/**
 * CausalSkeletonPruner — 最小因果骨架剪枝器 (V13.0)
 * =================================================
 * 将 BFS 闭包展开的较大子图裁剪为最小可读骨架。
 *
 * 保留优先级:
 *   1. 所有 seed 节点 (绝不可剪)
 *   2. confidence ≥ 0.75 的 causal 边
 *   3. 与 seed 直接相连的 entity 边
 *   4. 每个 seed 最多 2 条 semantic 边
 *   5. 每个 seed 最多 2 条 emotion 边
 *   6. 保证子图节点数 ≤ 30
 *
 * 边评分: confidence × weight × edgeTypePriority × seedBoost(×1.25)
 */

import type { MemoryClosureResult, MemoryAssociation } from './MemoryAssociationTypes.js';
import type { MemoryEdgeType } from './MemoryAssociationTypes.js';

const EDGE_PRIORITY: Record<MemoryEdgeType, number> = {
  causal: 4,
  entity: 3,
  semantic: 2,
  emotion: 2,
};

export interface PruneOptions {
  maxNodes?: number;
  maxEdges?: number;
  minConfidence?: number;
}

const DEFAULT_PRUNE_OPTIONS: Required<PruneOptions> = {
  maxNodes: 30,
  maxEdges: 50,
  minConfidence: 0.55,
};

export class CausalSkeletonPruner {
  /**
   * 裁剪闭包子图，保留最小可读骨架
   */
  prune(input: MemoryClosureResult, options?: PruneOptions): MemoryClosureResult {
    const opts = { ...DEFAULT_PRUNE_OPTIONS, ...options };
    const seedSet = new Set(input.seedGlobalUids);

    // 1. 给每条边打分
    const scoredEdges = input.edges
      .filter(e => e.confidence >= opts.minConfidence)
      .map(e => ({
        edge: e,
        score: this._edgeScore(e, seedSet),
      }))
      .sort((a, b) => b.score - a.score);

    // 2. 逐条选边，直到达到限制
    const keptEdges: MemoryAssociation[] = [];
    const keptNodes = new Set<string>(input.seedGlobalUids);
    const seedEdgeCount = new Map<string, number>(); // seed → 已选 semantic/emotion 边数

    for (const { edge } of scoredEdges) {
      if (keptEdges.length >= opts.maxEdges) break;
      if (keptNodes.size >= opts.maxNodes) break;

      // 每个 seed 最多 2 条 semantic/emotion 边
      if (edge.edgeType === 'semantic' || edge.edgeType === 'emotion') {
        const isSeedSource = seedSet.has(edge.sourceGlobalUid);
        const isSeedTarget = seedSet.has(edge.targetGlobalUid);
        const seedId = isSeedSource ? edge.sourceGlobalUid : isSeedTarget ? edge.targetGlobalUid : null;
        if (seedId) {
          const cnt = seedEdgeCount.get(seedId) ?? 0;
          if (cnt >= 2) continue;
          seedEdgeCount.set(seedId, cnt + 1);
        }
      }

      keptEdges.push(edge);
      keptNodes.add(edge.sourceGlobalUid);
      keptNodes.add(edge.targetGlobalUid);
    }

    // 3. 如果还有空间，把种子节点相关的 entity 边也带上
    if (keptEdges.length < opts.maxEdges && keptNodes.size < opts.maxNodes) {
      for (const edge of input.edges) {
        if (keptEdges.length >= opts.maxEdges) break;
        if (keptNodes.size >= opts.maxNodes) break;
        if (keptEdges.includes(edge)) continue;
        if (edge.edgeType === 'entity' && edge.confidence >= opts.minConfidence) {
          const touchesSeed = seedSet.has(edge.sourceGlobalUid) || seedSet.has(edge.targetGlobalUid);
          if (touchesSeed) {
            keptEdges.push(edge);
            keptNodes.add(edge.sourceGlobalUid);
            keptNodes.add(edge.targetGlobalUid);
          }
        }
      }
    }

    return {
      seedGlobalUids: input.seedGlobalUids,
      nodes: input.nodes.filter(n => keptNodes.has(n.globalUid)),
      edges: keptEdges,
    };
  }

  private _edgeScore(edge: MemoryAssociation, seedSet: Set<string>): number {
    const priority = EDGE_PRIORITY[edge.edgeType] ?? 1;
    const touchesSeed = seedSet.has(edge.sourceGlobalUid) || seedSet.has(edge.targetGlobalUid);
    const seedBoost = touchesSeed ? 1.25 : 1.0;
    return edge.confidence * edge.weight * priority * seedBoost;
  }
}
