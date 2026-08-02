// ============================================================
// SCRIPT-GOV-A2b — 脚本执行合约类型定义
// ============================================================
// 纯类型。无运行时行为。无 I/O。无导入副作用。
// 参考：docs/governance/SCRIPT-EXECUTION-CONTRACT.md
// ============================================================

// ── 枚举 ──

/** 脚本风险等级 */
export type ScriptRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** 脚本执行模式 */
export type ScriptExecutionMode = 'dry-run' | 'apply';

/** 执行环境 */
export type ScriptEnvironment = 'local' | 'dev' | 'test' | 'staging' | 'production';

/** 执行完成后的最终状态 */
export type ScriptExecutionStatus =
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'refused';

/** 脚本执行的操作类别 */
export type ScriptOperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'migrate'
  | 'backfill'
  | 'clean'
  | 'sync'
  | 'patch'
  | 'start'
  | 'other';

/** 审计钩子事件类型 */
export type ScriptAuditHookType =
  | 'ScriptExecutionRequested'
  | 'ScriptWritePlanned'
  | 'ScriptWriteApplied'
  | 'ScriptExecutionRefused'
  | 'ScriptExecutionFailed'
  | 'ScriptExecutionCompleted';

// ── 确认 ──

export interface ScriptConfirmation {
  /** 此风险等级 + 操作是否需要确认 */
  required: boolean;
  /** 是否提供了确认 */
  provided: boolean;
  /** 确认令牌摘要 (SHA256, 前16十六进制字符) */
  tokenDigest: string | null;
}

// ── 备份 ──

export interface ScriptBackup {
  /** 此操作是否需要备份 */
  required: boolean;
  /** 备份是否已创建 */
  created: boolean;
  /** 备份标识符 */
  backupId: string | null;
  /** 备份路径 (REDACTED 模式) */
  backupPath: string | null;
  /** 备份文件大小 (字节) */
  backupSizeBytes: number | null;
  /** 备份是否已通过验证 */
  verified: boolean;
}

// ── Operator ──

export interface ScriptOperator {
  /** 操作者 TXS-ID */
  operatorId: string;
  /** 执行业务理由 */
  reason: string;
  /** 关联的变更工单 ID */
  ticket: string | null;
}

// ── 范围 ──

export interface ScriptScope {
  /** 范围选择器 (例如 "table:memories", "person:TXS-000000001") */
  selector: string | null;
  /** 最大处理行数 (0 = 无限制) */
  limit: number;
  /** 批处理大小 */
  batchSize: number;
  /** 起始时间戳过滤 (ISO8601) */
  since: string | null;
  /** 截止时间戳过滤 (ISO8601) */
  until: string | null;
  /** 起始偏移量 */
  offset: number;
}

// ── 主执行合约 ──

export interface ScriptExecutionContract {
  /** 合约版本 (固定为 "script.contract.v1") */
  contractVersion: 'script.contract.v1';

  // ── 脚本标识 ──
  /** 脚本 ID (来自 SCRIPT-GOV-A1 盘点) */
  scriptId: string;
  /** 人类可读名称 */
  scriptName: string;
  /** 风险等级 */
  riskLevel: ScriptRiskLevel;
  /** 操作类别 */
  operationType: ScriptOperationType;

  // ── 执行 ──
  /** 执行模式 */
  mode: ScriptExecutionMode;
  /** 环境 */
  environment: ScriptEnvironment;

  // ── 操作者 ──
  operator: ScriptOperator;

  // ── 范围 ──
  scope: ScriptScope;

  // ── 确认 ──
  confirmation: ScriptConfirmation;

  // ── 备份 ──
  backup: ScriptBackup;

  // ── 审计 ──
  /** 已触发的审计钩子 */
  auditHooksFired: ScriptAuditHookType[];
  /** 关联的审计事件 ID */
  auditEventIds: string[];

  // ── 证据 ──
  /** 证据报告写入路径 (REDACTED 模式) */
  reportPath: string | null;

  // ── 不可逆确认 ──
  /** 是否为不可逆操作提供了显式确认 */
  irreversibleConfirmation: boolean;

  // ── 预检 ──
  /** Schema 兼容性是否已验证 */
  schemaPreflightPassed: boolean;
}

// ── 证据报告 ──

export interface ScriptEvidenceReport {
  reportVersion: 'script.evidence.v1';

  scriptId: string;
  scriptName: string;
  scriptPath: string;         // REDACTED
  riskLevel: ScriptRiskLevel;

  generatedAt: string;        // ISO8601
  mode: ScriptExecutionMode;
  environment: ScriptEnvironment;

  operator: {
    operatorId: string;
    reason: string;
    ticket: string | null;
  };

  execution: {
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    status: ScriptExecutionStatus;
    exitCode: number;
  };

  scope: {
    selector: string | null;
    limit: number;
    batchSize: number;
    since: string | null;
    until: string | null;
    offset: number;
  };

  preconditions: {
    schemaOk: boolean;
    missingTables: string[];
    missingColumns: string[];
    backup: {
      created: boolean;
      pathPattern: string;     // REDACTED
      sizeBytes: number | null;
      verified: boolean;
    };
    duplicatesFound: number;
    nullIdsFound: number;
  };

  changes: {
    rowsScanned: number;
    rowsPlanned: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsFailed: number;
    tablesAffected: string[];
    transactionOutcome: 'committed' | 'rolled_back' | 'not_applicable';
  };

  confirmation: {
    confirmTokenProvided: boolean;
    yesIUnderstandProvided: boolean;
    interactiveConfirmation: boolean;
  };

  audit: {
    auditHooksFired: ScriptAuditHookType[];
    auditEventIds: string[];
  };

  errors: Array<{
    rowId: string | null;
    errorCode: string;
    errorMessage: string;     // REDACTED
  }>;

  warnings: string[];

  privacy: {
    privateContentPrinted: boolean;
    dbPathRedacted: boolean;
    rowContentLogged: boolean;
  };
}

// ── 验证 ──

/** 单个合约验证问题的严重程度 */
export type ScriptContractIssueSeverity = 'error' | 'warning';

/** 单个合约验证问题 */
export interface ScriptContractValidationIssue {
  /** 严重程度 */
  severity: ScriptContractIssueSeverity;
  /** 机器可读规则 ID */
  rule: string;
  /** 人类可读描述 */
  message: string;
  /** 缺失 / 不正确的字段 */
  fields: string[];
}

/** 合约验证的整体结果 */
export interface ScriptContractValidationResult {
  /** 合约是否被允许继续执行 */
  allowed: boolean;
  /** 错误 & 警告 */
  issues: ScriptContractValidationIssue[];
  /** 仅错误 (severity=error) */
  errors: ScriptContractValidationIssue[];
  /** 仅警告 (severity=warning) */
  warnings: ScriptContractValidationIssue[];
}
