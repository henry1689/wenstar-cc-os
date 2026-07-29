// ============================================================
// Agent CNC Harness — command-runner.ts 单元测试
// 覆盖: runCommand (成功/失败/stdout/stderr), summary,
//        CommandResult → buildReport 兼容性
// 安全策略: 仅使用 process.execPath 执行 Node 单行无害脚本
// ============================================================

import { describe, it, expect } from 'vitest';
import { runCommand, summary } from '../command-runner.js';
import { buildReport } from '../report.js';
import { zeroDeviation } from '../types.js';
import type { CommandResult } from '../types.js';

// ---- 安全命令构造 ----

/** 构造成功命令：输出到 stdout + 零退出码 */
function okCmd(text = 'ok'): string {
  const node = JSON.stringify(process.execPath);
  return `${node} -e "console.log('${text}')"`;
}

/** 构造失败命令：输出到 stderr + 非零退出码 */
function failCmd(code = 2, msg = 'bad'): string {
  const node = JSON.stringify(process.execPath);
  return `${node} -e "console.error('${msg}'); process.exit(${code})"`;
}

/** 构造多行输出命令 */
function multiLineCmd(): string {
  const node = JSON.stringify(process.execPath);
  return `${node} -e "console.log('line1'); console.log('line2'); console.log('line3')"`;
}

// ============================================================
// runCommand — 成功命令
// ============================================================

describe('runCommand — 成功命令', () => {
  it('场景 1: node -e "console.log(\'ok\')" → exitCode=0, stdout="ok", stderr=""', () => {
    const result = runCommand(okCmd('hello'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
    expect(result.command).toContain('console.log');
  });

  it('场景 2: 多行输出 → stdout 包含所有行', () => {
    const result = runCommand(multiLineCmd());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('line1');
    expect(result.stdout).toContain('line2');
    expect(result.stdout).toContain('line3');
  });

  it('场景 2b: durationMs 为非负数字且在合理范围内', () => {
    const result = runCommand(okCmd('fast'));

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // 极快命令应在 30s 内完成
    expect(result.durationMs).toBeLessThan(30000);
  });
});

// ============================================================
// runCommand — 失败命令
// ============================================================

describe('runCommand — 失败命令', () => {
  it('场景 3: process.exit(2) → exitCode=2, 不抛异常', () => {
    // 不应 throw
    let result: CommandResult;
    expect(() => {
      result = runCommand(failCmd(2, 'something went wrong'));
    }).not.toThrow();

    result = runCommand(failCmd(2, 'something went wrong'));
    expect(result!.exitCode).toBe(2);
    expect(result!.stderr).toContain('something went wrong');
  });

  it('场景 3b: process.exit(1) → exitCode=1', () => {
    const result = runCommand(failCmd(1, 'error exit'));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('error exit');
  });

  it('场景 4: stderr 被捕获 → exitCode≠0 时 stderr 非空', () => {
    const result = runCommand(failCmd(3, 'critical failure'));

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('critical failure');
    // stdout 可能为空（错误时通常不写 stdout）
    expect(typeof result.stdout).toBe('string');
  });

  it('场景 4b: 失败命令的 durationMs 仍为非负数字', () => {
    const result = runCommand(failCmd(1, 'quick fail'));

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// summary — 纯函数
// ============================================================

describe('summary', () => {
  it('场景 6: 正常 CommandResult → stdoutSummary/stderrSummary 存在', () => {
    const cr: CommandResult = {
      command: 'test-cmd',
      exitCode: 0,
      stdout: 'all good',
      stderr: '',
      durationMs: 100,
    };

    const s = summary(cr);

    expect(s.stdoutSummary).toBe('all good');
    expect(s.stderrSummary).toBe('');
  });

  it('场景 6b: 有 stderr 的结果 → stderrSummary 包含内容', () => {
    const cr: CommandResult = {
      command: 'fail-cmd',
      exitCode: 2,
      stdout: '',
      stderr: 'error: something broke',
      durationMs: 200,
    };

    const s = summary(cr);

    expect(s.stdoutSummary).toBe('');
    expect(s.stderrSummary).toBe('error: something broke');
  });

  it('场景 7: 长输出 → maxLen 截断', () => {
    const longText = 'x'.repeat(5000);
    const cr: CommandResult = {
      command: 'long-cmd',
      exitCode: 0,
      stdout: longText,
      stderr: longText,
      durationMs: 500,
    };

    // 默认 maxLen=2000
    const s1 = summary(cr);
    expect(s1.stdoutSummary.length).toBe(2000);
    expect(s1.stderrSummary.length).toBe(2000);

    // 自定义 maxLen=100
    const s2 = summary(cr, 100);
    expect(s2.stdoutSummary.length).toBe(100);
    expect(s2.stderrSummary.length).toBe(100);
  });

  it('场景 7b: maxLen=0 → 返回空字符串', () => {
    const cr: CommandResult = {
      command: 'test',
      exitCode: 0,
      stdout: 'data',
      stderr: 'err',
      durationMs: 10,
    };

    const s = summary(cr, 0);
    expect(s.stdoutSummary).toBe('');
    expect(s.stderrSummary).toBe('');
  });
});

// ============================================================
// CommandResult → buildReport 兼容性
// ============================================================

describe('CommandResult → buildReport 兼容性', () => {
  it('场景 8a: 成功 CommandResult 传入 buildReport → result=PASS', () => {
    const cr = runCommand(okCmd('integration test'));

    const report = buildReport({
      project: 'WenStarOS',
      mode: 'auto',
      result: 'PASS',
      overallRisk: 'low',
      changedFiles: [],
      triggeredWorkflows: [],
      commandResults: [cr],
      meterResults: [],
      deviation: zeroDeviation(),
      gateDecision: 'PASS',
      requiredHumanReview: [],
      nextSteps: [],
    });

    expect(report.commandResults).toHaveLength(1);
    expect(report.commandResults[0].exitCode).toBe(0);
    expect(report.commandResults[0].stdout).toBe('integration test');
    expect(report.commandResults[0].command).toContain('console.log');
    expect(report.result).toBe('PASS');
    expect(report.gateDecision).toBe('PASS');
  });

  it('场景 8b: 失败 CommandResult 传入 buildReport → result=FAIL', () => {
    const cr = runCommand(failCmd(2, 'integration failure'));

    const report = buildReport({
      project: 'WenStarOS',
      mode: 'auto',
      result: 'FAIL',
      overallRisk: 'high',
      changedFiles: [],
      triggeredWorkflows: [],
      commandResults: [cr],
      meterResults: [],
      deviation: zeroDeviation(),
      gateDecision: 'FAIL',
      requiredHumanReview: ['Fix the command'],
      nextSteps: [],
    });

    expect(report.commandResults).toHaveLength(1);
    expect(report.commandResults[0].exitCode).toBe(2);
    expect(report.commandResults[0].stderr).toContain('integration failure');
    expect(report.result).toBe('FAIL');
    expect(report.gateDecision).toBe('FAIL');
  });

  it('场景 8c: 多个命令聚合 → 全部记录在 report 中', () => {
    const cr1 = runCommand(okCmd('first'));
    const cr2 = runCommand(okCmd('second'));
    const cr3 = runCommand(failCmd(1, 'third failed'));

    const report = buildReport({
      project: 'WenStarOS',
      mode: 'auto',
      result: 'FAIL',
      overallRisk: 'medium',
      changedFiles: [],
      triggeredWorkflows: [],
      commandResults: [cr1, cr2, cr3],
      meterResults: [],
      deviation: zeroDeviation(),
      gateDecision: 'FAIL',
      requiredHumanReview: [],
      nextSteps: [],
    });

    expect(report.commandResults).toHaveLength(3);
    expect(report.commandResults[0].stdout).toBe('first');
    expect(report.commandResults[1].stdout).toBe('second');
    expect(report.commandResults[2].exitCode).toBe(1);
    expect(report.commandResults[2].stderr).toContain('third failed');
  });
});
