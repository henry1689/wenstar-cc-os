// ============================================================
// AUTHZ-B — AuthzPolicy 授权策略评估器
// ============================================================
// evaluateWriteAuthorization(auth, intent) 是纯函数。
// 不访问 DB。不写日志。不修改任何状态。
//
// 铁律：DENY-BY-DEFAULT。
//   任何条件不满足 → DENY。
//   不明确 → DENY。
//   不确定 → DENY。
// ============================================================

import type { AuthContext } from './AuthContext.js';
import type { WriteIntent } from './WriteIntent.js';
import { validateWriteIntentFields, validateWriteIntentPurpose } from './WriteIntent.js';
import {
  allowDecision,
  denyDecision,
  requireConfirmationDecision,
  DENIAL_CODES,
  type AuthorizationDecision,
  type DenialReason,
} from './AuthorizationDecision.js';

// ── 策略定义 ──

/** 单个授权策略 */
export interface AuthzPolicyRule {
  /** 策略 ID */
  id: string;
  /** 策略描述 */
  description: string;
  /** 是否启用 */
  enabled: boolean;
}

/** 策略注册表（静态配置） */
export interface AuthzPolicyRegistry {
  rules: AuthzPolicyRule[];
  /** 拒绝所有 hard_delete 操作 */
  denyHardDelete: boolean;
  /** 敏感数据默认需确认 */
  requireConfirmationForSensitive: boolean;
  /** 推断影响规范键时必须确认 */
  requireConfirmationForInferredCanon: boolean;
  /** 自动写入敏感域时必须确认 */
  requireConfirmationForAutoSensitive: boolean;
  /** 私密域自动写入时必须确认 */
  requireConfirmationForAutoIntimate: boolean;
}

/** 默认策略注册表 */
export const DEFAULT_POLICY_REGISTRY: AuthzPolicyRegistry = {
  rules: [
    { id: 'P001', description: '所有写操作必须有 operatorId', enabled: true },
    { id: 'P002', description: '所有写操作必须有 requesterId', enabled: true },
    { id: 'P003', description: '所有写操作必须有 ownerId', enabled: true },
    { id: 'P004', description: '所有写操作必须有 purpose（受控词汇）', enabled: true },
    { id: 'P005', description: '所有写操作必须有 authScope', enabled: true },
    { id: 'P006', description: 'hard_delete 默认拒绝', enabled: true },
    { id: 'P007', description: '敏感数据自动写入需确认', enabled: true },
    { id: 'P008', description: '推断影响规范键需确认', enabled: true },
    { id: 'P009', description: '私密域自动写入需确认', enabled: true },
    { id: 'P010', description: '操作必须在 authScope.domains 内', enabled: true },
    { id: 'P011', description: '操作必须在 authScope.operations 内', enabled: true },
    { id: 'P012', description: '过期授权不得执行操作', enabled: true },
    { id: 'P013', description: '写入操作需要 authScope.operations 包含 write', enabled: true },
    { id: 'P014', description: '迁移/回填操作需要 authScope.operations 包含 admin', enabled: true },
    { id: 'P015', description: '操作敏感度必须 ≤ authScope 允许级别', enabled: true },
    { id: 'P016', description: 'Agent Tool 执行敏感写入需确认', enabled: true },
  ],
  denyHardDelete: true,
  requireConfirmationForSensitive: true,
  requireConfirmationForInferredCanon: true,
  requireConfirmationForAutoSensitive: true,
  requireConfirmationForAutoIntimate: true,
};

// ── 主评估函数 ──

/**
 * 评估写操作授权。
 * 纯函数。DENY-BY-DEFAULT。
 *
 * @returns AuthorizationDecision.decision ∈ { ALLOW, DENY, REQUIRE_CONFIRMATION }
 */
export function evaluateWriteAuthorization(
  auth: AuthContext,
  intent: WriteIntent,
  registry: AuthzPolicyRegistry = DEFAULT_POLICY_REGISTRY,
): AuthorizationDecision {
  const reasons: DenialReason[] = [];
  const confirmations: string[] = [];
  const applied: string[] = [];

  // ═══════════════════════════════════════
  // Phase 1: 必填字段检查（全缺全拒）
  // ═══════════════════════════════════════

  // 1a. operatorId
  if (!auth.operatorId || auth.operatorId === 'unknown') {
    reasons.push({ code: DENIAL_CODES.MISSING_OPERATOR_ID, message: 'operatorId 缺失', missing: ['operatorId'] });
  } else {
    applied.push('P001');
  }

  // 1b. requesterId
  if (!auth.requesterId || auth.requesterId === 'unknown') {
    reasons.push({ code: DENIAL_CODES.MISSING_REQUESTER_ID, message: 'requesterId 缺失', missing: ['requesterId'] });
  } else {
    applied.push('P002');
  }

  // 1c. ownerId
  if (!auth.ownerId || auth.ownerId === 'unknown') {
    reasons.push({ code: DENIAL_CODES.MISSING_OWNER_ID, message: 'ownerId 缺失', missing: ['ownerId'] });
  } else {
    applied.push('P003');
  }

  // 1d. purpose
  if (!auth.purpose || auth.purpose === 'unknown') {
    reasons.push({ code: DENIAL_CODES.MISSING_PURPOSE, message: 'purpose 缺失', missing: ['purpose'] });
  } else if (!validateWriteIntentPurpose(intent)) {
    reasons.push({ code: DENIAL_CODES.INVALID_PURPOSE, message: `purpose "${intent.purpose}" 不是合法受控词汇`, missing: ['purpose'] });
  } else {
    applied.push('P004');
  }

  // 1e. authScope
  if (!auth.authScope || auth.authScope.domains.length === 0) {
    reasons.push({ code: DENIAL_CODES.MISSING_AUTH_SCOPE, message: 'authScope 缺失或为空', missing: ['authScope'] });
  } else {
    applied.push('P005');
  }

  // 1f. WriteIntent 必填字段
  const missingIntentFields = validateWriteIntentFields(intent);
  if (missingIntentFields.length > 0) {
    reasons.push({
      code: 'MISSING_INTENT_FIELDS',
      message: `WriteIntent 必填字段缺失: ${missingIntentFields.join(', ')}`,
      missing: missingIntentFields,
    });
  }

  // 如果 Phase 1 已产生任何拒绝原因，直接返回 DENY（快速失败）
  if (reasons.length > 0) {
    return denyDecision(auth, intent, reasons);
  }

  // ═══════════════════════════════════════
  // Phase 2: 操作类型专项拒绝
  // ═══════════════════════════════════════

  // 2a. hard_delete → DENY (默认)
  if (intent.operation === 'hard_delete' && registry.denyHardDelete) {
    reasons.push({
      code: DENIAL_CODES.HARD_DELETE_DENIED,
      message: 'hard_delete 默认拒绝。需要 irreversible_approved 状态 + admin 权限',
      missing: ['reversibility'],
    });
  } else if (intent.operation === 'hard_delete') {
    // 即使策略未启用 hard_delete 拒绝，也要求 irreversibility = irreversible_approved
    if (intent.reversibility !== 'irreversible_approved') {
      reasons.push({
        code: DENIAL_CODES.HARD_DELETE_DENIED,
        message: 'hard_delete 要求 reversibility = "irreversible_approved"',
        missing: ['reversibility'],
      });
    }
  }

  // ═══════════════════════════════════════
  // Phase 3: authScope 域/操作检查
  // ═══════════════════════════════════════

  if (auth.authScope && auth.authScope.domains.length > 0) {
    // 3a. domain 检查
    if (!auth.authScope.domains.includes(intent.domain)) {
      reasons.push({
        code: DENIAL_CODES.OUT_OF_SCOPE_DOMAIN,
        message: `domain "${intent.domain}" 不在 authScope.domains [${auth.authScope.domains.join(', ')}] 内`,
        missing: ['authScope.domains'],
      });
    } else {
      applied.push('P010');
    }

    // 3b. operation 检查
    const requiredOp = intent.operation === 'backfill' || intent.operation === 'import'
      ? 'admin'
      : intent.operation === 'delete' || intent.operation === 'hard_delete'
        ? 'admin'
        : 'write';

    if (!auth.authScope.operations.includes(requiredOp)) {
      reasons.push({
        code: DENIAL_CODES.OUT_OF_SCOPE_OPERATION,
        message: `操作 "${intent.operation}" 需要 authScope.operations 包含 "${requiredOp}"`,
        missing: ['authScope.operations'],
      });
    } else {
      applied.push('P011');
    }
  }

  // 3c. 过期授权检查
  if (auth.authScope?.expiresAt) {
    if (new Date(auth.authScope.expiresAt) < new Date()) {
      reasons.push({
        code: DENIAL_CODES.EXPIRED_AUTH,
        message: `授权已过期: ${auth.authScope.expiresAt}`,
        missing: ['authScope.expiresAt'],
      });
    }
  }

  // Phase 3 产生的拒绝 → 直接 DENY
  if (reasons.length > 0) {
    return denyDecision(auth, intent, reasons);
  }

  // ═══════════════════════════════════════
  // Phase 4: 敏感度 + 自动写入 → REQUIRE_CONFIRMATION
  // ═══════════════════════════════════════

  // 4a. 敏感数据自动写入 → 需确认
  if (
    intent.sensitivityLevel === 'sensitive' &&
    !auth.authScope.allowSensitive &&
    intent.userIntentLevel !== 'explicit_user'
  ) {
    confirmations.push('敏感数据非用户显式指令写入');
    applied.push('P007');
  }

  // 4b. 私密数据自动写入 → 需确认
  if (
    intent.sensitivityLevel === 'secret' &&
    intent.userIntentLevel !== 'explicit_user'
  ) {
    confirmations.push('私密(secret)数据写入需用户显式指令');
    applied.push('P012');
  }

  // 4c. 推断影响规范键 → 需确认
  if (
    intent.affectsCanon &&
    intent.derivedFromInference &&
    registry.requireConfirmationForInferredCanon
  ) {
    confirmations.push('推断写入影响规范键(TXS-ID/GlobalUID/dna_root_id)');
    applied.push('P008');
  }

  // 4d. 自动写入私密域 → 需确认
  if (
    intent.sensitivityLevel === 'sensitive' &&
    intent.userIntentLevel === 'system_automatic' &&
    registry.requireConfirmationForAutoSensitive
  ) {
    confirmations.push('系统自动写入敏感域');
    applied.push('P009');
  }

  // 4e. Agent Tool 执行敏感写入 → 需确认
  if (
    intent.userIntentLevel === 'agent_tool' &&
    intent.sensitivityLevel === 'sensitive'
  ) {
    confirmations.push('Agent Tool 执行敏感写入');
    applied.push('P016');
  }

  // 4f. body/intimate → 需确认
  if (
    intent.domain === 'body' &&
    intent.userIntentLevel !== 'explicit_user'
  ) {
    confirmations.push('身体/亲密域写入需用户显式指令');
    applied.push('P014');
  }

  // ═══════════════════════════════════════
  // Phase 5: 最终决策
  // ═══════════════════════════════════════

  if (confirmations.length > 0) {
    return requireConfirmationDecision(auth, intent, confirmations, applied);
  }

  return allowDecision(auth, intent, applied);
}

// ── 便捷函数 ──

/** 判断决策是否为 DENY */
export function isDenied(decision: AuthorizationDecision): boolean {
  return decision.decision === 'DENY';
}

/** 判断决策是否为 ALLOW */
export function isAllowed(decision: AuthorizationDecision): boolean {
  return decision.decision === 'ALLOW';
}

/** 判断决策是否需要确认 */
export function requiresConfirmation(decision: AuthorizationDecision): boolean {
  return decision.decision === 'REQUIRE_CONFIRMATION';
}
