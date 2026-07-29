/**
 * retrieval-stage — 记忆检索（从 chat.ts 拆分）
 *
 * 职责：话题切换检测、情感记忆检索、黑钻检索
 * 包含：isTopicShift判断、多跳检索、黑钻FTS5+向量补充
 * 输出：emotionalMemories、memoryFragment推送、上下文标志位
 */
import type { ScoredMemory, SimilarityMode } from '../../m2/types/index.js';
import type { DNA } from '../../m1/types/dna.js';
import type { Perception24D } from '../../m3/types/perception.js';
import { rerank } from '../../m4/Reranker.js';
import { decompose, mergeDecomposedResults } from '../../m4/QueryDecomposer.js';

export interface RetrievalInput {
  ctx: any;
  message: string;
  /** 🆕 V5.1: 会晤实体名 — 非空时跳过所有记忆检索 */
  _meetingEntityName?: string | null;
  dna: DNA;
  p: Perception24D;
  enrichedHistory: Array<{ content: string }>;
  memoryFragments: string[];
}

export interface RetrievalOutput {
  isTopicShift: boolean;
  isFollowUp: boolean;
  hasContinuationMarkers: boolean;
  isCasualChat: boolean;
  isLimitedRetrieval: boolean;
  hasNewEntity: boolean;
  hasPersonEntity: boolean;
  emotionalMemories: ScoredMemory[];
  memoryGate: import('../../app/conversation/MemoryGate.js').MemoryGateOutput;
  memoryGateFillerUsed: boolean;
}

export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const { ctx, message, dna, p, enrichedHistory, memoryFragments, _meetingEntityName } = input;

  // 🛡️ V5.1: 会晤信息隔离墙 — 会晤实体不检索任何用户记忆
  if (_meetingEntityName) {
    return {
      isTopicShift: false, isFollowUp: false, hasContinuationMarkers: false,
      isCasualChat: true, isLimitedRetrieval: false, hasNewEntity: false, hasPersonEntity: false,
      emotionalMemories: [],
      memoryGate: { mode: 'casual' as const, needsMemorySearch: false, needsKnowledgeSearch: false, fillerPhrase: '', hallucinationGuard: '', strictMode: false },
      memoryGateFillerUsed: false,
    };
  }

  // 时间导航：检测用户是否在问"昨天/上周说了什么"
  const _tmMatch = message.match(/(昨天|前天|上周|上个月|前几天|最近|刚才)/);
  if (_tmMatch && (message.indexOf('说') >= 0 || message.indexOf('聊') >= 0 || message.indexOf('提') >= 0)) {
    try {
      const _tmNow = new Date();
      const _tmStart = new Date();
      const _tmEnd = new Date();
      const _tmUnit = _tmMatch[1];
      if (_tmUnit === '昨天') { _tmStart.setDate(_tmNow.getDate() - 1); }
      else if (_tmUnit === '前天') { _tmStart.setDate(_tmNow.getDate() - 2); _tmEnd.setDate(_tmNow.getDate() - 1); }
      else if (_tmUnit === '上周') { _tmStart.setDate(_tmNow.getDate() - 7); }
      else if (_tmUnit === '上个月') { _tmStart.setMonth(_tmNow.getMonth() - 1); }
      else if (_tmUnit === '前几天') { _tmStart.setDate(_tmNow.getDate() - 3); }
      else if (_tmUnit === '刚才') { _tmStart.setHours(_tmNow.getHours() - 1); }
      const _tmRows = ctx.conversationDB?.findByTimeRange(_tmStart.toISOString(), _tmEnd.toISOString(), 8);
      if (_tmRows && _tmRows.length > 0) {
        const _tmTexts = _tmRows.map(function(r: any) { return r.content; }).filter(Boolean).join(' | ').substring(0, 300);
        memoryFragments.push('【时间检索】' + _tmUnit + '的对话：' + _tmTexts);
        console.log('[TimeNav] ' + _tmUnit + ' 检索到 ' + _tmRows.length + ' 条');
      }
    } catch (err) {
      console.warn('[TimeNav] 检索失败:', err);
    }
  }

  let emotionalMemories: ScoredMemory[] = [];

  // 上下文连续性检测 —— 优先保持当前话题，记忆只在话题切换时注入

  const recentContext = enrichedHistory.slice(-3).map((t: { content: string }) => t.content).join('').slice(-200);

  const isFollowUp = /[那这]个|然后|还有|后来|可是|但是|而且|再|又|还|呢|吧|吗/.test(message) && message.length < 30;

  const hasNewEntity = dna.entity_genes.some(g => g.name && !recentContext.includes(g.name));

  const hasPersonEntity = dna.entity_genes.some((g: any) => g.type === 'person' && g.name !== '我' && g.name.length > 1);

  // V13: 提前收集当前活跃实体 UUID（供所有检索路径共用）
  const _activeEntityUuids: string[] = [];
  try {
    if (hasPersonEntity && ctx.m4?.getFamilyGraph) {
      const _fg = ctx.m4.getFamilyGraph();
      const _personNames = dna.entity_genes.filter((g: any) => g.type === 'person').map((g: any) => g.name);
      for (const _pn of _personNames.slice(0, 3)) {
        try {
          const _uuid = _fg.getUUIDByName?.(_pn);
          if (_uuid) _activeEntityUuids.push(_uuid);
        } catch { /* skip */ }
      }
    }
  } catch { /* 不阻塞 */ }

  const hasContinuationMarkers = /嗯|对|好|行|是|是的|没错|就是|[那这]样/.test(message) && message.length < 20;

  // 日常闲聊检测 — 短消息/日常问候 → 不触发记忆检索
  const isCasualChat = /^(在干嘛|忙什么|吃了吗|睡了|晚安|早安|早上好|晚上好|刚起来|下班|到家|今天天气|好开心|好累|心情|感觉|今天.*不错|今天.*好|嗯|好|行|对|是|好的|知道了|没事|算了|哈哈|嘿嘿|哎|唉)$/i.test(message.trim())
    || (message.length < 10 && /今天|天气|吃|睡|累|困|忙|下班|到家|早安|晚安/.test(message));
  let memoryGate: import('../../app/conversation/MemoryGate.js').MemoryGateOutput = { mode: 'casual', needsMemorySearch: false, needsKnowledgeSearch: false, fillerPhrase: '', hallucinationGuard: '', strictMode: false };
  let memoryGateFillerUsed = false;

  // 🔴 V7.0: 记忆每轮检索 — isTopicShift 控制深度而非开关
  const isTopicShift = hasNewEntity || isFollowUp || (!isFollowUp && !hasContinuationMarkers && !isCasualChat);
  const isLimitedRetrieval = isFollowUp && !hasNewEntity;
  // V10.4: 话题切换深度检索(10-15条)，日常闲聊常用检索(5-8条)
  const _memLimit = isTopicShift ? 15 : 8;
  const _memFinalLimit = isTopicShift ? 8 : 5;

  try {
    // V7.0: 始终检索记忆，不再用 isTopicShift 做总开关
    const currentEntityNames = dna.entity_genes.map(g => g.name).filter(Boolean);

      // P0-2: 定向检索模式（isLimitedRetrieval）— 跳过分解和实体扩展，只查当前实体
      if (isLimitedRetrieval) {
        const limMode: SimilarityMode = p.intimacy > 0.4 ? 'intimacy_search' : 'balanced';
        let limMemories = ctx.storage.findByEmotionalSimilarity({
          current_perception: p, similarity_mode: limMode,
          entities: currentEntityNames, limit: _memLimit + 3,
          entityUuids: _activeEntityUuids.length > 0 ? _activeEntityUuids : undefined,
        });
        limMemories = rerank(limMemories, message);
        // P0-2: 情感阈值过滤
        emotionalMemories = limMemories.filter((m: any) =>
          (m.scores.emotional > 0.5 || m.composite > 0.25)
          && m.record.id !== dna.branch_id
          && (m.record.effective_strength || 0) >= 0.15
          && (m.record.calcium_level || 0) >= 1
        ).slice(0, _memFinalLimit + 2);
        if (emotionalMemories.length > 0) {
          memoryFragments.push('【用户曾提到】"' + emotionalMemories[0].record.raw_input?.substring(0, 60) + '"');
        }
      } else {
        // 🆕 V8.0: 空实体快速路径 — entity_genes=[] 时跳过复杂多跳，直接用钙化分扫描
        if (currentEntityNames.length === 0) {
          const _scanMode: SimilarityMode = 'by_calcium';
          const _scan = ctx.storage.findByEmotionalSimilarity({
            current_perception: p, similarity_mode: _scanMode,
            entities: [], limit: 8,
            entityUuids: _activeEntityUuids.length > 0 ? _activeEntityUuids : undefined,
          });
          const _reranked = rerank(_scan, message);
          emotionalMemories = _reranked
            .filter((m: any) => m.record.id !== dna.branch_id && (m.record.calcium_score || 0) > 0.05)
            .slice(0, _memFinalLimit);
          if (emotionalMemories.length > 0) {
            const _top = emotionalMemories[0];
            memoryFragments.push('【回忆】' + (_top.record.raw_input || '').substring(0, 80));
          }
        } else {
        // P1-3: 多跳检索（1度→不足3条升2度）
        let relatedEntities: Array<{ name: string; relation: string; strength: number }> = [];
        if (currentEntityNames.length > 0) {
          let anyType = ctx.storage;
          let hop1 = (anyType as any).findRelatedEntitiesN(currentEntityNames, 1, 0.3) || [];
          if (hop1.length < 3) {
            let hop2 = (anyType as any).findRelatedEntitiesN(currentEntityNames, 2, 0.3) || [];
            relatedEntities = [...hop1, ...hop2];
          } else {
            relatedEntities = hop1;
          }

          // P1-3b: 从 FamilyGraph 补充人物关系
          try {
            const _fg = ctx.m4?.getFamilyGraph();
            if (_fg) {
              const _familyNames = _fg.getAllPersonNames();
              const _matchedPerson = currentEntityNames.find((n: string) => _familyNames.includes(n));
              if (_matchedPerson) {
                const _profile = _fg.getPersonProfile(_matchedPerson);
                if (_profile?.relation_to_user) {
                  relatedEntities.push({
                    name: _matchedPerson,
                    relation: 'known_person',
                    strength: 0.5,
                  });
                }
              }
            }
          } catch (_fgErr) { /* 图谱扩展不阻塞 */ }
        }

        const uniqueExpanded = [...new Set([...currentEntityNames, ...relatedEntities.map(r => r.name)])];
        const decomposed = decompose(message);
        const allQueryTexts = [message, ...decomposed.subQueries.filter((q: string) => q !== message)];
        const allResultSets: ScoredMemory[][] = [];

        const mode: SimilarityMode =
          p.pleasure < -0.2 ? 'mood_congruent' :
          p.intimacy > 0.4 ? 'intimacy_search' :
          p.arousal > 0.6 ? 'by_calcium' : 'balanced';

        for (const q of allQueryTexts) {
          let memories = ctx.storage.findByEmotionalSimilarity({
            current_perception: p, similarity_mode: mode,
            entities: uniqueExpanded, limit: _memLimit + 3,
            entityUuids: _activeEntityUuids.length > 0 ? _activeEntityUuids : undefined,
          });
          memories = rerank(memories, q);

          const _hasPerson = dna.entity_genes.some((g: any) => g.type === 'person' && g.name !== '我');
          // V7.0: 日常闲聊降低阈值，确保轻量检索也能命中
          const _emoThreshold = isTopicShift ? (_hasPerson ? 0.25 : 0.5) : 0.15;
          const _compThreshold = isTopicShift ? (_hasPerson ? 0.15 : 0.25) : 0.10;
          const valid = memories.filter((m: any) =>
            (m.scores.emotional > _emoThreshold || m.composite > _compThreshold) && m.record.id !== dna.branch_id
          );
          if (valid.length > 0) allResultSets.push(valid);
        }

        emotionalMemories = mergeDecomposedResults(allResultSets, _memLimit);

        if (relatedEntities.length > 0) {
          const relationMemories = ctx.storage.findMemoriesByEntityNames(relatedEntities.map((r: any) => r.name), _memLimit);
          for (const rm of relationMemories) {
            if (!emotionalMemories.some((e: any) => e.record.id === rm.id) && rm.id !== dna.branch_id) {
              emotionalMemories.push({
                record: rm, scores: { emotional: 0.5, topic: 0, entity: 0.8, calcium: rm.calcium_score },
                composite: 0.5 * rm.effective_strength,
              });
            }
          }
        }
      } // ← V8.0 多跳分支闭合
      } // ← else闭合

      const recentHistoryRaw = enrichedHistory.slice(-4).map((t: any) => t.content).join('');
      let freshMemories = emotionalMemories.filter((m: any) => !recentHistoryRaw.includes(m.record.id));
      if (freshMemories.length < 2 && !hasContinuationMarkers) {
        const fallback = ctx.storage.findByEmotionalSimilarity({ current_perception: p, similarity_mode: 'balanced', limit: 2, entityUuids: _activeEntityUuids.length > 0 ? _activeEntityUuids : undefined });
        freshMemories = fallback.filter((m: any) =>
          (m.scores.emotional > 0.3 || m.scores.calcium > 0.3) && m.record.id !== dna.branch_id && !recentHistoryRaw.includes(m.record.id)
        );
      }
      const finalMemories = freshMemories.length > 0 ? freshMemories : emotionalMemories.slice(0, _memFinalLimit);
      if (finalMemories.length > 0) {
        const top = finalMemories[0];
        const userSaid = top.record.raw_input.substring(0, 60);
        memoryFragments.push('【用户曾提到】"' + userSaid + '"——这是用户以前说的，不记得就说"不太记得了"');
      }
  } catch (err) { console.warn('[EmotionContagion] 检索失败:', err); }

  // ── V11.0: 统一语义搜索 — n-gram初筛 + 自有32D向量精排（替代旧LIKE黑钻检索） ──
  // ── V13.0: WS_SEARCH_V13=true 时走七层仿生管线 ──
  const WS_SEARCH_V13 = true; // 硬编码开启，绕过 env 加载问题
  console.error('[RETRIEVAL-STAGE-V13] ENTERED runRetrieval, WS_SEARCH_V13=' + WS_SEARCH_V13 + ' m4=' + !!ctx.m4 + ' retrieveFn=' + !!(ctx.m4?.retrieveMultiRankForSearch));
  try {
    if (message.trim().length > 1) {
      const _sqlite = ctx.storage.getSQLite();
      if (_sqlite && typeof _sqlite.queryAll === 'function') {
        // V13: 使用顶层 _activeEntityUuids（已提前收集）
        let _v13Result: any = null;
        let _dbResult: any = null;

        // ── V13 七层仿生管线 ──
        if (WS_SEARCH_V13 && ctx.m4?.retrieveMultiRankForSearch) {
          try {
            const { searchV13: v13Search } = await import('../../m4/UnifiedSearchEngine.js');
            const { MemoryAssociationRepository } = await import('../../m4/graph/MemoryAssociationRepository.js');

            const _locusPath = (dna as any).locus_path || 'default';
            const _entities = dna.entity_genes.map((g: any) => ({ name: g.name, type: g.type }));
            const _personUuids = _entities.filter((e: any) => e.type === 'person' && e.name !== '我')
              .map((e: any) => { try { return ctx.m4?.getFamilyGraph?.()?.getUUIDByName?.(e.name); } catch { return null; } })
              .filter(Boolean) as string[];

            const _multiRank = await ctx.m4.retrieveMultiRankForSearch(_locusPath, _entities, {
              perception: p,
              entityUuids: _personUuids.length > 0 ? _personUuids : _activeEntityUuids,
              sessionId: ctx.sessionId,
            });

            // 🔴 DAG Repo 必须用 SQLiteAdapter 实例（有 queryAll 方法），不能用 rawDb
            const _dagRepo = new MemoryAssociationRepository(_sqlite);

            _v13Result = await v13Search(
              _sqlite.rawDb || _sqlite, _multiRank, message, p,
              {
                mode: isTopicShift ? 'full' : 'balanced',
                entityUuids: _activeEntityUuids.length > 0 ? _activeEntityUuids : undefined,
                limit: isTopicShift ? 6 : 3,
                includeKnowledgeBase: true,
              },
              {
                enableRRF: true,
                enableDAGClosure: true,
                enableCrossEncoder: true,
                enableForesightFilter: true,
                enableMMR: true,
                enableNarrativeAssembler: true,
              },
              _dagRepo,
            );

            // 注入 V13 叙事或普通结果到 memoryFragments
            if (_v13Result.narrative?.compactText) {
              memoryFragments.push(_v13Result.narrative.compactText);
            }
            for (const _item of _v13Result.items) {
              if (!memoryFragments.some(f => f.includes(_item.substring(0, 40)))) {
                memoryFragments.push(_item.startsWith('💎') ? `【珍藏记忆】${_item.substring(1).trim()}` : _item);
              }
            }
            if (_v13Result.items.length > 0) {
              console.log(`[searchV13] 七层管线 → ${_v13Result.totalCandidates}候选 → ${_v13Result.items.length}条 | layers: ${JSON.stringify(_v13Result.layerLatency)}`);
            }
          } catch (_v13Err) {
            console.warn('[searchV13] 七层管线异常, 降级到 V11:', (_v13Err as Error)?.message);
            // V13 失败 → 自动回退到 V11
          }
        }

        // ── V11 旧管线（默认 / V13 失败降级） ──
        if (!WS_SEARCH_V13 || !ctx.m4?.retrieveMultiRankForSearch) {
          const { search: unifiedSearch } = await import('../../m4/UnifiedSearchEngine.js');
          _dbResult = unifiedSearch(_sqlite.rawDb || _sqlite, message, p, {
            mode: isTopicShift ? 'full' : 'balanced',
            entityUuids: _activeEntityUuids.length > 0 ? _activeEntityUuids : undefined,
            limit: isTopicShift ? 6 : 3,
            includeKnowledgeBase: true,
          });

          for (const _item of _dbResult.items) {
            if (!memoryFragments.some(f => f.includes(_item.substring(0, 40)))) {
              memoryFragments.push(_item.startsWith('💎') ? `【珍藏记忆】${_item.substring(1).trim()}` : _item);
            }
          }
          if (_dbResult.items.length > 0) {
            console.log(`[UnifiedSearch] n-gram→${_dbResult.totalCandidates}候选→向量精排${_dbResult.raw.length}条→注入${_dbResult.items.length}条 | ${JSON.stringify(_dbResult.hitsBySource)}`);
          }
        }

        // 更新召回计数（V13/V11 共用）
        for (const _r of (_v13Result?.raw || _dbResult?.raw || []).slice(0, 3)) {
          try {
            if (_r.item?.source === 'black_diamond') {
              _sqlite.writeRaw?.('UPDATE black_diamond SET recall_count = recall_count + 1, updated_at = ? WHERE id = ?',
                [new Date().toISOString(), _r.item.id]);
            }
          } catch { /* 非关键 */ }
        }
      }
    }
  } catch (err) { console.warn('[UnifiedSearch] 检索失败:', (err as Error)?.message); }

  // ── 知识库直接接入检索链路（V11.0：不再依赖LLM路由触发）──
  // V12.1: 追加 belongEntityUuid 过滤，防止跨实体知识泄漏
  try {
    if (message.trim().length > 3 && ctx.knowledgeBase) {
      const _kbHits = await ctx.knowledgeBase.search(message, 5); // 多搜2条留裁减空间
      if (_kbHits.length > 0) {
        for (const _kb of _kbHits) {
          const _kbUUID = _kb.belong_entity_uuid || null;
          // 实体过滤：结果无UUID(通用) 或 UUID 匹配活跃实体 → 放行
          if (_activeEntityUuids.length > 0 && _kbUUID && !_activeEntityUuids.includes(_kbUUID)) continue;
          const _text = (_kb.title || '') + ': ' + (_kb.content || '').substring(0, 200);
          if (_text.length > 10 && !memoryFragments.some(f => f.includes(_text.substring(0, 30)))) {
            memoryFragments.push('📖 ' + _text);
          }
        }
        console.log(`[KBDirect] 知识库命中 ${_kbHits.length} 条`);
      }
    }
  } catch (_kbErr) { /* 知识库检索不阻塞 */ }

  // V10.0: 金库检索 — vault_log 中 content_md 不为空的金库记忆
  try {
    const _hasPerson = dna.entity_genes.some((g: any) => g.type === 'person' && g.name !== '我');
    const _glLimit = isTopicShift ? 3 : (_hasPerson ? 2 : 1);
    const _sqlite = ctx.storage.getSQLite();
    if (_sqlite && typeof _sqlite.queryAll === 'function') {
      // priority: hasPerson → query by entity names; else → recent gold vault
      let _goldRows: any[] = [];
      if (_hasPerson) {
        const _names = dna.entity_genes.filter((g: any) => g.name && g.name.length > 1).map((g: any) => g.name);
        for (const _n of _names.slice(0, 3)) {
          const _r = _sqlite.queryAll("SELECT detail, content_md FROM vault_log WHERE (detail LIKE ? OR content_md LIKE ?) AND operation='promote' ORDER BY created_at DESC LIMIT 2", ['%' + _n + '%', '%' + _n + '%']);
          _goldRows.push(..._r);
        }
      }
      if (_goldRows.length === 0) {
        _goldRows = _sqlite.queryAll("SELECT detail, content_md FROM vault_log WHERE content_md IS NOT NULL OR detail IS NOT NULL ORDER BY created_at DESC LIMIT 5") || [];
      }
      for (const _gr of _goldRows.slice(0, _glLimit)) {
        const _t = (_gr.content_md || _gr.detail || '').substring(0, 100);
        if (_t.length > 4 && !memoryFragments.some(f => f.includes(_t.substring(0, 20)))) {
          memoryFragments.push('【金库记忆】' + _t);
        }
      }
      if (_goldRows.length > 0) console.log(`[GoldVault] 金库命中 ${Math.min(_goldRows.length, _glLimit)} 条`);
    }
  } catch (_gvErr) { /* 金库检索不阻塞 */ }

  // V10.0: 砂金库高钙化检索 — memories 中 calcium_level>=2 的经过加权检索
  try {
    const _sLimit = isTopicShift ? 3 : 1;
    const _sqlite = ctx.storage.getSQLite();
    if (_sqlite && typeof _sqlite.queryAll === 'function') {
      // V13: 加上 entity UUID 过滤，不跨人物泄露重要记忆
      let _sandQuery = "SELECT raw_input, calcium_level FROM memories WHERE leaf_zone='user' AND calcium_level >= 2";
      const _sandParams: any[] = [];
      if (_activeEntityUuids.length > 0) {
        _sandQuery += ` AND (belong_entity_uuid IN (${_activeEntityUuids.map(() => '?').join(',')}) OR belong_entity_uuid IS NULL)`;
        _sandParams.push(..._activeEntityUuids);
      }
      _sandQuery += ' ORDER BY calcium_score DESC LIMIT 10';
      const _sandRows = _sqlite.queryAll(_sandQuery, _sandParams) || [];
      for (const _sr of _sandRows.slice(0, _sLimit)) {
        const _t = (_sr.raw_input || '').substring(0, 80);
        if (_t.length > 4 && !memoryFragments.some(f => f.includes(_t.substring(0, 20)))) {
          const _tag = _sr.calcium_level >= 3 ? '💎' : '📌';
          memoryFragments.push(`【${_tag}重要记忆】${_t}`);
        }
      }
    }
  } catch {} // 砂金检索不阻塞

  return {
    isTopicShift,
    isFollowUp,
    hasContinuationMarkers,
    isCasualChat,
    isLimitedRetrieval,
    hasNewEntity,
    hasPersonEntity,
    emotionalMemories,
    memoryGate,
    memoryGateFillerUsed,
  };
}
