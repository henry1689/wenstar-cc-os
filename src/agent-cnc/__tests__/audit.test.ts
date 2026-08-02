// ============================================================
// Agent CNC Harness — audit.ts 单元测试
// 覆盖: auditGuardHistory — 7 种 finding 类型 + edge cases
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { auditGuardHistory } from '../audit.js';
import type { AuditResult, AuditInput } from '../audit.js';
import { buildGuardEvent, writeGuardEvent } from '../guard-event.js';

// ---- helpers ----

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-audit-'));
}

/** 写一条 PASS event，覆盖指定文件 */
function writePassEvent(
  rootDir: string, files: string[], extra: Partial<Parameters<typeof buildGuardEvent>[0]> = {},
): string {
  const event = buildGuardEvent({
    rootDir, targetFiles: files, scanResult: null,
    planFound: extra.planFound ?? false, planPath: extra.planPath ?? null,
    gatePassed: true, gateFailReasons: [],
    cliArgs: [],
  });
  writeGuardEvent(rootDir, event);
  return event.event_id;
}

// ============================================================
// Audit unit tests
// ============================================================

describe('auditGuardHistory', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('A1: no high-risk files → PASS', () => {
    const result = auditGuardHistory({
      changedFiles: ['docs/readme.md'],
      highRiskFiles: [],
      planRequired: false,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('A2: high-risk file with no history → NO_GUARD_EVENT + BLOCKER', () => {
    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts'],
      highRiskFiles: ['src/webui/chat.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(false);
    expect(result.findings[0].type).toBe('NO_GUARD_EVENT');
    expect(result.findings[0].severity).toBe('BLOCKER');
    expect(result.findings[0].files).toContain('src/webui/chat.ts');
  });

  it('A3: PASS event covers all high-risk files → PASS', () => {
    writePassEvent(tmpDir, ['src/webui/chat.ts'], { planFound: true });
    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts'],
      highRiskFiles: ['src/webui/chat.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(true);
    expect(result.matched_event_ids).toHaveLength(1);
  });

  it('A4: FAIL event → GUARD_FAILED + BLOCKER', () => {
    const event = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['src/webui/chat.ts'], scanResult: null,
      planFound: true, planPath: null, gatePassed: false,
      gateFailReasons: ['tsc --noEmit 失败'], cliArgs: [],
    });
    writeGuardEvent(tmpDir, event);

    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts'],
      highRiskFiles: ['src/webui/chat.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'GUARD_FAILED')).toBe(true);
  });

  it('A5: PASS event but plan missing when required → PLAN_MISSING', () => {
    writePassEvent(tmpDir, ['src/webui/chat.ts'], { planFound: false });
    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts'],
      highRiskFiles: ['src/webui/chat.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'PLAN_MISSING')).toBe(true);
  });

  it('A6: PASS event but files mismatch → FILES_MISMATCH', () => {
    writePassEvent(tmpDir, ['src/webui/chat.ts'], { planFound: true });
    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts', 'src/m5/DeepSeekLLMProvider.ts'],
      highRiskFiles: ['src/webui/chat.ts', 'src/m5/DeepSeekLLMProvider.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'FILES_MISMATCH')).toBe(true);
    const fm = result.findings.find((f) => f.type === 'FILES_MISMATCH')!;
    expect(fm.files).toContain('src/m5/DeepSeekLLMProvider.ts');
  });

  it('A7: stale event > maxAge → STALE_GUARD_EVENT', () => {
    const event = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['src/webui/chat.ts'], scanResult: null,
      planFound: true, planPath: null, gatePassed: true, gateFailReasons: [], cliArgs: [],
    });
    // Override timestamp to 30 hours ago
    const oldTs = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    (event as any).timestamp = oldTs;
    // 直接写文件绕过 buildGuardEvent 的 now() timestamp
    fs.mkdirSync(path.join(tmpDir, '.agent-cnc', 'history'), { recursive: true });
    fs.appendFileSync(path.join(tmpDir, '.agent-cnc', 'history', 'guard-events.jsonl'), JSON.stringify(event) + '\n');

    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts'],
      highRiskFiles: ['src/webui/chat.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'STALE_GUARD_EVENT')).toBe(true);
  });

  it('A8: corrupt/unreadable history with no events → UNKNOWN_HISTORY', () => {
    const historyDir = path.join(tmpDir, '.agent-cnc', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    // Write only corrupt lines
    fs.writeFileSync(path.join(historyDir, 'guard-events.jsonl'), 'not json\n{broken\n');

    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts'],
      highRiskFiles: ['src/webui/chat.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.type === 'UNKNOWN_HISTORY')).toBe(true);
  });

  it('A9: Windows paths normalize matching', () => {
    writePassEvent(tmpDir, ['src/webui/chat.ts', 'src/m5/provider.ts'], { planFound: true });
    const result = auditGuardHistory({
      changedFiles: ['src\\webui\\chat.ts', 'src\\m5\\provider.ts'],
      highRiskFiles: ['src\\webui\\chat.ts', 'src\\m5\\provider.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(true);
  });

  it('A10: planRequired=false + no plan → still PASS if guard PASS and files covered', () => {
    writePassEvent(tmpDir, ['src/m5/prompts/rules.ts'], { planFound: false });
    const result = auditGuardHistory({
      changedFiles: ['src/m5/prompts/rules.ts'],
      highRiskFiles: ['src/m5/prompts/rules.ts'],
      planRequired: false,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(true);
  });

  it('A11: high-risk file with multiple partial events → best valid PASS wins', () => {
    // Old partial event (not covering all files)
    const e1 = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['src/webui/chat.ts'], scanResult: null,
      planFound: true, planPath: null, gatePassed: true, gateFailReasons: [], cliArgs: [],
    });
    writeGuardEvent(tmpDir, e1);
    // Full coverage event
    writePassEvent(tmpDir, ['src/webui/chat.ts', 'src/m5/provider.ts'], { planFound: true });

    const result = auditGuardHistory({
      changedFiles: ['src/webui/chat.ts', 'src/m5/provider.ts'],
      highRiskFiles: ['src/webui/chat.ts', 'src/m5/provider.ts'],
      planRequired: true,
      cwd: tmpDir,
    });
    expect(result.passed).toBe(true);
  });
});
