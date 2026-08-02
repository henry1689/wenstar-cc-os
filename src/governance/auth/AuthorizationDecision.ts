// ============================================================
// AUTHZ-B — AuthorizationDecision 授权决策
// ============================================================
// evaluateWriteAuthorization 的返回类型。
// DENY → 操作被拒绝。
// ALLOW → 操作允许。
// REQUIRE_CONFIRMATION → 操作暂时允许但标记为 pending，
//   必须在后续确认后变为 confirmed。
// ============================================================

import type { AuthContext } from './AuthContext.js';
import type { WriteIntent } from './WriteIntent.js';

// ── 决策结果 ──

export type AuthDecision = 'ALLOW' | 'DENY' | 'REQUIRE_CONFIRMATION';

export interface DenialReason {
  /** 拒绝码（短标识） */
  code: string;
  /** 人类可读信息 */
  message: string;
  /** 缺失/不满足的字段 */
  missing: string[];
}

export interface AuthorizationDecision {
  /** ALLOW | DENY | REQUIRE_CONFIRMATION */
  decision: AuthDecision;

  /** 如果 DENY, 拒绝原因（可能多个） */
  reasons: DenialReason[];

  /** 使用的授权上下文（用于审计追踪） */
  context: {
    operatorId: string;
    requesterId: string;
    ownerId: string;
    purpose: string;
    domain: string;
    operation: string;
  };

  /** 决策时间（ISO8601） */
  evaluatedAt: string;

  /** 如果 REQUIRE_CONFIRMATION, 需要确认的操作列表 */
  requiredConfirmations: string[];

  /** 如果 ALLOW, 应用的授权策略 ID */
  appliedPolicies: string[];
}

// ── 工厂 ──

export function allowDecision(
  auth: AuthContext,
  intent: WriteIntent,
  appliedPolicies: string[],
): AuthorizationDecision {
  return {
    decision: 'ALLOW',
    reasons: [],
    context: {
      operatorId: auth.operatorId,
      requesterId: auth.requesterId,
      ownerId: auth.ownerId,
      purpose: auth.purpose,
      domain: intent.domain,
      operation: intent.operation,
    },
    evaluatedAt: new Date().toISOString(),
    requiredConfirmations: [],
    appliedPolicies,
  };
}

export function denyDecision(
  auth: AuthContext,
  intent: WriteIntent,
  reasons: DenialReason[],
): AuthorizationDecision {
  return {
    decision: 'DENY',
    reasons,
    context: {
      operatorId: auth.operatorId,
      requesterId: auth.requesterId,
      ownerId: auth.ownerId,
      purpose: auth.purpose,
      domain: intent.domain,
      operation: intent.operation,
    },
    evaluatedAt: new Date().toISOString(),
    requiredConfirmations: [],
    appliedPolicies: [],
  };
}

export function requireConfirmationDecision(
  auth: AuthContext,
  intent: WriteIntent,
  requiredConfirmations: string[],
  appliedPolicies: string[],
): AuthorizationDecision {
  return {
    decision: 'REQUIRE_CONFIRMATION',
    reasons: requiredConfirmations.map((c) => ({
      code: 'CONFIRMATION_REQUIRED',
      message: c,
      missing: [],
    })),
    context: {
      operatorId: auth.operatorId,
      requesterId: auth.requesterId,
      ownerId: auth.ownerId,
      purpose: auth.purpose,
      domain: intent.domain,
      operation: intent.operation,
    },
    evaluatedAt: new Date().toISOString(),
    requiredConfirmations,
    appliedPolicies,
  };
}

// ── 拒绝码常量 ──

export const DENIAL_CODES = {
  MISSING_OPERATOR_ID: 'MISSING_OPERATOR_ID',
  MISSING_REQUESTER_ID: 'MISSING_REQUESTER_ID',
  MISSING_OWNER_ID: 'MISSING_OWNER_ID',
  MISSING_SUBJECT_ID: 'MISSING_SUBJECT_ID',
  MISSING_PURPOSE: 'MISSING_PURPOSE',
  MISSING_AUTH_SCOPE: 'MISSING_AUTH_SCOPE',
  UNKNOWN_PURPOSE: 'UNKNOWN_PURPOSE',
  INVALID_PURPOSE: 'INVALID_PURPOSE',
  HARD_DELETE_DENIED: 'HARD_DELETE_DENIED',
  SENSITIVE_AUTO_DENIED: 'SENSITIVE_AUTO_DENIED',
  INFERRED_CANON_DENIED: 'INFERRED_CANON_DENIED',
  INTIMATE_AUTO_DENIED: 'INTIMATE_AUTO_DENIED',
  SECRET_AUTO_DENIED: 'SECRET_AUTO_DENIED',
  OUT_OF_SCOPE_DOMAIN: 'OUT_OF_SCOPE_DOMAIN',
  OUT_OF_SCOPE_OPERATION: 'OUT_OF_SCOPE_OPERATION',
  EXPIRED_AUTH: 'EXPIRED_AUTH',
} as const;
