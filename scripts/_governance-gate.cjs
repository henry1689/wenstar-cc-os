// ============================================================
// SCRIPT-GOV-A2c — Governance Gate Bridge (CommonJS)
// ============================================================
//
// 这是一个临时的 CJS 桥接层，仅用于 3 个 pilot 脚本。
//
// 这不是：
//   - 全局包装器
//   - 共享 CLI 框架
//   - validateScriptExecutionContract 的副本
//   - 永久解决方案
//
// TS→CJS 编译通道建立后，此文件将被替换为直接从 A2b 导入。
// 在此之前，每个 pilot 脚本内联其自己的合约构建 + 验证调用；
// validateGate 函数仅提供规则，不提供 CLI 解析或 I/O。
//
// 规则源自：
//   SCRIPT-GOV-A2a (SCRIPT-EXECUTION-CONTRACT.md)
//   SCRIPT-GOV-A2b (src/governance/scripts/validate.ts)
//
// 不允许添加到其他脚本。不允许扩展为共享库。
// ============================================================

/**
 * 验证脚本执行合约。纯函数。DENY-BY-DEFAULT。
 *
 * @param {object} c — 合约对象
 * @param {string} c.scriptId
 * @param {string} c.riskLevel — 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * @param {string} c.operationType — 'backfill' | 'clean' | 'delete' | 'migrate' | 'update' | 'sync' | 'other'
 * @param {string} c.mode — 'dry-run' | 'apply'
 * @param {string} c.environment — 'local' | 'dev' | 'test' | 'staging' | 'production'
 * @param {object} c.operator — { operatorId, reason, ticket }
 * @param {object} c.scope — { selector, limit, batchSize, since, until }
 * @param {object} c.backup — { required, created, backupId, backupPath, verified }
 * @param {object} c.confirmation — { required, provided, tokenDigest }
 * @param {boolean} c.irreversibleConfirmation
 * @param {string} [c.worldSegment]  — WORLD-SEGMENT-C1: 可选, pass-through 至审计 (core/personal/project/simulation/archive/unknown). 不参与 allow/deny 决策.
 * @param {string} [c.world_segment] — 别名, 与 worldSegment 等价. 由 WORLD-SEGMENT-B 审计层规范化.
 * @returns {{ allowed: boolean, errors: Array<{rule:string,message:string}>, warnings: Array<{rule:string,message:string}> }}
 */
function validateGate(c) {
  const errors = [];
  const warnings = [];

  const error = (rule, msg) => errors.push({ rule, message: msg });
  const warn = (rule, msg) => warnings.push({ rule, message: msg });

  const isApplying = c.mode === 'apply';
  const isProduction = c.environment === 'production';
  const isDestructive = ['delete', 'clean', 'migrate', 'backfill'].includes(c.operationType);
  const hasBoundedScope = c.scope && (
    c.scope.selector || (c.scope.limit > 0) || (c.scope.batchSize > 0) ||
    c.scope.since || c.scope.until
  );
  const isHighOrCritical = c.riskLevel === 'HIGH' || c.riskLevel === 'CRITICAL';

  // R001-R003: CRITICAL + apply → need confirmation
  if (c.riskLevel === 'CRITICAL' && isApplying) {
    if (!c.confirmation || !c.confirmation.required)
      error('R001', 'CRITICAL apply requires confirmation.required=true');
    if (!c.confirmation || !c.confirmation.provided)
      error('R002', 'CRITICAL apply requires confirmation.provided=true');
    if (!c.confirmation || !c.confirmation.tokenDigest)
      error('R003', 'CRITICAL apply requires confirmation.tokenDigest');
  }

  // R004-R007: production + apply → operator metadata
  if (isProduction && isApplying) {
    if (!c.operator || !c.operator.operatorId || c.operator.operatorId === 'unknown')
      error('R004', 'production apply requires operator.operatorId');
    if (!c.operator || !c.operator.reason || c.operator.reason.trim().length === 0)
      error('R005', 'production apply requires operator.reason');
    if (!c.operator || !c.operator.ticket)
      error('R006', 'production apply requires operator.ticket');
  }

  // R008-R010: destructive + apply → backup
  if (isDestructive && isApplying) {
    if (!c.backup || !c.backup.required)
      error('R008', `destructive ${c.operationType} apply requires backup.required=true`);
    if (!c.backup || !c.backup.created)
      error('R009', `destructive ${c.operationType} apply requires backup.created=true`);
    if (!c.backup || (!c.backup.backupId && !c.backup.backupPath))
      error('R010', `destructive ${c.operationType} apply requires backup.backupId or backup.backupPath`);
    if (!c.irreversibleConfirmation)
      error('R013', `destructive ${c.operationType} apply requires irreversibleConfirmation=true`);
  }

  // R011: HIGH/CRITICAL + apply → bounded scope
  if (isHighOrCritical && isApplying) {
    if (!hasBoundedScope)
      error('R011', `${c.riskLevel} apply requires bounded scope (selector, limit, batchSize, since, or until)`);
  }

  // R012: production → scope selector
  if (isProduction) {
    if (!c.scope || !c.scope.selector)
      error('R012', 'production requires scope.selector');
  }

  // W001: HIGH/CRITICAL without reportPath
  if (isHighOrCritical && !c.reportPath)
    warn('W001', `${c.riskLevel} script: reportPath recommended for evidence tracking`);

  return { allowed: errors.length === 0, errors, warnings };
}

// SCRIPT-GOV-B: audit evidence chain re-export
// WORLD-SEGMENT-C1: contract.worldSegment / contract.world_segment 字段
//   不参与 allow/deny 决策 — 仅 pass-through 至审计层.
//   审计端 (WORLD-SEGMENT-B) 负责规范化 (trim/lowercase/invalid→unknown).
//   调用方在合约中包含 worldSegment 即可启用; 不包含则审计默认为 'unknown'.
var _audit = require('./_governance-audit.cjs');

module.exports = {
  validateGate: validateGate,
  recordGovernanceDecision: _audit.recordGovernanceDecision,
  recordAuditEvent: _audit.recordAuditEvent,
  createAuditEvent: _audit.createAuditEvent,
  createAuthContext: _audit.createAuthContext,
  getAuditLogPath: _audit.getAuditLogPath,
  isAuditDisabled: _audit.isAuditDisabled
};
