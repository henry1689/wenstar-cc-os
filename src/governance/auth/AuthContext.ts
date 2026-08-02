// ============================================================
// AUTHZ-B — AuthContext 授权上下文
// ============================================================
// 治理原则：
//   真实数据可以被系统处理，但必须满足：
//   授权、身份绑定、审计、可撤销、可回滚。
//
// AuthContext 回答 "谁在操作？以什么身份？为什么目的？"
// 每个字段缺失都可能导致 evaluateWriteAuthorization 返回 DENY。
// ============================================================

/** 操作敏感度等级 */
export type SensitivityLevel = 'public' | 'internal' | 'private' | 'sensitive' | 'secret';

/** 授权范围 —— 操作者被授权执行的操作域 */
export interface AuthScope {
  /** 域类别：memory / dossier / familygraph / knowledge / agent */
  domains: string[];
  /** 每个域内的操作：read / write / delete / admin */
  operations: Array<'read' | 'write' | 'delete' | 'admin'>;
  /** 是否允许自动写入（无用户显式意图） */
  allowAutomatic: boolean;
  /** 是否允许敏感域写入 */
  allowSensitive: boolean;
  /** 授权过期时间（ISO8601, null = 会话有效期） */
  expiresAt: string | null;
}

/**
 * AuthContext — 每次数据操作的授权上下文
 *
 * 所有字段均为必填。调用方在创建 AuthContext 时如不确定某字段，
 * 必须显式传入 'unknown'，由 policy evaluator 根据操作敏感度决定。
 */
export interface AuthContext {
  // ── 身份（who） ──
  /** 操作者 TXS-ID（户籍规范身份） */
  operatorId: string;
  /** 请求者 TXS-ID（可能与 operatorId 相同；Agent Tool 调用时不同） */
  requesterId: string;
  /** 数据所有者 TXS-ID（被操作数据属于谁） */
  ownerId: string;

  // ── 意图（why） ──
  /** 操作目的，使用受控词汇表 */
  purpose: string;
  /** 操作授权范围 */
  authScope: AuthScope;

  // ── 会话（where） ──
  /** 会话标识 */
  sessionId: string;
  /** 命名空间 */
  namespace: string;

  // ── 可信度（how much） ──
  /** 操作是否来自 LLM/AI 推断（而非用户显式指令） */
  derivedFromInference: boolean;
  /** 是否需要后续确认（异步写入先标记 pending，后续确认才变 confirmed） */
  requiresConfirmation: boolean;
}

// ── 受控词汇表 ──

/** 合法的操作目的（purpose 字段的受控词汇） */
export const VALID_PURPOSES = [
  'user_explicit_command',    // 用户显式指令
  'user_confirmed',            // 用户确认（之前已 pending）
  'system_consolidation',      // 系统自动巩固
  'system_induction',          // 系统自动归纳
  'agent_tool_execution',     // Agent Tool 执行
  'nlu_inference',             // NLU 推断
  'migration_backfill',        // 迁移 / 回填
  'profile_acquisition',       // 画像采集
  'meeting_minutes',           // 会晤纪要
  'heat_tracker_upgrade',      // 热力追踪升级
  'import_external',           // 外部导入
  'manual_override',           // 人工覆写
  'test_synthetic',            // 测试（仅合成数据）
  'unknown',                   // 未知（deny-by-default）
] as const;

export type ValidPurpose = typeof VALID_PURPOSES[number];

/** 检查 purpose 是否为合法值 */
export function isValidPurpose(value: string): value is ValidPurpose {
  return VALID_PURPOSES.includes(value as ValidPurpose);
}

// ── 默认 AuthScope — 最严格的 deny-all ──

/** 默认空授权 —— 不授权任何操作 */
export const DEFAULT_AUTH_SCOPE: AuthScope = {
  domains: [],
  operations: [],
  allowAutomatic: false,
  allowSensitive: false,
  expiresAt: null,
};

/** 用户显式会话授权 —— 仅 read，不含 write/delete/admin/automatic/sensitive */
export function userSessionScope(sessionId: string, namespace: string): AuthScope {
  return {
    domains: ['memory', 'dossier', 'familygraph', 'knowledge'],
    operations: ['read'],
    allowAutomatic: false,
    allowSensitive: false,
    expiresAt: null,
  };
}
