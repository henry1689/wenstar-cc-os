// ============================================================
// AUTHZ-B — WriteIntent 写操作意图声明
// ============================================================
// WriteIntent 回答 "要写什么？写到哪？有多敏感？"
// 每个字段缺失都可能导致 evaluateWriteAuthorization 返回 DENY。
//
// 设计原则：
//   - 写操作必须显式声明 ownerId / subjectId / domain / purpose
//   - 推断写入必须标记 derivedFromInference = true → requiresConfirmation
//   - 敏感/私密写入必须通过 requiresConfirmation gate
//   - hard_delete 默认 DENY（除非显式申请并确认为 irreversible_approved）
// ============================================================

import type { SensitivityLevel } from './AuthContext.js';
import { isValidPurpose, type ValidPurpose } from './AuthContext.js';

// ── 操作类型 ──

export type OperationType =
  | 'create'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'hard_delete'
  | 'merge'
  | 'upgrade'
  | 'backfill'
  | 'import';

/** 操作是否可逆 */
export type Reversibility =
  | 'reversible'               // 可通过 soft-delete / undo 回滚
  | 'reversible_with_backup'   // 可逆但有前置备份要求
  | 'irreversible'             // 不可逆（需要显式确认）
  | 'irreversible_approved';   // 不可逆但已获显式人工批准

/** 用户意图级别 */
export type UserIntentLevel =
  | 'explicit_user'       // 用户显式指令（确认写入）
  | 'user_implied'        // 用户暗示（需确认）
  | 'agent_tool'          // Agent Tool 触发
  | 'system_automatic'    // 系统自动（心跳/定时器）
  | 'inferred'            // NLU/LLM 推断
  | 'migration'           // 迁移/回填
  | 'test_synthetic';     // 合成测试

// ── WriteIntent ──

export interface WriteIntent {
  // ── 归属（who） ──
  /** 操作者 TXS-ID */
  operatorId: string;
  /** 请求者 TXS-ID */
  requesterId: string;
  /** 数据所有者 TXS-ID */
  ownerId: string;
  /** 操作目标 TXS-ID（如果有特定目标） */
  subjectId: string | null;

  // ── 数据域（what / where） ──
  /** 数据域：memory / dossier / familygraph / knowledge / embedding */
  domain: string;
  /** 操作类型 */
  operation: OperationType;
  /** 可逆性 */
  reversibility: Reversibility;

  // ── 意图（why / how） ──
  /** 操作目的（受控词汇） */
  purpose: ValidPurpose | string;
  /** 用户意图级别 */
  userIntentLevel: UserIntentLevel;
  /** 操作原因（人类可读） */
  reason: string;

  // ── 敏感度（how risky） ──
  /** 数据敏感度 */
  sensitivityLevel: SensitivityLevel;

  // ── 数据质量标记 ──
  /** 是否影响规范键（TXS-ID / GlobalUID / dna_root_id） */
  affectsCanon: boolean;
  /** 是否来自推断（非人工确认） */
  derivedFromInference: boolean;
  /** 是否需要确认 */
  requiresConfirmation: boolean;
}

// ── 工厂函数 ──

export interface WriteIntentParams {
  operatorId: string;
  requesterId?: string;
  ownerId: string;
  subjectId?: string | null;
  domain: string;
  operation: OperationType;
  reversibility?: Reversibility;
  purpose: string;
  userIntentLevel: UserIntentLevel;
  reason: string;
  sensitivityLevel?: SensitivityLevel;
  affectsCanon?: boolean;
  derivedFromInference?: boolean;
  requiresConfirmation?: boolean;
}

/** 创建 WriteIntent —— 填充合理的默认值 */
export function createWriteIntent(params: WriteIntentParams): WriteIntent {
  return {
    operatorId: params.operatorId,
    requesterId: params.requesterId ?? params.operatorId,
    ownerId: params.ownerId,
    subjectId: params.subjectId ?? null,
    domain: params.domain,
    operation: params.operation,
    reversibility: params.reversibility ?? 'reversible',
    purpose: params.purpose,
    userIntentLevel: params.userIntentLevel,
    reason: params.reason,
    sensitivityLevel: params.sensitivityLevel ?? 'private',
    affectsCanon: params.affectsCanon ?? false,
    derivedFromInference: params.derivedFromInference ?? false,
    requiresConfirmation: params.requiresConfirmation ?? false,
  };
}

// ── 验证 ──

/**
 * 验证 WriteIntent 必填字段是否完整。
 * 返回缺失字段列表。空数组 = 完整。
 */
export function validateWriteIntentFields(intent: WriteIntent): string[] {
  const missing: string[] = [];

  if (!intent.operatorId || intent.operatorId === 'unknown') missing.push('operatorId');
  if (!intent.requesterId || intent.requesterId === 'unknown') missing.push('requesterId');
  if (!intent.ownerId || intent.ownerId === 'unknown') missing.push('ownerId');
  if (!intent.domain) missing.push('domain');
  if (!intent.operation) missing.push('operation');
  if (!intent.purpose || intent.purpose === 'unknown') missing.push('purpose');
  if (!intent.reason) missing.push('reason');

  return missing;
}

/**
 * 验证 WriteIntent purpose 是否为合法受控词汇。
 * purpose ≠ 'unknown' 时必须匹配已知词汇。
 */
export function validateWriteIntentPurpose(intent: WriteIntent): boolean {
  if (intent.purpose === 'unknown') return false;
  return isValidPurpose(intent.purpose);
}
