// META-GOV-A — Harness Diff Guard Smoke Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const req = createRequire(import.meta.url);

// Load the guard module for pure-function testing
const guard = req('../check-harness-diff.cjs') as {
  checkDiff: (opts?: { strict?: boolean }) => {
    exitCode: number;
    decision: string;
    files?: string[];
    categorized?: { forbidden: string[]; protected: string[]; allowed: string[] };
    deletions?: string[];
  };
  categorize: (files: string[]) => { forbidden: string[]; protected: string[]; allowed: string[] };
  FORBIDDEN_PATTERNS: string[];
  PROTECTED_PATTERNS: string[];
  PROTECTED_SCRIPTS: string[];
  PROTECTED_SMOKE_TESTS: string[];
  PROTECTED_DOCS: string[];
  META_GOV_A_ALLOWED: string[];
};

function runGuard(files: string[], strict = false): { status: number; stdout: string } {
  const joined = files.join('\n');
  const args = strict ? ['--strict'] : [];
  const r = spawnSync('node',
    [path.join(REPO, 'scripts', 'check-harness-diff.cjs'), ...args],
    {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, META_GOV_CHANGED_FILES: joined, NODE_ENV: 'test' },
    }
  );
  return { status: r.status || 0, stdout: (r.stdout || '') + (r.stderr || '') };
}

// ═══════════════════════════════════════════
// Test 1 — Pure function: categorize()
// ═══════════════════════════════════════════

describe('[META-GOV-A] categorize() pure function', () => {
  it('allowed meta-gov files are classified correctly', () => {
    // check-harness-diff.cjs matches scripts/*.cjs → PROTECTED
    // META-GOV-A.md is in no protected list → ALLOWED
    const r = guard.categorize([
      'scripts/check-harness-diff.cjs',
      'docs/governance/META-GOV-A.md',
    ]);
    expect(r.forbidden).toHaveLength(0);
    expect(r.protected).toHaveLength(1);
    expect(r.protected[0]).toBe('scripts/check-harness-diff.cjs');
    expect(r.allowed).toHaveLength(1);
    expect(r.allowed[0]).toBe('docs/governance/META-GOV-A.md');
  });

  it('src/ changes are forbidden', () => {
    const r = guard.categorize(['src/foo/bar.ts']);
    expect(r.forbidden).toHaveLength(1);
    expect(r.forbidden[0]).toBe('src/foo/bar.ts');
  });

  it('package.json change is forbidden', () => {
    const r = guard.categorize(['package.json']);
    expect(r.forbidden).toHaveLength(1);
  });

  it('.db file change is forbidden', () => {
    const r = guard.categorize(['data/webui/fusion_memory.db']);
    expect(r.forbidden).toHaveLength(1);
  });

  it('.sqlite3 file change is forbidden', () => {
    const r = guard.categorize(['some/dir/data.sqlite3']);
    expect(r.forbidden).toHaveLength(1);
  });

  it('audit.jsonl file is forbidden', () => {
    // Pattern: **/*audit*.jsonl — matches filenames containing "audit"
    const r = guard.categorize(['.var/log/script-governance-audit.jsonl']);
    expect(r.forbidden).toHaveLength(1);
  });

  it('governance core scripts are protected', () => {
    const r = guard.categorize(['scripts/_governance-gate.cjs']);
    expect(r.forbidden).toHaveLength(0);
    expect(r.protected).toHaveLength(1);
  });

  it('governed scripts match protected pattern', () => {
    const r = guard.categorize(['scripts/safe-backfill.cjs']);
    expect(r.forbidden).toHaveLength(0);
    expect(r.protected).toHaveLength(1);
  });

  it('smoke test files are protected', () => {
    const r = guard.categorize([
      'scripts/__tests__/script-gov-a2c-smoke.test.ts',
      'scripts/__tests__/script-gov-b-audit-smoke.test.ts',
    ]);
    expect(r.forbidden).toHaveLength(0);
    expect(r.protected).toHaveLength(2);
  });

  it('governance docs are protected', () => {
    const r = guard.categorize(['docs/governance/GOVERNANCE-LEDGER.md']);
    expect(r.forbidden).toHaveLength(0);
    expect(r.protected).toHaveLength(1);
  });

  it('mixed: forbidden + protected + allowed', () => {
    const r = guard.categorize([
      'src/bad.ts',
      'scripts/_governance-gate.cjs',
      'scripts/safe-backfill.cjs',
      'docs/governance/META-GOV-A.md',
      'README.md',
    ]);
    expect(r.forbidden).toHaveLength(1);
    expect(r.forbidden[0]).toBe('src/bad.ts');
    expect(r.protected).toHaveLength(2);
    expect(r.allowed).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════
// Test 2 — Guard CLI behavior
// ═══════════════════════════════════════════

describe('[META-GOV-A] Guard CLI (META_GOV_CHANGED_FILES env)', () => {
  it('allowed files → exit 0 (PASS_SAFE_DIFF)', () => {
    // Use files that are in no protected/forbidden list
    const r = runGuard(['docs/governance/META-GOV-A.md', 'README.md']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS_SAFE_DIFF');
  });

  it('no changes → exit 0', () => {
    const r = runGuard([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS_NO_CHANGES');
  });

  it('forbidden file → exit 1', () => {
    const r = runGuard(['src/foo.ts']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FAIL_FORBIDDEN_CHANGE');
    expect(r.stdout).toContain('🔴');
  });

  it('protected file (non-strict) → exit 0 with warning', () => {
    const r = runGuard(['scripts/_governance-gate.cjs']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS_WITH_PROTECTED_REVIEW');
    expect(r.stdout).toContain('⚠️');
  });

  it('protected file (strict) → exit 1', () => {
    const r = runGuard(['scripts/_governance-gate.cjs'], true);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FAIL_PROTECTED_CHANGE_STRICT');
  });

  it('strict + META_GOV_ALLOW_PROTECTED=1 → exit 0', () => {
    const r = spawnSync('node',
      [path.join(REPO, 'scripts', 'check-harness-diff.cjs'), '--strict'],
      {
        cwd: REPO,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          META_GOV_CHANGED_FILES: 'scripts/_governance-gate.cjs',
          META_GOV_ALLOW_PROTECTED: '1',
          NODE_ENV: 'test',
        },
      }
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/PASS_(WITH_PROTECTED_REVIEW|SAFE_DIFF)/);
  });

  it('package-lock.json → exit 1', () => {
    const r = runGuard(['package-lock.json']);
    expect(r.status).toBe(1);
  });
});

// ═══════════════════════════════════════════
// Test 3 — Configuration integrity
// ═══════════════════════════════════════════

describe('[META-GOV-A] Configuration integrity', () => {
  it('FORBIDDEN_PATTERNS includes critical paths', () => {
    expect(guard.FORBIDDEN_PATTERNS).toContain('src/**');
    expect(guard.FORBIDDEN_PATTERNS).toContain('package.json');
    expect(guard.FORBIDDEN_PATTERNS).toContain('**/*.db');
  });

  it('PROTECTED_PATTERNS covers governed scripts', () => {
    expect(guard.PROTECTED_PATTERNS).toContain('scripts/*.cjs');
    expect(guard.PROTECTED_PATTERNS).toContain('scripts/*.mjs');
  });

  it('PROTECTED_SCRIPTS covers governance core', () => {
    expect(guard.PROTECTED_SCRIPTS).toContain('scripts/_governance-gate.cjs');
    expect(guard.PROTECTED_SCRIPTS).toContain('scripts/_governance-audit.cjs');
  });

  it('PROTECTED_SMOKE_TESTS covers all 5 test suites', () => {
    expect(guard.PROTECTED_SMOKE_TESTS.length).toBeGreaterThanOrEqual(5);
    expect(guard.PROTECTED_SMOKE_TESTS).toContain('scripts/__tests__/script-gov-a2c-smoke.test.ts');
    expect(guard.PROTECTED_SMOKE_TESTS).toContain('scripts/__tests__/script-gov-a2d-batch-1-smoke.test.ts');
    expect(guard.PROTECTED_SMOKE_TESTS).toContain('scripts/__tests__/script-gov-a2d-batch-2-smoke.test.ts');
    expect(guard.PROTECTED_SMOKE_TESTS).toContain('scripts/__tests__/script-gov-b-audit-smoke.test.ts');
    expect(guard.PROTECTED_SMOKE_TESTS).toContain('scripts/__tests__/script-gov-c-db-isolation-smoke.test.ts');
  });

  it('META_GOV_A_ALLOWED documents this task scope', () => {
    expect(guard.META_GOV_A_ALLOWED).toContain('scripts/check-harness-diff.cjs');
    expect(guard.META_GOV_A_ALLOWED).toContain('docs/governance/META-GOV-A.md');
  });
});
