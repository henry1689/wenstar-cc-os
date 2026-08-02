// ============================================================
// AUDIT-B — AuditOutcome 审计结果状态
// ============================================================
// 对"结果如何"进行受控词汇表分类。
// ============================================================

/** 审计结果状态 */
export type AuditOutcomeStatus =
  | 'success'
  | 'failure'
  | 'denied'
  | 'requires_confirmation'
  | 'pending'
  | 'rollback';

/**
 * AuditOutcome — 审计事件中"操作结果如何"。
 *
 * 必填字段：status。
 * 可选字段：detail（人类可读）、errorCode（机器可读错误码）。
 */
export interface AuditOutcome {
  /** 结果状态 */
  status: AuditOutcomeStatus;
  /** 人类可读结果详情 */
  detail?: string;
  /** 机器可读错误码 */
  errorCode?: string;
}

/** 创建 AuditOutcome 的工厂函数 */
export function createAuditOutcome(
  status: AuditOutcomeStatus,
  detail?: string,
  errorCode?: string,
): AuditOutcome {
  return {
    status,
    ...(detail ? { detail } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

// ── 预置 Outcome ──

export const OUTCOME_SUCCESS: AuditOutcome = { status: 'success' };
export const OUTCOME_FAILURE: AuditOutcome = { status: 'failure' };
export const OUTCOME_DENIED: AuditOutcome = { status: 'denied' };
export const OUTCOME_REQUIRES_CONFIRMATION: AuditOutcome = { status: 'requires_confirmation' };
export const OUTCOME_PENDING: AuditOutcome = { status: 'pending' };
