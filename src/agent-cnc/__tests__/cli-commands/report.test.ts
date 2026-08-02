// ============================================================
// Agent CNC Harness — cmdReport 命令测试
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cmdReport, parseArgs } from '../../cli.js';
import { TestRuntime } from './helpers/cli-test-runtime.js';
import { setupValidFixture, writeLatestResult } from './helpers/fixtures.js';

describe('cmdReport', () => {
  it('场景 R1: latest-result.json 不存在 → 友好提示，不调用 exit', async () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['report']);

    await expect(cmdReport(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    expect(rt.logText()).toContain('[Agent CNC] Report');
    expect(rt.logText()).toContain('No previous report found');
    expect(rt.logText()).not.toContain('Report generated');
  });

  it('场景 R2: latest-result.json 存在且合法 → 读取并生成时间戳报告', async () => {
    const rootDir = setupValidFixture();
    writeLatestResult(rootDir, {
      result: 'PASS', overallRisk: 'medium', gateDecision: 'PASS',
      changedFiles: [{ path: 'src/webui/chat.ts', risk: 'high', reason: '聊天中枢' }],
      commandResults: [{ command: 'npx tsc --noEmit', exitCode: 0, stdout: 'ok', stderr: '', durationMs: 100 }],
    });
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['report']);

    await expect(cmdReport(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('[Agent CNC] Report');
    expect(text).toContain('Report generated:');

    const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
    const mdFiles = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThanOrEqual(2);

    const latestMd = fs.readFileSync(path.join(reportsDir, 'latest.md'), 'utf-8');
    expect(latestMd).toContain('# Agent CNC Evidence Report');
    expect(latestMd).toContain('src/webui/chat.ts');
    expect(latestMd).toContain('聊天中枢');
    expect(latestMd).toContain('npx tsc --noEmit');
    // R22-D: section 10 appears
    expect(latestMd).toContain('## 10. Guard History / Bypass Audit');
  });

  it('场景 R3: latest-result.json 含 FAIL 数据 → report 输出 FAIL', async () => {
    const rootDir = setupValidFixture();
    writeLatestResult(rootDir, {
      result: 'FAIL', overallRisk: 'high', gateDecision: 'FAIL',
      requiredHumanReview: ['修复: tsc --noEmit 失败'],
      nextSteps: ['修复编译错误后重新运行 guard'],
    });
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['report']);

    await expect(cmdReport(args, rt)).resolves.not.toThrow();

    expect(rt.logText()).toContain('Report generated:');
    const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
    const latestMd = fs.readFileSync(path.join(reportsDir, 'latest.md'), 'utf-8');
    expect(latestMd).toContain('**Result:** FAIL');
    expect(latestMd).toContain('**Gate Decision:** FAIL');
    expect(latestMd).toContain('tsc --noEmit 失败');
    // R22-D: section 10 present
    expect(latestMd).toContain('## 10. Guard History / Bypass Audit');
  });

  it('场景 R4: latest-result.json 缺少部分字段 → 默认值填充，不崩溃', async () => {
    const rootDir = setupValidFixture();
    const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'latest-result.json'), JSON.stringify({ project: 'Test' }), 'utf-8');
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['report']);

    await expect(cmdReport(args, rt)).resolves.not.toThrow();

    expect(rt.exitCode).toBeNull();
    expect(rt.logText()).toContain('Report generated');
  });

  it('场景 R5: latest-result.json 非法 JSON → 友好错误 + exit(1)', async () => {
    const rootDir = setupValidFixture();
    const reportsDir = path.join(rootDir, '.agent-cnc', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'latest-result.json'), 'not valid json {{{', 'utf-8');
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['report']);

    await expect(cmdReport(args, rt)).rejects.toThrow('EXIT:1');
    expect(rt.exitCode).toBe(1);
    expect(rt.errors.join(' ')).toContain('Failed to read or parse report file');
    expect(rt.logText()).not.toContain('Report generated');
  });
});
