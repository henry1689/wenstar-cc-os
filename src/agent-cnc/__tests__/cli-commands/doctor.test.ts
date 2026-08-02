// ============================================================
// Agent CNC Harness — cmdDoctor 命令测试
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cmdDoctor, parseArgs } from '../../cli.js';
import { TestRuntime } from './helpers/cli-test-runtime.js';
import { setupValidFixture, makeTempDir, writePkgJson } from './helpers/fixtures.js';

describe('cmdDoctor', () => {
  it('场景 D1: 完整合法配置 + package.json → Result: PASS, 不调用 exit', () => {
    const rootDir = setupValidFixture();
    writePkgJson(rootDir);
    const agentCncDir = path.join(rootDir, 'src', 'agent-cnc');
    fs.mkdirSync(agentCncDir, { recursive: true });
    fs.writeFileSync(path.join(agentCncDir, 'cli.ts'), '// dummy', 'utf-8');

    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['doctor']);

    expect(() => cmdDoctor(args, rt)).not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('[Agent CNC] Doctor');
    expect(text).toContain('Project: WenStarOS');
    expect(text).toContain('Config: OK');
    expect(text).toContain('TypeScript: OK');
    expect(text).toContain('Vitest: OK');
    expect(text).toContain('tsx: OK');
    expect(text).toContain('harness.yaml: OK');
    expect(text).toContain('risk-map.yaml: OK');
    expect(text).toContain('CLI Entry: OK');
    expect(text).toContain('Result: PASS');
  });

  it('场景 D2: .agent-cnc/ 不存在 → Config: MISSING, Result: WARN', () => {
    const rootDir = makeTempDir();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['doctor']);

    expect(() => cmdDoctor(args, rt)).not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('[Agent CNC] Doctor');
    expect(text).toContain('Config: MISSING');
    expect(text).toContain('Result: WARN');
  });

  it('场景 D3: .agent-cnc/ 存在但缺少 harness.yaml → harness.yaml: MISSING', () => {
    const rootDir = setupValidFixture();
    fs.unlinkSync(path.join(rootDir, '.agent-cnc', 'harness.yaml'));
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['doctor']);

    expect(() => cmdDoctor(args, rt)).not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('harness.yaml: MISSING');
  });

  it('场景 D4: .agent-cnc/ 存在但缺少 risk-map.yaml → risk-map.yaml: MISSING', () => {
    const rootDir = setupValidFixture();
    fs.unlinkSync(path.join(rootDir, '.agent-cnc', 'risk-map.yaml'));
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['doctor']);

    expect(() => cmdDoctor(args, rt)).not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('risk-map.yaml: MISSING');
  });

  it('场景 D5: package.json 缺失或不含 TypeScript/Vitest → 依赖显示 MISSING', () => {
    const rootDir = setupValidFixture();
    const rt = new TestRuntime(rootDir);
    const args = parseArgs(['doctor']);

    expect(() => cmdDoctor(args, rt)).not.toThrow();

    expect(rt.exitCode).toBeNull();
    const text = rt.logText();
    expect(text).toContain('TypeScript: MISSING');
    expect(text).toContain('Vitest: MISSING');
    expect(text).toContain('tsx: MISSING');
    expect(text).toContain('harness.yaml: OK');
    expect(text).toContain('Result: WARN');
  });
});
