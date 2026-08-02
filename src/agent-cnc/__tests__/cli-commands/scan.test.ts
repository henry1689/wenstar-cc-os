// ============================================================
// Agent CNC Harness — cmdScan 命令测试
// 覆盖: --files, changed-files provider, --base provider
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cmdScan, parseArgs } from '../../cli.js';
import { TestRuntime } from './helpers/cli-test-runtime.js';
import { setupValidFixture, initGitRepo } from './helpers/fixtures.js';

// ============================================================
// cmdScan — 基础 --files 路径
// ============================================================

describe('cmdScan', () => {
  it('场景 7: --files 单文件 src/webui/chat.ts → 触发 chat_ts_change workflow', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'src/webui/chat.ts']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('[Agent CNC] Scan');
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('prompt-meter');
    expect(text).toContain('聊天中枢');
  });

  it('场景 8: --files 多文件 → 触发多个 workflow + Meter 聚合', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs([
      'scan',
      '--files',
      'src/webui/chat.ts,src/m5/RoleplayPromptBuilder.ts',
    ]);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('roleplay_change');
    expect(text).toContain('prompt-meter');
    expect(text).toContain('roleplay-isolation-meter');
    expect(text).toContain('Overall Risk: HIGH');
  });

  it('场景 9: 无风险变更文件 → 不触发 WF，默认 medium', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'docs/readme.md']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('Overall Risk: MEDIUM');
    expect(text).toContain('Require Plan: No');
    expect(text).toContain('(none)');
  });

  it('场景 10: --files 多个不触发文件 → 全部分类正确，无 WF', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'docs/a.md,scripts/b.sh,tools/c.py']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('Overall Risk: MEDIUM');
    expect(text).toContain('Require Plan: No');
    expect(text).toContain('(none)');
    expect(text).toContain('docs/a.md');
    expect(text).toContain('scripts/b.sh');
    expect(text).toContain('tools/c.py');
    expect(text).toContain('Report saved');

    const scanPath = path.join(rootDir, '.agent-cnc', 'reports', 'latest-scan.json');
    const scan = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
    expect(scan.scanResult.files).toHaveLength(3);
    expect(scan.scanResult.triggeredWorkflows).toHaveLength(0);
  });

  it('场景 11: --files 含高风险文件 → requirePlan=YES 在输出中', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['scan', '--files', 'src/webui/chat.ts,src/m3/PerceptionAnalyzer.ts']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('src/webui/chat.ts');
    expect(text).toContain('src/m3/PerceptionAnalyzer.ts');

    const scanPath = path.join(rootDir, '.agent-cnc', 'reports', 'latest-scan.json');
    expect(fs.existsSync(scanPath)).toBe(true);
    const scan = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
    expect(scan.scanResult.overallRisk).toBe('high');
    expect(scan.scanResult.requirePlan).toBe(true);
    expect(Array.isArray(scan.scanResult.triggeredWorkflows)).toBe(true);
  });
});

// ============================================================
// cmdScan — changed files provider (无 --files)
// ============================================================

describe('cmdScan changed files provider', () => {
  it('场景 S1: 无 --files，runtime 返回安全文件 → 调用 getChangedFiles, scan PASS', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFiles = ['docs/readme.md'];
    const args = parseArgs(['scan']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesCalls).toHaveLength(1);
    expect(rt.changedFilesCalls[0]).toBe(rootDir);

    const text = rt.logText();
    expect(text).toContain('Changed files: 1');
    expect(text).toContain('Overall Risk: MEDIUM');
    expect(text).toContain('docs/readme.md');
  });

  it('场景 S2: 无 --files，runtime 返回高风险文件 → HIGH + require plan + WF 触发', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFiles = ['src/webui/chat.ts'];
    const args = parseArgs(['scan']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('聊天中枢');
  });

  it('场景 S3: 无 --files，runtime 返回空数组 → clean state, 不 crash', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFiles = [];
    const args = parseArgs(['scan']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Changed files: 0');
    expect(text).toContain('No changed files. Clean state.');
  });

  it('场景 S4: 有 --files → 不调用 getChangedFiles', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFiles = ['should-not-be-used.ts'];
    const args = parseArgs(['scan', '--files', 'docs/readme.md']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesCalls).toHaveLength(0);

    const text = rt.logText();
    expect(text).toContain('Using --files: 1 file(s)');
    expect(text).toContain('docs/readme.md');
  });

  it('场景 S5: 无 --files，runtime 返回多文件混合风险 → 最高风险聚合', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFiles = [
      'src/webui/chat.ts',
      'docs/readme.md',
      'src/m4/__tests__/test.ts',
    ];
    const args = parseArgs(['scan']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('src/webui/chat.ts');
    expect(text).toContain('docs/readme.md');
    expect(text).toContain('src/m4/__tests__/test.ts');
  });
});

// ============================================================
// cmdScan --base changed files provider
// ============================================================

describe('cmdScan --base changed files provider', () => {
  it('场景 B1: --base main → 调用 getChangedFilesSince, scan PASS', () => {
    const rootDir = setupValidFixture();
    initGitRepo(rootDir);
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFilesSince = ['docs/readme.md'];
    const args = parseArgs(['scan', '--base', 'main']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesSinceCalls).toHaveLength(1);
    expect(rt.changedFilesSinceCalls[0]).toEqual({ base: 'main', cwd: rootDir });
    expect(rt.changedFilesCalls).toHaveLength(0);

    const text = rt.logText();
    expect(text).toContain('Changed files since main: 1');
    expect(text).toContain('Overall Risk: MEDIUM');
    expect(text).toContain('docs/readme.md');
  });

  it('场景 B2: --base main 返回高风险文件 → HIGH + require plan + WF', () => {
    const rootDir = setupValidFixture();
    initGitRepo(rootDir);
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFilesSince = ['src/webui/chat.ts'];
    const args = parseArgs(['scan', '--base', 'main']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesSinceCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Overall Risk: HIGH');
    expect(text).toContain('Require Plan: YES');
    expect(text).toContain('chat_ts_change');
    expect(text).toContain('聊天中枢');
  });

  it('场景 B3: --base main 返回空数组 → clean state', () => {
    const rootDir = setupValidFixture();
    initGitRepo(rootDir);
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFilesSince = [];
    const args = parseArgs(['scan', '--base', 'main']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesSinceCalls).toHaveLength(1);
    const text = rt.logText();
    expect(text).toContain('Changed files since main: 0');
    expect(text).toContain('No changed files. Clean state.');
  });

  it('场景 B4: --files 优先于 --base → 不调用 getChangedFilesSince', () => {
    const rootDir = setupValidFixture();
    initGitRepo(rootDir);
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFilesSince = ['should-not-be-used.ts'];
    const args = parseArgs(['scan', '--files', 'docs/readme.md', '--base', 'main']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesSinceCalls).toHaveLength(0);
    expect(rt.changedFilesCalls).toHaveLength(0);

    const text = rt.logText();
    expect(text).toContain('Using --files: 1 file(s)');
    expect(text).toContain('docs/readme.md');
  });

  it('场景 B5: 无 git repo temp dir + --base main → Git 不可用提示, 不调用 provider', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    rt.mockChangedFilesSince = ['should-not-be-used.ts'];
    const args = parseArgs(['scan', '--base', 'main']);

    expect(() => cmdScan(args, rt)).not.toThrow();

    expect(rt.changedFilesSinceCalls).toHaveLength(0);

    const text = rt.logText();
    expect(text).toContain('Git 不可用，无法使用 --base');
    expect(text).toContain('No changed files. Clean state.');
  });
});
