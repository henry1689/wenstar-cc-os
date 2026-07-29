/**
 * DAGClosureSearch.test.ts — 闭包检索 + 骨架裁剪 单元测试
 */

import { describe, it, expect } from 'vitest';
import { MemoryClosureRetriever } from '../graph/MemoryClosureRetriever.js';
import { CausalSkeletonPruner } from '../graph/CausalSkeletonPruner.js';
import { MemoryAssociationRepository } from '../graph/MemoryAssociationRepository.js';
import type { MemoryClosureResult } from '../graph/MemoryAssociationTypes.js';

// ── 内存 Mock SQLite（Repository 只依赖 runSql + queryAll） ──

class MockSQLite {
  private rows: any[] = [];
  runSql(_sql: string, _params?: any[]): void { /* INSERT/UPDATE no-op in mock */ }
  queryAll(sql: string, params?: any[]): any[] {
    if (!sql.includes('memory_associations')) return [];
    if (!params || params.length < 4) return [];
    const uid = String(params[0]);  // first param is global_uid (direction='both')
    const minConf = typeof params[4] === 'number' ? params[4] : 0;  // params[4] = minConfidence
    const results: any[] = [];
    for (const r of this.rows) {
      if (r.source_global_uid === uid || r.target_global_uid === uid) {
        if ((r.confidence ?? 0) < minConf) continue;
        if (results.length < 30) results.push(r);
      }
    }
    return results;
  }
  addRow(row: any) { this.rows.push(row); }
  clear() { this.rows = []; }
}

/** 内存 mock 边，同时兼容 snake_case（SQLite rows）和 MemoryAssociation */
function makeEdge(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 10000),
    namespace: 'default',
    // 双字段名兼容: snake_case（mock SQLite rows） + camelCase（MemoryAssociation 类型）
    belong_entity_uuid: 'uuid-test',
    belongEntityUuid: 'uuid-test',
    source_global_uid: overrides.source_global_uid ?? 'A',
    sourceGlobalUid: overrides.source_global_uid ?? 'A',
    target_global_uid: overrides.target_global_uid ?? 'B',
    targetGlobalUid: overrides.target_global_uid ?? 'B',
    edge_type: overrides.edge_type ?? 'causal',
    edgeType: overrides.edge_type ?? 'causal',
    edge_reason: 'test',
    edgeReason: 'test',
    confidence: overrides.confidence ?? 0.8,
    weight: 1.0,
    source_timestamp_ms: overrides.source_timestamp_ms ?? 1000,
    sourceTimestampMs: overrides.source_timestamp_ms ?? 1000,
    target_timestamp_ms: overrides.target_timestamp_ms ?? 2000,
    targetTimestampMs: overrides.target_timestamp_ms ?? 2000,
    created_by: 'test',
    createdBy: 'test',
    created_at_ms: 1000,
    createdAtMs: 1000,
    updated_at_ms: 1000,
    updatedAtMs: 1000,
    state_flag: 'active',
    stateFlag: 'active',
  };
}

function makeClosure(overrides: Partial<MemoryClosureResult> = {}): MemoryClosureResult {
  return {
    seedGlobalUids: overrides.seedGlobalUids ?? ['S1'],
    nodes: overrides.nodes ?? [
      { globalUid: 'S1', depth: 0, isSeed: true },
      { globalUid: 'N1', depth: 1, isSeed: false },
      { globalUid: 'N2', depth: 1, isSeed: false },
      { globalUid: 'N3', depth: 2, isSeed: false },
    ],
    edges: overrides.edges ?? [
      makeEdge({ source_global_uid: 'S1', target_global_uid: 'N1', edge_type: 'causal' }),
      makeEdge({ source_global_uid: 'S1', target_global_uid: 'N2', edge_type: 'entity', confidence: 0.5 }),
      makeEdge({ source_global_uid: 'N1', target_global_uid: 'N3', edge_type: 'causal' }),
    ],
  };
}

describe('MemoryClosureRetriever', () => {
  it('空种子返回只有种子的结果', () => {
    const mockDb = new MockSQLite();
    mockDb.addRow(makeEdge({ source_global_uid: 'S1', target_global_uid: 'N1' }));
    const repo = new MemoryAssociationRepository(mockDb as any);
    const retriever = new MemoryClosureRetriever(repo);
    const result = retriever.retrieve({ namespace: 'default', belongEntityUuid: 'uuid-test', seedGlobalUids: ['S1'] });
    expect(result.seedGlobalUids).toEqual(['S1']);
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.nodes.find(n => n.globalUid === 'S1')?.isSeed).toBe(true);
  });

  it('无边时只返回种子节点', () => {
    const mockDb = new MockSQLite();
    const repo = new MemoryAssociationRepository(mockDb as any);
    const retriever = new MemoryClosureRetriever(repo);
    const result = retriever.retrieve({ namespace: 'default', belongEntityUuid: 'uuid-test', seedGlobalUids: ['X'] });
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].isSeed).toBe(true);
  });

  it('maxDepth=1 限制生效 — 种子始终在结果中', () => {
    const mockDb = new MockSQLite();
    mockDb.addRow(makeEdge({ id: 1, source_global_uid: 'S1', target_global_uid: 'N1' }));
    const repo = new MemoryAssociationRepository(mockDb as any);
    const retriever = new MemoryClosureRetriever(repo);
    const result = retriever.retrieve({
      namespace: 'default', belongEntityUuid: 'uuid-test',
      seedGlobalUids: ['S1'], maxDepth: 1,
    });
    // 种子永远在
    const seedNode = result.nodes.find(n => n.globalUid === 'S1');
    expect(seedNode).toBeDefined();
    expect(seedNode!.isSeed).toBe(true);
    // 总节点数受控
    expect(result.nodes.length).toBeLessThanOrEqual(2); // S1 + 最多1个邻居
  });

  it('maxNodes 上限生效', () => {
    const mockDb = new MockSQLite();
    for (let i = 0; i < 5; i++) {
      mockDb.addRow(makeEdge({ id: i, source_global_uid: 'S1', target_global_uid: `C${i}` }));
    }
    const repo = new MemoryAssociationRepository(mockDb as any);
    const retriever = new MemoryClosureRetriever(repo);
    const result = retriever.retrieve({ namespace: 'default', belongEntityUuid: 'uuid-test', seedGlobalUids: ['S1'], maxNodes: 3 });
    expect(result.nodes.length).toBeLessThanOrEqual(3);
  });

  it('minConfidence 过滤低置信边', () => {
    const mockDb = new MockSQLite();
    mockDb.addRow(makeEdge({ source_global_uid: 'S1', target_global_uid: 'N1', confidence: 0.3 }));
    const repo = new MemoryAssociationRepository(mockDb as any);
    const retriever = new MemoryClosureRetriever(repo);
    const result = retriever.retrieve({
      namespace: 'default', belongEntityUuid: 'uuid-test',
      seedGlobalUids: ['S1'], minConfidence: 0.5,
    });
    expect(result.nodes).toHaveLength(1); // 只有 S1
    expect(result.edges).toHaveLength(0);
  });
});

describe('CausalSkeletonPruner', () => {
  it('空闭包安全返回', () => {
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(makeClosure({ edges: [], nodes: [{ globalUid: 'S1', depth: 0, isSeed: true }] }));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].isSeed).toBe(true);
  });

  it('种子节点不被剪掉', () => {
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(makeClosure());
    const seedIds = result.nodes.filter(n => n.isSeed).map(n => n.globalUid);
    expect(seedIds).toContain('S1');
  });

  it('高置信 causal 边优先保留', () => {
    const closure: MemoryClosureResult = {
      seedGlobalUids: ['S1'],
      nodes: [
        { globalUid: 'S1', depth: 0, isSeed: true },
        { globalUid: 'A', depth: 1, isSeed: false },
        { globalUid: 'B', depth: 1, isSeed: false },
      ],
      edges: [
        makeEdge({ id: 1, source_global_uid: 'S1', target_global_uid: 'A', edge_type: 'causal', confidence: 0.9 }),
        makeEdge({ id: 2, source_global_uid: 'S1', target_global_uid: 'B', edge_type: 'entity', confidence: 0.6 }),
      ],
    };
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(closure);
    // 种子节点必然保留
    expect(result.nodes.find(n => n.globalUid === 'S1')).toBeDefined();
    // 至少有一条边被保留
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });

  it('节点数不超 maxNodes', () => {
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(makeClosure(), { maxNodes: 2 });
    expect(result.nodes.length).toBeLessThanOrEqual(2);
  });

  it('无边数不超 maxEdges', () => {
    const edges = [];
    for (let i = 0; i < 20; i++) {
      edges.push(makeEdge({ id: i, source_global_uid: `S${i}`, target_global_uid: `T${i}` }));
    }
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(makeClosure({ edges }), { maxEdges: 5 });
    expect(result.edges.length).toBeLessThanOrEqual(5);
  });

  it('每个种子 semantic/emotion 边最多 2 条', () => {
    const closure = makeClosure({
      edges: [
        makeEdge({ id: 1, source_global_uid: 'S1', target_global_uid: 'A', edge_type: 'semantic', confidence: 0.9 }),
        makeEdge({ id: 2, source_global_uid: 'S1', target_global_uid: 'B', edge_type: 'semantic', confidence: 0.85 }),
        makeEdge({ id: 3, source_global_uid: 'S1', target_global_uid: 'C', edge_type: 'semantic', confidence: 0.8 }),
        makeEdge({ id: 4, source_global_uid: 'S1', target_global_uid: 'D', edge_type: 'semantic', confidence: 0.75 }),
      ],
    });
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(closure, { maxNodes: 50, maxEdges: 50 });
    const semCount = result.edges.filter(e => e.edgeType === 'semantic' && e.sourceGlobalUid === 'S1').length;
    expect(semCount).toBeLessThanOrEqual(2);
  });

  it('低置信边被裁掉', () => {
    const closure = makeClosure({
      edges: [
        makeEdge({ id: 1, source_global_uid: 'S1', target_global_uid: 'A', edge_type: 'causal', confidence: 0.3 }),
      ],
    });
    const pruner = new CausalSkeletonPruner();
    const result = pruner.prune(closure, { minConfidence: 0.5 });
    expect(result.edges).toHaveLength(0);
  });
});
