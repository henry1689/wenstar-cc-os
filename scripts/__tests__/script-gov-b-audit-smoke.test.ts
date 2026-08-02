// SCRIPT-GOV-B — Audit evidence chain smoke tests
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const AUDIT_LOG = path.join(os.tmpdir(), 'script-gov-b-audit-test-' + Date.now() + '.jsonl');

function cleanup() {
  try { fs.unlinkSync(AUDIT_LOG); } catch {}
}

beforeAll(() => cleanup());
afterAll(() => cleanup());

function runAudited(args) {
  const r = spawnSync('node', args, {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, NODE_ENV: 'test', SCRIPT_GOV_AUDIT_LOG: AUDIT_LOG }
  });
  return r;
}

function readAuditEvents() {
  try {
    const raw = fs.readFileSync(AUDIT_LOG, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

describe('[SCRIPT-GOV-B] Audit Event — Denial writes audit event', () => {
  it('apply-migrations --apply writes one audit event', () => {
    const r = runAudited(['scripts/apply-migrations.mjs', '--apply']);
    const events = readAuditEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('build-dag-edges --apply writes one audit event', () => {
    cleanup();
    const r = runAudited(['scripts/build-dag-edges.mjs', '--apply']);
    const events = readAuditEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe('[SCRIPT-GOV-B] Audit Event Schema', () => {
  let event;

  beforeAll(() => {
    cleanup();
    runAudited(['scripts/apply-migrations.mjs', '--apply']);
    const events = readAuditEvents();
    event = events[0];
  });

  it('has schema version', () => {
    expect(event.schema).toBe('script-gov.audit.v1');
  });

  it('has eventId', () => {
    expect(event.eventId).toMatch(/^evt_/);
  });

  it('has ISO timestamp', () => {
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('records scriptId', () => {
    expect(event.scriptId).toBe('apply-migrations');
  });

  it('records operation', () => {
    expect(event.operation).toBe('migrate');
  });

  it('records risk', () => {
    expect(event.risk).toBe('CRITICAL');
  });

  it('records mode=apply', () => {
    expect(event.mode).toBe('apply');
  });

  it('records phase=preflight', () => {
    expect(event.phase).toBe('preflight');
  });

  it('records outcome=denied', () => {
    expect(event.outcome).toBe('denied');
  });

  it('records exitCode=2', () => {
    expect(event.exitCode).toBe(2);
  });

  it('has non-empty validationIssues', () => {
    expect(event.validationIssues.length).toBeGreaterThan(0);
    expect(event.validationIssues[0]).toMatch(/^\[R\d+\]/);
  });

  it('has auth object with operator/actorType', () => {
    expect(event.auth).toBeDefined();
    expect(event.auth).toHaveProperty('operator');
    expect(event.auth).toHaveProperty('actorType');
    expect(event.auth).toHaveProperty('runId');
    expect(event.auth).toHaveProperty('timestamp');
  });

  it('auth.operator is null for missing --operator', () => {
    expect(event.auth.operator).toBeNull();
    expect(event.auth.actorType).toBe('unknown');
  });

  it('does not contain real secrets or DB contents', () => {
    const str = JSON.stringify(event);
    expect(str).not.toContain('password');
    // No raw DB content in audit event
    expect(str).not.toContain('CREATE TABLE');
    expect(str).not.toContain('INSERT INTO');
    // Validation issue messages reference contract fields (e.g. 'tokenDigest'),
    // not actual secret values — this is expected and safe.
  });
});

describe('[SCRIPT-GOV-B] Denial semantics preserved', () => {
  it('apply-migrations --apply still exits 2', () => {
    const r = runAudited(['scripts/apply-migrations.mjs', '--apply']);
    expect(r.status).toBe(2);
  });

  it('apply-migrations --apply still prints DENIED banner', () => {
    const r = runAudited(['scripts/apply-migrations.mjs', '--apply']);
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });

  it('apply-migrations --apply still prints validation issues', () => {
    const r = runAudited(['scripts/apply-migrations.mjs', '--apply']);
    expect(r.stderr).toMatch(/\[R\d+\]/);
  });

  it('apply-migrations --apply does not require real DB', () => {
    // test DB file does not exist in test env — denial won't try to read it
    const r = runAudited(['scripts/apply-migrations.mjs', '--apply']);
    expect(r.status).toBe(2);
    // No DB backup created in cwd
    const backups = fs.readdirSync(path.join(REPO, 'data', 'webui'))
      .filter(f => f.startsWith('fusion_memory.db.bak'));
    expect(backups.length).toBe(0);
  });

  it('build-dag-edges --apply still exits 2', () => {
    const r = runAudited(['scripts/build-dag-edges.mjs', '--apply']);
    expect(r.status).toBe(2);
  });

  it('build-dag-edges --apply still prints DENIED banner', () => {
    const r = runAudited(['scripts/build-dag-edges.mjs', '--apply']);
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });

  it('apply-migrations --help still works', () => {
    const r = runAudited(['scripts/apply-migrations.mjs', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage');
  });
});

describe('[SCRIPT-GOV-B] Audit disabled flag', () => {
  it('SCRIPT_GOV_AUDIT_DISABLED=1 skips audit write', () => {
    cleanup();
    const r = spawnSync('node', ['scripts/apply-migrations.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test', SCRIPT_GOV_AUDIT_LOG: AUDIT_LOG, SCRIPT_GOV_AUDIT_DISABLED: '1' }
    });
    const events = readAuditEvents();
    expect(events.length).toBe(0);
  });
});
