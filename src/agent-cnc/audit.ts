// ============================================================
// Agent CNC Harness — Guard History Audit
// R22-C: Post-change 审计 — 检测高风险修改是否绕过 guard
// ============================================================

import { normalizePath } from './utils.js';
import {
  readGuardHistory,
  getDefaultGuardHistoryPath,
} from './guard-history.js';
import type { GuardHistoryParseWarning } from './guard-history.js';
import type { GuardEvent } from './guard-event.js';

// ---- Types ----

export type AuditFindingType =
  | 'NO_GUARD_EVENT'
  | 'GUARD_FAILED'
  | 'PLAN_MISSING'
  | 'FILES_MISMATCH'
  | 'STALE_GUARD_EVENT'
  | 'UNKNOWN_HISTORY';

export type AuditSeverity = 'BLOCKER' | 'HIGH' | 'INFO';

export interface AuditFinding {
  type: AuditFindingType;
  severity: AuditSeverity;
  message: string;
  files?: string[];
  event_id?: string;
}

export interface AuditResult {
  passed: boolean;
  findings: AuditFinding[];
  checked_files: string[];
  high_risk_files: string[];
  considered_events: number;
  matched_event_ids: string[];
  warnings: GuardHistoryParseWarning[];
}

export interface AuditInput {
  changedFiles: string[];
  highRiskFiles: string[];
  planRequired: boolean;
  currentBranch?: string;
  historyPath?: string;
  cwd?: string;
  maxEventAgeMs?: number;
  limit?: number;
}

// ---- Constants ----

const DEFAULT_MAX_GUARD_EVENT_AGE_MS = 24 * 60 * 60 * 1000; // 24h

// ---- Severity Map ----

const SEVERITY_MAP: Record<AuditFindingType, AuditSeverity> = {
  NO_GUARD_EVENT: 'BLOCKER',
  GUARD_FAILED: 'BLOCKER',
  PLAN_MISSING: 'BLOCKER',
  FILES_MISMATCH: 'HIGH',
  STALE_GUARD_EVENT: 'HIGH',
  UNKNOWN_HISTORY: 'HIGH',
};

// ---- Helpers ----

function now(): number {
  return Date.now();
}

function parseTimestamp(ts: string): number {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function isStale(timestamp: string, maxAgeMs: number): boolean {
  return now() - parseTimestamp(timestamp) > maxAgeMs;
}

function filesCovered(event: GuardEvent, highRiskFiles: string[]): boolean {
  const normalizedTargets = event.target_files.map(normalizePath);
  return highRiskFiles.every((f) => normalizedTargets.includes(normalizePath(f)));
}

// ---- Audit Engine ----

export function auditGuardHistory(input: AuditInput): AuditResult {
  const result: AuditResult = {
    passed: false,
    findings: [],
    checked_files: input.changedFiles.map(normalizePath),
    high_risk_files: input.highRiskFiles.map(normalizePath),
    considered_events: 0,
    matched_event_ids: [],
    warnings: [],
  };

  // No high-risk files → PASS
  if (input.highRiskFiles.length === 0) {
    result.passed = true;
    return result;
  }

  const maxAge = input.maxEventAgeMs ?? DEFAULT_MAX_GUARD_EVENT_AGE_MS;

  // Read history
  const history = readGuardHistory({
    historyPath: input.historyPath,
    cwd: input.cwd,
    limit: input.limit ?? 50,
  });
  result.warnings = history.warnings;
  result.considered_events = history.events.length;

  // All corrupt → UNKNOWN_HISTORY
  if (history.events.length === 0 && history.warnings.length > 0) {
    result.findings.push({
      type: 'UNKNOWN_HISTORY',
      severity: SEVERITY_MAP['UNKNOWN_HISTORY'],
      message: 'Guard history is present but contains no parseable events.',
      files: result.high_risk_files,
    });
    return result;
  }

  // No events at all → NO_GUARD_EVENT
  if (history.events.length === 0) {
    result.findings.push({
      type: 'NO_GUARD_EVENT',
      severity: SEVERITY_MAP['NO_GUARD_EVENT'],
      message: `High-risk files changed but no guard event found in history. Run guard before modifying high-risk files.`,
      files: result.high_risk_files,
    });
    return result;
  }

  // Filter to current branch events (if branch known)
  let branchEvents = history.events;
  if (input.currentBranch) {
    branchEvents = history.events.filter((e) => e.git.branch === input.currentBranch);
  }
  if (branchEvents.length === 0) {
    // Fall back to all events (cross-branch audit)
    branchEvents = history.events;
  }

  // Find the best matching PASS event
  let bestEvent: GuardEvent | null = null;
  let lastRelatedEvent: GuardEvent | null = null;

  for (const event of branchEvents) {
    // Check if this event is "related" (file intersection)
    const normalizedTargets = event.target_files.map(normalizePath);
    const hasOverlap = result.high_risk_files.some((f) => normalizedTargets.includes(f));
    if (!hasOverlap) continue;

    if (!lastRelatedEvent) lastRelatedEvent = event;

    // Best event: PASS + plan OK + files covered + not stale
    if (event.guard.result !== 'PASS') continue;
    if (input.planRequired && !event.plan.found) continue;
    if (!filesCovered(event, result.high_risk_files)) continue;
    if (isStale(event.timestamp, maxAge)) continue;

    bestEvent = event;
    break; // newest first from sort, first match wins
  }

  if (bestEvent) {
    result.passed = true;
    result.matched_event_ids = [bestEvent.event_id];
    return result;
  }

  // No valid PASS event → classify the failure
  if (!lastRelatedEvent) {
    result.findings.push({
      type: 'NO_GUARD_EVENT',
      severity: SEVERITY_MAP['NO_GUARD_EVENT'],
      message: `High-risk files changed but no matching guard event found. Run guard with an approved plan before modifying these files.`,
      files: result.high_risk_files,
    });
    return result;
  }

  const e = lastRelatedEvent;
  const eTs = parseTimestamp(e.timestamp);
  const stale = now() - eTs > maxAge;

  if (stale) {
    result.findings.push({
      type: 'STALE_GUARD_EVENT',
      severity: SEVERITY_MAP['STALE_GUARD_EVENT'],
      message: `Last matching guard event (${e.event_id}) is too old (${Math.round((now() - eTs) / 3600000)}h). Re-run guard before modifying high-risk files.`,
      files: result.high_risk_files,
      event_id: e.event_id,
    });
  }

  if (e.guard.result === 'FAIL') {
    result.findings.push({
      type: 'GUARD_FAILED',
      severity: SEVERITY_MAP['GUARD_FAILED'],
      message: `Last matching guard event (${e.event_id}) has result=FAIL. Block reasons: ${e.guard.block_reasons.join(', ') || '(none)'}. Fix issues and re-run guard.`,
      files: result.high_risk_files,
      event_id: e.event_id,
    });
  }

  if (input.planRequired && !e.plan.found) {
    result.findings.push({
      type: 'PLAN_MISSING',
      severity: SEVERITY_MAP['PLAN_MISSING'],
      message: `Plan is required but was not provided in guard event ${e.event_id}. Re-run guard with --plan.`,
      files: result.high_risk_files,
      event_id: e.event_id,
    });
  }

  if (!filesCovered(e, result.high_risk_files)) {
    const uncovered = result.high_risk_files.filter(
      (f) => !e.target_files.map(normalizePath).includes(f),
    );
    result.findings.push({
      type: 'FILES_MISMATCH',
      severity: SEVERITY_MAP['FILES_MISMATCH'],
      message: `Guard event ${e.event_id} does not cover all current high-risk files. Uncovered: ${uncovered.join(', ')}. Re-run guard covering all changed files.`,
      files: uncovered,
      event_id: e.event_id,
    });
  }

  // If no specific finding was added (edge case), default to NO_GUARD_EVENT
  if (result.findings.length === 0) {
    result.findings.push({
      type: 'NO_GUARD_EVENT',
      severity: SEVERITY_MAP['NO_GUARD_EVENT'],
      message: `No valid PASS guard event found for current high-risk files.`,
      files: result.high_risk_files,
    });
  }

  return result;
}
