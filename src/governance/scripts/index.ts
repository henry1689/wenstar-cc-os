// ============================================================
// SCRIPT-GOV-A2b — 脚本治理合约模块 统一导出
// ============================================================

// 类型
export type {
  ScriptRiskLevel,
  ScriptExecutionMode,
  ScriptEnvironment,
  ScriptExecutionStatus,
  ScriptOperationType,
  ScriptAuditHookType,
  ScriptExecutionContract,
  ScriptEvidenceReport,
  ScriptConfirmation,
  ScriptBackup,
  ScriptOperator,
  ScriptScope,
  ScriptContractValidationResult,
  ScriptContractValidationIssue,
  ScriptContractIssueSeverity,
} from './types.js';

// 验证
export { validateScriptExecutionContract } from './validate.js';
