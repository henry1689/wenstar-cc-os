// SCRIPT-GOV-C — DB Test Isolation Helpers
//
// Provides:
//   createTempDbIsolation() — temp directory + fixture DB creation + cleanup
//   isProductionPath()       — guard against real project DB paths
//   assertSafePath()         — fail fast if path is production-adjacent
//
// All temp data lives under os.tmpdir(). No real DB ever touched.

import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import { buildSqliteFixture } from './sqlite-fixture';

// ---- Project DB paths that must NEVER be written to in tests ----
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

const KNOWN_PRODUCTION_PATHS: Set<string> = new Set([
  resolve(REPO_ROOT, 'data', 'webui', 'fusion_memory.db'),
  resolve(REPO_ROOT, 'data', 'webui', 'knowledge', 'family_graph.db'),
  resolve(REPO_ROOT, 'data', 'knowledge', 'family_graph.db'),
]);

const KNOWN_PRODUCTION_DIRS = [
  resolve(REPO_ROOT, 'data'),
];

export interface DbIsolationContext {
  /** Absolute path to the temp working directory */
  tempDir: string;
  /** Absolute path to the fixture SQLite DB inside tempDir */
  dbPath: string;
  /** Absolute path to the audit log inside tempDir */
  auditLogPath: string;
  /** Cleanup: remove tempDir recursively */
  cleanup: () => void;
}

/**
 * Check whether a path looks like a production DB path.
 * Rejects known production paths and paths inside known production dirs.
 */
export function isProductionPath(candidate: string): boolean {
  const abs = resolve(candidate);
  if (KNOWN_PRODUCTION_PATHS.has(abs)) return true;
  for (const dir of KNOWN_PRODUCTION_DIRS) {
    if (abs.startsWith(dir + '\\') || abs.startsWith(dir + '/')) return true;
  }
  // Also reject any path inside the repo that ends with .db unless in temp
  if (abs.endsWith('.db') && abs.startsWith(REPO_ROOT) && !abs.includes('tmp')) {
    return true;
  }
  return false;
}

/**
 * Assert that a path is safe for test use (not a production path).
 * Throws if path is production-adjacent.
 */
export function assertSafePath(candidate: string, label?: string): void {
  if (isProductionPath(candidate)) {
    throw new Error(
      `[SCRIPT-GOV-C] REFUSING: ${label || 'path'} resolves to a production DB location: ${candidate}`
    );
  }
}

/**
 * Create an isolated temp DB context for a single test.
 *
 * @param testLabel - short identifier for the temp directory name
 * @param fixtureSql - optional SQL to execute on the newly-created empty DB
 * @returns DbIsolationContext with tempDir, dbPath, auditLogPath, and cleanup()
 */
export function createTempDbIsolation(
  testLabel: string,
  fixtureSql?: string,
): DbIsolationContext {
  const base = join(tmpdir(), 'script-gov-c');
  mkdirSync(base, { recursive: true });
  const tempDir = mkdtempSync(join(base, testLabel + '-'));
  const dbPath = join(tempDir, 'test.db');
  const auditLogPath = join(tempDir, 'audit.jsonl');

  // Create empty SQLite DB file (zero-byte placeholder — scripts that use
  // better-sqlite3 can open this; sql.js scripts read the file bytes)
  writeFileSync(dbPath, '');

  // Apply fixture SQL if provided (uses sql.js in the test, not here)
  if (fixtureSql) {
    // The fixture SQL will be applied by the test using the DB driver
  }

  // Guard: refuse to continue if path somehow resolves to production
  assertSafePath(dbPath, 'temp dbPath');
  assertSafePath(auditLogPath, 'temp auditLogPath');

  function cleanup() {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }

  return { tempDir, dbPath, auditLogPath, cleanup };
}

/**
 * Create a minimal fixture DB with an empty `memories` table for backfill tests.
 * Returns the SQL to execute (caller applies via the relevant DB driver).
 */
export function minimalMemoriesFixtureSql(): string {
  return [
    'CREATE TABLE IF NOT EXISTS memories (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  raw_input TEXT,',
    '  belong_entity_uuid TEXT,',
    '  global_uid TEXT,',
    '  created_at TEXT',
    ');',
    'INSERT INTO memories (id, raw_input, belong_entity_uuid, global_uid, created_at) VALUES',
    "  (1, 'hello world', 'uuid-test-01', 'MMTEST001', '2025-01-01T00:00:00Z'),",
    "  (2, 'test记忆内容', NULL, NULL, '2025-01-02T00:00:00Z'),",
    "  (3, 'another test entry', NULL, NULL, '2025-01-03T00:00:00Z'),",
    "  (4, 'fourth memory record', 'uuid-test-02', 'MMTEST002', '2025-01-04T00:00:00Z');",
  ].join('\n');
}

/**
 * TODO-SAFE-APPLY: Create a valid SQLite fixture file at ctx.dbPath using sql.js.
 * This produces a binary SQLite file that better-sqlite3 can open and write to.
 *
 * Call this after createTempDbIsolation() and before running the governed script.
 */
export async function buildIsolatedFixture(
  ctx: DbIsolationContext,
  sqlStatements: string[],
): Promise<number> {
  return buildSqliteFixture(ctx.dbPath, sqlStatements);
}
