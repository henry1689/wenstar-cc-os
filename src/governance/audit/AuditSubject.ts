// ============================================================
// AUDIT-B — AuditSubject 审计操作对象
// ============================================================
// 描述动作"对什么"执行。
// subjectId 是必填字段。资源类型提供结构化的分类。
// ============================================================

/** 审计对象的资源类型 */
export type ResourceType =
  | 'memory'
  | 'dossier'
  | 'familygraph_node'
  | 'familygraph_edge'
  | 'knowledge_entry'
  | 'knowledge_chunk'
  | 'embedding_vector'
  | 'profile_field'
  | 'person_identity'
  | 'conversation'
  | 'black_diamond'
  | 'backup'
  | 'auth_decision';

/**
 * AuditSubject — 受审计动作影响的对象。
 *
 * subjectId 是必填字段。resourceType 提供结构化的分类，
 * 用于过滤和聚合审计日志。
 */
export interface AuditSubject {
  /** 对象的唯一标识符（TXS-ID, memory_id, edge_id, doc_id…） */
  subjectId: string;
  /** 对象的资源类型 */
  resourceType: ResourceType;
  /** 对象的域名 */
  domain: string;
  /** 对象的命名空间 */
  namespace?: string;
}

/** 创建 AuditSubject 的工厂函数 */
export function createAuditSubject(
  subjectId: string,
  resourceType: ResourceType,
  domain: string,
  namespace?: string,
): AuditSubject {
  return {
    subjectId,
    resourceType,
    domain,
    ...(namespace ? { namespace } : {}),
  };
}
