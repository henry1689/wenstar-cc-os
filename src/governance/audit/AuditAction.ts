// ============================================================
// AUDIT-B — AuditAction 审计动作分类
// ============================================================
// 对"做了什么"进行受控词汇表分类。
// 每个数据变更必须映射到这些动作之一。
// ============================================================

/** 审计动作类型 —— 受控词汇表 */
export type AuditActionType =
  | 'create'
  | 'read'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'hard_delete'
  | 'merge'
  | 'archive'
  | 'restore'
  | 'promote'
  | 'demote'
  | 'backup'
  | 'migrate'
  | 'authorize'
  | 'deny'
  | 'confirm';

/**
 * AuditAction — 审计事件中"执行了什么操作"。
 *
 * 必填字段：type。
 * 可选字段：description（人类可读）、previousValue / newValue（变更前后，
 *   仅在不包含敏感内容的安全上下文中使用）。
 */
export interface AuditAction {
  /** 操作类型 */
  type: AuditActionType;
  /** 人类可读描述 */
  description?: string;
  /** 变更前的值（可选，仅安全上下文） */
  previousValue?: string;
  /** 变更后的值（可选，仅安全上下文） */
  newValue?: string;
}

/** 创建 AuditAction 的工厂函数 */
export function createAuditAction(
  type: AuditActionType,
  description?: string,
): AuditAction {
  return { type, ...(description ? { description } : {}) };
}
