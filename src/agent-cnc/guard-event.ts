// ============================================================
// Agent CNC Harness — Guard History Event Schema + Writer
// R22-A: 每次 guard 执行写入 append-only JSONL
// ============================================================

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { normalizePath, ensureDir } from './utils.js';
import type { ScanResult, MeterResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Types ----

export type GuardEventResult = 'PASS' | 'FAIL';

export interface FileFingerprint {
  path: string;
  sha256?: string;
  size_bytes?: number;
  status: 'HASHED' | 'MISSING' | 'SKIPPED_TOO_LARGE' | 'ERROR';
  error?: string;
}

export interface GuardEvent {
  event_id: string;
  timestamp: string;
  command: string;
  cwd: string;
  git: {
    root?: string;
    branch?: string;
    commit?: string;
    dirty?: boolean;
  };
  target_files: string[];
  risk: {
    highest: 'low' | 'medium' | 'high';
    plan_required: boolean;
    summary: { high: number; medium: number; low: number };
  };
  plan: {
    found: boolean;
    path?: string;
  };
  guard: {
    result: GuardEventResult;
    exit_code: number;
    block_reasons: string[];
  };
  meters?: Array<{ id: string; status: string; score: number }>;
  fingerprints: {
    files: FileFingerprint[];
  };
  harness: {
    version: string;
  };
}

// ---- Constants ----

const DEFAULT_MAX_FINGERPRINT_BYTES = 5 * 1024 * 1024; // 5MB
const SENSITIVE_FLAGS = /^--(api[_-]?key|token|secret|password|credential|auth)$/i;

// ---- Event ID ----

/**
 * 生成 guard event ID:
 *   guard_2026-07-29T05-00-00-000Z_ab12cd
 */
export function createGuardEventId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const random = crypto.randomBytes(3).toString('hex'); // 6 hex chars
  return `guard_${now}_${random}`;
}

// ---- Command Sanitization ----

/**
 * 脱敏命令行参数：
 *   --plan /absolute/path → --plan <filename>
 *   --api-key xxx → --api-key <REDACTED>
 *   --token xxx → --token <REDACTED>
 */
export function sanitizeCommand(args: string[]): string {
  const result: string[] = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];

    // --plan /abs/path → --plan <filename>
    if ((a === '--plan' || a === '-p') && i + 1 < args.length) {
      const basename = path.basename(args[i + 1]);
      result.push(a, basename);
      i += 2;
      continue;
    }

    // Sensitive flag: --api-key xxx → --api-key <REDACTED>
    if (SENSITIVE_FLAGS.test(a)) {
      result.push(a, '<REDACTED>');
      if (i + 1 < args.length) i += 2;
      else i += 1;
      continue;
    }

    result.push(a);
    i++;
  }

  return result.join(' ');
}

// ---- Git Info ----

function getGitInfo(cwd: string): GuardEvent['git'] {
  const info: GuardEvent['git'] = {};
  try {
    info.root = execSync('git rev-parse --show-toplevel', { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch { /* not a git repo */ }
  try {
    info.branch = execSync('git branch --show-current', { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch { /* no branch */ }
  try {
    info.commit = execSync('git rev-parse --short HEAD', { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch { /* no commit */ }
  try {
    const status = execSync('git status --porcelain', { cwd, stdio: 'pipe', encoding: 'utf-8' });
    info.dirty = status.trim().length > 0;
  } catch { /* unknown */ }
  return info;
}

// ---- Version ----

let _cachedHarnessVersion = '';

function getHarnessVersion(): string {
  if (_cachedHarnessVersion) return _cachedHarnessVersion;
  try {
    // 从 package.json 读取
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    _cachedHarnessVersion = pkg.version || '0.1.0';
  } catch {
    _cachedHarnessVersion = 'unknown';
  }
  return _cachedHarnessVersion;
}

// ---- File Fingerprinting ----

/**
 * 对目标文件列表计算 sha256 hash 和大小。
 * 文件不存在 → MISSING；超大 → SKIPPED_TOO_LARGE；错误 → ERROR。
 */
export function fingerprintFiles(
  targetFiles: string[],
  rootDir: string,
  maxBytes = DEFAULT_MAX_FINGERPRINT_BYTES,
): FileFingerprint[] {
  return targetFiles.map((filePath) => {
    const fullPath = path.resolve(rootDir, filePath);
    const normalizedPath = normalizePath(filePath);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      return {
        path: normalizedPath,
        status: 'MISSING' as const,
      };
    }

    if (stat.size > maxBytes) {
      return {
        path: normalizedPath,
        size_bytes: stat.size,
        status: 'SKIPPED_TOO_LARGE' as const,
      };
    }

    try {
      const content = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      // 截取前 16 字节 (32 hex chars)
      return {
        path: normalizedPath,
        sha256: hash.slice(0, 32),
        size_bytes: stat.size,
        status: 'HASHED' as const,
      };
    } catch (e: unknown) {
      return {
        path: normalizedPath,
        size_bytes: stat.size,
        status: 'ERROR' as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

// ---- Build Guard Event ----

export interface BuildGuardEventParams {
  rootDir: string;
  targetFiles: string[];
  scanResult: ScanResult | null;
  planFound: boolean;
  planPath: string | null;
  gatePassed: boolean;
  gateFailReasons: string[];
  meterResults?: MeterResult[];
  cliArgs: string[];
}

export function buildGuardEvent(params: BuildGuardEventParams): GuardEvent {
  const riskSummary = { high: 0, medium: 0, low: 0 };
  if (params.scanResult) {
    for (const f of params.scanResult.files) {
      riskSummary[f.risk]++;
    }
  }

  const meters = params.meterResults?.map((m) => ({
    id: m.id,
    status: m.status,
    score: m.score,
  }));

  return {
    event_id: createGuardEventId(),
    timestamp: new Date().toISOString(),
    command: sanitizeCommand(params.cliArgs),
    cwd: normalizePath(params.rootDir),
    git: getGitInfo(params.rootDir),
    target_files: params.targetFiles.map(normalizePath),
    risk: {
      highest: params.scanResult?.overallRisk || 'low',
      plan_required: params.scanResult?.requirePlan || false,
      summary: riskSummary,
    },
    plan: {
      found: params.planFound,
      path: params.planPath ? path.basename(params.planPath) : undefined,
    },
    guard: {
      result: params.gatePassed ? 'PASS' : 'FAIL',
      exit_code: params.gatePassed ? 0 : 1,
      block_reasons: params.gateFailReasons,
    },
    meters,
    fingerprints: {
      files: fingerprintFiles(params.targetFiles, params.rootDir),
    },
    harness: {
      version: getHarnessVersion(),
    },
  };
}

// ---- Write Guard Event ----

/**
 * 将 GuardEvent 追加到 .agent-cnc/history/guard-events.jsonl。
 * 自动创建目录。一行一个 JSON。
 */
export function writeGuardEvent(rootDir: string, event: GuardEvent): void {
  const historyDir = path.join(rootDir, '.agent-cnc', 'history');
  ensureDir(historyDir);

  const filePath = path.join(historyDir, 'guard-events.jsonl');
  const line = JSON.stringify(event) + '\n';

  fs.appendFileSync(filePath, line, 'utf-8');
}
