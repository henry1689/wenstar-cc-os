// ============================================================
// Agent CNC Harness — cmdGuard 命令测试
// 覆盖: --files + --no-test, --test runner, Meter 注入
// ============================================================

import { describe, it, expect } from 'vitest';
import { cmdGuard, parseArgs } from '../../cli.js';
import { TestRuntime } from './helpers/cli-test-runtime.js';
import {
  setupValidFixture,
  writeValidPlan,
  meterPass,
  meterWarn,
  meterFail,
} from './helpers/fixtures.js';

// ============================================================
// cmdGuard — 基础 --files + --no-test
// ============================================================

describe('cmdGuard', () => {
  it('场景 G1: --files 低风险文件 --no-test → GATE PASS，不调用 exit', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'src/m4/__tests__/test.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('[Agent CNC] Guard');
    expect(text).toContain('GATE: PASS');
    expect(text).toContain('tsc --noEmit PASSED');
    expect(text).toContain('Report saved:');
  });

  it('场景 G2: --files 高风险文件 --no-test → 无 Plan → exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'src/webui/chat.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('HIGH RISK but no Plan found');
    expect(text).toContain('GATE: FAIL');
    expect(text).toContain('high_risk_without_plan');
  });

  it('场景 G3: --files 高风险文件 --strict --no-test → 无 Plan 仍 exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'src/webui/chat.ts', '--strict', '--no-test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('HIGH RISK but no Plan found');
  });

  it('场景 G4: --files 多文件 --no-test → 多 WF 聚合 + GATE PASS', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockMeterResults = [
      { id: 'persist-meter', title: 'SQLite 持久化检查', severity: 'S', status: 'pass', score: 100, evidence: [], warnings: [], failures: [] },
      { id: 'uuid-meter', title: 'UUID 归属检查', severity: 'S', status: 'pass', score: 100, evidence: [], warnings: [], failures: [] },
      { id: 'roleplay-isolation-meter', title: '角色扮演隔离检查', severity: 'S', status: 'pass', score: 100, evidence: [], warnings: [], failures: [] },
      { id: 'fg-meter', title: 'FamilyGraph 完整性检查', severity: 'S', status: 'pass', score: 100, evidence: [], warnings: [], failures: [] },
      { id: 'behavior-meter', title: '行为回归检查', severity: 'A', status: 'pass', score: 100, evidence: [], warnings: [], failures: [] },
    ];
    const args = parseArgs(['guard', '--files', 'src/m2/SQLiteAdapter.ts,src/app/role/RoleClassifier.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('GATE: PASS');
    expect(text).toContain('SQLite 持久化检查');
    expect(text).toContain('角色扮演隔离检查');
    expect(text).toContain('Report saved:');
  });

  it('场景 G5: --files 高风险文件 --plan <valid-plan> --no-test → Plan 被找到', async () => {
    const rootDir = setupValidFixture();
    const planPath = writeValidPlan(rootDir);
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'src/webui/chat.ts', '--plan', planPath, '--no-test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Plan found');
    expect(text).toContain('All required sections present');
    expect(text).toContain('GATE: FAIL');
  });

  it('场景 G6: --files 高风险文件 --plan <missing> --no-test → exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'src/webui/chat.ts', '--plan', '/nonexistent/plan.md', '--no-test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('HIGH RISK but no Plan found');
    expect(rt.logText()).toContain('GATE: FAIL');
  });
});

// ============================================================
// cmdGuard --test runner injection
// ============================================================

describe('cmdGuard --test runner injection', () => {
  it('场景 T1: --files 安全文件 --test + Vitest PASS → GATE PASS, 调用 runVitest', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'docs/readme.md', '--test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    expect(rt.vitestCalls).toHaveLength(1);
    expect(rt.typecheckCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('GATE: PASS');
    expect(text).toContain('✅ vitest PASSED');
  });

  it('场景 T2: --files 安全文件 --test --strict + Vitest FAIL → GATE FAIL, exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockVitestResult = {
      command: 'npx vitest run', exitCode: 1, stdout: '', stderr: '3 tests failed', durationMs: 500,
    };
    const args = parseArgs(['guard', '--files', 'docs/readme.md', '--test', '--strict']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    expect(rt.vitestCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('GATE: FAIL');
    expect(text).toContain('vitest FAILED');
  });

  it('场景 T3: --files 安全文件 --test + TypeCheck FAIL → GATE FAIL, exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockTscResult = {
      command: 'npx tsc --noEmit', exitCode: 2, stdout: '', stderr: 'error TS2304: Cannot find name', durationMs: 100,
    };
    const args = parseArgs(['guard', '--files', 'docs/readme.md', '--test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    expect(rt.typecheckCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('GATE: FAIL');
    expect(text).toContain('tsc --noEmit FAILED');
  });

  it('场景 T4: --files 高风险 --plan <valid> --test + Vitest PASS → Plan 验证通过', async () => {
    const rootDir = setupValidFixture();
    const planPath = writeValidPlan(rootDir);
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'src/webui/chat.ts', '--plan', planPath, '--test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.vitestCalls).toHaveLength(1);
    expect(rt.typecheckCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Plan found');
    expect(text).toContain('All required sections present');
    expect(text).toContain('tsc --noEmit PASSED');
    expect(text).toContain('✅ vitest PASSED');
  });

  it('场景 T5: --files 高风险 --plan <valid> --test + Vitest FAIL → GATE FAIL, exit(1)', async () => {
    const rootDir = setupValidFixture();
    const planPath = writeValidPlan(rootDir);
    const rt = new TestRuntime(rootDir);
    rt.mockVitestResult = {
      command: 'npx vitest run', exitCode: 1, stdout: '', stderr: '10 tests failed', durationMs: 800,
    };
    const args = parseArgs(['guard', '--files', 'src/webui/chat.ts', '--plan', planPath, '--test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    expect(rt.vitestCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Plan found');
    expect(text).toContain('All required sections present');
    expect(text).toContain('vitest FAILED');
    expect(text).toContain('GATE: FAIL');
  });

  it('场景 T6: --files 安全文件 --no-test → 不调用 runVitest, 仍调用 runTypeCheck', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'docs/readme.md', '--no-test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    expect(rt.vitestCalls).toHaveLength(0);
    expect(rt.typecheckCalls).toHaveLength(1);
    expect(rt.logText()).toContain('GATE: PASS');
  });
});

// ============================================================
// cmdGuard — Meter 注入
// ============================================================

describe('cmdGuard — Meter 注入', () => {
  it('场景 M1: mock meters 全 PASS → GATE PASS, 参数正确传入', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockMeterResults = [meterPass('persist-meter', 'SQLite 持久化检查')];
    const args = parseArgs(['guard', '--files', 'src/m2/SQLiteAdapter.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    expect(rt.meterCalls).toHaveLength(1);
    expect(rt.meterCalls[0].ids).toEqual(['persist-meter']);
    expect(rt.meterCalls[0].context.rootDir).toBe(rootDir);

    const text = rt.logText();
    expect(text).toContain('GATE: PASS');
    expect(text).toContain('SQLite 持久化检查');
    expect(text).toContain('Report saved:');
  });

  it('场景 M2: mock meter WARN → A 级别不影响 Gate, GATE PASS', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockMeterResults = [
      meterWarn('roleplay-isolation-meter', '角色扮演隔离检查', 'A'),
      meterPass('fg-meter', 'FG 完整性检查', 'S'),
      meterPass('behavior-meter', '行为回归检查', 'A'),
    ];
    const args = parseArgs(['guard', '--files', 'src/app/role/RoleClassifier.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('GATE: PASS');
    expect(text).toContain('warn');
  });

  it('场景 M3: mock meter S-severity FAIL → GATE FAIL, exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockMeterResults = [
      meterPass('persist-meter', 'SQLite 持久化检查'),
      meterFail('uuid-meter', 'UUID 归属检查', 'S'),
    ];
    const args = parseArgs(['guard', '--files', 'src/m2/SQLiteAdapter.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    const text = rt.logText();
    expect(text).toContain('GATE: FAIL');
    expect(text).toContain('S severity meter failed: uuid-meter');
  });

  it('场景 M4: mock meter 返回少于 required → required meter missing, exit(1)', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockMeterResults = [
      meterPass('roleplay-isolation-meter', '角色扮演隔离检查'),
      meterPass('behavior-meter', '行为回归检查', 'A'),
    ];
    const args = parseArgs(['guard', '--files', 'src/app/role/RoleClassifier.ts', '--no-test']);

    await expect(cmdGuard(args, rt)).rejects.toThrow('EXIT:1');

    expect(rt.exitCode).toBe(1);
    const text = rt.logText();
    expect(text).toContain('required meter missing');
  });

  it('场景 M5: --files 无 WF 文件 → 不调用 runMeters', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['guard', '--files', 'docs/readme.md', '--no-test']);

    await expect(cmdGuard(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    expect(rt.meterCalls).toHaveLength(0);
    expect(rt.logText()).toContain('GATE: PASS');
  });
});
