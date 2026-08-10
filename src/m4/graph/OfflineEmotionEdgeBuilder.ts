/**
 * OfflineEmotionEdgeBuilder — 离线情绪边构建器 (V13.0)
 * ====================================================
 * 利用 WenStar 独有 24D 情绪向量建立情绪共振边。
 * 不只是"内容相似"——而是"心境相似"。
 *
 * 建边规则:
 *   1. 同 namespace + 同 belong_entity_uuid
 *   2. source 时间早于 target
 *   3. 情绪象限相似度 ≥ 0.75
 *   4. 钙化分 ≥ 0.5 的记忆优先
 *   5. 每条记忆最多 top-5 emotion 出边
 *
 * 复用 emotionalSimilarity() from m2/math.ts
 */

import type { MemoryAssociationRepository } from './MemoryAssociationRepository.js';
import { cosineSimilarity, parseStoredVector, perceptionV40ObjectTo24DArray } from '../VectorReranker.js';

export interface EmotionBuildOptions {
  namespace?: string;
  belongEntityUuid?: string;
  sinceTimestampMs?: number;
  limit?: number;
  /** 情绪子空间相似度阈值 */
  minSimilarity?: number;
  /** 钙化分最低门槛 */
  minCalciumScore?: number;
}

const DEFAULT_OPTIONS: Required<EmotionBuildOptions> = {
  namespace: 'default',
  belongEntityUuid: '',
  sinceTimestampMs: 0,
  limit: 100,
  minSimilarity: 0.75,
  minCalciumScore: 0.5,
};

/** 情绪子空间: 6 维 (pleasure/arousal/dominance/aggression/sincerity/humor) */
const EMOTION_DIM_RANGE = [0, 6] as const;

export class OfflineEmotionEdgeBuilder {
  private repo: MemoryAssociationRepository;
  private storage: any;

  constructor(repo: MemoryAssociationRepository, storage: any) {
    this.repo = repo;
    this.storage = storage;
  }

  async buildIncremental(opts?: EmotionBuildOptions): Promise<number> {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    const ns = o.namespace;
    let created = 0;

    const newMemories = this._getRecentMemories(ns, o.belongEntityUuid, o.sinceTimestampMs, o.limit);
    if (newMemories.length === 0) return 0;

    for (const mem of newMemories) {
      const memVec = this._getVector(mem);
      if (!memVec) continue;

      // 情绪子空间 (0-5维)
      const memEmotionVec = memVec.slice(EMOTION_DIM_RANGE[0], EMOTION_DIM_RANGE[1]);

      const existingOut = this.repo.getEdges({
        namespace: ns,
        belongEntityUuid: mem.belongEntityUuid ?? '',
        globalUid: mem.globalUid,
        edgeTypes: ['emotion'],
        direction: 'out',
        limit: 5,
      });
      if (existingOut.length >= 5) continue;

      const candidates = this._getCandidateMemories(
        ns, mem.belongEntityUuid ?? '', mem.timestampMs, 200,
      );

      const scored: Array<{ candidate: any; similarity: number }> = [];
      for (const prev of candidates) {
        if (prev.globalUid === mem.globalUid) continue;
        if ((prev.calcium_score ?? 0) < o.minCalciumScore) continue;
        const prevVec = this._getVector(prev);
        if (!prevVec) continue;
        const prevEmotionVec = prevVec.slice(EMOTION_DIM_RANGE[0], EMOTION_DIM_RANGE[1]);
        const sim = cosineSimilarity(memEmotionVec, prevEmotionVec);
        if (sim >= o.minSimilarity) {
          scored.push({ candidate: prev, similarity: sim });
        }
      }

      scored.sort((a, b) => b.similarity - a.similarity);
      const remaining = 5 - existingOut.length;

      for (let i = 0; i < Math.min(remaining, scored.length); i++) {
        const { candidate, similarity } = scored[i];
        const result = this.repo.createOrUpdateEdge({
          namespace: ns,
          belongEntityUuid: mem.belongEntityUuid ?? '',
          sourceGlobalUid: candidate.globalUid,
          targetGlobalUid: mem.globalUid,
          edgeType: 'emotion',
          edgeReason: `offline_emotional_resonance_sim=${similarity.toFixed(3)}`,
          confidence: similarity,
          weight: similarity,
          sourceTimestampMs: candidate.timestampMs ?? 0,
          targetTimestampMs: mem.timestampMs,
          createdBy: 'offline_emotion_builder',
        });
        if (result !== null) created++;
      }

      if (created >= 500) break;
    }

    return created;
  }

  private _getRecentMemories(ns: string, euuid: string, sinceMs: number, limit: number): any[] {
    try {
      if (typeof this.storage.findMemoriesSince === 'function') {
        return this.storage.findMemoriesSince({ namespace: ns, belongEntityUuid: euuid, sinceTimestampMs: sinceMs, limit });
      }
      if (typeof this.storage.findBySeqPosRange === 'function') {
        return this.storage.findBySeqPosRange(0, 999_999_999, { limit });
      }
    } catch { /* skip */ }
    return [];
  }

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

  private _getVector(mem: any): number[] | null {
    // V12.4 阶段B 根除24D: 新记录形态 record.perceptionV40（PerceptionV40 对象）→ 40D 反解 24D 数组；
    // 兼容旧 JSON 串（mem.perception_json / perceptionJson）
    if (mem.perceptionV40 && typeof mem.perceptionV40 === 'object') {
      return perceptionV40ObjectTo24DArray(mem.perceptionV40 as any);
    }
    return parseStoredVector(mem.perception_json ?? mem.perceptionJson);
  }
}
