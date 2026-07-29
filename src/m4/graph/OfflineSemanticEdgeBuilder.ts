/**
 * OfflineSemanticEdgeBuilder — 离线语义边构建器 (V13.0)
 * ====================================================
 * 利用 24D state_spines 余弦相似度建立语义相似边。
 * 挂载在 SWR/DELTA 节律，不阻塞主写入链路。
 *
 * 建边规则:
 *   1. 同 namespace + 同 belong_entity_uuid
 *   2. source 时间早于 target
 *   3. 24D 余弦相似度 ≥ 0.72
 *   4. 每条记忆最多 top-5 semantic 出边
 *   5. 单次任务最多写 500 条边
 */

import type { MemoryAssociationRepository } from './MemoryAssociationRepository.js';
import { cosineSimilarity, parseStoredVector } from '../VectorReranker.js';

export interface SemanticBuildOptions {
  namespace?: string;
  belongEntityUuid?: string;
  /** 只处理此时间之后新增的记忆 */
  sinceTimestampMs?: number;
  /** 新记忆数上限 */
  limit?: number;
  /** 相似度阈值 */
  minSimilarity?: number;
}

const DEFAULT_OPTIONS: Required<SemanticBuildOptions> = {
  namespace: 'default',
  belongEntityUuid: '',
  sinceTimestampMs: 0,
  limit: 100,
  minSimilarity: 0.72,
};

export class OfflineSemanticEdgeBuilder {
  private repo: MemoryAssociationRepository;
  private storage: any;  // FusionStorageAdapter — 只读查询

  constructor(repo: MemoryAssociationRepository, storage: any) {
    this.repo = repo;
    this.storage = storage;
  }

  /**
   * 增量构建语义边：为最近新增记忆找到语义相似的旧记忆
   * @returns 本次创建的边数
   */
  async buildIncremental(opts?: SemanticBuildOptions): Promise<number> {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const ns = o.namespace;
    let created = 0;

    // 获取最近新增的记忆（需要 storage 提供查询能力）
    const newMemories = this._getRecentMemories(ns, o.belongEntityUuid, o.sinceTimestampMs, o.limit);
    if (newMemories.length === 0) return 0;

    for (const mem of newMemories) {
      // 只在已有语义出边不足 5 条时才建
      const existingOut = this.repo.getEdges({
        namespace: ns,
        belongEntityUuid: mem.belongEntityUuid ?? '',
        globalUid: mem.globalUid,
        edgeTypes: ['semantic'],
        direction: 'out',
        limit: 5,
      });
      if (existingOut.length >= 5) continue;

      const memVec = this._getVector(mem);
      if (!memVec) continue;

      // 扫描旧候选（在 mem 之前创建的记忆）
      const candidates = this._getCandidateMemories(ns, mem.belongEntityUuid ?? '', mem.timestampMs, 200);
      const scored: Array<{ candidate: any; similarity: number }> = [];

      for (const prev of candidates) {
        if (prev.globalUid === mem.globalUid) continue;
        const prevVec = this._getVector(prev);
        if (!prevVec) continue;
        const sim = cosineSimilarity(memVec, prevVec);
        if (sim >= o.minSimilarity) {
          scored.push({ candidate: prev, similarity: sim });
        }
      }

      // 取 top-5 减已有数
      scored.sort((a, b) => b.similarity - a.similarity);
      const remaining = 5 - existingOut.length;

      for (let i = 0; i < Math.min(remaining, scored.length); i++) {
        const { candidate, similarity } = scored[i];
        const result = this.repo.createOrUpdateEdge({
          namespace: ns,
          belongEntityUuid: mem.belongEntityUuid ?? '',
          sourceGlobalUid: candidate.globalUid,  // 旧→新
          targetGlobalUid: mem.globalUid,
          edgeType: 'semantic',
          edgeReason: `offline_24d_cosine_sim=${similarity.toFixed(3)}`,
          confidence: similarity,
          weight: similarity,
          sourceTimestampMs: candidate.timestampMs ?? 0,
          targetTimestampMs: mem.timestampMs,
          createdBy: 'offline_semantic_builder',
        });
        if (result !== null) created++;
      }

      // 单轮上限保护
      if (created >= 500) break;
    }

    return created;
  }

  /** 从 storage 获取最近记忆（封装: 实际接入时替换为 storage.findMemoriesSince） */
  private _getRecentMemories(ns: string, euuid: string, sinceMs: number, limit: number): any[] {
    try {
      if (typeof this.storage.findMemoriesSince === 'function') {
        return this.storage.findMemoriesSince({ namespace: ns, belongEntityUuid: euuid, sinceTimestampMs: sinceMs, limit });
      }
      // fallback: 通过 seq_pos 范围查询
      if (typeof this.storage.findBySeqPosRange === 'function') {
        return this.storage.findBySeqPosRange(0, 999_999_999, { limit });
      }
    } catch { /* storage 不可用时返回空 */ }
    return [];
  }

  /** 从 storage 获取候选旧记忆 */
  private _getCandidateMemories(ns: string, euuid: string, beforeMs: number, limit: number): any[] {
    try {
      if (typeof this.storage.findMemoriesBefore === 'function') {
        return this.storage.findMemoriesBefore({ namespace: ns, belongEntityUuid: euuid, beforeTimestampMs: beforeMs, limit });
      }
      if (typeof this.storage.findBySeqPosRange === 'function') {
        return this.storage.findBySeqPosRange(0, 999_999_999, { limit });
      }
    } catch { /* skip */ }
    return [];
  }

  /** 提取向量 */
  private _getVector(mem: any): number[] | null {
    return parseStoredVector(mem.perception_json ?? mem.perceptionJson);
  }
}
