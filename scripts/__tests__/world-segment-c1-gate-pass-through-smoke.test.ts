// WORLD-SEGMENT-C1 — Gate Contract worldSegment Pass-Through Smoke Tests
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const req = createRequire(import.meta.url);
const gate = req('../_governance-gate.cjs') as {
  validateGate: (c: Record<string, unknown>) => { allowed: boolean; errors: Array<{ rule: string; message: string }>; warnings: Array<{ rule: string; message: string }> };
  recordGovernanceDecision: (c: Record<string, unknown>, v: { allowed: boolean; errors: Array<{ rule: string; message: string }>; warnings: Array<{ rule: string; message: string }> }, phase?: string, sinkPath?: string) => void;
  createAuditEvent: (c: Record<string, unknown> | null, v: { allowed: boolean; errors: Array<{ rule: string; message: string }>; warnings: Array<{ rule: string; message: string }> }, phase?: string) => Record<string, unknown>;
};

const REPO = path.resolve(import.meta.dirname, '..', '..');

const BASE_CONTRACT = {
  scriptId: 'test-c1',
  riskLevel: 'CRITICAL' as const,
  operationType: 'update' as const,
  mode: 'apply' as const,
  environment: 'local' as const,
  operator: { operatorId: 'test-user', reason: 'test', ticket: 'T-1' },
  scope: { selector: 'table:test', limit: 0, batchSize: 0, since: null, until: null },
  confirmation: { required: true, provided: true, tokenDigest: 'tok-abc' },
  backup: { required: true, created: false, backupId: null, backupPath: null, verified: false },
  irreversibleConfirmation: true,
};

const DENIED = { allowed: false, errors: [{ rule: 'R001', message: 'test denial' }], warnings: [] };

// ═══════════════════════════════════════════
// 1. Gate accepts worldSegment without rejection
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C1] Gate accepts worldSegment', () => {
  it('validateGate does not reject contract with worldSegment', () => {
    // worldSegment is a pass-through field — gate must NOT add errors for it
    const r = gate.validateGate({ ...BASE_CONTRACT, worldSegment: 'simulation' });
    expect(r.allowed).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('validateGate does not reject contract with world_segment alias', () => {
    const r = gate.validateGate({ ...BASE_CONTRACT, world_segment: 'personal' });
    expect(r.allowed).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('validateGate does not reject contract without worldSegment', () => {
    const r = gate.validateGate(BASE_CONTRACT);
    expect(r.allowed).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('validateGate does not reject contract with invalid worldSegment', () => {
    // Invalid values are passed through — audit layer normalizes to 'unknown'
    const r = gate.validateGate({ ...BASE_CONTRACT, worldSegment: 'prod' });
    expect(r.allowed).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('validateGate does not reject contract with empty worldSegment', () => {
    const r = gate.validateGate({ ...BASE_CONTRACT, worldSegment: '' });
    expect(r.allowed).toBe(true);
  });

  it('worldSegment does not affect allow/deny decision', () => {
    // Same contract, with and without worldSegment — same decision
    const r1 = gate.validateGate(BASE_CONTRACT);
    const r2 = gate.validateGate({ ...BASE_CONTRACT, worldSegment: 'core' });
    expect(r1.allowed).toBe(r2.allowed);
  });

  it('worldSegment does not affect denial either', () => {
    // Missing required field → denied, with or without worldSegment
    const c = { ...BASE_CONTRACT };
    delete (c as any).confirmation;
    const r1 = gate.validateGate(c);
    const r2 = gate.validateGate({ ...c, worldSegment: 'simulation' });
    expect(r1.allowed).toBe(false);
    expect(r2.allowed).toBe(false);
    expect(r1.errors.length).toBe(r2.errors.length);
  });
});

// ═══════════════════════════════════════════
// 2. Audit pass-through: contract.worldSegment → event.worldSegment
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C1] Contract worldSegment → audit event', () => {
  it('explicit worldSegment flows through to audit event', () => {
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';

    const event = gate.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'simulation' },
      DENIED,
    );
    expect(event.worldSegment).toBe('simulation');

    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });

  it('explicit world_segment alias flows through', () => {
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';

    const event = gate.createAuditEvent(
      { ...BASE_CONTRACT, world_segment: 'personal' },
      DENIED,
    );
    expect(event.worldSegment).toBe('personal');

    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });

  it('missing worldSegment defaults to unknown in audit', () => {
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';

    const event = gate.createAuditEvent(BASE_CONTRACT, DENIED);
    expect(event.worldSegment).toBe('unknown');

    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });

  it('invalid worldSegment normalizes to unknown', () => {
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';

    const event = gate.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'prod' },
      DENIED,
    );
    expect(event.worldSegment).toBe('unknown');

    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });

  it('all existing audit fields preserved', () => {
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';

    const event = gate.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'core' },
      DENIED,
    ) as Record<string, unknown>;
    expect(event.schema).toBe('script-gov.audit.v1');
    expect(event.scriptId).toBe('test-c1');
    expect(event.operation).toBe('update');
    expect(event.risk).toBe('CRITICAL');
    expect(event.mode).toBe('apply');
    expect(event.outcome).toBe('denied');
    expect(event.exitCode).toBe(2);
    expect(event.auth).toBeDefined();

    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });

  it('JSONL output remains parseable with worldSegment', () => {
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';

    const event = gate.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'archive' },
      DENIED,
    );
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);
    expect(parsed.worldSegment).toBe('archive');
    expect(parsed.outcome).toBe('denied');

    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });
});

// ═══════════════════════════════════════════
// 3. Denial path unchanged
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C1] Denial path unchanged', () => {
  it('apply-migrations --apply still exits 2', () => {
    const r = spawnSync('node', ['scripts/apply-migrations.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    expect(r.status).toBe(2);
  });

  it('DENIED banner still appears', () => {
    const r = spawnSync('node', ['scripts/apply-migrations.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');
  });

  it('validation issues still printed', () => {
    const r = spawnSync('node', ['scripts/apply-migrations.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    expect(r.stderr).toMatch(/\[R\d+\]/);
  });

  it('no DB required for denial', () => {
    const r = spawnSync('node', ['scripts/apply-migrations.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    expect(r.status).toBe(2);
    // No backup created (would need to read DB first)
    const bakFiles = fs.readdirSync(path.join(REPO, 'data', 'webui'))
      .filter(f => f.startsWith('fusion_memory.db.bak'));
    expect(bakFiles.length).toBe(0);
  });
});

// ═══════════════════════════════════════════
// 4. E2E: full pass-through with temp audit log
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-C1] E2E pass-through', () => {
  it('contract worldSegment reaches audit JSONL event', () => {
    const auditPath = path.join(os.tmpdir(), 'ws-c1-e2e-' + Date.now() + '.jsonl');
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;

    // Simulate the pass-through: gate → createAuditEvent → write
    gate.recordGovernanceDecision(
      { ...BASE_CONTRACT, worldSegment: 'simulation' },
      DENIED,
      'preflight',
      auditPath,
    );

    // Read and verify
    const content = fs.readFileSync(auditPath, 'utf8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.worldSegment).toBe('simulation');
    expect(parsed.outcome).toBe('denied');
    expect(parsed.scriptId).toBe('test-c1');

    // Cleanup
    try { fs.unlinkSync(auditPath); } catch {}

    // Restore
    if (prev === undefined) delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    else process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
  });

  it('missing worldSegment → audit event defaults to unknown', () => {
    const auditPath = path.join(os.tmpdir(), 'ws-c1-e2e-default-' + Date.now() + '.jsonl');

    gate.recordGovernanceDecision(BASE_CONTRACT, DENIED, 'preflight', auditPath);

    const content = fs.readFileSync(auditPath, 'utf8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.worldSegment).toBe('unknown');

    try { fs.unlinkSync(auditPath); } catch {}
  });
});
