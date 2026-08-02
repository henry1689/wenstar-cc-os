// WORLD-SEGMENT-C2 — CLI --world Flag Smoke Tests
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const REPO = path.resolve(import.meta.dirname, '..', '..');

function runScript(args: string[], auditLog?: string) {
  const env: Record<string, string> = { ...process.env, NODE_ENV: 'test' };
  if (auditLog) env.SCRIPT_GOV_AUDIT_LOG = auditLog;
  return spawnSync('node', ['scripts/apply-migrations.mjs', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 15000,
    env,
  });
}

function readAuditEvent(logPath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 1. --world flag parsing
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C2] --world flag parsing', () => {
  it('--world simulation reaches audit JSONL', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-sim-' + Date.now() + '.jsonl');
    const r = runScript(['--apply', '--world', 'simulation'], log);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');

    const event = readAuditEvent(log);
    expect(event).not.toBeNull();
    expect(event!.worldSegment).toBe('simulation');
    expect(event!.outcome).toBe('denied');
    try { fs.unlinkSync(log); } catch {}
  });

  it('--world core reaches audit JSONL', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-core-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', 'core'], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('core');
    try { fs.unlinkSync(log); } catch {}
  });

  it('--world personal reaches audit JSONL', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-pers-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', 'personal'], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('personal');
    try { fs.unlinkSync(log); } catch {}
  });

  it('--world archive reaches audit JSONL', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-arch-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', 'archive'], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('archive');
    try { fs.unlinkSync(log); } catch {}
  });

  it('--world "  CORE  " normalizes to core', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-trim-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', '  CORE  '], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('core');
    try { fs.unlinkSync(log); } catch {}
  });

  it('--world PERSONAL normalizes to personal', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-upcase-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', 'PERSONAL'], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('personal');
    try { fs.unlinkSync(log); } catch {}
  });

  it('--world prod maps to unknown', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-invalid-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', 'prod'], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('unknown');
    try { fs.unlinkSync(log); } catch {}
  });

  it('missing --world defaults to unknown', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-default-' + Date.now() + '.jsonl');
    runScript(['--apply'], log);
    const event = readAuditEvent(log);
    expect(event!.worldSegment).toBe('unknown');
    try { fs.unlinkSync(log); } catch {}
  });
});

// ═══════════════════════════════════════════
// 2. Denial semantics unchanged
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C2] Denial semantics unchanged with --world', () => {
  it('unsafe --apply still exits 2 with --world', () => {
    const r = runScript(['--apply', '--world', 'simulation']);
    expect(r.status).toBe(2);
  });

  it('DENIED banner still appears with --world', () => {
    const r = runScript(['--apply', '--world', 'simulation']);
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });

  it('validation issues still printed with --world', () => {
    const r = runScript(['--apply', '--world', 'simulation']);
    expect(r.stderr).toMatch(/\[R\d+\]/);
  });

  it('--world does not bypass denial (still requires --confirm)', () => {
    const r = runScript(['--apply', '--world', 'core']);
    // With --world but without --confirm, still DENIED
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');
    expect(r.stderr).toContain('[R002]');
  });

  it('--world does not require DB for denial', () => {
    const r = runScript(['--apply', '--world', 'simulation']);
    expect(r.status).toBe(2);
    const bakFiles = fs.readdirSync(path.join(REPO, 'data', 'webui'))
      .filter(f => f.startsWith('fusion_memory.db.bak'));
    expect(bakFiles.length).toBe(0);
  });

  it('recordGovernanceDecision still runs on denial with --world', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-audit-denial-' + Date.now() + '.jsonl');
    const r = runScript(['--apply', '--world', 'project'], log);
    expect(r.status).toBe(2);

    const event = readAuditEvent(log);
    expect(event).not.toBeNull();
    expect(event!.outcome).toBe('denied');
    expect(event!.worldSegment).toBe('project');
    expect(event!.exitCode).toBe(2);
    try { fs.unlinkSync(log); } catch {}
  });
});

// ═══════════════════════════════════════════
// 3. --help includes new flag
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C2] --help', () => {
  it('--help shows --world in usage', () => {
    const r = runScript(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--world');
    expect(r.stdout).toContain('Usage');
  });

  it('--help does not require DB or audit', () => {
    const r = runScript(['--help']);
    expect(r.status).toBe(0);
    // --help exits before governance preflight; audit log from other
    // tests may already exist but --help itself does not create one.
  });
});

// ═══════════════════════════════════════════
// 4. Existing audit fields preserved
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C2] Existing audit fields preserved', () => {
  it('all existing fields present with --world', () => {
    const log = path.join(os.tmpdir(), 'ws-c2-fields-' + Date.now() + '.jsonl');
    runScript(['--apply', '--world', 'simulation'], log);
    const event = readAuditEvent(log) as Record<string, unknown>;
    expect(event.schema).toBe('script-gov.audit.v1');
    expect(event.scriptId).toBe('apply-migrations');
    expect(event.operation).toBe('migrate');
    expect(event.risk).toBe('CRITICAL');
    expect(event.mode).toBe('apply');
    expect(event.phase).toBe('preflight');
    expect(event.outcome).toBe('denied');
    expect(event.exitCode).toBe(2);
    expect(Array.isArray(event.validationIssues)).toBe(true);
    expect(event.auth).toBeDefined();
    try { fs.unlinkSync(log); } catch {}
  });
});
