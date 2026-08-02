// ============================================================
// SCRIPT-GOV-A2b — 合约验证器单元测试
// 所有测试使用合成数据。不访问 DB 或文件系统。
// ============================================================

import { describe, it, expect } from 'vitest';
import { validateScriptExecutionContract } from '../validate.js';
import type { ScriptExecutionContract } from '../types.js';

// ── 工厂函数 ──

const OPERATOR_ID = 'TXS-000000001';

/** 创建一个最小合法 LOW-risk dry-run 合约 */
function lowDryRun(overrides: Partial<ScriptExecutionContract> = {}): ScriptExecutionContract {
  return {
    contractVersion: 'script.contract.v1',
    scriptId: 'test-low-read',
    scriptName: '测试 LOW 只读脚本',
    riskLevel: 'LOW',
    operationType: 'other',
    mode: 'dry-run',
    environment: 'local',
    operator: { operatorId: OPERATOR_ID, reason: '测试', ticket: null },
    scope: { selector: null, limit: 0, batchSize: 0, since: null, until: null, offset: 0 },
    confirmation: { required: false, provided: false, tokenDigest: null },
    backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
    auditHooksFired: [],
    auditEventIds: [],
    reportPath: null,
    irreversibleConfirmation: false,
    schemaPreflightPassed: true,
    ...overrides,
  };
}

/** 创建一个完整的 CRITICAL + delete + production apply 合约 */
function criticalDeleteApply(overrides: Partial<ScriptExecutionContract> = {}): ScriptExecutionContract {
  return {
    contractVersion: 'script.contract.v1',
    scriptId: 'clean-familygraph-nodes',
    scriptName: 'FamilyGraph 全局脏节点清洗',
    riskLevel: 'CRITICAL',
    operationType: 'delete',
    mode: 'apply',
    environment: 'production',
    operator: { operatorId: OPERATOR_ID, reason: '清理重复节点', ticket: 'TKT-001' },
    scope: { selector: 'table:nodes', limit: 100, batchSize: 10, since: null, until: null, offset: 0 },
    confirmation: { required: true, provided: true, tokenDigest: 'abc123def4567890' },
    backup: { required: true, created: true, backupId: 'bak_001', backupPath: null, backupSizeBytes: 1024, verified: true },
    auditHooksFired: ['ScriptExecutionRequested', 'ScriptWritePlanned', 'ScriptWriteApplied'],
    auditEventIds: ['audit_001', 'audit_002'],
    reportPath: './evidence-report.json',
    irreversibleConfirmation: true,
    schemaPreflightPassed: true,
    ...overrides,
  };
}

// ============================================================
// T1: LOW dry-run — 始终允许
// ============================================================

describe('[SCRIPT-GOV-A2b] LOW dry-run', () => {
  it('T1.1: LOW + dry-run + 最小合约 → 允许, 零问题', () => {
    const result = validateScriptExecutionContract(lowDryRun());
    expect(result.allowed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('T1.2: LOW + dry-run (无 operator) → 仍然允许', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({ operator: { operatorId: '', reason: '', ticket: null } }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// T2: HIGH dry-run 警告
// ============================================================

describe('[SCRIPT-GOV-A2b] HIGH dry-run 警告', () => {
  it('T2.1: HIGH + dry-run + 有 reportPath + auditHooks → 允许, 无警告', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'HIGH',
        reportPath: './report.json',
        auditHooksFired: ['ScriptExecutionRequested'],
      }),
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('T2.2: HIGH + dry-run + 无 reportPath → 允许但有警告', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({ riskLevel: 'HIGH', reportPath: null }),
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings.some((w) => w.rule === 'W001')).toBe(true);
  });
});

// ============================================================
// T3: HIGH apply 无界范围 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] HIGH apply 范围检查', () => {
  it('T3.1: HIGH + apply + 无界范围 → 拒绝 (R011)', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'HIGH',
        mode: 'apply',
        scope: { selector: null, limit: 0, batchSize: 0, since: null, until: null, offset: 0 },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R011')).toBe(true);
  });

  it('T3.2: HIGH + apply + selector 限定了范围 → 允许', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'HIGH',
        mode: 'apply',
        reportPath: './report.json',
        scope: { selector: 'table:memories', limit: 0, batchSize: 0, since: null, until: null, offset: 0 },
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it('T3.3: HIGH + apply + limit > 0 → 允许', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'HIGH',
        mode: 'apply',
        reportPath: './report.json',
        scope: { selector: null, limit: 500, batchSize: 0, since: null, until: null, offset: 0 },
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it('T3.4: HIGH + apply + since 设置了范围 → 允许', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'HIGH',
        mode: 'apply',
        reportPath: './report.json',
        scope: { selector: null, limit: 0, batchSize: 0, since: '2026-01-01T00:00:00Z', until: null, offset: 0 },
      }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// T4: CRITICAL apply 无确认 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] CRITICAL apply 确认规则', () => {
  it('T4.1: CRITICAL + apply + confirmation.required=false → 拒绝 (R001)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        confirmation: { required: false, provided: true, tokenDigest: 'abc123def4567890' },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R001')).toBe(true);
  });

  it('T4.2: CRITICAL + apply + confirmation.provided=false → 拒绝 (R002)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        confirmation: { required: true, provided: false, tokenDigest: 'abc123def4567890' },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R002')).toBe(true);
  });

  it('T4.3: CRITICAL + apply + 无 tokenDigest → 拒绝 (R003)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        confirmation: { required: true, provided: true, tokenDigest: null },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R003')).toBe(true);
  });

  it('T4.4: CRITICAL + apply + 完整确认 → 允许', () => {
    const result = validateScriptExecutionContract(criticalDeleteApply());
    expect(result.allowed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================
// T5: CRITICAL apply + delete 无备份 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] 破坏性操作备份规则', () => {
  it('T5.1: delete + apply + backup.required=false → 拒绝 (R008)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        backup: { required: false, created: true, backupId: 'bak_001', backupPath: null, backupSizeBytes: 1024, verified: true },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R008')).toBe(true);
  });

  it('T5.2: delete + apply + backup.created=false → 拒绝 (R009)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        backup: { required: true, created: false, backupId: 'bak_001', backupPath: null, backupSizeBytes: 1024, verified: false },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R009')).toBe(true);
  });

  it('T5.3: delete + apply + 无 backupId 且无 backupPath → 拒绝 (R010)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        backup: { required: true, created: true, backupId: null, backupPath: null, backupSizeBytes: 1024, verified: true },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R010')).toBe(true);
  });

  it('T5.4: delete + apply + irreversibleConfirmation=false → 拒绝 (R013)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({ irreversibleConfirmation: false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R013')).toBe(true);
  });
});

// ============================================================
// T6: production apply 无操作者元数据 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] production apply 元数据规则', () => {
  it('T6.1: production + apply + 无 operatorId → 拒绝 (R004)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operator: { operatorId: '', reason: '清理', ticket: 'TKT-001' },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R004')).toBe(true);
  });

  it('T6.2: production + apply + 无 reason → 拒绝 (R005)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operator: { operatorId: OPERATOR_ID, reason: '', ticket: 'TKT-001' },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R005')).toBe(true);
  });

  it('T6.3: production + apply + 无 ticket → 拒绝 (R006)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operator: { operatorId: OPERATOR_ID, reason: '清理重复数据', ticket: null },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R006')).toBe(true);
  });

  it('T6.4: production + apply + 无 reportPath → 拒绝 (R007)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({ reportPath: null }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R007')).toBe(true);
  });

  it('T6.5: production + apply + 无 scope.selector → 拒绝 (R012)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        scope: { selector: null, limit: 100, batchSize: 10, since: null, until: null, offset: 0 },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R012')).toBe(true);
  });
});

// ============================================================
// T7: migration apply 无备份 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] migration apply 备份规则', () => {
  it('T7.1: migrate + apply + backup.required=false → 拒绝 (R008)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'migrate',
        backup: { required: false, created: true, backupId: 'bak_mig', backupPath: null, backupSizeBytes: 2048, verified: true },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R008')).toBe(true);
  });

  it('T7.2: migrate + apply + 完整备份 → 允许', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'migrate',
        backup: { required: true, created: true, backupId: 'bak_mig', backupPath: null, backupSizeBytes: 2048, verified: true },
      }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// T8: backfill apply 无备份 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] backfill apply 备份规则', () => {
  it('T8.1: backfill + apply + backup.created=false → 拒绝 (R009)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'backfill',
        backup: { required: true, created: false, backupId: 'bak_bf', backupPath: null, backupSizeBytes: null, verified: false },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R009')).toBe(true);
  });

  it('T8.2: backfill + apply + 完整备份 → 允许', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'backfill',
        backup: { required: true, created: true, backupId: 'bak_bf', backupPath: null, backupSizeBytes: 2048, verified: true },
      }),
    );
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// T9: clean apply 无备份 → 拒绝
// ============================================================

describe('[SCRIPT-GOV-A2b] clean apply 备份规则', () => {
  it('T9.1: clean + apply + 无 backupId → 拒绝 (R010)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'clean',
        backup: { required: true, created: true, backupId: null, backupPath: null, backupSizeBytes: 1024, verified: true },
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.rule === 'R010')).toBe(true);
  });

  it('T9.2: clean + dry-run (非 apply) → 允许 (不对非 apply 操作强制执行备份)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'clean',
        mode: 'dry-run',
        backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
        confirmation: { required: false, provided: false, tokenDigest: null },
        irreversibleConfirmation: false,
      }),
    );
    // 仍会因 production env 被拒绝 (R012: 需要 scope.selector; R004-R007: 需要 operator 元数据)
    // 但不会因备份规则被拒绝
    const backupErrors = result.errors.filter((e) =>
      ['R008', 'R009', 'R010', 'R013'].includes(e.rule),
    );
    expect(backupErrors).toHaveLength(0);
  });
});

// ============================================================
// T10: 单个错误 → allowed=false
// ============================================================

describe('[SCRIPT-GOV-A2b] fail-closed 语义', () => {
  it('T10.1: 任何 error 都会导致 allowed=false', () => {
    // 创建一个只缺少一个字段的合约
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        confirmation: { required: false, provided: true, tokenDigest: 'abc123def4567890' },
      }),
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.allowed).toBe(false);
  });

  it('T10.2: 仅有 warning 但无 error → allowed=true', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({ riskLevel: 'HIGH' }),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.allowed).toBe(true);
  });

  it('T10.3: 多个 error 全部收集 (非短路)', () => {
    // 缺少 confirmation.required, confirmation.provided, tokenDigest, backup.* (×3)
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        mode: 'apply',
        confirmation: { required: false, provided: false, tokenDigest: null },
        backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
        irreversibleConfirmation: false,
      }),
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(6);
    expect(result.allowed).toBe(false);
  });
});

// ============================================================
// T11: CRITICAL dry-run 警告
// ============================================================

describe('[SCRIPT-GOV-A2b] CRITICAL dry-run 警告', () => {
  it('T11.1: CRITICAL + dry-run + 有 reportPath → 允许, 最小警告', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        mode: 'dry-run',
        confirmation: { required: false, provided: false, tokenDigest: null },
        backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
        irreversibleConfirmation: false,
        operator: { operatorId: '', reason: '', ticket: null },
        reportPath: './report.json',
      }),
    );
    // 仍可能因 production R012 被拒绝 (需要 scope.selector)
    // 但不应有 W001 或 W002
    const missingReportWarnings = result.warnings.filter((w) => w.rule === 'W001');
    expect(missingReportWarnings).toHaveLength(0);
  });

  it('T11.2: CRITICAL + dry-run + 无 reportPath → 允许但有 W001 警告', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        mode: 'dry-run',
        environment: 'local',
        confirmation: { required: false, provided: false, tokenDigest: null },
        backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
        irreversibleConfirmation: false,
        reportPath: null,
        scope: { selector: null, limit: 0, batchSize: 0, since: null, until: null, offset: 0 },
      }),
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings.some((w) => w.rule === 'W001')).toBe(true);
  });
});

// ============================================================
// T12: 审计钩子警告
// ============================================================

describe('[SCRIPT-GOV-A2b] 审计钩子警告', () => {
  it('T12.1: CRITICAL + 空 auditHooksFired → 警告 (W002)', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({ riskLevel: 'CRITICAL', reportPath: './report.json' }),
    );
    expect(result.warnings.some((w) => w.rule === 'W002')).toBe(true);
  });

  it('T12.2: CRITICAL + 已填充 auditHooksFired → 无 W002 警告', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'CRITICAL',
        reportPath: './report.json',
        auditHooksFired: ['ScriptExecutionRequested'],
      }),
    );
    expect(result.warnings.some((w) => w.rule === 'W002')).toBe(false);
  });
});

// ============================================================
// T13: MEDIUM apply — 无严格规则
// ============================================================

describe('[SCRIPT-GOV-A2b] MEDIUM apply 宽松规则', () => {
  it('T13.1: MEDIUM + apply + 最小合约 → 允许 (无 CRITICAL/HIGH 规则)', () => {
    const result = validateScriptExecutionContract(
      lowDryRun({
        riskLevel: 'MEDIUM',
        mode: 'apply',
        scope: { selector: null, limit: 0, batchSize: 0, since: null, until: null, offset: 0 },
      }),
    );
    // 无界范围对 MEDIUM 不是 error
    const scopeErrors = result.errors.filter((e) => e.rule === 'R011');
    expect(scopeErrors).toHaveLength(0);
  });
});

// ============================================================
// T14: 非破坏性操作 + apply — 无备份规则
// ============================================================

describe('[SCRIPT-GOV-A2b] 非破坏性操作无备份规则', () => {
  it('T14.1: update (非破坏性) + apply + 无备份 → 仍然允许 (不触发 R008-R010)', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'update',
        backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
        irreversibleConfirmation: false,
      }),
    );
    // R008-R010 是破坏性操作专属 — update 不触发
    const backupErrors = result.errors.filter((e) =>
      ['R008', 'R009', 'R010', 'R013'].includes(e.rule),
    );
    expect(backupErrors).toHaveLength(0);
  });

  it('T14.2: create (非破坏性) + apply + 无备份 → 不触发备份规则', () => {
    const result = validateScriptExecutionContract(
      criticalDeleteApply({
        operationType: 'create',
        backup: { required: false, created: false, backupId: null, backupPath: null, backupSizeBytes: null, verified: false },
        irreversibleConfirmation: false,
      }),
    );
    const backupErrors = result.errors.filter((e) =>
      ['R008', 'R009', 'R010', 'R013'].includes(e.rule),
    );
    expect(backupErrors).toHaveLength(0);
  });
});

// ============================================================
// T15: 合约版本不变
// ============================================================

describe('[SCRIPT-GOV-A2b] 合约版本', () => {
  it('T15.1: contractVersion 必须为 script.contract.v1', () => {
    const contract = lowDryRun();
    expect(contract.contractVersion).toBe('script.contract.v1');
  });
});
