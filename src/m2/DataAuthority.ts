/**
 * DataAuthority — 数据权威源声明 (V12.0 P2-4)
 * ==============================================
 * 定义系统中每类事实的唯一权威来源。
 * 解决多源冲突（迁移覆盖运行时 / 回填覆盖人工 / edges vs properties）。
 *
 * 规则:
 *   1. 每类事实只能有一个权威来源
 *   2. 非权威源只做缓存/展示，不可作为判断依据
 *   3. 迁移/回填脚本必须标注是否可覆盖已有数据
 */

/** 事实类型 → 权威来源映射 */
export const DATA_AUTHORITY = {
  /** 人物关系事实 — 唯一来源: FamilyGraph.edges */
  person_relations: {
    authority: 'edges',
    cache_only: ['nodes.properties.relation_to_user', 'dossier.relation_to_user'],
    rule: 'edges 为唯一事实源。relation_to_user 仅做展示缓存，禁止用于关系判断。',
  },

  /** 人物 UUID — 唯一来源: FamilyGraph.nodes.uuid */
  person_uuid: {
    authority: 'nodes.uuid',
    cache_only: ['entities.uuid'],
    rule: 'nodes.uuid 为主。entities.uuid 仅在 FG 未同步时临时使用。',
  },

  /** 对话实体归属 — 唯一来源: conversations.belong_entity_uuid */
  conversation_ownership: {
    authority: 'conversations.belong_entity_uuid',
    rule: '由 EntityOwnershipResolver 统一写入。回填脚本不得覆盖已有标注。',
  },

  /** 记忆实体归属 — 跟随 conversations */
  memory_ownership: {
    authority: 'memories.belong_entity_uuid',
    rule: '优先从 conversations 传导。roleplay 记忆直接从 raw_input 人名匹配。',
  },

  /** 黑钻实体归属 — 跟随 source memories */
  black_diamond_ownership: {
    authority: 'black_diamond.belong_entity_uuid',
    rule: '从 source_id → memories.belong_entity_uuid 传导。晋升时由 MemoryAssessor 同步写入。',
  },

  /** 知识库实体归属 — 唯一来源: knowledge_base.belong_entity_uuid */
  knowledge_ownership: {
    authority: 'knowledge_base.belong_entity_uuid',
    rule: '入库时显式指定，或从首次引用的人物推导。',
  },
} as const;

/**
 * 检查给定的归属字段是否可被迁移脚本覆盖。
 * 返回 false 表示已有标注，不可覆盖。
 */
export function canOverwriteOwnership(
  currentBelongUUID: string | null | undefined,
): boolean {
  return !currentBelongUUID || currentBelongUUID.length === 0;
}

/**
 * 数据权威源审计 — 返回已知的多源冲突点
 */
export function auditAuthorityConflicts(): string[] {
  const conflicts: string[] = [];

  // relation_to_user vs edges
  conflicts.push(
    'relation_to_user (properties cache) vs edges (authority) — 迁移脚本可能覆盖运行时修正。' +
    ' 使用 RelationResolver.resolveRelationToUser() 统一读取。'
  );

  // 回填直接写 belong_entity_uuid 覆盖已有标注
  conflicts.push(
    'SQLiteAdapter 启动回填使用 UPDATE ... SET belong_entity_uuid WHERE belong_entity_uuid IS NULL — 安全。' +
    ' 但 safe-backfill.cjs 可能直接写入，需检查 WHERE 子句。'
  );

  return conflicts;
}

export default DATA_AUTHORITY;
