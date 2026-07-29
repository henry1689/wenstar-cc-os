/**
 * MemoryAssociationTypes — DAG 边类型定义 (V13.0)
 * ==============================================
 * Sprint 2 建骨层核心类型。4 类有向边，每条边严格满足 source_timestamp < target_timestamp。
 *
 * 设计硬约束:
 *   - 所有读写必须携带 namespace + belong_entity_uuid
 *   - 严禁自环 (source_uid ≠ target_uid)
 *   - 同类边不重复 (UNIQUE constraint)
 *   - 时间正向: τ(source) < τ(target)
 */

/** 四类边 */
export type MemoryEdgeType = 'causal' | 'entity' | 'semantic' | 'emotion';

/** 边状态 */
export type EdgeStateFlag = 'active' | 'suppressed' | 'repaired' | 'deleted';

/** DAG 关联边 */
export interface MemoryAssociation {
  id?: number;
  namespace: string;
  belongEntityUuid: string;

  sourceGlobalUid: string;
  targetGlobalUid: string;

  edgeType: MemoryEdgeType;
  edgeReason?: string;

  confidence: number;       // [0, 1]
  weight: number;           // 融合权重

  sourceTimestampMs: number;
  targetTimestampMs: number;

  createdBy: string;        // 'online_entity_builder' | 'offline_semantic_builder' | ...
  createdAtMs: number;
  updatedAtMs: number;

  stateFlag: EdgeStateFlag;
}

/** 创建边的输入 */
export interface CreateAssociationInput {
  namespace: string;
  belongEntityUuid: string;
  sourceGlobalUid: string;
  targetGlobalUid: string;
  edgeType: MemoryEdgeType;
  edgeReason?: string;
  confidence?: number;
  weight?: number;
  sourceTimestampMs: number;
  targetTimestampMs: number;
  createdBy?: string;
}

/** 查询边的过滤条件 */
export interface AssociationQuery {
  namespace: string;
  belongEntityUuid: string;
  globalUid: string;
  edgeTypes?: MemoryEdgeType[];
  minConfidence?: number;
  direction?: 'out' | 'in' | 'both';
  limit?: number;
}

/** 闭包检索结果中的节点 */
export interface ClosureNode {
  globalUid: string;
  depth: number;                   // 距种子节点的 BFS 深度 (0=seed)
  isSeed: boolean;
  rawInput?: string;
  calciumScore?: number;
  createdAt?: string;
  entityUuid?: string;
}

/** 闭包检索结果 */
export interface MemoryClosureResult {
  seedGlobalUids: string[];
  nodes: ClosureNode[];
  edges: MemoryAssociation[];
}

/** 叙事组装后的事件线节点 */
export interface TimelineNode {
  globalUid: string;
  timestampMs: number;
  role?: string;
  content: string;
  calciumScore?: number;
  emotionSummary?: string;
  foresightStatus?: string;
  isSeed: boolean;
  isKeyEvent: boolean;
}
