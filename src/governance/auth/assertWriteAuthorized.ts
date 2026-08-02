// ============================================================
// AUTHZ-B — assertWriteAuthorized 断言辅助
// ============================================================
// 纯函数。不执行写操作本身，只做前置授权检查。
// throw WriteNotAuthorizedError 如果授权失败。
// ============================================================

import type { AuthContext } from './AuthContext.js';
import type { WriteIntent } from './WriteIntent.js';
import { evaluateWriteAuthorization } from './AuthzPolicy.js';
import type { AuthorizationDecision } from './AuthorizationDecision.js';

// ── 错误类型 ──

/** 写操作未授权错误 */
export class WriteNotAuthorizedError extends Error {
  public readonly decision: AuthorizationDecision;

  constructor(decision: AuthorizationDecision) {
    const summary = decision.reasons.map((r) => `[${r.code}] ${r.message}`).join('; ');
    super(`写操作未授权: ${summary}`);
    this.name = 'WriteNotAuthorizedError';
    this.decision = decision;
  }
}

/** 写操作需确认错误 */
export class WriteRequiresConfirmationError extends Error {
  public readonly decision: AuthorizationDecision;

  constructor(decision: AuthorizationDecision) {
    const summary = decision.requiredConfirmations.join('; ');
    super(`写操作需确认: ${summary}`);
    this.name = 'WriteRequiresConfirmationError';
    this.decision = decision;
  }
}

// ── 断言函数 ──

/**
 * 断言写操作已授权。
 *
 * - DENY → throw WriteNotAuthorizedError
 * - REQUIRE_CONFIRMATION → throw WriteRequiresConfirmationError
 * - ALLOW → 返回 decision（可用于审计追踪）
 *
 * 使用示例：
 * ```
 * const decision = assertWriteAuthorized(auth, intent);
 * // 如果到这里还没 throw → 授权已通过
 * // 执行写操作...
 * ```
 */
export function assertWriteAuthorized(
  auth: AuthContext,
  intent: WriteIntent,
): AuthorizationDecision {
  const decision = evaluateWriteAuthorization(auth, intent);

  if (decision.decision === 'DENY') {
    throw new WriteNotAuthorizedError(decision);
  }

  if (decision.decision === 'REQUIRE_CONFIRMATION') {
    throw new WriteRequiresConfirmationError(decision);
  }

  return decision;
}

/**
 * 检查写操作是否已授权（不 throw）。
 *
 * @returns AuthorizationDecision — 调用方自行处理
 */
export function checkWriteAuthorized(
  auth: AuthContext,
  intent: WriteIntent,
): AuthorizationDecision {
  return evaluateWriteAuthorization(auth, intent);
}

/**
 * 检查一组写操作是否全部已授权。
 *
 * @returns Map<intent, decision>
 */
export function checkAllWriteAuthorized(
  auth: AuthContext,
  intents: WriteIntent[],
): Map<WriteIntent, AuthorizationDecision> {
  const results = new Map<WriteIntent, AuthorizationDecision>();
  for (const intent of intents) {
    results.set(intent, evaluateWriteAuthorization(auth, intent));
  }
  return results;
}
