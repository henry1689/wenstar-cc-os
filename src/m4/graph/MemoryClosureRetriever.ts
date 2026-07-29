/**
 * MemoryClosureRetriever — DAG 闭包 BFS 检索器 (V13.0)
 * ====================================================
 * 从 RRF 种子节点出发，沿 memory_associations 边展开 1~2 跳，得到闭包子图。
 *
 * 设计硬约束:
 *   - maxDepth=2, maxNodes=80, minConfidence=0.55
 *   - 边权衰减: depth1 ×0.85, depth2 ×0.65
 *   - 所有查询强强制带 namespace + belong_entity_uuid
 *   - 跨域不可见
 */

import type { MemoryAssociationRepository } from './MemoryAssociationRepository.js';
import type { MemoryClosureResult, ClosureNode } from './MemoryAssociationTypes.js';

export interface ClosureRetrieveInput {
  namespace: string;
  belongEntityUuid: string;
  seedGlobalUids: string[];
  maxDepth?: number;
  maxNodes?: number;
  minConfidence?: number;
  direction?: 'out' | 'in' | 'both';
}

export class MemoryClosureRetriever {
  private repo: MemoryAssociationRepository;

  constructor(repo: MemoryAssociationRepository) {
    this.repo = repo;
  }

  /**
   * BFS 闭包展开：从种子节点沿边遍历 1~2 跳
   */
  retrieve(input: ClosureRetrieveInput): MemoryClosureResult {
    const maxDepth = input.maxDepth ?? 2;
    const maxNodes = input.maxNodes ?? 80;
    const minConf = input.minConfidence ?? 0.55;
    const direction = input.direction ?? 'both';

    const visited = new Set<string>();
    const queue: Array<{ uid: string; depth: number }> = [];
    const seedSet = new Set(input.seedGlobalUids);

    // 种子节点入队
    for (const uid of input.seedGlobalUids) {
      visited.add(uid);
      queue.push({ uid, depth: 0 });
    }

    const edgeMap = new Map<string, any[]>(); // uid → edges (去重用)
    const nodeDepth = new Map<string, number>(); // uid → depth

    // BFS
    while (queue.length > 0 && visited.size < maxNodes) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const edges = this.repo.getEdges({
        namespace: input.namespace,
        belongEntityUuid: input.belongEntityUuid,
        globalUid: current.uid,
        minConfidence: minConf,
        direction,
        limit: 20,
      });

      for (const edge of edges) {
        const neighbor = edge.sourceGlobalUid === current.uid
          ? edge.targetGlobalUid
          : edge.sourceGlobalUid;

        if (visited.size >= maxNodes) break;

        // 记录边
        const existing = edgeMap.get(current.uid) ?? [];
        if (!existing.find((e: any) => e.sourceGlobalUid === edge.sourceGlobalUid && e.targetGlobalUid === edge.targetGlobalUid)) {
          existing.push(edge);
          edgeMap.set(current.uid, existing);
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nodeDepth.set(neighbor, current.depth + 1);
          queue.push({ uid: neighbor, depth: current.depth + 1 });
        }
      }
    }

    // 组装结果
    const nodes: ClosureNode[] = [];
    for (const uid of visited) {
      nodes.push({
        globalUid: uid,
        depth: nodeDepth.get(uid) ?? (seedSet.has(uid) ? 0 : 1),
        isSeed: seedSet.has(uid),
      });
    }

    // 收集所有边
    const allEdges: any[] = [];
    for (const [, edges] of edgeMap) {
      allEdges.push(...edges);
    }

    return {
      seedGlobalUids: input.seedGlobalUids,
      nodes,
      edges: allEdges,
    };
  }
}
