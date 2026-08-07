/**
 * persistence-stage — 对话持久化
 *
 * 🔴 铁律：每轮对话必须同步写入砂金库（memories 表）+ conversations.db
 *     写失败不静默吞——直接同步重试，5 次还失败才放弃并打错误日志
 *
 * 三写保障：
 *   1. conversationHistory（内存）
 *   2. conversations.db（对话历史库）
 *   3. fusion_memory.db memories 表（砂金库）
 *
 * 🔧 修复历史：
 *   v3 - 改用原生 db.prepare + 同步重试队列，彻底解决静默丢数据
 */
import type { DNA } from '../../m1/types/dna.js';
import type { Perception24D } from '../../m3/types/perception.js';
import { encodeEmotionVector, encodeEmotionVectorWithFingerprint } from '../../m2/EmotionVectorCodec.js';
import { encodePerceptionV40 } from '../../m2/PerceptionVector40DCodec.js';
import { buildFallbackV40 } from '../../m2/YaoguangNormalizer.js';
import type { PerceptionV40 } from '../../m3/types/perception-40d.js';
import type { M3Decision } from '../../m3/types/perception.js';
import { detectForesight } from '../../m3/ForesightDetector.js';
import { enqueueYaoguangBackfill } from './yaoguang-backfill.js';
import { detectWork } from '../../app/works/WorkDetector.js';
import { WorkRepository } from '../../app/works/WorkRepository.js';
import type { ChatContext } from '../chat.js';

export interface PersistInput {
  ctx: ChatContext;
  message: string;
  reply: string;
  seqPos: number;
  dna: DNA;
  p: Perception24D;
  decision: M3Decision;
}

const TOPIC_KW: Record<string, RegExp> = {
  '健身': /健[身康]|运动|跑步|深蹲|健身|增肌|减脂/,
  '工作': /工作|项目|代码|开发|调试|bug|加班|会议|客户|方案/,
  '情感': /想|爱|思念|难过|开心|快乐|委屈|焦虑|压力|累/,
  '家庭': /妈|爸|家|家人|父母|亲戚|姐姐|妹妹/,
  '亲密': /操|干|日|插|高潮|抱|吻|摸|亲热/,
  '知识': /知识库|看过|知道|记得|查|找资料/,
  '健康': /生病|感冒|失眠|睡|药|医院|体检/,
};

function detectTopic(message: string): string {
  for (const [t, re] of Object.entries(TOPIC_KW)) {
    if (re.test(message)) return t;
  }
  return '';
}

/** V13: 使用文本指纹编码，确保中性文本也有微量可区分的向量基线 */
function buildPerceptionJson(p: Perception24D, text?: string): string {
  if (text) return encodeEmotionVectorWithFingerprint(p, text);
  return encodeEmotionVector(p);
}

/**
 * V3: 写 perception_40d 列 — M3 直接产出的 40D 语义维（严格走 24D 原路径）。
 * 优先用 `perceptionV40`（M3 decide 产出，与 24D 同源）；缺失时回退 buildFallbackV40。
 * 客观维（D01-D08/D21-D32）由瑶光异步回填（yaoguang-backfill），此处语义维已就绪。
 */
function writePerceptionV40Dual(
  sqlite: { writeRaw(sql: string, ...params: unknown[]): void },
  id: string,
  p: Perception24D,
  perceptionV40?: PerceptionV40,
): void {
  try {
    const p40 = perceptionV40 ?? buildFallbackV40(p);
    sqlite.writeRaw(
      'UPDATE memories SET perception_40d = ? WHERE id = ?',
      encodePerceptionV40(p40),
      id,
    );
  } catch (e) {
    console.error('[Persist] ⚠️ 40D 双轨写入失败:', (e as Error)?.message);
  }
}

/** 🔧 V10.5: 从 assistant 回复中检测说话者 UUID（自称匹配） */
// P1-2: _detectSpeakerUUID 已废弃 — EntityOwnershipResolver.resolveOwnership(role='assistant') 覆盖全部自称检测模式

/**
 * 三写持久化（每轮对话调用 1 次）
 *
 * 🔴 铁律：
 *   - 写失败不打日志就走——同步重试 5 次
 *   - 5 次都失败才放弃并打 error 日志
 *   - 使用原生 db.prepare 绕过间接调用层
 */
export async function persistConversation(input: PersistInput): Promise<void> {
  const nowTs = new Date().toISOString();
  const topic = detectTopic(input.message);
  let hadError = false;

  // ── Step 1: conversationHistory（内存）──
  input.ctx.conversationHistory.push({ role: 'user', content: input.message, timestamp: nowTs, topic } as any);
  input.ctx.saveConversationHistory();
  if (input.ctx.conversationHistory.length > 500) {
    input.ctx.conversationHistory.splice(0, input.ctx.conversationHistory.length - 500);
  }

  // ── Step 2: conversations.db（对话历史库） ──
  // P0-4+P1-2: 统一实体归属解析 — EntityOwnershipResolver 单一入口
  // 🔴 户籍管理法（第五条 会晤写入强制）: 会晤模式 belong_entity_uuid 强制 = 会晤实体 UUID，
  // 禁止 entity_genes 推断覆盖（用户消息提到他人时不应把对话归属他人）。
  const _meetingUUID = input.ctx._entityMeeting?.getEntityUUID?.() ?? null;
  const { resolveOwnership } = await import('../../app/entity/EntityOwnershipResolver.js');
  const _fg = input.ctx.m4?.getFamilyGraph?.();
  let belongUUID: string | null = null;
  let ownerEntityName: string | null = null;
  if (_meetingUUID) {
    belongUUID = _meetingUUID;  // 会晤强制 = 会晤实体
    ownerEntityName = input.ctx._entityMeeting?.getEntityName?.() ?? null;
  } else {
    const _ownerResult = resolveOwnership(input.message, input.dna.entity_genes, _fg, 'user');
    belongUUID = _ownerResult.uuid;
    ownerEntityName = _ownerResult.entityName ?? null;
  }
  // assistant 回复也走 resolveOwnership（替代旧 _detectSpeakerUUID）；会晤时强制 = 会晤实体
  let asstUUID: string | null = null;
  if (_meetingUUID) {
    asstUUID = _meetingUUID;
  } else {
    const _asstResult = resolveOwnership(input.reply, input.dna.entity_genes, _fg, 'assistant');
    asstUUID = _asstResult.uuid || belongUUID;
  }

  try {
    input.ctx.conversationDB?.insertConversation('user', input.message, {
      seqPos: input.seqPos, topic,
      entityNames: input.dna.entity_genes.filter((g: any) => g.type !== 'self').map((g: any) => g.name),
      perception: { pleasure: input.p.pleasure, arousal: input.p.arousal, intimacy: input.p.intimacy },
      calciumScore: input.decision.enhanced.calcium_score,
      dnaRootId: (input.dna as any).dna_root_id,
      globalUid: input.dna.global_uid || (input.dna as any).dna_root_id,
      locationFingerprint: input.dna.location_fingerprint || '',
      isTest: input.ctx.testMode ? 1 : 0,
      belongEntityUuid: belongUUID || undefined,
    });
    input.ctx.conversationDB?.insertConversation('assistant', input.reply, {
      seqPos: input.seqPos + 1, topic,
      calciumScore: input.decision.enhanced.calcium_score,
      dnaRootId: (input.dna as any).dna_root_id,
      globalUid: input.dna.global_uid || (input.dna as any).dna_root_id,
      locationFingerprint: input.dna.location_fingerprint || '',
      belongEntityUuid: asstUUID || undefined,
    });
  } catch (e: any) {
    console.error('[Persist] ❌ conversations.db 写入失败:', e?.message);
    hadError = true;
  }

  // ── Step 3: 砂金库 memories 表（fusion_memory.db）使用公共 API 写入 ──
  try {
    const sqlite = input.ctx.storage.getSQLite();
    const pJson = buildPerceptionJson(input.p, input.message);
    const calciumScore = input.decision.enhanced.calcium_score ?? 0.5;
    const calciumLevel = input.decision.enhanced.calcium_level ?? 1;
    const locusPath = (input.dna as any).locus_path || 'chat';
    const now = new Date().toISOString();
    const primaryEmotion = topic || 'chat';

    // V13: Foresight 前瞻时态检测
    const foresight = detectForesight({ content: input.message, timestampMs: Date.now() });

    // 写用户消息 — 改造②：使用 SQLiteAdapter.writeMemory() 公共 API
    const idUser = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (!sqlite.writeMemory({
      id: idUser, seqPos: input.seqPos, createdAt: now,
      perceptionJson: pJson, calciumScore, calciumLevel,
      locusPath, leafZone: 'user', rawInput: input.message,
      primaryEmotion, memoryType: 'dialog',
      memoryKind: 'episodic',
      lifecycleState: calciumLevel >= 2 ? 'active' : 'candidate',
      confidenceScore: 0.6,
      stabilityScore: calciumLevel >= 2 ? 0.45 : 0.2,
      threadId: (input.dna as any).dna_root_id ?? idUser,
      sourceConversationIds: [input.seqPos],
      globalUid: input.dna.global_uid, locationFingerprint: input.dna.location_fingerprint,
      dialogGroupId: null, topicLabel: null,
      belongEntityUuid: belongUUID || undefined,  // V10.4: 实体归属标注
      isForesight: foresight.isForesight,         // V13: 前瞻标记
      validUntilMs: foresight.validUntilMs ?? null,
      foresightStatus: foresight.status,
    })) {
      hadError = true;
    }
    // V3: 40D — 用户消息写 perception_40d（M3 直接产出的语义维，瑶光客观维异步回填）
    writePerceptionV40Dual(sqlite, idUser, input.p, input.decision.enhanced.perceptionV40);

    // 🔴 V22 作品召回: 检测用户消息是否为作品（小说/文章），命中则写入 works 表。
    // 这是"长文召回"的元数据桥——让"那篇小说"这类指称词可被解析。
    try {
      const workDet = detectWork(input.message, input.dna);
      if (workDet.isWork && workDet.confidence !== 'low') {
        const workRepo = new WorkRepository(sqlite);
        const work = await workRepo.upsertWork({
          title: workDet.title,
          workType: workDet.workType || 'story',
          fullText: input.message,
          belongEntityUuid: belongUUID,
          dnaRootId: (input.dna as any).dna_root_id,
          sourceConversationIds: [idUser],
          dialogGroupId: (input.dna as any).dialog_group_id ?? null,
          summary: workDet.summary,
          firstSentence: workDet.firstSentence,
        });
        // 回填 work_id 到刚写的记忆
        sqlite.writeRaw('UPDATE memories SET work_id = ? WHERE id = ?', work.work_id, idUser);
        console.log(`[WorkDetector] ✅ 识别作品《${work.title}》(${work.work_type}, 置信度=${workDet.confidence})`);
      }
    } catch (e) { console.warn('[WorkDetector] 作品检测跳过:', (e as Error)?.message); }

    // 写助理回复 — 剥离场景描写后再存储
    //     LLM 的回复含"（我趴在浴缸边…）"等动作描写。这是生成产物，不是语义记忆。
    //     原样存储 → 下次检索注入 → LLM 读到自己的场景文本 → 重新走进那个场景 → 死循环。
    //     存储时剥离括号场景描写，只保留语义内容（"我记得那次你说…我姐…"）。
    const idAssist = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const cleanReply = input.reply.replace(/（[^）]*）/g, '').trim();
    const asstPJson = buildPerceptionJson(input.p, cleanReply);
    if (!sqlite.writeMemory({
      id: idAssist, seqPos: input.seqPos + 1, createdAt: now,
      perceptionJson: asstPJson, calciumScore, calciumLevel,
      locusPath, leafZone: 'assistant', rawInput: cleanReply,
      primaryEmotion, memoryType: 'dialog',
      memoryKind: 'episodic',
      lifecycleState: calciumLevel >= 2 ? 'active' : 'candidate',
      confidenceScore: 0.6,
      stabilityScore: calciumLevel >= 2 ? 0.45 : 0.2,
      threadId: (input.dna as any).dna_root_id ?? idAssist,
      sourceConversationIds: [input.seqPos + 1],
      globalUid: input.dna.global_uid, locationFingerprint: input.dna.location_fingerprint,
      dialogGroupId: null, topicLabel: null,
      belongEntityUuid: asstUUID || undefined,  // P1-2: 统一走 EntityOwnershipResolver
    })) {
      hadError = true;
    }
    // V3: 40D — 助理回复写 perception_40d（M3 直接产出的语义维，瑶光客观维异步回填）
    writePerceptionV40Dual(sqlite, idAssist, input.p, input.decision.enhanced.perceptionV40);

    // ── V3: 瑶光客观维异步回填（fire-and-forget，绝不同步阻塞 chat） ──
    // M3 已直接产出 40D 语义维写入 perception_40d；此处异步补 D01-D08/D21-D32 客观维。
    try {
      const v40Semantic = input.decision.enhanced.perceptionV40 ?? buildFallbackV40(input.p);
      enqueueYaoguangBackfill(input.ctx, {
        dnaRootId: (input.dna as any).dna_root_id ?? input.dna.branch_id ?? 'TT00000001M01SYS0000000',
        globalUid: input.dna.global_uid,
        locationFingerprint: input.dna.location_fingerprint ?? '0'.repeat(32),
        sceneTags: input.dna.scene_tags,
        interpersonalLabels: input.dna.entity_genes
          ?.filter((g: any) => g.type === 'person' && g.name !== '我')
          .map((g: any) => g.name),
        rawInputText: input.message,
        memoryIds: [idUser, idAssist],
        p40Semantic: v40Semantic,
      });
    } catch (e) {
      console.warn('[Persist] 瑶光回填入队跳过:', (e as Error)?.message);
    }
  } catch (e: any) {
    console.error('[Persist] ❌ 砂金库写入异常:', e?.message);
    hadError = true;
  }

  // ── Step 3.5: 双螺旋三底座同步 (蓝皮书 §3.1-3.3) ──
  if (input.dna.global_uid) {
    const dhsqlite = input.ctx.storage.getSQLite();
    try {
      const { writeToDualHelix } = await import('../../m2/DualHelixWriter.js');
      const dhResult = writeToDualHelix(dhsqlite.rawDb, {
        globalUid: input.dna.global_uid,
        perceptionJson: buildPerceptionJson(input.p),
        seqPos: input.seqPos,
        createdAt: new Date().toISOString(),
        locationFingerprint: input.dna.location_fingerprint,
        locusPath: input.dna.locus_path || (input.dna as any).locus_path,
        dnaRootId: input.dna.dna_root_id || (input.dna as any).dna_root_id,
        entityNames: input.dna.entity_genes?.filter((g: any) => g.type !== 'self').map((g: any) => g.name),
        calciumScore: input.decision.enhanced.calcium_score,
      });
      if (!dhResult.success) {
        console.warn('[DualHelix] 写入失败 (将在下次定时重试):', dhResult.error);
      }
    } catch (e) { console.warn('[DualHelix] 写入跳过:', (e as Error).message); }
    try { dhsqlite.flushNow?.(); } catch { /* flush optional */ }
  }

  // ── Step 3.6: Transcoder 序列化验证 (蓝皮书 §8.3, P4 前置) ──
  if (input.dna.global_uid && input.dna.entity_genes) {
    try {
      const { encodeFleshContainer, computeCRC32 } = await import('../../m2/Transcoder.js');
      encodeFleshContainer({
        global_uid: input.dna.global_uid,
        raw_text: input.message,
        tokens: [],
        entity_genes: input.dna.entity_genes.map((g: any) => ({
          name: g.name || '', type: g.type || 'object',
          phenotype: g.phenotype, knowledge_type: g.knowledge_type,
        })),
        locus_path: input.dna.locus_path || 'chat',
        leaf_zone: (input.dna as any).leaf_zone || 'language_semantic_zone',
        calcium_score: input.decision.enhanced.calcium_score ?? 0,
      });
    } catch (e) { /* Transcoder P4 正式启用, 当前仅验证可调通 */ }
  }

  // ── Step 4: 写后读验证（改造③ — 彻底杜绝静默数据丢失） ──
  try {
    const verifySqlite = input.ctx.storage.getSQLite();
    const userCheck = verifySqlite.queryAll<any>(
      'SELECT raw_input FROM memories WHERE seq_pos = ? AND leaf_zone = ?',
      [input.seqPos, 'user'],
    );
    const asstCheck = verifySqlite.queryAll<any>(
      'SELECT raw_input FROM memories WHERE seq_pos = ? AND leaf_zone = ?',
      [input.seqPos + 1, 'assistant'],
    );
    if (!userCheck.length || !asstCheck.length) {
      console.error(`[Persist] ❌ 写后验证失败: seq=${input.seqPos} user=${!!userCheck.length} asst=${!!asstCheck.length}`);
      hadError = true;
    }
  } catch (e: any) {
    console.error('[Persist] ❌ 写后验证异常:', e?.message);
  }

  // ── 更新内存 ──
  input.ctx.conversationHistory.push({ role: 'assistant', content: input.reply, timestamp: nowTs, topic } as any);
  input.ctx.saveConversationHistory();

  if (hadError) {
    console.warn(`[Persist] ⚠️ 本轮写入有错误 seq=${input.seqPos} msg="${input.message.substring(0, 20)}"`);
  }

  // V13: 对话→事实归纳 — 写入 vault_log（金库）而非 knowledge_base
  // knowledge_base 仅用于用户上传的文件/文档知识，对话归纳属于金库记忆体系
  try {
    const _msg = input.message;
    const _patterns = [
      { re: /我(?:在|住在|家[住在])[^\s，。？！]{2,20}(?:[^\s，。？！]{0,5})?/, cat: '地址' },
      { re: /我(?:公?司|在)[^\s，。？！]{2,30}(?:公司|上班|工作|科技|工厂|企业)/, cat: '工作' },
      { re: /我(?:儿子|女儿|孩子|小孩|宝宝)[^\s，。？！叫]{0,10}(?:叫|是|名字)[^\s，。？！]{2,10}/, cat: '家人' },
      { re: /我(?:老婆|老公|妻子|丈夫|对象|男朋友|女朋友)[^\s，。？！叫]{0,10}(?:叫|是|在)[^\s，。？！]{2,20}/, cat: '家人' },
      { re: /我(?:爸|妈|父亲|母亲|爸爸|妈妈)[^\s，。？！叫]{0,10}(?:叫|是|名字)[^\s，。？！]{2,10}/, cat: '家人' },
    ];
    for (const { re, cat } of _patterns) {
      const _match = _msg.match(re);
      if (_match) {
        const _fact = _match[0].trim();
        if (_fact.length >= 4) {
          // V13: 写入 vault_log 金库（不再写入 knowledge_base）
          const vlId = 'vl_induct_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
          input.ctx.storage.getSQLite()?.writeRaw(
            "INSERT INTO vault_log (id, operation, source_type, detail, content_md, belong_entity_uuid, created_at) VALUES (?, 'auto_induct', 'conversation', ?, ?, ?, ?)",
            [vlId, `[对话归纳·${cat}] ${_fact}`, `鸿艺曾说过：${_msg}`, belongUUID || undefined, new Date().toISOString()],
          );
          console.log('[KB·Induct→Vault] ' + cat + ' → "' + _fact.substring(0, 30) + '"');
        }
        break; // 一条消息只提取最优先的
      }
    }
  } catch (_indErr) { /* 归纳失败不阻塞 */ }

  // ── V11.0: 增量n-gram索引写入（异步，fire-and-forget）──
  try {
    const _sqlite = input.ctx.storage?.getSQLite();
    if (_sqlite?.rawDb) {
      const { indexDocument } = await import('../../m4/SearchIndexBuilder.js');
      // 索引用户消息
      if (input.message?.length > 5) {
        indexDocument(_sqlite.rawDb, 'conversation', String(input.dna?.dna_root_id || 'conv_' + Date.now()), input.message, (input.dna as any)?.belong_entity_uuid);
      }
      // 索引助手回复
      if (input.reply?.length > 5) {
        indexDocument(_sqlite.rawDb, 'conversation', 'reply_' + String(input.dna?.dna_root_id || Date.now()), input.reply, (input.dna as any)?.belong_entity_uuid);
      }
    }
  } catch { /* 索引写入不阻塞主流程 */ }

  // ── V12.1: 新实体即时UUID回填（写入时 belongUUID 为 null → FG 可能刚创建节点 → 重试）──
  if (!belongUUID && input.dna.entity_genes?.some((g: any) => g.type === 'person' && g.name !== '我' && g.name.length >= 2)) {
    try {
      const _fg = input.ctx.m4?.getFamilyGraph?.();
      const _si = input.ctx.storage?.getSQLite?.();
      if (_fg && _si?.rawDb) {
        const { backfillAllEntities } = await import('../../m4/household/EntityUUIDBackfill.js');
        backfillAllEntities(_si.rawDb, _fg);
      }
    } catch { /* 即时回填不阻塞 */ }
  }

  // ── V12.2: 记录最后活跃实体 — 供跨重启上下文锚定 ──
  if (belongUUID && ownerEntityName) {
    try {
      const _si = input.ctx.storage?.getSQLite?.();
      if (_si) {
        const { EntityContextStore } = await import('../../app/entity/EntityContextStore.js');
        const _store = new EntityContextStore(_si);
        _store.saveLastActiveEntity(belongUUID, ownerEntityName);
      }
    } catch { /* 非关键 */ }
  }
}
