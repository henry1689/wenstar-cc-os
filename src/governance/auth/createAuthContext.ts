// ============================================================
// AUTHZ-B — createAuthContext 授权上下文工厂
// ============================================================
// 从现有 ChatContext 构建 AuthContext。
// 不修改 ChatContext。AuthContext 是附加层。
// ============================================================

import type { AuthContext, AuthScope, SensitivityLevel } from './AuthContext.js';
import { DEFAULT_AUTH_SCOPE, userSessionScope } from './AuthContext.js';

// ── 工厂参数 ──

export interface CreateAuthContextParams {
  // ── 必填身份 ──
  /** 操作者 TXS-ID（户籍规范身份） */
  operatorId: string;
  /** 数据所有者 TXS-ID */
  ownerId: string;
  /** 请求者 TXS-ID（默认同 operatorId） */
  requesterId?: string;

  // ── 必填意图 ──
  /** 操作目的（受控词汇） */
  purpose: string;

  // ── 会话 ──
  /** 会话标识 */
  sessionId?: string;
  /** 命名空间 */
  namespace?: string;

  // ── 授权范围 ──
  /** 自定义授权范围（默认使用 userSessionScope 只读） */
  authScope?: AuthScope;

  // ── 可信度标记 ──
  /** 操作是否来自 LLM/AI 推断 */
  derivedFromInference?: boolean;
  /** 是否需要后续确认 */
  requiresConfirmation?: boolean;
}

/**
 * 从显式参数创建 AuthContext。
 *
 * 默认值策略：
 *   - requesterId = operatorId（同一人）
 *   - sessionId = "unknown"（未在会话上下文中）
 *   - namespace = "default"
 *   - authScope = userSessionScope（只读）
 *   - derivedFromInference = false
 *   - requiresConfirmation = false
 *
 * 调用方应显式覆盖不满足需求的默认值。
 */
export function createAuthContext(params: CreateAuthContextParams): AuthContext {
  return {
    operatorId: params.operatorId,
    requesterId: params.requesterId ?? params.operatorId,
    ownerId: params.ownerId,
    purpose: params.purpose,
    authScope: params.authScope ?? DEFAULT_AUTH_SCOPE,
    sessionId: params.sessionId ?? 'unknown',
    namespace: params.namespace ?? 'default',
    derivedFromInference: params.derivedFromInference ?? false,
    requiresConfirmation: params.requiresConfirmation ?? false,
  };
}

// ── 预置工厂 ──

/**
 * 创建用户显式会话的 AuthContext。
 * 默认 authScope = userSessionScope（只读）。
 * 需要写权限时，调用方必须覆盖 authScope。
 */
export function createUserSessionAuthContext(params: {
  operatorId: string;
  ownerId: string;
  sessionId: string;
  namespace?: string;
  purpose?: string;
}): AuthContext {
  return {
    operatorId: params.operatorId,
    requesterId: params.operatorId,
    ownerId: params.ownerId,
    purpose: params.purpose ?? 'user_explicit_command',
    authScope: userSessionScope(params.sessionId, params.namespace ?? 'default'),
    sessionId: params.sessionId,
    namespace: params.namespace ?? 'default',
    derivedFromInference: false,
    requiresConfirmation: false,
  };
}

/**
 * 创建 Agent Tool 执行专属 AuthContext。
 * 默认 authScope 包含 write + admin 但不包含敏感域。
 */
export function createAgentToolAuthContext(params: {
  operatorId: string;
  requesterId: string;  // 谁调用了 Tool（与 operatorId 可能不同）
  ownerId: string;
  sessionId: string;
  purpose?: string;
  derivedFromInference?: boolean;
}): AuthContext {
  return {
    operatorId: params.operatorId,
    requesterId: params.requesterId,
    ownerId: params.ownerId,
    purpose: params.purpose ?? 'agent_tool_execution',
    authScope: {
      domains: ['memory', 'dossier', 'familygraph', 'knowledge'],
      operations: ['read', 'write'],
      allowAutomatic: false,
      allowSensitive: false,
      expiresAt: null,
    },
    sessionId: params.sessionId,
    namespace: 'default',
    derivedFromInference: params.derivedFromInference ?? true,
    requiresConfirmation: params.derivedFromInference ?? true,
  };
}

/**
 * 创建系统自动操作的 AuthContext（ConsolidationQueue / InductionScheduler）。
 * 默认 authScope 包含 write + 自动写入。
 */
export function createSystemAutoAuthContext(params: {
  operatorId: string;
  ownerId: string;
  purpose?: string;
  domain?: string;
}): AuthContext {
  return {
    operatorId: params.operatorId,
    requesterId: params.operatorId,
    ownerId: params.ownerId,
    purpose: params.purpose ?? 'system_consolidation',
    authScope: {
      domains: [params.domain ?? 'memory'],
      operations: ['read', 'write'],
      allowAutomatic: true,
      allowSensitive: false,
      expiresAt: null,
    },
    sessionId: 'system',
    namespace: 'default',
    derivedFromInference: true,
    requiresConfirmation: true,  // 系统自动操作默认需要确认
  };
}

/**
 * 创建迁移/回填操作的 AuthContext。
 * 默认 authScope 包含 admin + 敏感域。
 */
export function createMigrationAuthContext(params: {
  operatorId: string;
  ownerId: string;
  purpose?: string;
}): AuthContext {
  return {
    operatorId: params.operatorId,
    requesterId: params.operatorId,
    ownerId: params.ownerId,
    purpose: params.purpose ?? 'migration_backfill',
    authScope: {
      domains: ['memory', 'dossier', 'familygraph', 'knowledge', 'embedding'],
      operations: ['read', 'write', 'admin'],
      allowAutomatic: true,
      allowSensitive: true,
      expiresAt: null,
    },
    sessionId: 'migration',
    namespace: 'default',
    derivedFromInference: false,
    requiresConfirmation: false,
  };
}
