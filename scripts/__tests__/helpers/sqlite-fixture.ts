// SCRIPT-GOV-C — Valid SQLite Fixture Builder (TODO-SAFE-APPLY)
//
// Uses sql.js (WASM, already a project dependency) to build valid binary
// SQLite DB files. Exports the bytes to a temp file that better-sqlite3
// can then open and write to.
//
// This bridges the gap: sql.js creates the file, better-sqlite3 operates on it.

import { writeFileSync } from 'node:fs';

// Async bootstrap — sql.js WASM loads asynchronously
let _SQL: any = null;
async function _getSql() {
  if (!_SQL) {
    const initSqlJs = require('sql.js');
    _SQL = await initSqlJs();
  }
  return _SQL;
}

/**
 * Build a valid SQLite fixture file at `targetPath`.
 *
 * @param targetPath - absolute path to write the .db file to
 * @param sqlStatements - array of SQL strings to execute on the new DB
 * @returns byte length of the written file
 */
export async function buildSqliteFixture(
  targetPath: string,
  sqlStatements: string[],
): Promise<number> {
  const SQL = await _getSql();
  const db = new SQL.Database();

  for (const sql of sqlStatements) {
    try { db.run(sql); } catch (e: any) {
      // Ignore expected errors (e.g. duplicate table creation)
      if (!e.message?.includes('already exists')) throw e;
    }
  }

  const buf = Buffer.from(db.export());
  db.close();
  writeFileSync(targetPath, buf);
  return buf.length;
}

/**
 * Pre-built fixture SQL for prestart-backfill safe-apply smoke.
 *
 * Creates the minimal tables needed by the script:
 *   - memories (id, raw_input, belong_entity_uuid, created_at)
 *   - conversations (belong_entity_uuid, content)
 *
 * Includes test data: 3 memories with varying annotation states,
 * and 1 conversation to enable the JOIN backfill path.
 */
export const PRESTART_BACKFILL_FIXTURE_SQL = [
  // Memories table — the primary target of backfill operations
  `CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    raw_input TEXT,
    belong_entity_uuid TEXT,
    global_uid TEXT,
    created_at TEXT
  )`,
  // Conversations table — used by the JOIN backfill query
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,
    belong_entity_uuid TEXT,
    content TEXT
  )`,
  // Test data: memory 1 is already annotated, memories 2-3 need backfill
  `INSERT INTO memories (id, raw_input, belong_entity_uuid, global_uid, created_at) VALUES
    (1, 'hello world from test entity', 'uuid-test-entity-01', 'MMTEST001', '2025-06-01T10:00:00Z'),
    (2, 'hello world from test entity plus extra content here for matching', NULL, 'MMTEST002', '2025-06-01T10:30:00Z'),
    (3, 'completely unrelated content string', NULL, 'MMTEST003', '2025-06-02T12:00:00Z')`,
  // Conversation that matches memory 2's raw_input prefix — enables JOIN backfill
  `INSERT INTO conversations (id, belong_entity_uuid, content) VALUES
    (1, 'uuid-test-entity-01', 'hello world from test entity plus extra content here for matching')`,
];
