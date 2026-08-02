// SCRIPT-GOV-C — Governed Script Runner
//
// Spawns governed scripts with SCRIPT_GOV_TEST_DB injected.
// Captures stdout, stderr, exit code. Guards against production DB paths.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { resolve } from 'node:path';
import { isProductionPath } from './db-isolation';

const REPO = resolve(import.meta.dirname, '..', '..', '..');

export interface ScriptRunOptions {
  script: string;          // relative to repo root, e.g. 'scripts/prestart-backfill.cjs'
  args?: string[];
  env?: Record<string, string>;
  testDbPath?: string;     // injected as SCRIPT_GOV_TEST_DB
  auditLogPath?: string;   // injected as SCRIPT_GOV_AUDIT_LOG
  timeout?: number;
}

export interface ScriptRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

/**
 * Run a governed script against a temp DB, with audit log isolation.
 *
 * Guards:
 *  - If testDbPath is set, it MUST NOT be a production path.
 *  - SCRIPT_GOV_AUDIT_LOG overrides the default audit log location.
 */
export function runGovernedScript(opts: ScriptRunOptions): ScriptRunResult {
  const env: Record<string, string> = { ...process.env, NODE_ENV: 'test' };

  if (opts.testDbPath) {
    if (isProductionPath(opts.testDbPath)) {
      throw new Error(
        `[SCRIPT-GOV-C] REFUSING: testDbPath is a production path: ${opts.testDbPath}`
      );
    }
    env.SCRIPT_GOV_TEST_DB = opts.testDbPath;
  }

  if (opts.auditLogPath) {
    if (isProductionPath(opts.auditLogPath)) {
      throw new Error(
        `[SCRIPT-GOV-C] REFUSING: auditLogPath is a production path: ${opts.auditLogPath}`
      );
    }
    env.SCRIPT_GOV_AUDIT_LOG = opts.auditLogPath;
  }

  const scriptPath = resolve(REPO, opts.script);
  const r: SpawnSyncReturns<string> = spawnSync(
    'node',
    [scriptPath, ...(opts.args || [])],
    {
      cwd: REPO,
      encoding: 'utf8',
      timeout: opts.timeout || 15000,
      env,
    }
  );

  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    combined: (r.stdout || '') + (r.stderr || ''),
  };
}
