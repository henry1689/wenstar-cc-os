// ============================================================
// Agent CNC Harness — cmdValidate 命令测试
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cmdValidate } from '../../cli.js';
import { TestRuntime } from './helpers/cli-test-runtime.js';
import { setupValidFixture, makeTempDir } from './helpers/fixtures.js';

describe('cmdValidate', () => {
  it('场景 1: 完整合法 .agent-cnc/ → 日志含 "PASS"，不调用 exit', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).not.toThrow();

    expect(rt.logText()).toContain('Validation: PASS');
    expect(rt.logText()).toContain('[Agent CNC] Validate');
    expect(rt.exitCode).toBeNull();
    expect(rt.errors).toHaveLength(0);
  });

  it('场景 2: .agent-cnc/ 目录不存在 → exitCode=1，日志含 "FAIL"', () => {
    const rootDir = makeTempDir();
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Validation: FAIL');
    expect(rt.logText()).toContain('不存在');
  });

  it('场景 3: 缺少 harness.yaml → exitCode=1 + 列出缺失项', () => {
    const rootDir = setupValidFixture();
    fs.unlinkSync(path.join(rootDir, '.agent-cnc', 'harness.yaml'));
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Validation: FAIL');
    expect(rt.logText()).toContain('Missing files:');
  });

  it('场景 4: harness.yaml 语法错误 → exitCode=1 + Invalid YAML', () => {
    const rootDir = setupValidFixture();
    fs.writeFileSync(
      path.join(rootDir, '.agent-cnc', 'harness.yaml'),
      '{{{broken!!! yaml',
      'utf-8',
    );
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Invalid YAML:');
  });

  it('场景 5: harness.yaml 缺少 agent_cnc_harness 根字段 → FAIL + Missing fields', () => {
    const rootDir = setupValidFixture();
    fs.writeFileSync(
      path.join(rootDir, '.agent-cnc', 'harness.yaml'),
      'some_other_key:\n  foo: bar\n',
      'utf-8',
    );
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Missing fields:');
  });

  it('场景 6: risk-map.yaml 缺失 → exitCode=1 + 缺失列表', () => {
    const rootDir = setupValidFixture();
    fs.unlinkSync(path.join(rootDir, '.agent-cnc', 'risk-map.yaml'));
    const rt = new TestRuntime(rootDir);

    expect(() => cmdValidate(rt)).toThrow(/EXIT:1/);

    expect(rt.exitCode).toBe(1);
    expect(rt.logText()).toContain('Missing files:');
  });
});
