// ============================================================
// Agent CNC Harness — guard-event.ts 单元测试
// 覆盖: createGuardEventId, sanitizeCommand, fingerprintFiles,
//        writeGuardEvent, buildGuardEvent
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createGuardEventId,
  sanitizeCommand,
  fingerprintFiles,
  writeGuardEvent,
  buildGuardEvent,
} from '../guard-event.js';
import type { MeterResult } from '../types.js';

// ---- helpers ----

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-guard-event-'));
}

// ============================================================
// createGuardEventId
// ============================================================

describe('createGuardEventId', () => {
  it('格式: guard_YYYY-MM-DDTHH-mm-ss-SSSZ_<6 hex chars>', () => {
    const id = createGuardEventId();
    expect(id).toMatch(/^guard_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-f0-9]{6}$/);
  });

  it('连续两次生成不同 id', () => {
    const id1 = createGuardEventId();
    const id2 = createGuardEventId();
    expect(id1).not.toBe(id2);
  });
});

// ============================================================
// sanitizeCommand
// ============================================================

describe('sanitizeCommand', () => {
  it('--plan /abs/path → --plan <basename>', () => {
    const result = sanitizeCommand(['guard', '--plan', '/home/user/my-plan.md']);
    expect(result).toBe('guard --plan my-plan.md');
  });

  it('--api-key xxx → --api-key <REDACTED>', () => {
    const result = sanitizeCommand(['guard', '--api-key', 'sk-12345secret']);
    expect(result).toBe('guard --api-key <REDACTED>');
  });

  it('--token xxx → --token <REDACTED>', () => {
    const result = sanitizeCommand(['scan', '--token', 'ghp_abc123']);
    expect(result).toBe('scan --token <REDACTED>');
  });

  it('--secret xxx → --secret <REDACTED>', () => {
    const result = sanitizeCommand(['--secret', 'my-password']);
    expect(result).toBe('--secret <REDACTED>');
  });

  it('--password xxx → --password <REDACTED>', () => {
    const result = sanitizeCommand(['--password', 'admin123']);
    expect(result).toBe('--password <REDACTED>');
  });

  it('普通 flag 保持不变', () => {
    const result = sanitizeCommand(['guard', '--files', 'src/chat.ts', '--no-test', '--offline']);
    expect(result).toContain('--files src/chat.ts');
    expect(result).toContain('--no-test');
    expect(result).toContain('--offline');
  });

  it('空参数 → 空字符串', () => {
    expect(sanitizeCommand([])).toBe('');
  });
});

// ============================================================
// fingerprintFiles
// ============================================================

describe('fingerprintFiles', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('存在的文件 → HASHED, sha256_32 hex, size_bytes', () => {
    const filePath = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(filePath, 'console.log("hello world");');

    const results = fingerprintFiles(['test.ts'], tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('HASHED');
    expect(results[0].sha256).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(results[0].size_bytes).toBeGreaterThan(0);
  });

  it('不存在的文件 → MISSING', () => {
    const results = fingerprintFiles(['ghost.ts'], tmpDir);
    expect(results[0].status).toBe('MISSING');
    expect(results[0].sha256).toBeUndefined();
  });

  it('超大文件 → SKIPPED_TOO_LARGE', () => {
    const filePath = path.join(tmpDir, 'big.bin');
    // 创建 ~5.5MB 文件
    const buf = Buffer.alloc(5.5 * 1024 * 1024, 0);
    fs.writeFileSync(filePath, buf);

    const results = fingerprintFiles(['big.bin'], tmpDir);
    expect(results[0].status).toBe('SKIPPED_TOO_LARGE');
    expect(results[0].size_bytes).toBeGreaterThan(5 * 1024 * 1024);
  });

  it('路径使用 POSIX 正斜杠', () => {
    const filePath = path.join(tmpDir, 'sub', 'deep', 'file.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '// test');

    const results = fingerprintFiles(['sub/deep/file.ts'], tmpDir);
    expect(results[0].path).toBe('sub/deep/file.ts');
  });
});

// ============================================================
// writeGuardEvent
// ============================================================

describe('writeGuardEvent', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('写入 .agent-cnc/history/guard-events.jsonl → 一行一个 JSON', () => {
    const event = buildGuardEvent({
      rootDir: tmpDir,
      targetFiles: ['src/chat.ts'],
      scanResult: null,
      planFound: false,
      planPath: null,
      gatePassed: true,
      gateFailReasons: [],
      cliArgs: ['guard', '--files', 'src/chat.ts'],
    });

    writeGuardEvent(tmpDir, event);

    const historyPath = path.join(tmpDir, '.agent-cnc', 'history', 'guard-events.jsonl');
    expect(fs.existsSync(historyPath)).toBe(true);

    const lines = fs.readFileSync(historyPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.event_id).toMatch(/^guard_/);
    expect(parsed.guard.result).toBe('PASS');
    expect(parsed.target_files).toEqual(['src/chat.ts']);
  });

  it('append 追加模式 — 多次写入不覆盖', () => {
    const event1 = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['a.ts'], scanResult: null,
      planFound: false, planPath: null, gatePassed: true,
      gateFailReasons: [], cliArgs: [],
    });
    const event2 = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['b.ts'], scanResult: null,
      planFound: false, planPath: null, gatePassed: false,
      gateFailReasons: ['high_risk_without_plan'], cliArgs: [],
    });

    writeGuardEvent(tmpDir, event1);
    writeGuardEvent(tmpDir, event2);

    const historyPath = path.join(tmpDir, '.agent-cnc', 'history', 'guard-events.jsonl');
    const lines = fs.readFileSync(historyPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).guard.result).toBe('PASS');
    expect(JSON.parse(lines[1]).guard.result).toBe('FAIL');
  });

  it('目录自动创建', () => {
    const historyDir = path.join(tmpDir, '.agent-cnc', 'history');
    expect(fs.existsSync(historyDir)).toBe(false); // 尚未创建

    const event = buildGuardEvent({
      rootDir: tmpDir, targetFiles: [], scanResult: null,
      planFound: false, planPath: null, gatePassed: true,
      gateFailReasons: [], cliArgs: [],
    });
    writeGuardEvent(tmpDir, event);

    expect(fs.existsSync(historyDir)).toBe(true);
  });
});

// ============================================================
// buildGuardEvent — 字段完整性
// ============================================================

describe('buildGuardEvent', () => {
  it('PASS event → guard.result=PASS, exit_code=0', () => {
    const event = buildGuardEvent({
      rootDir: '/tmp/test',
      targetFiles: ['docs/readme.md'],
      scanResult: null,
      planFound: false,
      planPath: null,
      gatePassed: true,
      gateFailReasons: [],
      cliArgs: ['guard', '--files', 'docs/readme.md'],
    });

    expect(event.guard.result).toBe('PASS');
    expect(event.guard.exit_code).toBe(0);
    expect(event.risk.highest).toBe('low');
    expect(event.risk.plan_required).toBe(false);
  });

  it('FAIL event → guard.result=FAIL, exit_code=1, block_reasons populated', () => {
    const event = buildGuardEvent({
      rootDir: '/tmp/test',
      targetFiles: ['src/webui/chat.ts'],
      scanResult: {
        overallRisk: 'high',
        files: [{ path: 'src/webui/chat.ts', risk: 'high', reason: 'S 级资产' }],
        triggeredWorkflows: ['chat_ts_change'],
        requiredMeters: ['prompt-meter'],
        requirePlan: true,
      },
      planFound: false,
      planPath: null,
      gatePassed: false,
      gateFailReasons: ['high_risk_without_plan'],
      cliArgs: ['guard', '--files', 'src/webui/chat.ts'],
    });

    expect(event.guard.result).toBe('FAIL');
    expect(event.guard.exit_code).toBe(1);
    expect(event.guard.block_reasons).toContain('high_risk_without_plan');
    expect(event.risk.highest).toBe('high');
    expect(event.risk.plan_required).toBe(true);
    expect(event.plan.found).toBe(false);
  });

  it('plan 路径脱敏为 basename', () => {
    const event = buildGuardEvent({
      rootDir: '/tmp/test',
      targetFiles: [],
      scanResult: null,
      planFound: true,
      planPath: '/home/user/plans/security-fix.md',
      gatePassed: true,
      gateFailReasons: [],
      cliArgs: ['guard', '--plan', '/home/user/plans/security-fix.md'],
    });

    expect(event.plan.found).toBe(true);
    expect(event.plan.path).toBe('security-fix.md'); // basename only
  });

  it('meter results 摘要', () => {
    const meters: MeterResult[] = [
      { id: 'prompt-meter', title: 'Prompt 检查', severity: 'S', status: 'pass', score: 100, evidence: [], warnings: [], failures: [] },
      { id: 'uuid-meter', title: 'UUID 检查', severity: 'S', status: 'warn', score: 100, evidence: [], warnings: ['建议审查'], failures: [] },
    ];
    const event = buildGuardEvent({
      rootDir: '/tmp/test',
      targetFiles: [],
      scanResult: null,
      planFound: false, planPath: null,
      gatePassed: true, gateFailReasons: [],
      cliArgs: [],
      meterResults: meters,
    });

    expect(event.meters).toHaveLength(2);
    expect(event.meters![0].id).toBe('prompt-meter');
    expect(event.meters![0].status).toBe('pass');
    expect(event.meters![1].status).toBe('warn');
  });
});
