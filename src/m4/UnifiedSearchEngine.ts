/**
 * UnifiedSearchEngine — 统一语义搜索引擎 (V11.0)
 * ================================================
 * 编排 n-gram倒排索引初筛 → 自有32D向量精排 全流程。
 * 是全部检索请求的唯一入口。取代此前分散在 retrieval-stage 中的四段独立检索。
 *
 * 架构:
 *  第0层（可选）: 时序寻址围栏 — findByTimeRange / AtomAddressTimeline
 *  第1层:         n-gram倒排索引极速粗筛 — search_index 交运算
 *  第2层:         自有32D语义向量精细化重排 — VectorReranker
 *
 * 设计硬约束:
 *   - n-gram仅做前置围栏，不参与最终排序
 *   - 最终排序权完全交给自有32D仿生心智向量
 *   - 零外部API调用
 *   - belong_entity_uuid 强制过滤
 */

import { buildNgrams } from './SearchIndexBuilder.js';
import { rankByVector, perceptionToArray, type MemoryCandidate, type RankedMemory, type SearchMode } from './VectorReranker.js';
import type { Perception24D } from '../m3/types/perception.js';

// ── 搜索选项 ──
export interface SearchOptions {
  /** 检索力度模式 */
  mode?: SearchMode;
  /** 实体UUID过滤（可选，传入当前对话的实体UUID列表） */
  entityUuids?: string[];
  /** 时间范围过滤（可选，ISO 8601 起止时间） */
  timeRange?: { start: string; end?: string };
  /** 最大返回条数 */
  limit?: number;
  /** 是否包含知识库 */
  includeKnowledgeBase?: boolean;
}

/** 搜索结果 */
export interface SearchResult {
  items: string[];                // 格式化后的记忆文本（可直接注入 memoryFragments）
  raw: RankedMemory[];            // 原始排序结果
  hitsBySource: Record<string, number>;
  totalCandidates: number;
}

/**
 * 搜索入口
 *
 * @param db     sql.js Database 实例
 * @param query  用户消息原文
 * @param perception 当前24D感知向量（用于向量精排）
 * @param opts   搜索选项
 * @returns 搜索结果
 */
export function search(
  db: any,
  query: string,
  perception?: Perception24D | null,
  opts: SearchOptions = {},
): SearchResult {
  const mode = opts.mode || 'balanced';
  const limit = opts.limit || 8;
  const includeKB = opts.includeKnowledgeBase !== false; // 默认包含知识库
  const entityUuids = opts.entityUuids || [];

  const ngrams = buildNgrams(query);
  if (ngrams.length === 0) {
    return { items: [], raw: [], hitsBySource: {}, totalCandidates: 0 };
  }

  // ═══════════ 第1层: n-gram初筛 ═══════════
  const candidates: MemoryCandidate[] = [];
  const seenIds = new Set<string>();

  // 对每个n-gram查 search_index，取候选文档ID的交运行
  for (const gram of ngrams.slice(0, 12)) { // 最多用12个n-gram（控制查询复杂度）
    try {
      const rows = db.exec(
        "SELECT source_type, source_id FROM search_index WHERE term = ? LIMIT 100",
        [gram],
      );
      if (!rows.length || !rows[0].values) continue;

      for (const [sourceType, sourceId] of rows[0].values) {
        const key = `${sourceType}:${sourceId}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        candidates.push({
          id: String(sourceId),
          text: '', // 后面从源表加载
          source: sourceType as MemoryCandidate['source'],
        });
      }
    } catch {
      // 个别term查询失败不阻塞
    }
  }

  if (candidates.length === 0) {
    return { items: [], raw: [], hitsBySource: {}, totalCandidates: 0 };
  }

  // ═══════════ 从源表加载完整文本 + 向量 + 元数据 ═══════════
  const hitsBySource: Record<string, number> = {};
  const enriched: MemoryCandidate[] = [];

  // 分组加载 — 每类源表用不同的字段映射
  const convIds = candidates.filter(c => c.source === 'conversation').map(c => c.id);
  const memIds = candidates.filter(c => c.source === 'memory').map(c => c.id);
  const bdIds = candidates.filter(c => c.source === 'black_diamond').map(c => c.id);
  const kbIds = includeKB ? candidates.filter(c => c.source === 'knowledge_base').map(c => c.id) : [];

  // 加载 conversations
  if (convIds.length > 0) {
    try {
      const placeholders = convIds.map(() => '?').join(',');
      const entityFilter = entityUuids.length > 0
        ? `AND (belong_entity_uuid IN (${entityUuids.map(() => '?').join(',')}) OR belong_entity_uuid IS NULL)`
        : '';
      const rows = db.exec(
        `SELECT id, content, belong_entity_uuid FROM conversations WHERE id IN (${placeholders}) ${entityFilter} LIMIT 50`,
        [...convIds, ...entityUuids],
      );
      if (rows.length && rows[0].values) {
        for (const [id, content, euuid] of rows[0].values) {
          enriched.push({
            id: String(id), text: String(content || '').substring(0, 800),
            source: 'conversation', entityUuid: euuid ? String(euuid) : null,
          });
        }
      }
    } catch { /* skip */ }
    hitsBySource.conversation = enriched.filter(c => c.source === 'conversation').length;
  }

  // 加载 memories（含向量）
  if (memIds.length > 0) {
    try {
      const placeholders = memIds.map(() => '?').join(',');
      const entityFilter = entityUuids.length > 0
        ? `AND (belong_entity_uuid IN (${entityUuids.map(() => '?').join(',')}) OR belong_entity_uuid IS NULL)`
        : '';
      const rows = db.exec(
        `SELECT id, raw_input, perception_json, calcium_score, calcium_level, confidence_score, effective_strength, created_at, belong_entity_uuid
         FROM memories WHERE id IN (${placeholders}) ${entityFilter} LIMIT 100`,
        [...memIds, ...entityUuids],
      );
      if (rows.length && rows[0].values) {
        for (const [id, rawInput, pJson, caScore, caLevel, confScore, effStr, createdAt, euuid] of rows[0].values) {
          enriched.push({
            id: String(id), text: String(rawInput || '').substring(0, 800),
            source: 'memory',
            perceptionJson: pJson ? String(pJson) : null,
            calciumScore: Number(caScore) || 0, calciumLevel: Number(caLevel) || 1,
            confidenceScore: Number(confScore) || 0.5, effectiveStrength: Number(effStr) || 1,
            createdAt: String(createdAt || ''), entityUuid: euuid ? String(euuid) : null,
          });
        }
      }
    } catch { /* skip */ }
    hitsBySource.memory = enriched.filter(c => c.source === 'memory').length;
  }

  // 加载 black_diamond（含向量）
  if (bdIds.length > 0) {
    try {
      const placeholders = bdIds.map(() => '?').join(',');
      const entityFilter = entityUuids.length > 0
        ? `AND (belong_entity_uuid IN (${entityUuids.map(() => '?').join(',')}) OR belong_entity_uuid IS NULL)`
        : '';
      const rows = db.exec(
        `SELECT id, summary, emotion_vector, calcium_level, created_at, belong_entity_uuid
         FROM black_diamond WHERE id IN (${placeholders}) ${entityFilter} LIMIT 50`,
        [...bdIds, ...entityUuids],
      );
      if (rows.length && rows[0].values) {
        for (const [id, summary, eVec, caLevel, createdAt, euuid] of rows[0].values) {
          enriched.push({
            id: String(id), text: String(summary || '').substring(0, 500),
            source: 'black_diamond',
            perceptionJson: eVec ? String(eVec) : null,
            calciumScore: Number(caLevel) || 1, calciumLevel: Number(caLevel) || 1,
            confidenceScore: 0.7, effectiveStrength: 1,
            createdAt: String(createdAt || ''), entityUuid: euuid ? String(euuid) : null,
          });
        }
      }
    } catch { /* skip */ }
    hitsBySource.black_diamond = enriched.filter(c => c.source === 'black_diamond').length;
  }

  // 加载知识库
  if (kbIds.length > 0) {
    try {
      const placeholders = kbIds.map(() => '?').join(',');
      const entityFilter = entityUuids.length > 0
        ? `AND (belong_entity_uuid IN (${entityUuids.map(() => '?').join(',')}) OR belong_entity_uuid IS NULL)`
        : '';
      const rows = db.exec(
        `SELECT id, title, content, belong_entity_uuid FROM knowledge_base WHERE id IN (${placeholders}) ${entityFilter} LIMIT 20`,
        [...kbIds, ...entityUuids],
      );
      if (rows.length && rows[0].values) {
        for (const [id, title, content, euuid] of rows[0].values) {
          const text = (title ? String(title) : '') + ': ' + String(content || '').substring(0, 500);
          enriched.push({
            id: String(id), text,
            source: 'knowledge_base', entityUuid: euuid ? String(euuid) : null,
          });
        }
      }
    } catch { /* skip */ }
    hitsBySource.knowledge_base = enriched.filter(c => c.source === 'knowledge_base').length;
  }

  // ═══════════ 第2层: 32D向量精排 ═══════════
  const queryVec = perception ? perceptionToArray(perception) : new Array(24).fill(0.5);

  const ranked = rankByVector(enriched, queryVec, mode);

  // ═══════════ 格式化输出 ═══════════
  const items: string[] = [];
  for (let i = 0; i < Math.min(ranked.length, limit); i++) {
    const r = ranked[i];
    const prefix = r.item.source === 'black_diamond' ? '💎'
      : r.item.source === 'knowledge_base' ? '📖' : '💭';
    items.push(`${prefix} ${r.item.text}`);
  }

  return {
    items,
    raw: ranked,
    hitsBySource,
    totalCandidates: candidates.length,
  };
}

/**
 * 批量搜索（对同一查询、不同实体UUID并行）
 */
export function searchByEntity(
  db: any,
  query: string,
  entityUuids: string[],
  perception?: Perception24D | null,
  opts: SearchOptions = {},
): Map<string, SearchResult> {
  const results = new Map<string, SearchResult>();
  for (const uuid of entityUuids) {
    results.set(uuid, search(db, query, perception, { ...opts, entityUuids: [uuid] }));
  }
  return results;
}

export default { search, searchByEntity };
