// SCRIPT-GOV-A2d-batch-1 — 16 direct-fit script refusal smoke tests
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const REPO = path.resolve(import.meta.dirname, '..', '..');
function run(args: string[]) { return spawnSync('node', args, { cwd: REPO, encoding: 'utf8', timeout: 15000, env: { ...process.env, NODE_ENV: 'test' } }); }

const B1 = [
  ['prestart-backfill.cjs', 'CRITICAL', 'backfill'],
  ['fix-memories-now.cjs', 'CRITICAL', 'update'],
  ['fix-remaining-data.cjs', 'CRITICAL', 'update'],
  ['final-annotation-sweep.cjs', 'CRITICAL', 'update'],
  ['clean-kb.cjs', 'CRITICAL', 'clean'],
  ['clean-kb.js', 'CRITICAL', 'clean'],
  ['clean-person-profiles.cjs', 'CRITICAL', 'clean'],
  ['sync-social-to-fg.cjs', 'CRITICAL', 'sync'],
  ['offline-sync-knowledge.cjs', 'CRITICAL', 'sync'],
  ['fix-garbled-files.cjs', 'CRITICAL', 'clean'],
  ['backfill-bd-l2norm.mjs', 'CRITICAL', 'backfill'],
  ['cleanup-black-diamond.mjs', 'CRITICAL', 'clean'],
  ['backfill-all-uuids.mjs', 'CRITICAL', 'backfill'],
  ['backfill_truncated.mjs', 'CRITICAL', 'backfill'],
  ['cleanup-garbage-entities.mjs', 'CRITICAL', 'clean'],
  ['phase1-data-fix.mjs', 'CRITICAL', 'update'],
];

describe('[A2d-Batch-1] 16 脚本: --apply 无元数据 → exit 2', () => {
  for (const [script, risk, op] of B1) {
    it(`${script}: --apply → exit 2 + DENIED`, () => {
      const r = run([`scripts/${script}`, '--apply']);
      expect(r.status, `${script}: expected exit 2, got ${r.status}`).toBe(2);
      expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
    });
  }
});

describe('[A2d-Batch-1] 部分元数据仍被拒绝', () => {
  it('clean-kb.cjs: --apply --operator TXS-000000001 → exit 2 (缺 reason/ticket/scope)', () => {
    const r = run(['scripts/clean-kb.cjs', '--apply', '--operator', 'TXS-000000001']);
    expect(r.status).toBe(2);
  });
  it('backfill-all-uuids.mjs: --apply --operator X --reason test → exit 2 (缺 ticket/scope)', () => {
    const r = run(['scripts/backfill-all-uuids.mjs', '--apply', '--operator', 'TXS-000000001', '--reason', 'test']);
    expect(r.status).toBe(2);
  });
  it('cleanup-black-diamond.mjs: --apply --operator X --reason test --ticket T1 → exit 2 (缺 scope)', () => {
    const r = run(['scripts/cleanup-black-diamond.mjs', '--apply', '--operator', 'TXS-000000001', '--reason', 'test', '--ticket', 'TKT-001']);
    expect(r.status).toBe(2);
  });
});

describe('[A2d-Batch-1] --help works for all', () => {
  for (const [script] of B1) {
    it(`${script}: --help → exit 0`, () => {
      const r = run([`scripts/${script}`, '--help']);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Usage');
    });
  }
});
