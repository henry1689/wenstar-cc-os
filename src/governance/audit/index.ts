// ============================================================
// AUDIT-B — 审计治理模块 统一导出
// ============================================================

// 核心类型
export type { AuditEvent, CreateAuditEventParams } from './AuditEvent.js';
export { createAuditEvent, generateAuditEventId, resetAuditEventSequence } from './AuditEvent.js';

export type { AuditActor, ActorType } from './AuditActor.js';
export { createAuditActor, SYSTEM_ACTOR, UNKNOWN_ACTOR } from './AuditActor.js';

export type { AuditSubject, ResourceType } from './AuditSubject.js';
export { createAuditSubject } from './AuditSubject.js';

export type { AuditAction, AuditActionType } from './AuditAction.js';
export { createAuditAction } from './AuditAction.js';

export type { AuditOutcome, AuditOutcomeStatus } from './AuditOutcome.js';
export {
  createAuditOutcome,
  OUTCOME_SUCCESS,
  OUTCOME_FAILURE,
  OUTCOME_DENIED,
  OUTCOME_REQUIRES_CONFIRMATION,
  OUTCOME_PENDING,
} from './AuditOutcome.js';

// Sink
export type { AuditSink } from './AuditSink.js';
export { NoopAuditSink, InMemoryAuditSink, NOOP_AUDIT_SINK } from './AuditSink.js';

// AUTHZ-B 集成
export type { RecordAuthDecisionParams } from './recordAuthorizationDecision.js';
export { recordAuthorizationDecision } from './recordAuthorizationDecision.js';
