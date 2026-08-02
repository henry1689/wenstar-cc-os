// ============================================================
// AUTHZ-B — 授权基准测试
// 所有测试使用合成 Fixture。不访问 DB。不修改任何文件。
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createAuthContext,
  createUserSessionAuthContext,
  createAgentToolAuthContext,
  createSystemAutoAuthContext,
  createMigrationAuthContext,
} from '../createAuthContext.js';
import {
  createWriteIntent,
  validateWriteIntentFields,
  validateWriteIntentPurpose,
} from '../WriteIntent.js';
import {
  evaluateWriteAuthorization,
  DEFAULT_POLICY_REGISTRY,
  isDenied,
  isAllowed,
  requiresConfirmation,
} from '../AuthzPolicy.js';
import {
  assertWriteAuthorized,
  checkWriteAuthorized,
  WriteNotAuthorizedError,
  WriteRequiresConfirmationError,
} from '../assertWriteAuthorized.js';
import {
  DENIAL_CODES,
} from '../AuthorizationDecision.js';
import { VALID_PURPOSES, isValidPurpose } from '../AuthContext.js';
import type { AuthContext } from '../AuthContext.js';
import type { WriteIntent } from '../WriteIntent.js';
import type { AuthzPolicyRegistry } from '../AuthzPolicy.js';

// ── 合成 Fixture ──

const OPERATOR_TXS = 'TXS-000000001';
const OWNER_TXS = 'TXS-000000001'; // 操作者 = 所有者（常规场景）
const OTHER_TXS = 'TXS-000000002';

const SESSION_ID = 'session_alpha_001';
const NAMESPACE = 'default';

/** 创建一个完整的合法 AuthContext（用户显式指令，只读 scope） */
function validUserAuth(overrides: Partial<Parameters<typeof createAuthContext>[0]> = {}): AuthContext {
  return createAuthContext({
    operatorId: OPERATOR_TXS,
    ownerId: OWNER_TXS,
    purpose: 'user_explicit_command',
    sessionId: SESSION_ID,
    namespace: NAMESPACE,
    authScope: {
      domains: ['memory', 'dossier', 'familygraph', 'knowledge'],
      operations: ['read', 'write'],
      allowAutomatic: false,
      allowSensitive: false,
      expiresAt: null,
    },
    ...overrides,
  });
}

/** 创建一个完整合法的 WriteIntent（最低风险：memory 域 create） */
function lowRiskIntent(overrides: Partial<Parameters<typeof createWriteIntent>[0]> = {}): WriteIntent {
  return createWriteIntent({
    operatorId: OPERATOR_TXS,
    ownerId: OWNER_TXS,
    domain: 'memory',
    operation: 'create',
    purpose: 'user_explicit_command',
    userIntentLevel: 'explicit_user',
    reason: '用户请求写入测试记忆',
    sensitivityLevel: 'public',
    ...overrides,
  });
}

// ============================================================
// 1. 类型和工厂测试
// ============================================================

describe('[AUTHZ-B] 类型和工厂', () => {
  it('T1: createAuthContext 生成完整 AuthContext', () => {
    const auth = validUserAuth();
    expect(auth.operatorId).toBe(OPERATOR_TXS);
    expect(auth.requesterId).toBe(OPERATOR_TXS);
    expect(auth.ownerId).toBe(OWNER_TXS);
    expect(isValidPurpose(auth.purpose)).toBe(true);
    expect(auth.authScope.domains.length).toBeGreaterThan(0);
  });

  it('T2: createWriteIntent 生成完整 WriteIntent', () => {
    const intent = lowRiskIntent();
    expect(intent.operatorId).toBe(OPERATOR_TXS);
    expect(intent.domain).toBe('memory');
    expect(intent.operation).toBe('create');
    expect(intent.userIntentLevel).toBe('explicit_user');
  });

  it('T3: requesterId 默认等于 operatorId', () => {
    const auth = createAuthContext({ operatorId: OPERATOR_TXS, ownerId: OWNER_TXS, purpose: 'user_explicit_command' });
    expect(auth.requesterId).toBe(OPERATOR_TXS);
  });

  it('T4: validateWriteIntentFields 检测缺失字段', () => {
    const intent = createWriteIntent({
      operatorId: '', ownerId: '', domain: '', operation: 'create', purpose: 'unknown',
      userIntentLevel: 'explicit_user', reason: '',
    });
    const missing = validateWriteIntentFields(intent);
    expect(missing).toContain('operatorId');
    expect(missing).toContain('ownerId');
    expect(missing).toContain('domain');
    expect(missing).toContain('purpose');
    expect(missing).toContain('reason');
  });

  it('T5: 完整 WriteIntent → validateWriteIntentFields 返回空数组', () => {
    const missing = validateWriteIntentFields(lowRiskIntent());
    expect(missing).toHaveLength(0);
  });

  it('T6: VALID_PURPOSES 包含 14 个合法目的', () => {
    expect(VALID_PURPOSES.length).toBe(14);
    expect(VALID_PURPOSES).toContain('user_explicit_command');
    expect(VALID_PURPOSES).toContain('system_consolidation');
    expect(VALID_PURPOSES).toContain('nlu_inference');
    expect(VALID_PURPOSES).toContain('unknown');
  });

  it('T7: 工厂函数创建各自类型的 AuthContext', () => {
    const user = createUserSessionAuthContext({ operatorId: OP, ownerId: OP, sessionId: SESSION_ID });
    expect(user.authScope.operations).toEqual(['read']);

    const agent = createAgentToolAuthContext({ operatorId: OP, requesterId: OTHER, ownerId: OP, sessionId: SESSION_ID });
    expect(agent.authScope.operations).toEqual(['read', 'write']);
    expect(agent.derivedFromInference).toBe(true);

    const auto = createSystemAutoAuthContext({ operatorId: OP, ownerId: OP });
    expect(auto.authScope.allowAutomatic).toBe(true);
    expect(auto.requiresConfirmation).toBe(true);

    const mig = createMigrationAuthContext({ operatorId: OP, ownerId: OP });
    expect(mig.authScope.operations).toContain('admin');
    expect(mig.authScope.allowSensitive).toBe(true);
  });
});

// ── 缩写 ──
const OP = OPERATOR_TXS;
const OTHER = OTHER_TXS;

// ============================================================
// 2. Phase 1: 必填字段拒绝 (DENY-BY-DEFAULT)
// ============================================================

describe('[AUTHZ-B] Phase 1: 必填字段拒绝', () => {
  it('D1: operatorId 缺失 → DENY', () => {
    const auth = validUserAuth({ operatorId: 'unknown' });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.MISSING_OPERATOR_ID)).toBe(true);
  });

  it('D2: requesterId 缺失 → DENY', () => {
    const auth = validUserAuth({ requesterId: 'unknown' });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.MISSING_REQUESTER_ID)).toBe(true);
  });

  it('D3: ownerId 缺失 → DENY', () => {
    const auth = validUserAuth({ ownerId: 'unknown' });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.MISSING_OWNER_ID)).toBe(true);
  });

  it('D4: purpose 缺失 → DENY', () => {
    const auth = validUserAuth({ purpose: 'unknown' });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.MISSING_PURPOSE)).toBe(true);
  });

  it('D5: purpose 不是受控词汇 → DENY', () => {
    const auth = validUserAuth({ purpose: 'just_because' });
    const intent = lowRiskIntent({ purpose: 'just_because' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.INVALID_PURPOSE)).toBe(true);
  });

  it('D6: authScope 为空 → DENY', () => {
    const auth = validUserAuth({ authScope: { domains: [], operations: [], allowAutomatic: false, allowSensitive: false, expiresAt: null } });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.MISSING_AUTH_SCOPE)).toBe(true);
  });

  it('D7: 多个字段同时缺失 → 一次性报告所有拒绝原因', () => {
    const auth = validUserAuth({ operatorId: 'unknown', ownerId: 'unknown', purpose: 'unknown', authScope: undefined as any });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// 3. Phase 2: 操作类型拒绝
// ============================================================

describe('[AUTHZ-B] Phase 2: 操作类型拒绝', () => {
  it('D8: hard_delete → DENY (默认策略)', () => {
    const intent = lowRiskIntent({ operation: 'hard_delete', reversibility: 'irreversible' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.HARD_DELETE_DENIED)).toBe(true);
  });

  it('D9: hard_delete + irreversible_approved → ALLOW (如果策略未启用 denyHardDelete)', () => {
    const reg: AuthzPolicyRegistry = { ...DEFAULT_POLICY_REGISTRY, denyHardDelete: false };
    const intent = lowRiskIntent({ operation: 'hard_delete', reversibility: 'irreversible_approved' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent, reg);
    // 仍然可能有其他拒绝原因（如 operation 需要 admin），但 hard_delete 本身不拒绝
    const hardDeleteRejection = result.reasons.some((r) => r.code === DENIAL_CODES.HARD_DELETE_DENIED);
    expect(hardDeleteRejection).toBe(false);
  });
});

// ============================================================
// 4. Phase 3: authScope 域/操作 检查
// ============================================================

describe('[AUTHZ-B] Phase 3: authScope 域/操作检查', () => {
  it('D10: domain 不在 authScope.domains → DENY', () => {
    const auth = validUserAuth({ authScope: { domains: ['memory'], operations: ['read', 'write'], allowAutomatic: false, allowSensitive: false, expiresAt: null } });
    const intent = lowRiskIntent({ domain: 'familygraph' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.OUT_OF_SCOPE_DOMAIN)).toBe(true);
  });

  it('D11: write 操作需要 authScope.operations 包含 write → DENY', () => {
    const auth = validUserAuth({ authScope: { domains: ['memory'], operations: ['read'], allowAutomatic: false, allowSensitive: false, expiresAt: null } });
    const intent = lowRiskIntent({ domain: 'memory', operation: 'update' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.OUT_OF_SCOPE_OPERATION)).toBe(true);
  });

  it('D12: backfill 操作需要 authScope.operations 包含 admin → DENY', () => {
    const auth = validUserAuth();
    const intent = lowRiskIntent({ operation: 'backfill' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.OUT_OF_SCOPE_OPERATION)).toBe(true);
  });

  it('D13: 过期授权 → DENY', () => {
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const auth = validUserAuth({
      authScope: { domains: ['memory'], operations: ['read', 'write'], allowAutomatic: false, allowSensitive: false, expiresAt: pastDate },
    });
    const result = evaluateWriteAuthorization(auth, lowRiskIntent());
    expect(isDenied(result)).toBe(true);
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.EXPIRED_AUTH)).toBe(true);
  });
});

// ============================================================
// 5. Phase 4: 敏感度 + 自动写入 → REQUIRE_CONFIRMATION
// ============================================================

describe('[AUTHZ-B] Phase 4: 敏感度 + 自动写入 → 需确认', () => {
  it('C1: 敏感数据 + 非用户显式指令 → REQUIRE_CONFIRMATION', () => {
    const intent = lowRiskIntent({ sensitivityLevel: 'sensitive', userIntentLevel: 'system_automatic' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(requiresConfirmation(result)).toBe(true);
    expect(result.requiredConfirmations.length).toBeGreaterThan(0);
  });

  it('C2: 私密(secret)数据 + 非用户显式指令 → REQUIRE_CONFIRMATION', () => {
    const intent = lowRiskIntent({ sensitivityLevel: 'secret', userIntentLevel: 'inferred' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(requiresConfirmation(result)).toBe(true);
  });

  it('C3: 推断写入影响规范键(affectsCanon) → REQUIRE_CONFIRMATION', () => {
    const intent = lowRiskIntent({ affectsCanon: true, derivedFromInference: true, userIntentLevel: 'inferred' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(requiresConfirmation(result)).toBe(true);
    expect(result.requiredConfirmations.some((c) => c.includes('规范键'))).toBe(true);
  });

  it('C4: Agent Tool 执行敏感写入 → REQUIRE_CONFIRMATION', () => {
    const auth = createAgentToolAuthContext({ operatorId: OP, requesterId: OTHER, ownerId: OP, sessionId: SESSION_ID });
    // Agent Tool auth scope 默认不包含 allowSensitive
    const intent = lowRiskIntent({ sensitivityLevel: 'sensitive', userIntentLevel: 'agent_tool' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(requiresConfirmation(result)).toBe(true);
  });

  it('C5: 身体/亲密域 + 非用户显式 → REQUIRE_CONFIRMATION', () => {
    const auth = validUserAuth({
      authScope: { domains: ['memory', 'body'], operations: ['read', 'write'], allowAutomatic: false, allowSensitive: false, expiresAt: null },
    });
    const intent = lowRiskIntent({ domain: 'body', userIntentLevel: 'system_automatic' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(requiresConfirmation(result)).toBe(true);
    expect(result.requiredConfirmations.some((c) => c.includes('身体'))).toBe(true);
  });

  it('C6: 同一操作触发多个确认需求 → 全部列出', () => {
    const intent = lowRiskIntent({
      sensitivityLevel: 'sensitive',
      userIntentLevel: 'system_automatic',
      affectsCanon: true,
      derivedFromInference: true,
    });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(requiresConfirmation(result)).toBe(true);
    expect(result.requiredConfirmations.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 6. ALLOW 正向案例
// ============================================================

describe('[AUTHZ-B] ALLOW 正向案例', () => {
  it('A1: 完整 AuthContext + 低风险 WriteIntent → ALLOW', () => {
    const result = evaluateWriteAuthorization(validUserAuth(), lowRiskIntent());
    expect(isAllowed(result)).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('A2: 迁移 AuthContext + backfill WriteIntent → ALLOW', () => {
    const auth = createMigrationAuthContext({ operatorId: OP, ownerId: OP });
    const intent = lowRiskIntent({ operation: 'backfill', purpose: 'migration_backfill', userIntentLevel: 'migration' });
    const result = evaluateWriteAuthorization(auth, intent);
    expect(isAllowed(result)).toBe(true);
  });

  it('A3: 用户显式指令 + 私密数据 + allowSensitive → ALLOW (不拒绝)', () => {
    const auth = validUserAuth({
      authScope: { domains: ['memory'], operations: ['read', 'write'], allowAutomatic: false, allowSensitive: true, expiresAt: null },
    });
    const intent = lowRiskIntent({ sensitivityLevel: 'secret', userIntentLevel: 'explicit_user' });
    const result = evaluateWriteAuthorization(auth, intent);
    // Phase 4 中 secret + explicit_user 不触发 confirmation
    expect(isAllowed(result)).toBe(true);
  });

  it('A4: update 操作需要 write → ALLOW', () => {
    const intent = lowRiskIntent({ operation: 'update', purpose: 'user_explicit_command' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(isAllowed(result)).toBe(true);
  });

  it('A5: merge 操作需要 write → ALLOW', () => {
    const intent = lowRiskIntent({ operation: 'merge', purpose: 'user_explicit_command' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent);
    expect(isAllowed(result)).toBe(true);
  });
});

// ============================================================
// 7. assertWriteAuthorized 行为
// ============================================================

describe('[AUTHZ-B] assertWriteAuthorized 断言', () => {
  it('AS1: ALLOW → 正常返回 decision', () => {
    const decision = assertWriteAuthorized(validUserAuth(), lowRiskIntent());
    expect(isAllowed(decision)).toBe(true);
  });

  it('AS2: DENY → throw WriteNotAuthorizedError', () => {
    const auth = validUserAuth({ operatorId: 'unknown' });
    expect(() => assertWriteAuthorized(auth, lowRiskIntent())).toThrow(WriteNotAuthorizedError);
  });

  it('AS3: REQUIRE_CONFIRMATION → throw WriteRequiresConfirmationError', () => {
    const intent = lowRiskIntent({ affectsCanon: true, derivedFromInference: true, userIntentLevel: 'inferred' });
    expect(() => assertWriteAuthorized(validUserAuth(), intent)).toThrow(WriteRequiresConfirmationError);
  });

  it('AS4: checkWriteAuthorized 不 throw（自行处理）', () => {
    const decision = checkWriteAuthorized(
      validUserAuth({ operatorId: 'unknown' }),
      lowRiskIntent(),
    );
    expect(isDenied(decision)).toBe(true);
  });

  it('AS5: WriteNotAuthorizedError 包含拒绝原因', () => {
    try {
      assertWriteAuthorized(validUserAuth({ operatorId: 'unknown' }), lowRiskIntent());
      expect.unreachable('应该 throw');
    } catch (e) {
      expect(e).toBeInstanceOf(WriteNotAuthorizedError);
      const err = e as WriteNotAuthorizedError;
      expect(err.decision.reasons.length).toBeGreaterThan(0);
      expect(err.message).toContain('MISSING_OPERATOR_ID');
    }
  });
});

// ============================================================
// 8. 策略注册表可定制
// ============================================================

describe('[AUTHZ-B] 策略注册表可定制', () => {
  it('P1: 自定义注册表可禁用 hard_delete 拒绝', () => {
    const reg: AuthzPolicyRegistry = { ...DEFAULT_POLICY_REGISTRY, denyHardDelete: false };
    const auth = validUserAuth({
      authScope: { domains: ['memory'], operations: ['read', 'write'], allowAutomatic: false, allowSensitive: false, expiresAt: null },
    });
    // hard_delete 不可逆 → 需要 admin，当前 auth 是 write → 仍 DENY on scope
    const intent = lowRiskIntent({ operation: 'hard_delete', reversibility: 'irreversible_approved' });
    const result = evaluateWriteAuthorization(auth, intent, reg);
    // hard_delete 拒绝被禁用, 但仍被 scope check 拒绝 (operation=hard_delete 需要 admin)
    expect(result.reasons.some((r) => r.code === DENIAL_CODES.HARD_DELETE_DENIED)).toBe(false);
  });

  it('P2: 未启用策略的规则不影响评估', () => {
    const reg: AuthzPolicyRegistry = {
      ...DEFAULT_POLICY_REGISTRY,
      requireConfirmationForInferredCanon: false,
    };
    const intent = lowRiskIntent({ affectsCanon: true, derivedFromInference: true, userIntentLevel: 'inferred' });
    const result = evaluateWriteAuthorization(validUserAuth(), intent, reg);
    expect(isAllowed(result)).toBe(true); // 策略关闭 → 不需要确认
  });
});

// ============================================================
// 9. 拒绝码覆盖
// ============================================================

describe('[AUTHZ-B] 拒绝码全覆盖', () => {
  it('DENIAL_CODES 包含 16 个拒绝码', () => {
    const codes = Object.values(DENIAL_CODES);
    expect(codes.length).toBe(16);
  });

  it('DENIAL_CODES 全部唯一', () => {
    const codes = Object.values(DENIAL_CODES);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});
