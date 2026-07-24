/**
 * MeetingContextPipeline — 会晤实体上下文全链路注入 (V10.3)
 * =============================================================
 * V10.3 二段精准检索: 全量粗筛 → 语义排序 → 精准注入
 *   不再"抓多少塞多少"，而是从全部历史中选出与当前问题最相关的片段
 */
import type { ChatContext } from '../chat.js';
import type { FamilyGraph } from '../../m4/household/FamilyGraph.js';
import { getRelationLabel, getCorrectedRelation } from '../../m4/household/shared/RelationLabels.js';

export interface MeetingContextInput {
  meetingEntityName: string;
  ctx: ChatContext;
  dna: any;
  existingFragments: string[];
  knowledgeBaseText: string;
  userMessage?: string;  // V10.3 用于相关性排序
}

export interface MeetingContextOutput {
  memoryFragments: string[];
  knowledgeBaseText: string;
}

export async function buildMeetingContext(input: MeetingContextInput): Promise<MeetingContextOutput> {
  const { meetingEntityName, ctx, dna, existingFragments, knowledgeBaseText } = input;
  const userMsg = (input.userMessage || (dna as any)?.raw_input || '').toLowerCase();
  const fragments = [...existingFragments];
  let kbText = knowledgeBaseText || '';
  const stats = { profile: 0, family: 0, memory: 0, knowledge: 0 };

  const fg: FamilyGraph = ctx.m4?.getFamilyGraph?.();
  if (!fg) return { memoryFragments: fragments, knowledgeBaseText: kbText };

  // ═══ ① 实体个人档案 ═══
  try {
    const profile = fg.getPersonProfile(meetingEntityName);
    if (profile) {
      const parts: string[] = [];
      parts.push(`我是${meetingEntityName}`);
      const bi = (profile as any).dossier?.basicInfo || {};
      const si = (profile as any).dossier?.socialIdentity || {};
      const sp = (profile as any).dossier?.selfProfile || {};
      if (bi.gender) parts.push(`${bi.gender === '女' ? '女' : bi.gender === '男' ? '男' : bi.gender}性`);
      if (bi.birthYear) {
        const age = new Date().getFullYear() - parseInt(bi.birthYear);
        parts.push(`${bi.birthYear}年生, ${age}岁`);
      }
      if (bi.education) parts.push(`学历${bi.education}`);
      if (si.currentOccupation) parts.push(`${si.currentOccupation}`);
      if (si.currentWorkplace) parts.push(`在${si.currentWorkplace}工作`);
      // V10.4: 使用共享修正函数（RelationLabels.ts 唯一定义点）
      const _kr = getCorrectedRelation(meetingEntityName, profile.relation_to_user);
      if (_kr) parts.push(`与鸿艺的关系：${_kr}`);
      if (sp.traits?.length) parts.push(`性格：${sp.traits.join('、')}`);
      const detail = parts.join('，') + '。';
      fragments.push('【我的档案】' + detail);
      stats.profile++;
    }
  } catch { /* 非关键 */ }

  // ═══ ② 家族关系（家庭优先于社交）═══
  try {
    const GENERIC_RELS = /grandmother_of|grandfather_of|grandchild_of|grandparent_of/;
    const REL_BLACKLIST = new Set(['我', '公司', '妹妹', '妈妈', '老婆', '爸爸', '姐姐', '哥哥', '弟弟', '叔叔']);
    const FAMILY_RELS = new Set(['child_of','parent_of','mother_of','father_of',
      'elder_sister_of','younger_sister_of','sister_of','elder_brother_of','younger_brother_of','brother_of','sibling_of',
      'aunt_of','uncle_of','niece_of','nephew_of','cousin_of','grandmother_of','grandfather_of','grandchild_of','spouse_of']);
    const persons = (fg as any).getRelatedPersons?.(meetingEntityName) || [];
    const filtered = persons.filter((p: any) => {
      if (REL_BLACKLIST.has(p.name)) return false;
      if (p.name === meetingEntityName) return false;
      if (GENERIC_RELS.test(p.relation)) return false;
      return true;
    });
    if (filtered.length > 0) {
      const familyParts: string[] = [];
      const socialParts: string[] = [];
      const seenNames = new Set<string>();  // 🔴 去重：同一人只保留一条
      for (const p of filtered) {
        if (familyParts.length >= 6 && socialParts.length >= 4) break;
        if (seenNames.has(p.name)) continue;
        seenNames.add(p.name);
        // 🔴 家族关系要用对方视角标签（"她是我的姐姐"而非"我是她的妹妹"）
        const label = FAMILY_RELS.has(p.relation) ? getRelationLabel(p.relation, false) : getRelationLabel(p.relation, true);
        const relProfile = fg.getPersonProfile(p.name);
        let detail = '';
        if (relProfile) {
          const bi = (relProfile as any).dossier?.basicInfo || {};
          const si = (relProfile as any).dossier?.socialIdentity || {};
          if (bi.birthYear) detail = `（${bi.gender || ''}，${new Date().getFullYear() - parseInt(bi.birthYear)}岁）`;
          if (si.currentOccupation) detail = detail.replace('）', `，${si.currentOccupation}）`);
        }
        const text = detail ? `${p.name}：${label}${detail}` : `${p.name}：${label}`;
        if (FAMILY_RELS.has(p.relation)) familyParts.push(text);
        else socialParts.push(text);
      }
      if (familyParts.length > 0) {
        fragments.push(`【我的家人】${familyParts.join('; ')}`);
        stats.family++;
      }
      if (socialParts.length > 0) {
        fragments.push(`【我认识的人】${socialParts.join('; ')}`);
      }
    }
  } catch { /* 非关键 */ }

  // ═══════════════════════════════════════════════════
  // ③ V10.3 二段精准记忆检索
  //   阶段1: 全量采集 (conversations + memories + roleplay)
  //   阶段2: ngram 相关性排序 → 取前 15 条注入
  //   论据: 无论多少历史数据, 只注入与当前问题最相关的片段
  // ═══════════════════════════════════════════════════
  try {
    const allCandidates: Array<{ text: string; isSelf: boolean }> = [];
    const _entUuid = (fg as any).getUUIDByName?.(meetingEntityName);  // V10.4: 提升到外层供源2a使用

    // ── 源1: conversations 表 — 优先取实体本人发言 ──
    try {
      const s1 = (ctx as any).storage?.getSQLite?.();
      if (s1 && typeof s1.queryAll === 'function') {
        const _existingIds = new Set<string>();
        let allCR: any[] = [];
        let _byUuidRows: any[] = [];

        // 源A: belong_entity_uuid 精确匹配（本人发言，可信度高）
        if (_entUuid) {
          _byUuidRows = s1.queryAll(
            "SELECT role, content FROM conversations WHERE belong_entity_uuid = ? ORDER BY timestamp DESC LIMIT 200",
            [_entUuid]
          ) || [];
          for (const r of _byUuidRows) {
            const tid = ((r.content || '') as string).substring(0, 40);
            _existingIds.add(tid);
            allCR.push(r);
          }
        }

        // 源B: 关键词匹配 + 无UUID标注（可能为本人但未标注）
        const _byKeyword = s1.queryAll(
          "SELECT role, content FROM conversations WHERE content LIKE ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid = '') ORDER BY timestamp DESC LIMIT 100",
          ['%' + meetingEntityName + '%']
        );
        for (const r of (_byKeyword || [])) {
          const tid = ((r.content || '') as string).substring(0, 40);
          if (!_existingIds.has(tid)) {
            _existingIds.add(tid);
            allCR.push(r);
          }
        }

        // 把源A(UUID)和源B分开标记——源A是本人，评分更高
        const _uuidContentIds = new Set<string>();
        for (const r of _byUuidRows) { _uuidContentIds.add(((r.content || '') as string).substring(0, 40)); }

        for (const r of allCR) {
          const t = ((r.content || '') as string).trim();
          if (t.length < 5) continue;
          const _cid = t.substring(0, 40);
          allCandidates.push({
            text: (r.role === 'user' ? '鸿艺说：' : '你说：') + t,
            isSelf: _uuidContentIds.has(_cid),  // 源A来的=本人发言
          });
        }
      }
    } catch {}

    // ── 源2a: memories 按 belong_entity_uuid 精确检索（V10.4）──
    try {
      const s2a = (ctx as any).storage?.getSQLite?.();
      if (s2a && typeof s2a.queryAll === 'function' && _entUuid) {
        const mu = s2a.queryAll(
          "SELECT raw_input FROM memories WHERE belong_entity_uuid = ? ORDER BY created_at DESC LIMIT 100",
          [_entUuid]
        );
        for (const r of (mu || [])) {
          const t = ((r.raw_input || '') as string).trim();
          if (t.length < 5) continue;
          allCandidates.push({ text: '鸿艺曾说：' + t, isSelf: true });
        }
      }
    } catch {}

    // ── 源2b: memories user 发言（关键词匹配，fallback）──
    try {
      const s2 = (ctx as any).storage?.getSQLite?.();
      if (s2 && typeof s2.queryAll === 'function') {
        const ur = s2.queryAll(
          "SELECT raw_input FROM memories WHERE leaf_zone='user' AND raw_input LIKE ? ORDER BY created_at DESC LIMIT 100",
          ['%' + meetingEntityName + '%']
        );
        for (const r of (ur || [])) {
          const t = ((r.raw_input || '') as string).trim();
          if (t.length < 5) continue;
          allCandidates.push({ text: '鸿艺曾说：' + t, isSelf: false });
        }
      }
    } catch {}

    // ── 源3: memories assistant 发言（过滤第三人称）──
    try {
      const s3 = (ctx as any).storage?.getSQLite?.();
      if (s3 && typeof s3.queryAll === 'function') {
        const ar = s3.queryAll(
          "SELECT raw_input FROM memories WHERE leaf_zone='assistant' AND (raw_input LIKE ? OR raw_input LIKE ?) ORDER BY created_at DESC LIMIT 50",
          ['%' + meetingEntityName + '%', '%' + meetingEntityName.slice(-2) + '%']
        );
        const ns = meetingEntityName.length >= 3 ? meetingEntityName.slice(-2) : meetingEntityName;
        for (const r of (ar || [])) {
          const t = ((r.raw_input || '') as string).trim();
          if (t.length < 5) continue;
          allCandidates.push({ text: '你曾对他说：' + t, isSelf: false });
        }
      }
    } catch {}

    // ── 源4: roleplay 时间聚类 ──
    try {
      const s4 = (ctx as any).storage?.getSQLite?.();
      if (s4 && typeof s4.queryAll === 'function') {
        const rt = s4.queryAll(
          "SELECT created_at FROM memories WHERE memory_kind='roleplay' AND raw_input LIKE ? ORDER BY created_at LIMIT 20",
          ['%' + meetingEntityName + '%']
        );
        if (rt?.length > 0) {
          const windows: Array<[string, string]> = [];
          for (const tr of rt) {
            const ts = tr.created_at as string;
            const ws = new Date(new Date(ts).getTime() - 15 * 60 * 1000).toISOString();
            const we = new Date(new Date(ts).getTime() + 15 * 60 * 1000).toISOString();
            let merged = false;
            for (const w of windows) {
              if (ws <= w[1] && we >= w[0]) { if (ws < w[0]) w[0] = ws; if (we > w[1]) w[1] = we; merged = true; break; }
            }
            if (!merged) windows.push([ws, we]);
          }
          for (const tw of windows.slice(0, 5)) {
            const cl = s4.queryAll(
              "SELECT raw_input, leaf_zone FROM memories WHERE memory_kind='roleplay' AND created_at BETWEEN ? AND ? ORDER BY created_at LIMIT 10",
              [tw[0], tw[1]]
            );
            for (const cr of (cl || [])) {
              const t = ((cr.raw_input || '') as string).trim();
              if (t.length < 5) continue;
              allCandidates.push({ text: (cr.leaf_zone === 'assistant' ? '你说：' : '鸿艺说：') + t, isSelf: false });
            }
          }
        }
      }
    } catch {}

    // ── 阶段2: ngram 相关性排序 ──
    const queryNgrams = new Set<string>();
    if (userMsg) {
      for (let i = 0; i < userMsg.length - 1; i++) {
        queryNgrams.add(userMsg.substring(i, Math.min(i + 2, userMsg.length)));
        if (i + 2 < userMsg.length) queryNgrams.add(userMsg.substring(i, i + 3));
      }
      // 🔴 V10.4: 家庭称谓扩展——用户提到家庭成员名字时,也添加关系词到ngram
      try {
        const _relMap: Record<string, string[]> = {
          'mother_of': ['妈妈','母亲','妈'], 'father_of': ['爸爸','父亲','爸'],
          'elder_sister_of': ['姐姐','姐'], 'younger_sister_of': ['妹妹','妹'],
          'elder_brother_of': ['哥哥','哥'], 'younger_brother_of': ['弟弟','弟'],
          'spouse_of': ['老婆','老公','妻子','丈夫'],
        };
        for (const e of (fg as any).getRelatedPersons?.(meetingEntityName) || []) {
          if (userMsg.includes(e.name) && _relMap[e.relation]) {
            for (const _t of _relMap[e.relation]) { queryNgrams.add(_t); }
            break; // 一位家庭成员匹配就够了
          }
        }
      } catch {}
    }

    // 🔧 V10.3 fix: 泛化问题不适用关键词排序 → 改用话题多样性采样
    const isGenericQuery = queryNgrams.size === 0 || /^(?:我们以前|你还记得|之前|过去|以前|原来|聊过什么|聊了些什么|聊过哪些|还记得.*吗|说说.*以前)/.test(userMsg);

    const seen = new Set<string>();
    let ranked: Array<{ text: string; score: number }>;

    if (isGenericQuery) {
      // 泛化问题 → 按时间均匀采样 + 话题多样性
      const deduped = allCandidates.filter(c => {
        const head = c.text.substring(0, 25);
        if (seen.has(head)) return false;
        seen.add(head);
        return true;
      });

      // 均匀采样: 从开头、中间、尾部各取等量
      const segment = Math.max(1, Math.floor(deduped.length / 3));
      const picks: typeof deduped = [];
      // 取头部(最近) + 中部 + 尾部(最久)，每段各取最多 8 条
      for (const seg of [0, segment, Math.max(0, deduped.length - segment)]) {
        const batch = deduped.slice(seg, seg + Math.min(8, segment));
        picks.push(...batch);
      }
      ranked = picks.map(c => ({ ...c, score: 1.0 }));
    } else {
      // 具体问题 → ngram 相关性排序 + isSelf加成
      ranked = allCandidates
        .map(c => {
          let score = 1.0;
          if (userMsg && queryNgrams.size > 0) {
            const lower = c.text.toLowerCase();
            let hits = 0;
            for (const ng of queryNgrams) { if (lower.includes(ng)) hits++; }
            score = hits / queryNgrams.size;
          }
        return { ...c, score };
      })
      .filter(c => {
          const head = c.text.substring(0, 25);
          if (seen.has(head)) return false;
          seen.add(head);
          return true;
        })
        .sort((a, b) => b.score - a.score);
    }

    // V10.5 P0: 提炼压缩——每条100字+情感保留，6条上限
    const topN = Math.min(ranked.length, 6);
    const EMOTION_WORDS = new Set(['开心','难过','累','烦','焦虑','兴奋','生气','委屈','感动','紧张','害怕','担心',
      '加班','项目','方案','工作','研究','学校','图书馆','问卷','实验','数据','论文']);
    const display = ranked.slice(0, topN).map(r => {
      const t = r.text;
      if (t.length <= 100) return t;
      // 保留包含情感/工作关键词的前后文
      let bestEnd = 100;
      for (const kw of EMOTION_WORDS) {
        const idx = t.indexOf(kw);
        if (idx > 30 && idx < 180) bestEnd = Math.max(bestEnd, Math.min(idx + kw.length + 30, 180));
      }
      return t.substring(0, bestEnd) + '…';
    });

    if (display.length > 0) {
      const narrativeIntro = '【回忆素材】以下是' + meetingEntityName + '的真实对话——回忆这些事不是编造。用自己的话像老朋友叙旧一样自然地讲出来。记忆中没写的细节不要自编。\n';
      const narrativeTail = '\n--- 以上，组织成自然的回忆叙述。 ---';
      fragments.push(narrativeIntro + '\n' + display.join('\n') + narrativeTail);
      stats.memory = allCandidates.length;
    }

    console.log('[MeetingContext] ' + meetingEntityName + ' → 候选' + allCandidates.length + '条 注入' + display.length + '条(语义排序)');
  } catch { /* 非关键 */ }

  // ═══ ④ 实体知识库条目 ═══
  try {
    const uuid = (fg as any).getUUIDByName?.(meetingEntityName);
    if (uuid && ctx.knowledgeBase) {
      const kbItems = await ctx.knowledgeBase?.search?.(meetingEntityName, 5) || [];
      const entityKb = kbItems.filter((k: any) => k.belong_entity_uuid === uuid || (k.title || '').includes(meetingEntityName));
      if (entityKb.length > 0) {
        const kbContent = entityKb.map((k: any) => `📄 ${k.title}: ${(k.content || '').substring(0, 300)}`).join('\n');
        if (!kbText.includes(kbContent.substring(0, 30))) {
          kbText = (kbText ? kbText + '\n\n' : '') + '【关于我的知识】\n' + kbContent;
          stats.knowledge++;
        }
      }
    }
  } catch { /* 非关键 */ }

  if (stats.profile + stats.family + stats.memory + stats.knowledge > 0) {
    console.log('[MeetingContext] ' + meetingEntityName + ': 档案' + stats.profile + ' 家人' + stats.family + ' 记忆' + stats.memory + '条 知识' + stats.knowledge + '条');
  }

  return { memoryFragments: fragments, knowledgeBaseText: kbText };
}
