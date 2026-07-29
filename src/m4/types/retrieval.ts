/**
 * retrieval.ts — 四路召回统一类型定义 (V12.0)
 * ============================================
 * 四路独立排名输出的统一接口，替代 MemoryRetriever 内部的数组拼接。
 *
 * 四路召回:
 *   emotion  — 24D 情绪相似度降序（mood_congruent 模式）
 *   keyword  — n-gram 关键词命中数降序
 *   spine    — state_spines 24D 余弦相似度降序
 *   locus    — 话题前缀匹配 + seq_pos 降序
 *   entity   — belong_entity_uuid 直查 + 时序降序
 */

/** 单条结果（四路通用） */
export interface RankedItem {
  id: string;            // branch_id 或 global_uid
  text: string;          // 摘要文本（≤200 字符）
  score: number;         // 路内原始分
  source: 'emotion' | 'keyword' | 'spine' | 'locus' | 'entity';
  entityUuid: string | null;
  calciumScore: number;
  createdAt: string;
}

/** 一路召回输出（路内已按 score 降序） */
export interface RankedList {
  source: RankedItem['source'];
  items: RankedItem[];
}

/** 四路召回聚合结果 */
export interface MultiRankResult {
  lists: RankedList[];          // 四路各自排名（路内已排序）
  totalCandidates: number;      // 去重后总候选数
  indexHit: boolean;            // 海马体稀疏索引是否命中
  indexedIds: string[];         // 索引命中的记忆 ID 列表
}

/** RRF 融合后的单条结果 */
export interface RRFFusedItem {
  id: string;
  rrfScore: number;
  sourceCount: number;          // 被几路同时命中
}

/** MMR 多样性去重后的最终结果 */
export interface MMRSelectedItem extends RankedItem {
  mmrScore: number;             // MMR 最终得分
}

/** 检索模式（与 VectorReranker 保持一致） */
export type SearchMode = 'introvert' | 'balanced' | 'full';
