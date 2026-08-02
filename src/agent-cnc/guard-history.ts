// ============================================================
// Agent CNC Harness — Guard History Store
// R22-B: 读取、解析、过滤、排序、摘要 guard-events.jsonl
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { normalizePath, fileExists } from './utils.js';
import type { GuardEvent } from './guard-event.js';
import { writeGuardEvent } from './guard-event.js';

// ---- Types ----

export interface GuardHistoryReadOptions {
  /** 自定义 history 文件路径（默认 .agent-cnc/history/guard-events.jsonl） */
  historyPath?: string;
  /** 项目根目录（用于推导默认 history 路径） */
  cwd?: string;
  /** 最多读取最近 N 条事件 */
  limit?: number;
}

export interface GuardHistoryParseWarning {
  line: number;
  reason: string;
  raw?: string;
}

export interface GuardHistoryReadResult {
  events: GuardEvent[];
  warnings: GuardHistoryParseWarning[];
  historyPath: string;
}

export interface GuardHistorySummary {
  total: number;
  pass: number;
  fail: number;
  high: number;
  medium: number;
  low: number;
  planRequired: number;
  planFound: number;
  earliestTimestamp?: string;
  latestTimestamp?: string;
}

// ---- Default Path ----

/**
 * 推导默认 guard-events.jsonl 路径。
 * 与 writeGuardEvent 使用的路径一致。
 */
export function getDefaultGuardHistoryPath(cwd?: string): string {
  const root = cwd || process.cwd();
  return path.join(root, '.agent-cnc', 'history', 'guard-events.jsonl');
}

// ---- Read ----

/**
 * 从 JSONL 文件读取 guard events。
 * - 文件不存在 → events=[], warnings=[]
 * - 空行跳过
 * - 非法 JSON 行 → warning（不抛异常）
 */
export function readGuardHistory(
  options: GuardHistoryReadOptions = {},
): GuardHistoryReadResult {
  const historyPath = options.historyPath || getDefaultGuardHistoryPath(options.cwd);

  if (!fileExists(historyPath)) {
    return { events: [], warnings: [], historyPath };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(historyPath, 'utf-8');
  } catch (e: unknown) {
    return {
      events: [],
      warnings: [
        {
          line: 0,
          reason: `Failed to read history file: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      historyPath,
    };
  }

  const warnings: GuardHistoryParseWarning[] = [];
  const events: GuardEvent[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    try {
      const parsed = JSON.parse(line);
      const warn = validateMinimalSchema(parsed, i + 1);
      if (warn) {
        warnings.push(warn);
        continue;
      }
      events.push(parsed);
    } catch {
      warnings.push({
        line: i + 1,
        reason: 'Invalid JSON',
        raw: line.slice(0, 200),
      });
    }
  }

  // 按 timestamp 降序
  sortGuardEventsNewestFirst(events);

  // limit
  if (options.limit && options.limit > 0 && events.length > options.limit) {
    return { events: events.slice(0, options.limit), warnings, historyPath };
  }

  return { events, warnings, historyPath };
}

// ---- Minimal Schema Validation ----

function validateMinimalSchema(
  obj: unknown,
  line: number,
): GuardHistoryParseWarning | null {
  if (!obj || typeof obj !== 'object') {
    return { line, reason: 'Not a JSON object' };
  }
  const e = obj as Record<string, unknown>;

  if (typeof e.event_id !== 'string') {
    return { line, reason: 'Missing required field: event_id' };
  }
  if (typeof e.timestamp !== 'string') {
    return { line, reason: 'Missing required field: timestamp' };
  }
  if (!e.guard || typeof (e.guard as Record<string, unknown>)?.result !== 'string') {
    return { line, reason: 'Missing required field: guard.result' };
  }
  return null;
}

// ---- Append ----

/**
 * 追加一条 guard event 到 history。
 * 自动创建目录。re-exports writeGuardEvent 语义。
 */
export function appendGuardHistoryEvent(rootDir: string, event: GuardEvent): void {
  writeGuardEvent(rootDir, event);
}

// ---- Sort ----

/** 按 timestamp 降序排列（最新的在前） */
export function sortGuardEventsNewestFirst(events: GuardEvent[]): GuardEvent[] {
  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ---- Filter by Branch ----

/** 过滤到指定分支的事件。branch 为 null 的 event 不匹配任何具体 branch。 */
export function filterGuardEventsByBranch(
  events: GuardEvent[],
  branch: string,
): GuardEvent[] {
  return events.filter((e) => e.git.branch === branch);
}

// ---- Filter by Files (Intersection) ----

/**
 * 过滤到 target_files 与给定文件集合有交集的 event。
 * 路径比较前均 normalize 为 POSIX 格式。
 */
export function filterGuardEventsByFiles(
  events: GuardEvent[],
  files: string[],
): GuardEvent[] {
  const normalizedInput = files.map(normalizePath);
  return events.filter((e) => {
    const normalizedTargets = e.target_files.map(normalizePath);
    return normalizedInput.some((f) => normalizedTargets.includes(f));
  });
}

// ---- Recent ----

/** 取最近 N 条 event（按 timestamp 降序，适合已排序的数组） */
export function getRecentGuardEvents(
  events: GuardEvent[],
  limit: number,
): GuardEvent[] {
  if (events.length <= limit) return [...events];
  return events.slice(0, limit);
}

// ---- Summary ----

/**
 * 生成 guard history 摘要统计。
 * 空 events → 全 0，earliest/latest undefined。
 */
export function summarizeGuardHistory(
  events: GuardEvent[],
): GuardHistorySummary {
  const summary: GuardHistorySummary = {
    total: events.length,
    pass: 0,
    fail: 0,
    high: 0,
    medium: 0,
    low: 0,
    planRequired: 0,
    planFound: 0,
  };

  if (events.length === 0) return summary;

  let earliest = events[0].timestamp;
  let latest = events[0].timestamp;

  for (const e of events) {
    // guard result
    if (e.guard.result === 'PASS') summary.pass++;
    else if (e.guard.result === 'FAIL') summary.fail++;

    // risk
    const h = e.risk.highest;
    if (h === 'high') summary.high++;
    else if (h === 'medium') summary.medium++;
    else if (h === 'low') summary.low++;

    // plan
    if (e.risk.plan_required) summary.planRequired++;
    if (e.plan.found) summary.planFound++;

    // timestamps
    if (e.timestamp < earliest) earliest = e.timestamp;
    if (e.timestamp > latest) latest = e.timestamp;
  }

  summary.earliestTimestamp = earliest;
  summary.latestTimestamp = latest;

  return summary;
}
