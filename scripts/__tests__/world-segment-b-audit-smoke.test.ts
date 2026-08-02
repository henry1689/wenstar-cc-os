// WORLD-SEGMENT-B — World-Aware Audit Event Smoke Tests
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const audit = req('../_governance-audit.cjs') as {
  createAuditEvent: (contract: Record<string, unknown> | null, validationResult: { allowed: boolean; errors: Array<{ rule: string; message: string }>; warnings: Array<{ rule: string; message: string }> }, phase?: string) => Record<string, unknown>;
  recordGovernanceDecision: (contract: Record<string, unknown>, validationResult: { allowed: boolean; errors: Array<{ rule: string; message: string }>; warnings: Array<{ rule: string; message: string }> }, phase?: string, sinkPath?: string) => void;
  recordAuditEvent: (event: Record<string, unknown>, sinkPath?: string) => void;
  createAuthContext: (contract: Record<string, unknown> | null) => Record<string, unknown>;
  getAuditLogPath: () => string;
  isAuditDisabled: () => boolean;
};

const BASE_CONTRACT = {
  scriptId: 'test-script',
  operationType: 'update',
  riskLevel: 'CRITICAL',
  mode: 'apply',
  environment: 'local',
};

const DENIED = { allowed: false, errors: [{ rule: 'R001', message: 'test denial' }], warnings: [] };
const ACCEPTED = { allowed: true, errors: [], warnings: [] };

// ═══════════════════════════════════════════
// 1. World segment in audit events
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-B] worldSegment in createAuditEvent', () => {
  it('records worldSegment when provided via contract.worldSegment', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'simulation' },
      DENIED,
    );
    expect(event.worldSegment).toBe('simulation');
  });

  it('records worldSegment when provided via contract.world_segment', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, world_segment: 'personal' },
      DENIED,
    );
    expect(event.worldSegment).toBe('personal');
  });

  it('trims and lowercases worldSegment', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: '  CORE  ' },
      DENIED,
    );
    expect(event.worldSegment).toBe('core');
  });

  it('normalizes SIMULATION to simulation', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'SIMULATION' },
      DENIED,
    );
    expect(event.worldSegment).toBe('simulation');
  });

  it('maps invalid worldSegment to unknown', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'prod' },
      DENIED,
    );
    expect(event.worldSegment).toBe('unknown');
  });

  it('maps empty string worldSegment to unknown', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: '   ' },
      DENIED,
    );
    expect(event.worldSegment).toBe('unknown');
  });

  it('defaults to unknown when contract has no worldSegment', () => {
    const event = audit.createAuditEvent(BASE_CONTRACT, DENIED);
    expect(event.worldSegment).toBe('unknown');
  });

  it('defaults to unknown when contract is null', () => {
    const event = audit.createAuditEvent(null, DENIED);
    expect(event.worldSegment).toBe('unknown');
  });

  it('worldSegment is always a valid segment string', () => {
    const segments = ['core', 'personal', 'project', 'simulation', 'archive', 'unknown'];
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'project' },
      DENIED,
    );
    expect(segments).toContain(event.worldSegment);
  });

  it('works for accepted outcomes too', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: 'archive' },
      ACCEPTED,
    );
    expect(event.worldSegment).toBe('archive');
    expect(event.outcome).toBe('accepted');
  });
});

// ═══════════════════════════════════════════
// 2. Backward compatibility — existing fields preserved
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-B] backward compatibility', () => {
  it('all existing audit event fields remain present', () => {
    const event = audit.createAuditEvent(BASE_CONTRACT, DENIED);
    expect(event.schema).toBe('script-gov.audit.v1');
    expect(event.eventId).toMatch(/^evt_/);
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(event.scriptId).toBe('test-script');
    expect(event.operation).toBe('update');
    expect(event.risk).toBe('CRITICAL');
    expect(event.mode).toBe('apply');
    expect(event.environment).toBe('local');
    expect(event.phase).toBe('preflight');
    expect(event.outcome).toBe('denied');
    expect(event.exitCode).toBe(2);
    expect(event.validationIssues).toEqual(['[R001] test denial']);
    expect(event.auth).toBeDefined();
    expect(event.auth.operator).toBeNull();
    expect(event.auth.actorType).toBe('unknown');
  });

  it('JSONL output remains parseable', () => {
    const event = audit.createAuditEvent(BASE_CONTRACT, DENIED);
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);
    expect(parsed.worldSegment).toBe('unknown');
    expect(parsed.schema).toBe('script-gov.audit.v1');
    expect(parsed.scriptId).toBe('test-script');
  });

  it('worldSegment is additive — no existing fields removed', () => {
    const event = audit.createAuditEvent(BASE_CONTRACT, DENIED) as Record<string, unknown>;
    const keys = Object.keys(event).sort();
    // All base fields MUST be present
    const required = ['schema', 'eventId', 'timestamp', 'scriptId', 'operation', 'risk',
      'mode', 'environment', 'phase', 'outcome', 'exitCode', 'validationIssues', 'auth', 'worldSegment'];
    for (const k of required) {
      expect(keys).toContain(k);
    }
  });

  it('auth object still has expected shape', () => {
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, operator: { operatorId: 'user-1', reason: 'test', ticket: 'T-1' } },
      DENIED,
    );
    expect(event.auth.operator).toBe('user-1');
    expect(event.auth.reason).toBe('test');
    expect(event.auth.ticket).toBe('T-1');
  });
});

// ═══════════════════════════════════════════
// 3. Denial path resilience
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-B] denial path resilience', () => {
  it('invalid worldSegment does not crash createAuditEvent', () => {
    expect(() => {
      audit.createAuditEvent(
        { ...BASE_CONTRACT, worldSegment: 'garbage-value' },
        DENIED,
      );
    }).not.toThrow();
  });

  it('null worldSegment does not crash', () => {
    expect(() => {
      audit.createAuditEvent(
        { ...BASE_CONTRACT, worldSegment: null as unknown as string },
        DENIED,
      );
    }).not.toThrow();
    const event = audit.createAuditEvent(
      { ...BASE_CONTRACT, worldSegment: null as unknown as string },
      DENIED,
    );
    expect(event.worldSegment).toBe('unknown');
  });

  it('undefined contract does not crash', () => {
    expect(() => {
      audit.createAuditEvent(undefined as unknown as Record<string, unknown>, DENIED);
    }).not.toThrow();
  });

  it('recordGovernanceDecision still works with worldSegment', () => {
    // Verify no crash (audit disabled to avoid writing files)
    const prev = process.env.SCRIPT_GOV_AUDIT_DISABLED;
    process.env.SCRIPT_GOV_AUDIT_DISABLED = '1';
    expect(() => {
      audit.recordGovernanceDecision(
        { ...BASE_CONTRACT, worldSegment: 'core' },
        DENIED,
      );
    }).not.toThrow();
    if (prev === undefined) {
      delete process.env.SCRIPT_GOV_AUDIT_DISABLED;
    } else {
      process.env.SCRIPT_GOV_AUDIT_DISABLED = prev;
    }
  });
});

// ═══════════════════════════════════════════
// 4. End-to-end: audit event appears in script denial
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-B] end-to-end audit event', () => {
  it('apply-migrations denial still writes audit event', () => {
    // Import existing smoke test pattern — run apply-migrations --apply
    // and verify the audit event contains worldSegment.
    // The script doesn't pass worldSegment → should default to 'unknown'.
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');
    const fs = require('node:fs');
    const os = require('node:os');

    const REPO = path.resolve(__dirname, '..', '..');
    const auditLog = path.join(os.tmpdir(), 'ws-b-e2e-' + Date.now() + '.jsonl');

    const r = spawnSync('node', ['scripts/apply-migrations.mjs', '--apply'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NODE_ENV: 'test', SCRIPT_GOV_AUDIT_LOG: auditLog },
    });

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('SCRIPT EXECUTION CONTRACT DENIED');

    // Read audit event
    const content = fs.readFileSync(auditLog, 'utf8').trim();
    expect(content.length).toBeGreaterThan(0);
    const parsed = JSON.parse(content);
    expect(parsed.worldSegment).toBe('unknown');
    expect(parsed.outcome).toBe('denied');

    // Cleanup
    try { fs.unlinkSync(auditLog); } catch {}
  });
});
