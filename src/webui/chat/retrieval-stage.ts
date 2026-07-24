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
  _bdVecCache: Map<string, Array<{ row: any; score: number }>>;
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
  const { ctx, message, dna, p, enrichedHistory, memoryFragments, _bdVecCache, _meetingEntityName } = input;

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
        const fallback = ctx.storage.findByEmotionalSimilarity({ current_perception: p, similarity_mode: 'balanced', limit: 2 });
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

  // ── 黑钻库检索：V10.1 多级检索（FTS5不可用→LIKE→短词拆分→钙化兜底）──
  try {
    if (message.trim().length > 1) {
      const _bdLimit = isTopicShift ? 6 : 3;
      const _sqlite = ctx.storage.getSQLite();
      if (_sqlite && typeof _sqlite.queryAll === 'function') {
        const _kw = message.replace(/[？?！!。，、：；\s"''""【】《》\(\)（）]/g, '').trim();
        if (_kw.length > 1) {
          let _rows: any[] = [];
          // 🔧 V10.1: FTS5 永远不可用(sql.js无fts5模块)，直接用 LIKE + 多词拆分
          // ① 全关键词 LIKE 搜索
          _rows = _sqlite.queryAll(
            "SELECT id, summary, emotion_tag, tags FROM black_diamond WHERE summary LIKE ? OR tags LIKE ? ORDER BY calcium_level DESC, created_at DESC LIMIT 15",
            ['%' + _kw + '%', '%' + _kw + '%']
          );
          // ② 短词拆分：中文按2-3字窗口拆分，逐个搜索
          if (_rows.length < _bdLimit && _kw.length >= 4) {
            const _seenIds = new Set(_rows.map((r: any) => r.id));
            for (let _ci = 0; _ci < _kw.length - 1 && _rows.length < _bdLimit + 3; _ci++) {
              const _chunk = _kw.substring(_ci, Math.min(_ci + 3, _kw.length));
              if (_chunk.length < 2) continue;
              const _more = _sqlite.queryAll(
                "SELECT id, summary, emotion_tag, tags FROM black_diamond WHERE (summary LIKE ? OR tags LIKE ?) AND id NOT IN (" + [..._seenIds].map(function(id: string) { return "'" + id + "'"; }).join(',') + ") ORDER BY calcium_level DESC, created_at DESC LIMIT 3",
                ['%' + _chunk + '%', '%' + _chunk + '%']
              );
              for (const _r of _more || []) {
                if (!_seenIds.has(_r.id)) { _rows.push(_r); _seenIds.add(_r.id); }
              }
            }
          }
          // ③ 宽泛兜底：钙化分最高的黑钻
          if (_rows.length < _bdLimit) {
            const _seenIds = new Set(_rows.map((r: any) => r.id));
            const _fallback = _sqlite.queryAll(
              "SELECT id, summary, emotion_tag, tags FROM black_diamond ORDER BY calcium_level DESC, created_at DESC LIMIT 20"
            );
            for (const _r of _fallback || []) {
              if (_seenIds.has(_r.id)) continue;
              _rows.push(_r);
              _seenIds.add(_r.id);
              if (_rows.length >= _bdLimit + 3) break;
            }
            if (_seenIds.size > _rows.length - _fallback.length) console.log('[BlackDiamond] 钙化兜底 ' + (_seenIds.size - _rows.length + _fallback.length) + ' 条');
          }
          _rows = _rows.slice(0, _bdLimit);
          for (const _r of _rows) {
            const _tag = _r.emotion_tag ? '【' + _r.emotion_tag + '】' : '';
            // 🔧 V10.1: 扩展上下文——从 source_id 关联 memories 获取原始对话
            let _context = (_r.summary || '').substring(0, 200);
            try {
              if (_r.source_id) {
                const _mem = _sqlite.queryAll('SELECT raw_input FROM memories WHERE id = ? LIMIT 1', [_r.source_id]);
                if (_mem?.length && _mem[0].raw_input) {
                  const _raw = _mem[0].raw_input.substring(0, 200);
                  if (_raw !== _context.substring(0, Math.min(_raw.length, _context.length))) {
                    _context = _raw + '（珍藏记忆：' + _context.substring(0, 80) + '）';
                  }
                }
              }
            } catch { /* 关联失败不阻塞 */ }
            memoryFragments.push('【珍藏记忆】' + _tag + _context);
            try {
              _sqlite.writeRaw('UPDATE black_diamond SET recall_count = recall_count + 1, updated_at = ? WHERE id = ?',
                [new Date().toISOString(), _r.id]);
            } catch (e: any) { console.error('[Retrieval] error:', e?.message); }
          }
          if (_rows.length > 0) console.log('[BlackDiamond] 命中 ' + _rows.length + ' 条珍藏记忆');

          // SP3-3: 黑钻向量补充检索（带每轮缓存）
          if (_rows.length < 3) {
            try {
              const _cacheKey = '_bd_vec_' + (message.length > 50 ? message.substring(0, 20) : message.substring(0, 10));
              let scored: Array<{ row: any; score: number }> = [];
              if (_bdVecCache.has(_cacheKey)) {
                scored = _bdVecCache.get(_cacheKey)!;
              } else {
                const allDiamonds = _sqlite.queryAll("SELECT id, summary, emotion_tag, emotion_vector, l2_norm, calcium_level FROM black_diamond");
                const queryVec = [p.pleasure, p.arousal, p.dominance, p.aggression, p.sincerity, p.humor, p.factual, p.logical, p.certainty, p.abstract, p.temporal_focus, p.self_ref, p.intimacy, p.power_diff, p.dependency, p.moral_judgment, p.etiquette, p.belonging, p.sexual_attraction, p.sensory_craving, p.energy_merge, p.possessiveness, p.ecstasy, p.safety];
                let qL2 = 0;
                for (let _di = 0; _di < 24; _di++) qL2 += queryVec[_di] ** 2;
                qL2 = Math.sqrt(qL2);
                let _skipped = 0, _scanned = 0;
                for (const _d of allDiamonds as any[]) {
                  if (!_d.emotion_vector) continue;
                  try {
                    const dv = JSON.parse(_d.emotion_vector as string);
                    if (!dv || !Array.isArray(dv) || dv.length !== 24) continue;
                    // 🔧 V10.1: 实时计算 l2_norm + 检测全零向量（数据损坏）
                    let _sumSq = 0, _nonZero = 0;
                    for (let _di = 0; _di < 24; _di++) { const v = Number(dv[_di]) || 0; if (v !== 0) _nonZero++; _sumSq += v * v; }
                    // 只跳过全零向量（数据损坏），其他都参与计算
                    if (_nonZero === 0) { _skipped++; continue; }
                    const _dL2 = Math.sqrt(_sumSq);
                    _scanned++;
                    let dot = 0;
                    for (let _di = 0; _di < 24; _di++) dot += queryVec[_di] * dv[_di];
                    const sim = dot / (qL2 * _dL2 || 0.0001);
                    // V8.0: 阈值从 0.3 降到 0.15，加钙化分补偿让低情感场景也能命中
                    const _bdCal = (_d.calcium_level || 1) as number;
                    const _bdThreshold = 0.15 + (_bdCal >= 3 ? 0 : _bdCal >= 2 ? 0.03 : 0.06);
                    if (sim > _bdThreshold) scored.push({ row: _d, score: sim + _bdCal * 0.05 });
                  } catch { /* 跳过解析失败 */ }
                }
                scored.sort((a, b) => b.score - a.score);
                if (_skipped > 0) console.log(`[BlackDiamond] l2剪枝: ${_skipped}条跳过, ${_scanned}条计算`);
                _bdVecCache.set(_cacheKey, scored);
                if (_bdVecCache.size > 500) {
                  const firstKey = _bdVecCache.keys().next().value;
                  if (firstKey) _bdVecCache.delete(firstKey);
                }
              }
              const vecResults = scored.slice(0, 3 - _rows.length);
              for (const _vr of vecResults) {
                const _tag = _vr.row.emotion_tag ? "【" + _vr.row.emotion_tag + "】" : "";
                const exists = _rows.some((_ex: any) => _ex.id === _vr.row.id);
                if (!exists && (_vr.row.summary || "")) {
                  memoryFragments.push("【珍藏记忆】" + _tag + (_vr.row.summary || "").substring(0, 120));
                }
              }
              if (vecResults.length > 0) console.log("[BlackDiamond] 向量补充 " + vecResults.length + " 条");
              // 🔧 V10.1: 向量检索 + FTS5 都不足时，钙化分兜底
              if (_rows.length + vecResults.length < _bdLimit) {
                try {
                  const _needMore = _bdLimit - _rows.length - vecResults.length;
                  const _seenIds = new Set(_rows.map((r: any) => r.id));
                  vecResults.forEach((v: any) => _seenIds.add(v.row.id));
                  const _allBD = _sqlite.queryAll(
                    "SELECT id, summary, emotion_tag FROM black_diamond WHERE calcium_level >= 2 ORDER BY calcium_level DESC, created_at DESC LIMIT 50"
                  );
                  let _added = 0;
                  for (const _bd of _allBD || []) {
                    if (_seenIds.has(_bd.id)) continue;
                    const _tag = _bd.emotion_tag ? "【" + _bd.emotion_tag + "】" : "";
                    memoryFragments.push("【珍藏记忆】" + _tag + (_bd.summary || "").substring(0, 120));
                    _seenIds.add(_bd.id);
                    _added++;
                    if (_added >= _needMore) break;
                  }
                  if (_added > 0) console.log("[BlackDiamond] 钙化兜底 " + _added + " 条");
                } catch { /* 非关键 */ }
              }
            } catch (_ve) { console.warn('[RetrievalErr] 黑钻向量补充失败:', (_ve as Error).message); }
          }
        }
      }
    }
  } catch (err) { console.warn('[BlackDiamond] 检索失败:', err); }

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
      const _sandRows = _sqlite.queryAll(
        "SELECT raw_input, calcium_level FROM memories WHERE leaf_zone='user' AND calcium_level >= 2 ORDER BY calcium_score DESC LIMIT 10"
      ) || [];
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
