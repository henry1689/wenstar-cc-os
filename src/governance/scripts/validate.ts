// ============================================================
// SCRIPT-GOV-A2b — validateScriptExecutionContract
// ============================================================
// 纯函数。零副作用。不访问 DB、文件系统或网络。
//
// 实现 SCRIPT-GOV-A2a 中定义的风险级语义：
//   §5.1 - CRITICAL 脚本 → 需要确认
//   §5.2 - HIGH 脚本 → 需要有界范围
//   §5.4 - production 环境 → 需要操作者元数据
//   §6   - 破坏性操作 → 需要备份
// ============================================================

import type {
  ScriptExecutionContract,
  ScriptContractValidationIssue,
  ScriptContractValidationResult,
  ScriptContractIssueSeverity,
} from './types.js';

// ── 辅助函数 ──

/** 是否为破坏性操作 (DELETE, DROP, cleanup, patch) */
function isDestructive(contract: ScriptExecutionContract): boolean {
  return (
    contract.operationType === 'delete' ||
    contract.operationType === 'clean' ||
    contract.operationType === 'migrate' ||
    contract.operationType === 'backfill'
  );
}

/** 是否应用了写入 (非空运行) */
function isApplying(contract: ScriptExecutionContract): boolean {
  return contract.mode === 'apply';
}

/** 是否为生产环境 */
function isProduction(contract: ScriptExecutionContract): boolean {
  return contract.environment === 'production';
}

/** 合约是否具有有界范围 */
function hasBoundedScope(contract: ScriptExecutionContract): boolean {
  return (
    contract.scope.selector !== null ||
    contract.scope.limit > 0 ||
    contract.scope.batchSize > 0 ||
    contract.scope.since !== null ||
    contract.scope.until !== null
  );
}

// ── 主验证函数 ──

/**
 * 根据 SCRIPT-EXECUTION-CONTRACT.md 验证脚本执行合约。
 *
 * 纯函数。fail-closed：任何 severity=error 的问题
 * 都会导致 result.allowed = false。
 *
 * @param contract — 要验证的 ScriptExecutionContract
 * @returns ScriptContractValidationResult，包含 allowed、issues、errors、warnings
 */
export function validateScriptExecutionContract(
  contract: ScriptExecutionContract,
): ScriptContractValidationResult {
  const issues: ScriptContractValidationIssue[] = [];

  const issue = (
    severity: ScriptContractIssueSeverity,
    rule: string,
    message: string,
    fields: string[],
  ) => {
    issues.push({ severity, rule, message, fields });
  };

  const error = (rule: string, message: string, fields: string[]) =>
    issue('error', rule, message, fields);

  const warn = (rule: string, message: string, fields: string[]) =>
    issue('warning', rule, message, fields);

  // ═══════════════════════════════════════════
  // 规则 1: CRITICAL + apply → 需要确认
  // ═══════════════════════════════════════════

  if (contract.riskLevel === 'CRITICAL' && isApplying(contract)) {
    if (!contract.confirmation.required) {
      error(
        'R001',
        'CRITICAL 脚本在 apply 模式下必须将 confirmation.required 设为 true',
        ['confirmation.required'],
      );
    }
    if (!contract.confirmation.provided) {
      error(
        'R002',
        'CRITICAL 脚本在 apply 模式下必须将 confirmation.provided 设为 true',
        ['confirmation.provided'],
      );
    }
    if (!contract.confirmation.tokenDigest) {
      error(
        'R003',
        'CRITICAL 脚本在 apply 模式下必须提供 confirmation.tokenDigest',
        ['confirmation.tokenDigest'],
      );
    }
  }

  // ═══════════════════════════════════════════
  // 规则 2: production + apply → 操作者元数据
  // ═══════════════════════════════════════════

  if (isProduction(contract) && isApplying(contract)) {
    if (!contract.operator.operatorId || contract.operator.operatorId === 'unknown') {
      error(
        'R004',
        'production 环境 + apply 模式需要 operator.operatorId (非空, 非 unknown)',
        ['operator.operatorId'],
      );
    }
    if (!contract.operator.reason || contract.operator.reason.trim().length === 0) {
      error(
        'R005',
        'production 环境 + apply 模式需要 operator.reason (非空)',
        ['operator.reason'],
      );
    }
    if (!contract.operator.ticket) {
      error(
        'R006',
        'production 环境 + apply 模式需要 operator.ticket (变更工单)',
        ['operator.ticket'],
      );
    }
    if (!contract.reportPath) {
      error(
        'R007',
        'production 环境 + apply 模式需要 reportPath',
        ['reportPath'],
      );
    }
  }

  // ═══════════════════════════════════════════
  // 规则 3: 破坏性操作 + apply → 备份
  // ═══════════════════════════════════════════

  if (isDestructive(contract) && isApplying(contract)) {
    if (!contract.backup.required) {
      error(
        'R008',
        `破坏性操作 (${contract.operationType}) + apply 模式需要 backup.required = true`,
        ['backup.required'],
      );
    }
    if (!contract.backup.created) {
      error(
        'R009',
        `破坏性操作 (${contract.operationType}) + apply 模式需要 backup.created = true`,
        ['backup.created'],
      );
    }
    if (!contract.backup.backupId && !contract.backup.backupPath) {
      error(
        'R010',
        `破坏性操作 (${contract.operationType}) + apply 模式需要 backup.backupId 或 backup.backupPath`,
        ['backup.backupId', 'backup.backupPath'],
      );
    }
  }

  // ═══════════════════════════════════════════
  // 规则 4: HIGH 或 CRITICAL + apply → 有界范围
  // ═══════════════════════════════════════════

  if (
    (contract.riskLevel === 'HIGH' || contract.riskLevel === 'CRITICAL') &&
    isApplying(contract)
  ) {
    if (!hasBoundedScope(contract)) {
      error(
        'R011',
        `${contract.riskLevel} 风险脚本 + apply 模式需要有界范围 (scope.selector、limit、batchSize、since 或 until)`,
        ['scope.selector', 'scope.limit', 'scope.batchSize', 'scope.since', 'scope.until'],
      );
    }
  }

  // ═══════════════════════════════════════════
  // 规则 5: 生产环境 → 范围必填
  // ═══════════════════════════════════════════

  if (isProduction(contract)) {
    if (!contract.scope.selector) {
      error(
        'R012',
        'production 环境需要 scope.selector (无界生产环境执行被阻止)',
        ['scope.selector'],
      );
    }
  }

  // ═══════════════════════════════════════════
  // 规则 6: 不可逆 + apply → 需显式确认
  // ═══════════════════════════════════════════

  if (isDestructive(contract) && isApplying(contract)) {
    if (!contract.irreversibleConfirmation) {
      error(
        'R013',
        `破坏性操作 (${contract.operationType}) + apply 模式需要 irreversibleConfirmation = true`,
        ['irreversibleConfirmation'],
      );
    }
  }

  // ═══════════════════════════════════════════
  // 警告 (不阻塞): 无 reportPath
  // ═══════════════════════════════════════════

  if (
    (contract.riskLevel === 'HIGH' || contract.riskLevel === 'CRITICAL') &&
    !contract.reportPath
  ) {
    warn(
      'W001',
      `${contract.riskLevel} 风险脚本建议提供 reportPath 用于证据追踪`,
      ['reportPath'],
    );
  }

  // ═══════════════════════════════════════════
  // 警告 (不阻塞): 无审计钩子
  // ═══════════════════════════════════════════

  if (
    (contract.riskLevel === 'HIGH' || contract.riskLevel === 'CRITICAL') &&
    contract.auditHooksFired.length === 0
  ) {
    warn(
      'W002',
      `${contract.riskLevel} 风险脚本建议触发审计钩子 (auditHooksFired)`,
      ['auditHooksFired'],
    );
  }

  // ═══════════════════════════════════════════
  // 组装结果
  // ═══════════════════════════════════════════

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const allowed = errors.length === 0;

  return { allowed, issues, errors, warnings };
}
