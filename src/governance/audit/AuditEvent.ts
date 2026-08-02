// ============================================================
// AUDIT-B — AuditEvent 审计事件
// ============================================================
// 不可变审计事件记录。创建后不可修改。
// schemaVersion 锁定为 "audit.event.v1"。
// ============================================================

import type { AuditActor } from './AuditActor.js';
import type { AuditSubject } from './AuditSubject.js';
import type { AuditAction } from './AuditAction.js';
import type { AuditOutcome } from './AuditOutcome.js';

// ── 主类型 ──

/**
 * AuditEvent — 单个不可变审计事件。
 *
 * 设计原则：
 *   - 创建后不可变（冻结）
 *   - eventId 全局唯一
 *   - 所有必填字段必须存在
 *   - schemaVersion 锁定，用于版本化反序列化
 */
export interface AuditEvent {
  /** 事件唯一标识符 */
  eventId: string;
  /** 事件发生时间（ISO8601） */
  occurredAt: string;
  /** 谁执行了动作 */
  actor: AuditActor;
  /** 对什么执行了动作（可选 —— 某些审计事件没有特定对象） */
  subject?: AuditSubject;
  /** 执行了什么动作 */
  action: AuditAction;
  /** 结果如何 */
  outcome: AuditOutcome;

  // ── AUTHZ-B 追踪（可选，将审计事件与授权决策关联） ──
  /** 关联的 AuthContext.operatorId（如适用） */
  authContextId?: string;
  /** 关联的 WriteIntent（如适用） */
  writeIntentId?: string;
  /** 关联的 AuthorizationDecision（如适用） */
  authorizationDecisionId?: string;

  // ── 可选上下文 ──
  /** 受影响的资源（补充 subject） */
  resource?: string;
  /** 人类可读原因 */
  reason?: string;
  /** 附加结构化元数据 */
  metadata?: Record<string, unknown>;

  // ── 版本 ──
  /** 固定 schema 版本 */
  schemaVersion: 'audit.event.v1';
}

// ── 工厂参数 ──

export interface CreateAuditEventParams {
  eventId: string;
  occurredAt?: string;
  actor: AuditActor;
  subject?: AuditSubject;
  action: AuditAction;
  outcome: AuditOutcome;
  authContextId?: string;
  writeIntentId?: string;
  authorizationDecisionId?: string;
  resource?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ── 工厂函数 ──

/**
 * 创建一个新的不可变 AuditEvent。
 *
 * 要求：
 *   - eventId 必填
 *   - actor、action、outcome 必填
 *   - occurredAt 默认为当前时间
 *   - schemaVersion 始终为 "audit.event.v1"
 */
export function createAuditEvent(params: CreateAuditEventParams): AuditEvent {
  return Object.freeze({
    eventId: params.eventId,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    actor: params.actor,
    subject: params.subject,
    action: params.action,
    outcome: params.outcome,
    authContextId: params.authContextId,
    writeIntentId: params.writeIntentId,
    authorizationDecisionId: params.authorizationDecisionId,
    resource: params.resource,
    reason: params.reason,
    metadata: params.metadata,
    schemaVersion: 'audit.event.v1' as const,
  }) as AuditEvent;
}

// ── 生成 eventId ──

let _seq = 0;

/** 生成一个唯一的事件 ID。格式：audit_<ISO>_<seq>_<rand> */
export function generateAuditEventId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const seq = String(++_seq).padStart(6, '0');
  const rand = Math.random().toString(36).substring(2, 8);
  return `audit_${ts}_${seq}_${rand}`;
}

/** 重置事件序列计数器（仅测试用） */
export function resetAuditEventSequence(): void {
  _seq = 0;
}
