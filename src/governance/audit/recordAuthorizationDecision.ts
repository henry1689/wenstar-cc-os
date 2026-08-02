// ============================================================
// AUDIT-B — recordAuthorizationDecision
// ============================================================
// AUTHZ-B 集成层：将 AuthorizationDecision 转换为 AuditEvent。
// 纯函数。不执行任何授权 —— 仅记录已做出的决策。
// ============================================================

import type { AuthContext } from '../auth/AuthContext.js';
import type { WriteIntent } from '../auth/WriteIntent.js';
import type { AuthorizationDecision } from '../auth/AuthorizationDecision.js';
import type { AuditEvent } from './AuditEvent.js';
import type { AuditSink } from './AuditSink.js';
import { createAuditEvent, generateAuditEventId } from './AuditEvent.js';
import { createAuditActor } from './AuditActor.js';
import { createAuditSubject } from './AuditSubject.js';
import { createAuditAction } from './AuditAction.js';
import { createAuditOutcome } from './AuditOutcome.js';
import type { AuditActor } from './AuditActor.js';
import type { AuditSubject } from './AuditSubject.js';
import type { AuditAction, AuditActionType } from './AuditAction.js';
import type { AuditOutcome, AuditOutcomeStatus } from './AuditOutcome.js';

// ── 映射表 ──

/** 将 OperationType 映射为 AuditActionType */
function mapOperationToActionType(op: string): AuditActionType {
  switch (op) {
    case 'create':       return 'create';
    case 'update':       return 'update';
    case 'upsert':       return 'upsert';
    case 'delete':       return 'delete';
    case 'hard_delete':  return 'hard_delete';
    case 'merge':        return 'merge';
    case 'upgrade':      return 'promote';
    case 'backfill':     return 'migrate';
    case 'import':       return 'migrate';
    default:             return 'update';
  }
}

/** 将 AuthDecision 映射为 AuditOutcomeStatus */
function mapDecisionToOutcomeStatus(decision: string): AuditOutcomeStatus {
  switch (decision) {
    case 'ALLOW':                 return 'success';
    case 'DENY':                  return 'denied';
    case 'REQUIRE_CONFIRMATION':  return 'requires_confirmation';
    default:                      return 'failure';
  }
}

// ── recordAuthorizationDecision ──

export interface RecordAuthDecisionParams {
  /** AUTHZ-B AuthContext */
  auth: AuthContext;
  /** AUTHZ-B WriteIntent */
  intent: WriteIntent;
  /** AUTHZ-B AuthorizationDecision */
  decision: AuthorizationDecision;
  /** 审计事件接收器 */
  sink: AuditSink;
  /** 可选：覆盖 eventId（默认自动生成） */
  eventId?: string;
}

/**
 * 将授权决策记录为审计事件。
 *
 * 纯逻辑。不执行授权（假设授权已经发生）。
 * 将 AUTHZ-B 类型映射到 AUDIT-B 类型，创建 AuditEvent，
 * 并将其记录到提供的 sink 中。
 *
 * 返回创建的 AuditEvent（调用方可用于附加追踪）。
 */
export function recordAuthorizationDecision(
  params: RecordAuthDecisionParams,
): AuditEvent {
  const { auth, intent, decision, sink, eventId } = params;

  // 1. Actor — 从 AuthContext 推导
  const actor: AuditActor = createAuditActor(
    auth.operatorId,
    auth.derivedFromInference ? 'agent' : 'user',
    auth.operatorId,
  );

  // 2. Subject — 从 WriteIntent 推导
  const subject: AuditSubject = createAuditSubject(
    intent.subjectId ?? intent.ownerId,
    intent.domain as AuditSubject['resourceType'],
    intent.domain,
    auth.namespace,
  );

  // 3. Action — 从 WriteIntent.operation 推导
  const actionType = mapOperationToActionType(intent.operation);
  const action: AuditAction = createAuditAction(
    actionType,
    `${actionType} on ${intent.domain}/${intent.subjectId ?? intent.ownerId}`,
  );

  // 4. Outcome — 从 AuthorizationDecision.decision 推导
  const outcomeStatus = mapDecisionToOutcomeStatus(decision.decision);
  const outcomeDetail = decision.decision === 'DENY'
    ? decision.reasons.map((r) => `[${r.code}] ${r.message}`).join('; ')
    : decision.decision === 'REQUIRE_CONFIRMATION'
      ? decision.requiredConfirmations.join('; ')
      : undefined;
  const outcome: AuditOutcome = createAuditOutcome(outcomeStatus, outcomeDetail);

  // 5. 创建 AuditEvent
  const auditEvent = createAuditEvent({
    eventId: eventId ?? generateAuditEventId(),
    actor,
    subject,
    action,
    outcome,
    authContextId: auth.operatorId,
    writeIntentId: intent.purpose,
    authorizationDecisionId: decision.decision,
    resource: `${intent.domain}:${intent.operation}`,
    reason: intent.reason,
    metadata: {
      sensitivityLevel: intent.sensitivityLevel,
      userIntentLevel: intent.userIntentLevel,
      affectsCanon: intent.affectsCanon,
      derivedFromInference: intent.derivedFromInference,
      appliedPolicies: decision.appliedPolicies,
    },
  });

  // 6. 记录到 sink
  sink.record(auditEvent);

  return auditEvent;
}
