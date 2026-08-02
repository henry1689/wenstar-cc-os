// ============================================================
// Agent CNC Harness — guard-history.ts 单元测试
// 覆盖: read, parse, filter, sort, summary, append
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readGuardHistory,
  getDefaultGuardHistoryPath,
  sortGuardEventsNewestFirst,
  filterGuardEventsByBranch,
  filterGuardEventsByFiles,
  getRecentGuardEvents,
  summarizeGuardHistory,
  appendGuardHistoryEvent,
} from '../guard-history.js';
import { buildGuardEvent } from '../guard-event.js';
import type { GuardEvent } from '../guard-event.js';

// ---- helpers ----

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-history-'));
}

function writeHistoryFile(tmpDir: string, lines: string[]): string {
  const historyDir = path.join(tmpDir, '.agent-cnc', 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  const filePath = path.join(historyDir, 'guard-events.jsonl');
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  return filePath;
}

function makeEvent(overrides: Partial<GuardEvent> = {}): GuardEvent {
  return {
    event_id: 'guard_test',
    timestamp: '2026-07-29T12:00:00.000Z',
    command: 'guard --files test.ts',
    cwd: '/tmp/test',
    git: { branch: 'main', commit: 'abc123', dirty: false },
    target_files: ['src/test.ts'],
    risk: { highest: 'medium', plan_required: false, summary: { high: 0, medium: 1, low: 0 } },
    plan: { found: false },
    guard: { result: 'PASS', exit_code: 0, block_reasons: [] },
    fingerprints: { files: [] },
    harness: { version: '0.1.0' },
    ...overrides,
  };
}

// ============================================================
// getDefaultGuardHistoryPath
// ============================================================

describe('getDefaultGuardHistoryPath', () => {
  it('返回 .agent-cnc/history/guard-events.jsonl', () => {
    const p = getDefaultGuardHistoryPath('/tmp/project');
    expect(p).toContain('.agent-cnc');
    expect(p).toContain('history');
    expect(p).toContain('guard-events.jsonl');
  });

  it('无 cwd 时使用 process.cwd()', () => {
    expect(() => getDefaultGuardHistoryPath()).not.toThrow();
  });
});

// ============================================================
// readGuardHistory
// ============================================================

describe('readGuardHistory', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('H1: history 文件不存在 → events=[], warnings=[]', () => {
    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.events).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('H2: 空文件 → events=[]', () => {
    writeHistoryFile(tmpDir, []);
    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.events).toHaveLength(0);
  });

  it('H3: 多个合法 JSONL events → 全部解析 (newest first)', () => {
    const e1 = JSON.stringify(makeEvent({ event_id: 'evt_001', timestamp: '2026-07-01T00:00:00.000Z' }));
    const e2 = JSON.stringify(makeEvent({ event_id: 'evt_002', timestamp: '2026-07-29T12:00:00.000Z' }));
    writeHistoryFile(tmpDir, [e1, e2]);

    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].event_id).toBe('evt_002'); // newest first
  });

  it('H4: 空行跳过', () => {
    const e1 = JSON.stringify(makeEvent({ event_id: 'evt_001' }));
    writeHistoryFile(tmpDir, ['', e1, '', '']);

    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.events).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('H5: 非法 JSON 行 → warning (不抛异常)', () => {
    const e1 = JSON.stringify(makeEvent({ event_id: 'evt_001' }));
    writeHistoryFile(tmpDir, [e1, 'not valid json {{{']);

    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toContain('Invalid JSON');
    expect(result.warnings[0].line).toBe(2);
    expect(result.events).toHaveLength(1);
  });

  it('H6: 缺少 event_id → warning (不崩溃)', () => {
    writeHistoryFile(tmpDir, [JSON.stringify({ guard: { result: 'PASS' } })]);

    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toContain('event_id');
    expect(result.events).toHaveLength(0);
  });

  it('H7: order: 最新 event 排在前面', () => {
    const old = JSON.stringify(makeEvent({ event_id: 'old', timestamp: '2026-07-01T00:00:00.000Z' }));
    const mid = JSON.stringify(makeEvent({ event_id: 'mid', timestamp: '2026-07-15T00:00:00.000Z' }));
    const now = JSON.stringify(makeEvent({ event_id: 'new', timestamp: '2026-07-29T12:00:00.000Z' }));
    writeHistoryFile(tmpDir, [old, mid, now]);

    const result = readGuardHistory({ cwd: tmpDir });
    expect(result.events).toHaveLength(3);
    expect(result.events[0].event_id).toBe('new');
    expect(result.events[2].event_id).toBe('old');
  });

  it('H8: limit 参数生效', () => {
    const e1 = JSON.stringify(makeEvent({ event_id: 'evt_001', timestamp: '2026-07-29T01:00:00.000Z' }));
    const e2 = JSON.stringify(makeEvent({ event_id: 'evt_002', timestamp: '2026-07-29T02:00:00.000Z' }));
    const e3 = JSON.stringify(makeEvent({ event_id: 'evt_003', timestamp: '2026-07-29T03:00:00.000Z' }));
    writeHistoryFile(tmpDir, [e1, e2, e3]);

    const result = readGuardHistory({ cwd: tmpDir, limit: 2 });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].event_id).toBe('evt_003');
    expect(result.events[1].event_id).toBe('evt_002');
  });
});

// ============================================================
// Sort
// ============================================================

describe('sortGuardEventsNewestFirst', () => {
  it('按 timestamp 降序', () => {
    const events = [
      makeEvent({ timestamp: '2026-01-01T00:00:00.000Z' }),
      makeEvent({ timestamp: '2026-06-15T00:00:00.000Z' }),
      makeEvent({ timestamp: '2026-03-10T00:00:00.000Z' }),
    ];
    sortGuardEventsNewestFirst(events);
    expect(events[0].timestamp).toBe('2026-06-15T00:00:00.000Z');
    expect(events[2].timestamp).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ============================================================
// Filter by Branch
// ============================================================

describe('filterGuardEventsByBranch', () => {
  it('匹配到指定 branch 的事件', () => {
    const events = [
      makeEvent({ git: { branch: 'main' } }),
      makeEvent({ git: { branch: 'feature/x' } }),
      makeEvent({ git: { branch: 'main' } }),
    ];
    const result = filterGuardEventsByBranch(events, 'main');
    expect(result).toHaveLength(2);
  });

  it('branch 为 undefined 的 event 不匹配', () => {
    const events = [
      makeEvent({ git: { branch: undefined } }),
      makeEvent({ git: { branch: 'main' } }),
    ];
    const result = filterGuardEventsByBranch(events, 'main');
    expect(result).toHaveLength(1);
  });
});

// ============================================================
// Filter by Files
// ============================================================

describe('filterGuardEventsByFiles', () => {
  it('有交集 → 保留', () => {
    const events = [
      makeEvent({ target_files: ['a.ts', 'b.ts'] }),
      makeEvent({ target_files: ['c.ts'] }),
    ];
    const result = filterGuardEventsByFiles(events, ['a.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].target_files).toContain('a.ts');
  });

  it('Windows 路径 normalize 后匹配', () => {
    const events = [
      makeEvent({ target_files: ['src/webui/chat.ts'] }),
    ];
    const result = filterGuardEventsByFiles(events, ['src\\webui\\chat.ts']);
    expect(result).toHaveLength(1);
  });

  it('无交集 → 空', () => {
    const events = [makeEvent({ target_files: ['a.ts'] })];
    const result = filterGuardEventsByFiles(events, ['b.ts']);
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// getRecentGuardEvents
// ============================================================

describe('getRecentGuardEvents', () => {
  it('limit=2 返回 2 条', () => {
    const events = [
      makeEvent(), makeEvent(), makeEvent(), makeEvent(),
    ];
    const result = getRecentGuardEvents(events, 2);
    expect(result).toHaveLength(2);
  });

  it('limit 大于总数 → 全返回', () => {
    const events = [makeEvent(), makeEvent()];
    const result = getRecentGuardEvents(events, 10);
    expect(result).toHaveLength(2);
  });
});

// ============================================================
// summarizeGuardHistory
// ============================================================

describe('summarizeGuardHistory', () => {
  it('空 events → 全 0', () => {
    const s = summarizeGuardHistory([]);
    expect(s.total).toBe(0);
    expect(s.pass).toBe(0);
    expect(s.fail).toBe(0);
    expect(s.earliestTimestamp).toBeUndefined();
  });

  it('混合 PASS/FAIL → 计数正确', () => {
    const events = [
      makeEvent({ guard: { result: 'PASS', exit_code: 0, block_reasons: [] } }),
      makeEvent({ guard: { result: 'FAIL', exit_code: 1, block_reasons: ['high_risk_without_plan'] } }),
      makeEvent({ guard: { result: 'PASS', exit_code: 0, block_reasons: [] } }),
    ];
    const s = summarizeGuardHistory(events);
    expect(s.total).toBe(3);
    expect(s.pass).toBe(2);
    expect(s.fail).toBe(1);
  });

  it('混合 high/medium/low → 计数正确', () => {
    const events = [
      makeEvent({ risk: { highest: 'high', plan_required: true, summary: { high: 1, medium: 0, low: 0 } } }),
      makeEvent({ risk: { highest: 'medium', plan_required: false, summary: { high: 0, medium: 1, low: 0 } } }),
      makeEvent({ risk: { highest: 'low', plan_required: false, summary: { high: 0, medium: 0, low: 1 } } }),
    ];
    const s = summarizeGuardHistory(events);
    expect(s.high).toBe(1);
    expect(s.medium).toBe(1);
    expect(s.low).toBe(1);
  });

  it('planRequired / planFound 计数', () => {
    const events = [
      makeEvent({ risk: { highest: 'high', plan_required: true, summary: { high: 1, medium: 0, low: 0 } }, plan: { found: true } }),
      makeEvent({ risk: { highest: 'high', plan_required: true, summary: { high: 1, medium: 0, low: 0 } }, plan: { found: false } }),
      makeEvent({ risk: { highest: 'medium', plan_required: false, summary: { high: 0, medium: 1, low: 0 } }, plan: { found: false } }),
    ];
    const s = summarizeGuardHistory(events);
    expect(s.planRequired).toBe(2);
    expect(s.planFound).toBe(1);
  });

  it('earliest/latest timestamp 正确', () => {
    const events = [
      makeEvent({ timestamp: '2026-07-01T00:00:00.000Z' }),
      makeEvent({ timestamp: '2026-07-15T00:00:00.000Z' }),
      makeEvent({ timestamp: '2026-07-29T12:00:00.000Z' }),
    ];
    const s = summarizeGuardHistory(events);
    expect(s.latestTimestamp).toBe('2026-07-29T12:00:00.000Z');
    expect(s.earliestTimestamp).toBe('2026-07-01T00:00:00.000Z');
  });
});

// ============================================================
// appendGuardHistoryEvent
// ============================================================

describe('appendGuardHistoryEvent', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('append 追加一行 JSONL，不覆盖已有行', () => {
    const event1 = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['a.ts'], scanResult: null,
      planFound: false, planPath: null, gatePassed: true,
      gateFailReasons: [], cliArgs: [],
    });
    const event2 = buildGuardEvent({
      rootDir: tmpDir, targetFiles: ['b.ts'], scanResult: null,
      planFound: false, planPath: null, gatePassed: true,
      gateFailReasons: [], cliArgs: [],
    });

    appendGuardHistoryEvent(tmpDir, event1);
    appendGuardHistoryEvent(tmpDir, event2);

    const historyPath = getDefaultGuardHistoryPath(tmpDir);
    const lines = fs.readFileSync(historyPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});
