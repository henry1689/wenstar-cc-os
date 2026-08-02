// ============================================================
// AUDIT-B — 审计基准测试
// 所有测试使用合成 Fixture。不访问 DB。不修改任何文件。
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAuditEvent,
  generateAuditEventId,
  resetAuditEventSequence,
  type AuditEvent,
} from '../AuditEvent.js';
import {
  createAuditActor,
  SYSTEM_ACTOR,
  UNKNOWN_ACTOR,
} from '../AuditActor.js';
import { createAuditSubject } from '../AuditSubject.js';
import { createAuditAction } from '../AuditAction.js';
import {
  createAuditOutcome,
  OUTCOME_SUCCESS,
  OUTCOME_DENIED,
  OUTCOME_REQUIRES_CONFIRMATION,
} from '../AuditOutcome.js';
import {
  NoopAuditSink,
  InMemoryAuditSink,
  NOOP_AUDIT_SINK,
  type AuditSink,
} from '../AuditSink.js';
import { recordAuthorizationDecision } from '../recordAuthorizationDecision.js';
import {
  createAuthContext,
  createSystemAutoAuthContext,
  createMigrationAuthContext,
} from '../../auth/createAuthContext.js';
import {
  createWriteIntent,
  type WriteIntent,
} from '../../auth/WriteIntent.js';
import {
  evaluateWriteAuthorization,
  isAllowed,
  isDenied,
  requiresConfirmation,
} from '../../auth/AuthzPolicy.js';
import type { AuthContext } from '../../auth/AuthContext.js';
import type { AuthorizationDecision } from '../../auth/AuthorizationDecision.js';

// ── 合成 Fixture ──

const OPERATOR_TXS = 'TXS-000000001';
const OWNER_TXS = 'TXS-000000001';
const SESSION_ID = 'session_alpha_001';

function makeAuth(overrides: Partial<Parameters<typeof createAuthContext>[0]> = {}): AuthContext {
  return createAuthContext({
    operatorId: OPERATOR_TXS,
    ownerId: OWNER_TXS,
    purpose: 'user_explicit_command',
    sessionId: SESSION_ID,
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

function makeIntent(overrides: Partial<Parameters<typeof createWriteIntent>[0]> = {}): WriteIntent {
  return createWriteIntent({
    operatorId: OPERATOR_TXS,
    ownerId: OWNER_TXS,
    domain: 'memory',
    operation: 'create',
    purpose: 'user_explicit_command',
    userIntentLevel: 'explicit_user',
    reason: '用户请求写入测试记忆',
    ...overrides,
  });
}

// ============================================================
// 1. AuditActor
// ============================================================

describe('[AUDIT-B] AuditActor', () => {
  it('A1: createAuditActor 创建合法 Actor', () => {
    const actor = createAuditActor('TXS-000000001', 'user', 'TestUser');
    expect(actor.id).toBe('TXS-000000001');
    expect(actor.type).toBe('user');
    expect(actor.name).toBe('TestUser');
  });

  it('A2: name 是可选字段', () => {
    const actor = createAuditActor('TXS-000000002', 'system');
    expect(actor.id).toBe('TXS-000000002');
    expect(actor.type).toBe('system');
    expect(actor.name).toBeUndefined();
  });

  it('A3: SYSTEM_ACTOR 预置值', () => {
    expect(SYSTEM_ACTOR.id).toBe('TXS-000000000');
    expect(SYSTEM_ACTOR.type).toBe('system');
  });

  it('A4: UNKNOWN_ACTOR 预置值', () => {
    expect(UNKNOWN_ACTOR.id).toBe('UNKNOWN');
    expect(UNKNOWN_ACTOR.type).toBe('system');
  });
});

// ============================================================
// 2. AuditSubject
// ============================================================

describe('[AUDIT-B] AuditSubject', () => {
  it('S1: createAuditSubject 创建合法 Subject', () => {
    const subj = createAuditSubject('TXS-000000001', 'person_identity', 'familygraph');
    expect(subj.subjectId).toBe('TXS-000000001');
    expect(subj.resourceType).toBe('person_identity');
    expect(subj.domain).toBe('familygraph');
  });

  it('S2: namespace 是可选字段', () => {
    const subj = createAuditSubject('mem_001', 'memory', 'memory', 'default');
    expect(subj.namespace).toBe('default');
    const subj2 = createAuditSubject('mem_002', 'memory', 'memory');
    expect(subj2.namespace).toBeUndefined();
  });
});

// ============================================================
// 3. AuditAction
// ============================================================

describe('[AUDIT-B] AuditAction', () => {
  it('AC1: createAuditAction 创建合法 Action', () => {
    const action = createAuditAction('create', '创建新记忆');
    expect(action.type).toBe('create');
    expect(action.description).toBe('创建新记忆');
  });

  it('AC2: description 是可选字段', () => {
    const action = createAuditAction('delete');
    expect(action.type).toBe('delete');
    expect(action.description).toBeUndefined();
  });
});

// ============================================================
// 4. AuditOutcome
// ============================================================

describe('[AUDIT-B] AuditOutcome', () => {
  it('O1: createAuditOutcome 创建合法 Outcome', () => {
    const out = createAuditOutcome('success', '操作完成');
    expect(out.status).toBe('success');
    expect(out.detail).toBe('操作完成');
  });

  it('O2: 预置 Outcome 值正确', () => {
    expect(OUTCOME_SUCCESS.status).toBe('success');
    expect(OUTCOME_DENIED.status).toBe('denied');
    expect(OUTCOME_REQUIRES_CONFIRMATION.status).toBe('requires_confirmation');
  });
});

// ============================================================
// 5. createAuditEvent
// ============================================================

describe('[AUDIT-B] createAuditEvent', () => {
  beforeEach(() => {
    resetAuditEventSequence();
  });

  it('E1: 必填字段 → 创建完整 AuditEvent', () => {
    const event = createAuditEvent({
      eventId: 'audit_test_001',
      actor: createAuditActor('TXS-000000001', 'user'),
      action: createAuditAction('create'),
      outcome: OUTCOME_SUCCESS,
    });

    expect(event.eventId).toBe('audit_test_001');
    expect(event.actor.id).toBe('TXS-000000001');
    expect(event.action.type).toBe('create');
    expect(event.outcome.status).toBe('success');
    expect(event.schemaVersion).toBe('audit.event.v1');
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('E2: schemaVersion 稳定锁定为 audit.event.v1', () => {
    const e1 = createAuditEvent({
      eventId: 'e1',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('read'),
      outcome: OUTCOME_SUCCESS,
    });
    const e2 = createAuditEvent({
      eventId: 'e2',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('update'),
      outcome: OUTCOME_DENIED,
    });
    expect(e1.schemaVersion).toBe('audit.event.v1');
    expect(e2.schemaVersion).toBe('audit.event.v1');
  });

  it('E3: occurredAt 默认为当前 ISO 时间', () => {
    const before = new Date().toISOString();
    const event = createAuditEvent({
      eventId: 'e3',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('read'),
      outcome: OUTCOME_SUCCESS,
    });
    const after = new Date().toISOString();
    expect(event.occurredAt >= before).toBe(true);
    expect(event.occurredAt <= after).toBe(true);
  });

  it('E4: occurredAt 可显式覆盖', () => {
    const customTs = '2026-01-01T00:00:00.000Z';
    const event = createAuditEvent({
      eventId: 'e4',
      occurredAt: customTs,
      actor: SYSTEM_ACTOR,
      action: createAuditAction('read'),
      outcome: OUTCOME_SUCCESS,
    });
    expect(event.occurredAt).toBe(customTs);
  });

  it('E5: 所有可选字段均可设置', () => {
    const event = createAuditEvent({
      eventId: 'e5_full',
      actor: createAuditActor('TXS-000000001', 'user', 'TestUser'),
      subject: createAuditSubject('TXS-000000002', 'person_identity', 'familygraph'),
      action: createAuditAction('merge', '合并重复人物'),
      outcome: createAuditOutcome('success', '合并完成'),
      authContextId: 'ctx_001',
      writeIntentId: 'wi_001',
      authorizationDecisionId: 'ALLOW',
      resource: 'familygraph:person:TXS-000000002',
      reason: '用户请求合并重复人物节点',
      metadata: { sourceCount: 2, mergedInto: 'TXS-000000001' },
    });

    expect(event.eventId).toBe('e5_full');
    expect(event.subject?.subjectId).toBe('TXS-000000002');
    expect(event.authContextId).toBe('ctx_001');
    expect(event.writeIntentId).toBe('wi_001');
    expect(event.authorizationDecisionId).toBe('ALLOW');
    expect(event.resource).toBe('familygraph:person:TXS-000000002');
    expect(event.reason).toBe('用户请求合并重复人物节点');
    expect(event.metadata).toEqual({ sourceCount: 2, mergedInto: 'TXS-000000001' });
  });

  it('E6: AuditEvent 是不可变的（Object.freeze）', () => {
    const event = createAuditEvent({
      eventId: 'e6',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('read'),
      outcome: OUTCOME_SUCCESS,
    });

    expect(() => {
      (event as any).eventId = 'mutated';
    }).toThrow();
  });

  it('E7: generateAuditEventId 生成唯一 ID', () => {
    const id1 = generateAuditEventId();
    const id2 = generateAuditEventId();
    expect(id1).toMatch(/^audit_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_\d{6}_[a-z0-9]{6}$/);
    expect(id1).not.toBe(id2);
  });
});

// ============================================================
// 6. NoopAuditSink
// ============================================================

describe('[AUDIT-B] NoopAuditSink', () => {
  it('N1: NoopAuditSink count 始终为 0', () => {
    const sink = new NoopAuditSink();
    expect(sink.count).toBe(0);

    const event = createAuditEvent({
      eventId: 'n1',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('read'),
      outcome: OUTCOME_SUCCESS,
    });
    sink.record(event);
    expect(sink.count).toBe(0);
  });

  it('N2: NoopAuditSink record() 从不 throw', () => {
    const sink = new NoopAuditSink();
    expect(() => sink.record({} as any)).not.toThrow();
    expect(() => sink.record(null as any)).not.toThrow();
    expect(() => sink.record(undefined as any)).not.toThrow();
  });

  it('N3: NOOP_AUDIT_SINK 是共享单例', () => {
    expect(NOOP_AUDIT_SINK).toBeInstanceOf(NoopAuditSink);
    expect(NOOP_AUDIT_SINK.count).toBe(0);
  });
});

// ============================================================
// 7. InMemoryAuditSink
// ============================================================

describe('[AUDIT-B] InMemoryAuditSink', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('M1: 初始 count 为 0', () => {
    expect(sink.count).toBe(0);
    expect(sink.getEvents()).toHaveLength(0);
  });

  it('M2: record() 后 count 递增', () => {
    const event = createAuditEvent({
      eventId: 'm1',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('create'),
      outcome: OUTCOME_SUCCESS,
    });
    sink.record(event);
    expect(sink.count).toBe(1);
  });

  it('M3: getEvents() 返回已记录事件的副本', () => {
    const event = createAuditEvent({
      eventId: 'm2',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('update'),
      outcome: OUTCOME_SUCCESS,
    });
    sink.record(event);

    const events = sink.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe('m2');

    // 返回的是副本 —— 修改不影响内部存储
    events.pop();
    expect(sink.count).toBe(1);
  });

  it('M4: 多次 record() 保留所有事件', () => {
    for (let i = 0; i < 5; i++) {
      sink.record(createAuditEvent({
        eventId: `m3_${i}`,
        actor: SYSTEM_ACTOR,
        action: createAuditAction('read'),
        outcome: OUTCOME_SUCCESS,
      }));
    }
    expect(sink.count).toBe(5);
    expect(sink.getEvents().map((e) => e.eventId)).toEqual([
      'm3_0', 'm3_1', 'm3_2', 'm3_3', 'm3_4',
    ]);
  });

  it('M5: clear() 清空所有事件', () => {
    sink.record(createAuditEvent({
      eventId: 'm4',
      actor: SYSTEM_ACTOR,
      action: createAuditAction('read'),
      outcome: OUTCOME_SUCCESS,
    }));
    expect(sink.count).toBe(1);

    sink.clear();
    expect(sink.count).toBe(0);
    expect(sink.getEvents()).toHaveLength(0);
  });
});

// ============================================================
// 8. recordAuthorizationDecision — ALLOW
// ============================================================

describe('[AUDIT-B] recordAuthorizationDecision — ALLOW', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('R1: ALLOW 决策 → 记录 success 审计事件', () => {
    const auth = makeAuth();
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);

    expect(isAllowed(decision)).toBe(true);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.outcome.status).toBe('success');
    expect(event.actor.id).toBe(OPERATOR_TXS);
    expect(event.actor.type).toBe('user');
    expect(event.subject?.domain).toBe('memory');
    expect(event.action.type).toBe('create');
    expect(event.schemaVersion).toBe('audit.event.v1');
    expect(sink.count).toBe(1);
  });

  it('R2: ALLOW 事件包含 AUTHZ-B 追踪字段', () => {
    const auth = makeAuth();
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.authContextId).toBe(OPERATOR_TXS);
    expect(event.writeIntentId).toBe('user_explicit_command');
    expect(event.authorizationDecisionId).toBe('ALLOW');
    expect(event.resource).toBe('memory:create');
    expect(event.reason).toBe('用户请求写入测试记忆');
  });

  it('R3: ALLOW 事件含完整元数据', () => {
    const auth = makeAuth();
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.metadata).toBeDefined();
    expect(event.metadata?.sensitivityLevel).toBe('private');
    expect(event.metadata?.userIntentLevel).toBe('explicit_user');
    expect(event.metadata?.affectsCanon).toBe(false);
    expect(event.metadata?.derivedFromInference).toBe(false);
    expect(Array.isArray(event.metadata?.appliedPolicies)).toBe(true);
  });

  it('R4: eventId 可显式覆盖', () => {
    const auth = makeAuth();
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);

    const event = recordAuthorizationDecision({
      auth, intent, decision, sink,
      eventId: 'custom_event_001',
    });

    expect(event.eventId).toBe('custom_event_001');
  });
});

// ============================================================
// 9. recordAuthorizationDecision — DENY
// ============================================================

describe('[AUDIT-B] recordAuthorizationDecision — DENY', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('R5: DENY 决策 → 记录 denied 审计事件', () => {
    const auth = makeAuth({ operatorId: 'unknown' });
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);

    expect(isDenied(decision)).toBe(true);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.outcome.status).toBe('denied');
    expect(event.outcome.detail).toBeDefined();
    expect(event.outcome.detail).toContain('MISSING_OPERATOR_ID');
    expect(sink.count).toBe(1);
  });

  it('R6: DENY 事件仍包含完整的 actor/action 上下文', () => {
    const auth = makeAuth({ purpose: 'unknown' });
    const intent = makeIntent({ purpose: 'unknown' });
    const decision = evaluateWriteAuthorization(auth, intent);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.actor.id).toBe(OPERATOR_TXS);
    expect(event.action.type).toBe('create');
    expect(event.outcome.status).toBe('denied');
  });
});

// ============================================================
// 10. recordAuthorizationDecision — REQUIRE_CONFIRMATION
// ============================================================

describe('[AUDIT-B] recordAuthorizationDecision — REQUIRE_CONFIRMATION', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('R7: REQUIRE_CONFIRMATION 决策 → 记录 requires_confirmation 审计事件', () => {
    const auth = makeAuth();
    const intent = makeIntent({
      sensitivityLevel: 'sensitive',
      userIntentLevel: 'system_automatic',
    });
    const decision = evaluateWriteAuthorization(auth, intent);

    expect(requiresConfirmation(decision)).toBe(true);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.outcome.status).toBe('requires_confirmation');
    expect(sink.count).toBe(1);
  });

  it('R8: REQUIRE_CONFIRMATION 事件包含确认需求列表', () => {
    const auth = makeAuth();
    const intent = makeIntent({
      affectsCanon: true,
      derivedFromInference: true,
      userIntentLevel: 'inferred',
    });
    const decision = evaluateWriteAuthorization(auth, intent);

    const event = recordAuthorizationDecision({ auth, intent, decision, sink });

    expect(event.outcome.status).toBe('requires_confirmation');
    expect(event.outcome.detail).toBeDefined();
    expect(event.outcome.detail).toContain('规范键');
  });
});

// ============================================================
// 11. recordAuthorizationDecision — 不同 Actor 类型
// ============================================================

describe('[AUDIT-B] recordAuthorizationDecision — Actor 类型推导', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('R9: derivedFromInference=true → actor.type = agent', () => {
    const auth = makeAuth({ derivedFromInference: true });
    const intent = makeIntent({ derivedFromInference: true });
    const decision = evaluateWriteAuthorization(auth, intent);
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    expect(event.actor.type).toBe('agent');
  });

  it('R10: 迁移 AuthContext → actor.type = user', () => {
    const auth = createMigrationAuthContext({ operatorId: OPERATOR_TXS, ownerId: OWNER_TXS });
    const intent = makeIntent({ operation: 'backfill', purpose: 'migration_backfill', userIntentLevel: 'migration' });
    const decision = evaluateWriteAuthorization(auth, intent);
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    // 迁移操作通常不是推断的
    expect(event.actor.type).toBe('user');
  });
});

// ============================================================
// 12. recordAuthorizationDecision — 操作类型映射
// ============================================================

describe('[AUDIT-B] recordAuthorizationDecision — 操作类型映射', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('R11: operation=delete → action.type=delete', () => {
    const auth = makeAuth({
      authScope: { domains: ['memory'], operations: ['read', 'write'], allowAutomatic: false, allowSensitive: false, expiresAt: null },
    });
    const intent = makeIntent({ operation: 'delete' });
    const decision = evaluateWriteAuthorization(auth, intent);
    // delete needs admin; this will be DENY, but we still want to audit it with correct action type
    expect(decision.decision).toBe('DENY');
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    expect(event.action.type).toBe('delete');
  });

  it('R12: operation=hard_delete → action.type=hard_delete', () => {
    const auth = makeAuth();
    const intent = makeIntent({ operation: 'hard_delete', reversibility: 'irreversible_approved' });
    const decision = evaluateWriteAuthorization(auth, intent);
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    expect(event.action.type).toBe('hard_delete');
  });

  it('R13: operation=merge → action.type=merge', () => {
    const auth = makeAuth();
    const intent = makeIntent({ operation: 'merge' });
    const decision = evaluateWriteAuthorization(auth, intent);
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    expect(event.action.type).toBe('merge');
  });

  it('R14: operation=backfill → action.type=migrate', () => {
    const auth = createMigrationAuthContext({ operatorId: OPERATOR_TXS, ownerId: OWNER_TXS });
    const intent = makeIntent({ operation: 'backfill', purpose: 'migration_backfill', userIntentLevel: 'migration' });
    const decision = evaluateWriteAuthorization(auth, intent);
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    expect(event.action.type).toBe('migrate');
  });

  it('R15: operation=upgrade → action.type=promote', () => {
    const auth = makeAuth();
    const intent = makeIntent({ operation: 'upgrade' });
    const decision = evaluateWriteAuthorization(auth, intent);
    const event = recordAuthorizationDecision({ auth, intent, decision, sink });
    expect(event.action.type).toBe('promote');
  });
});

// ============================================================
// 13. 集成回归：AUTHZ-B 测试仍通过
// ============================================================

describe('[AUDIT-B] AUTHZ-B 集成回归', () => {
  it('I1: 现有 AUTHZ-B 评估仍可正常调用', () => {
    const auth = makeAuth();
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);
    expect(isAllowed(decision)).toBe(true);
  });

  it('I2: AUTHZ-B DENY 场景不受影响', () => {
    const auth = makeAuth({ operatorId: 'unknown' });
    const intent = makeIntent();
    const decision = evaluateWriteAuthorization(auth, intent);
    expect(isDenied(decision)).toBe(true);
  });

  it('I3: AUTHZ-B REQUIRE_CONFIRMATION 场景不受影响', () => {
    const auth = makeAuth();
    const intent = makeIntent({
      affectsCanon: true,
      derivedFromInference: true,
      userIntentLevel: 'inferred',
    });
    const decision = evaluateWriteAuthorization(auth, intent);
    expect(requiresConfirmation(decision)).toBe(true);
  });
});

// ============================================================
// 14. 审计事件可链式记录
// ============================================================

describe('[AUDIT-B] 审计事件链', () => {
  let sink: InMemoryAuditSink;

  beforeEach(() => {
    sink = new InMemoryAuditSink();
    resetAuditEventSequence();
  });

  it('C1: 连续的授权决策产生独立事件', () => {
    const auth = makeAuth();
    const intents = [
      makeIntent({ domain: 'memory', operation: 'create' }),
      makeIntent({ domain: 'dossier', operation: 'update' }),
      makeIntent({ domain: 'familygraph', operation: 'merge' }),
    ];

    for (const intent of intents) {
      const decision = evaluateWriteAuthorization(auth, intent);
      recordAuthorizationDecision({ auth, intent, decision, sink });
    }

    expect(sink.count).toBe(3);

    const events = sink.getEvents();
    const eventIds = events.map((e) => e.eventId);
    const uniqueIds = new Set(eventIds);
    expect(uniqueIds.size).toBe(3);

    expect(events[0].resource).toBe('memory:create');
    expect(events[1].resource).toBe('dossier:update');
    expect(events[2].resource).toBe('familygraph:merge');
  });
});
