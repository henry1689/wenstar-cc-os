// ============================================================
// SCRIPT-GOV-A2c-smoke — Pilot Script Refusal Smoke Tests
// ============================================================
// 验证 A2c 治理门控在 3 个 pilot 脚本中的拒绝行为。
//
// 策略:
//   - validateGate 纯函数测试 (通过 createRequire 加载 CJS gate)
//   - --help 冒烟测试 (spawnSync, 无需 DB)
//   - 全量脚本拒绝测试被记录为限制
//     (所有 3 个脚本在门控检查之前都需要真实的 DB 文件)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRequire = createRequire(import.meta.url);
const { validateGate } = repoRequire('../_governance-gate.cjs') as {
  validateGate: (c: Record<string, unknown>) => {
    allowed: boolean;
    errors: Array<{ rule: string; message: string }>;
    warnings: Array<{ rule: string; message: string }>;
  };
};

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function runNode(scriptPath: string, args: string[] = []) {
  return spawnSync('node', [path.join(REPO_ROOT, scriptPath), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

// ── 每个 pilot 的最小合法 Apply 合约 ──

function baseValidApply(): Record<string, unknown> {
  return {
    scriptId: 'test-pilot',
    riskLevel: 'CRITICAL',
    operationType: 'backfill',
    mode: 'apply',
    environment: 'local',
    operator: { operatorId: 'TXS-000000001', reason: '测试拒绝行为', ticket: 'TKT-TEST-001' },
    scope: { selector: 'table:test', limit: 100, batchSize: 10, since: null, until: null },
    confirmation: { required: true, provided: true, tokenDigest: 'abc123' },
    backup: { required: true, created: true, backupId: 'bak_test_001', backupPath: 'bak_test_001', verified: true },
    irreversibleConfirmation: true,
    reportPath: null,
  };
}

// ============================================================
// 1. safe-backfill gate (CRITICAL, backfill)
// ============================================================

describe('[A2c-smoke] safe-backfill gate (CRITICAL, backfill)', () => {
  it('S1: --apply 无 operator 无 scope → 拒绝 (R001-R003, R011)', () => {
    const c = baseValidApply();
    c.scriptId = 'safe-backfill';
    c.operationType = 'backfill';
    c.operator = { operatorId: '', reason: '', ticket: null };
    c.confirmation = { required: false, provided: false, tokenDigest: null };
    c.backup = { required: false, created: false, backupId: null, backupPath: null, verified: false };
    c.scope = { selector: null, limit: 0, batchSize: 0, since: null, until: null };
    c.irreversibleConfirmation = false;
    const r = validateGate(c);
    expect(r.allowed).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
    expect(r.errors.some((e) => e.rule === 'R001')).toBe(true);
    expect(r.errors.some((e) => e.rule === 'R002')).toBe(true);
    expect(r.errors.some((e) => e.rule === 'R011')).toBe(true);
  });

  it('S2: 完整合约 → ALLOW', () => {
    const c = baseValidApply();
    c.scriptId = 'safe-backfill';
    c.operationType = 'backfill';
    const r = validateGate(c);
    expect(r.allowed).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

// ============================================================
// 2. clean-familygraph-nodes gate (CRITICAL, clean)
// ============================================================

describe('[A2c-smoke] clean-familygraph-nodes gate (CRITICAL, clean)', () => {
  it('C1: clean --apply 无 backup → 拒绝 (R008-R010, R013)', () => {
    const c = baseValidApply();
    c.scriptId = 'clean-familygraph-nodes';
    c.operationType = 'clean';
    c.backup = { required: false, created: false, backupId: null, backupPath: null, verified: false };
    c.irreversibleConfirmation = false;
    const r = validateGate(c);
    expect(r.allowed).toBe(false);
    expect(r.errors.some((e) => e.rule === 'R008')).toBe(true);
    expect(r.errors.some((e) => e.rule === 'R009')).toBe(true);
    expect(r.errors.some((e) => e.rule === 'R010')).toBe(true);
    expect(r.errors.some((e) => e.rule === 'R013')).toBe(true);
  });

  it('C2: clean --apply 无 operator → 拒绝 (R001-R003)', () => {
    const c = baseValidApply();
    c.scriptId = 'clean-familygraph-nodes';
    c.operationType = 'clean';
    c.operator = { operatorId: '', reason: '', ticket: null };
    c.confirmation = { required: false, provided: false, tokenDigest: null };
    c.scope = { selector: null, limit: 0, batchSize: 0, since: null, until: null };
    const r = validateGate(c);
    expect(r.allowed).toBe(false);
    expect(r.errors.some((e) => e.rule === 'R001')).toBe(true);
  });

  it('C3: clean dry-run → ALLOW (门控不拒绝 dry-run)', () => {
    const c = baseValidApply();
    c.scriptId = 'clean-familygraph-nodes';
    c.operationType = 'clean';
    c.mode = 'dry-run';
    c.confirmation = { required: false, provided: false, tokenDigest: null };
    c.backup = { required: true, created: false, backupId: null, backupPath: null, verified: false };
    c.irreversibleConfirmation = false;
    const r = validateGate(c);
    expect(r.allowed).toBe(true);
  });
});

// ============================================================
// 3. fix-family-graph gate (CRITICAL, update)
// ============================================================

describe('[A2c-smoke] fix-family-graph gate (CRITICAL, update)', () => {
  it('F1: update --apply 无界范围 → 拒绝 (R011)', () => {
    const c = baseValidApply();
    c.scriptId = 'fix-family-graph';
    c.operationType = 'update';
    c.scope = { selector: null, limit: 0, batchSize: 0, since: null, until: null };
    const r = validateGate(c);
    expect(r.allowed).toBe(false);
    expect(r.errors.some((e) => e.rule === 'R011')).toBe(true);
  });

  it('F2: update --apply 有 selector → ALLOW', () => {
    const c = baseValidApply();
    c.scriptId = 'fix-family-graph';
    c.operationType = 'update';
    c.scope = { selector: 'table:nodes,edges', limit: 0, batchSize: 0, since: null, until: null };
    const r = validateGate(c);
    expect(r.allowed).toBe(true);
  });

  it('F3: update dry-run 无 reportPath → 警告但不拒绝', () => {
    const c = baseValidApply();
    c.scriptId = 'fix-family-graph';
    c.operationType = 'update';
    c.mode = 'dry-run';
    c.confirmation = { required: false, provided: false, tokenDigest: null };
    c.backup = { required: true, created: false, backupId: null, backupPath: null, verified: false };
    c.irreversibleConfirmation = false;
    c.reportPath = null;
    const r = validateGate(c);
    expect(r.allowed).toBe(true);
    expect(r.warnings.some((w) => w.rule === 'W001')).toBe(true);
  });
});

// ============================================================
// 4. 跨 pilot 通用拒绝
// ============================================================

describe('[A2c-smoke] 跨 pilot 通用拒绝', () => {
  it('X1: CRITICAL apply + 无 confirmation.tokenDigest → 拒绝 (R003)', () => {
    for (const id of ['safe-backfill', 'clean-familygraph-nodes', 'fix-family-graph']) {
      const c = baseValidApply();
      c.scriptId = id;
      c.confirmation = { required: true, provided: true, tokenDigest: null };
      const r = validateGate(c);
      expect(r.allowed).toBe(false, `${id}: 应该拒绝`);
      expect(r.errors.some((e) => e.rule === 'R003')).toBe(true);
    }
  });

  it('X2: CRITICAL dry-run + 最小合约 → 全部 ALLOW', () => {
    const ops: Array<[string, string]> = [
      ['safe-backfill', 'backfill'],
      ['clean-familygraph-nodes', 'clean'],
      ['fix-family-graph', 'update'],
    ];
    for (const [id, op] of ops) {
      const c = baseValidApply();
      c.scriptId = id;
      c.operationType = op;
      c.mode = 'dry-run';
      c.confirmation = { required: false, provided: false, tokenDigest: null };
      c.backup = { required: false, created: false, backupId: null, backupPath: null, verified: false };
      c.irreversibleConfirmation = false;
      const r = validateGate(c);
      expect(r.allowed).toBe(true, `${id}: dry-run 应该 ALLOW`);
    }
  });

  it('X3: LOW 脚本 + apply → 无严格规则', () => {
    const c = baseValidApply();
    c.riskLevel = 'LOW';
    c.operationType = 'other';
    c.scope = { selector: null, limit: 0, batchSize: 0, since: null, until: null };
    c.confirmation = { required: false, provided: false, tokenDigest: null };
    c.backup = { required: false, created: false, backupId: null, backupPath: null, verified: false };
    c.irreversibleConfirmation = false;
    const r = validateGate(c);
    expect(r.allowed).toBe(true);
  });
});

// ============================================================
// 5. 🔴 真实脚本级拒绝测试 (spawnSync, 预检门控在 DB 之前)
//    证明: --apply 无元数据 → exit 2 + SCRIPT EXECUTION CONTRACT DENIED
//    无需任何真实 DB 文件。
// ============================================================

describe('[A2c-smoke] 真实脚本级拒绝 (无 DB 依赖)', () => {
  it('R1: safe-backfill --apply (缺所有元数据) → exit 2 + 拒绝横幅', () => {
    const r = runNode('scripts/safe-backfill.cjs', ['--apply']);
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
    expect(r.stderr + r.stdout).toContain('safe-backfill');
  });

  it('R2: clean-familygraph-nodes --apply (缺所有元数据) → exit 2 + 拒绝横幅', () => {
    const r = runNode('scripts/clean-familygraph-nodes.cjs', ['--apply']);
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
    expect(r.stderr + r.stdout).toContain('clean-familygraph-nodes');
  });

  it('R3: fix-family-graph --apply (缺所有元数据) → exit 2 + 拒绝横幅', () => {
    const r = runNode('scripts/fix-family-graph.cjs', ['--apply']);
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
    expect(r.stderr + r.stdout).toContain('fix-family-graph');
  });

  it('R4: safe-backfill --apply 含部分参数 → exit 2 (仍缺必填字段)', () => {
    const r = runNode('scripts/safe-backfill.cjs', ['--apply', '--operator', 'TXS-000000001']);
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });

  it('R5: clean-familygraph-nodes --apply 含 operator+reason → exit 2 (仍缺 ticket+scope)', () => {
    const r = runNode('scripts/clean-familygraph-nodes.cjs', ['--apply', '--operator', 'TXS-000000001', '--reason', 'test']);
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });

  it('R6: fix-family-graph --apply 含 operator+reason+ticket → exit 2 (仍缺 scope)', () => {
    const r = runNode('scripts/fix-family-graph.cjs', ['--apply', '--operator', 'TXS-000000001', '--reason', 'test', '--ticket', 'TKT-001']);
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });
});

// ============================================================
// 6. --help 冒烟测试 (spawnSync, 无需 DB)
// ============================================================

describe('[A2c-smoke] --help 冒烟测试', () => {
  it('H1: safe-backfill --help → exit 0 + 包含 Usage', () => {
    const r = runNode('scripts/safe-backfill.cjs', ['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage');
  });

  it('H2: clean-familygraph-nodes --help → exit 0 + 包含 Usage', () => {
    const r = runNode('scripts/clean-familygraph-nodes.cjs', ['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage');
  });

  it('H3: fix-family-graph --help → exit 0 + 包含 Usage', () => {
    const r = runNode('scripts/fix-family-graph.cjs', ['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage');
  });
});

// ============================================================
// 7. 已知限制: dry-run 成功 + 写入成功测试仍需真实 DB
// ============================================================

describe('[A2c-smoke] 已知限制 (需 DB)', () => {
  it('L1: 默认 dry-run 需要 DB 进行扫描', () => {
    // 所有 3 个 pilot 在 dry-run 模式下仍需 DB 连接来扫描行。
    // 预检门控仅在 apply 模式下激活 (不阻塞 dry-run)。
    // 限制: dry-run 成功测试需要真实的 DB 文件。
  });

  it('L2: --apply 完整有效元数据 需要 DB 进行写入', () => {
    // 全量写入路径测试需要 DB + 备份 + 合约门控通过。
    // 限制: 全量端到端测试需要真实的 DB 文件。
  });
});
