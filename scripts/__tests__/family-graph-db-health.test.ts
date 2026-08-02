// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-05
// FamilyGraph DB Health Smoke Test
// Checks family_graph.db integrity and node UUID uniqueness.
// Zero network calls. Zero LLM API calls. Read-only on DB.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const FG_DB_PATH = path.join(REPO, 'data', 'webui', 'knowledge', 'family_graph.db');

describe('[DB-HEALTH] FamilyGraph database', () => {
  // Test 1: DB file exists
  it('family_graph.db exists', () => {
    expect(existsSync(FG_DB_PATH)).toBe(true);
  });

  // Test 2: DB is a valid SQLite file (header check)
  it('family_graph.db is a valid SQLite file', () => {
    const header = readFileSync(FG_DB_PATH).subarray(0, 16);
    const magic = header.toString('utf8', 0, 16);
    expect(magic).toContain('SQLite');
  });

  // Test 3: Read-only audit via sql.js
  it('family_graph.db passes integrity check and has no duplicate UUIDs', async () => {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const buf = readFileSync(FG_DB_PATH);
    const db = new SQL.Database(buf);

    try {
      // Integrity check
      const integrity = db.exec('PRAGMA integrity_check');
      expect(integrity.length).toBeGreaterThan(0);
      expect(integrity[0].values[0][0]).toBe('ok');

      // Required tables
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('nodes', 'edges')");
      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0].values.length).toBe(2); // both nodes and edges

      // No duplicate UUIDs on nodes
      const dups = db.exec('SELECT uuid, COUNT(*) c FROM nodes WHERE uuid IS NOT NULL GROUP BY uuid HAVING c > 1');
      if (dups.length && dups[0].values.length) {
        // Should not happen
        expect(dups[0].values.length).toBe(0);
      }

      // Nodes table has expected columns
      const cols = db.exec('PRAGMA table_info(nodes)');
      const colNames = cols[0].values.map((r: any) => r[1]);
      expect(colNames).toContain('uuid');
      expect(colNames).toContain('id');
      expect(colNames).toContain('name');
      expect(colNames).toContain('type');
    } finally {
      db.close();
    }
  }, 10000);
});
