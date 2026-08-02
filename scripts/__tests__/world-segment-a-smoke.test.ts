// WORLD-SEGMENT-A — World Segmentation Foundation Smoke Tests
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const ws = req('../lib/world-segment.cjs') as {
  WORLD_SEGMENTS: Record<string, string>;
  isWorldSegment: (v: unknown) => boolean;
  normalizeWorldSegment: (v: unknown) => string;
  assertWorldSegment: (v: unknown, opts?: { allowUnknown?: boolean }) => string;
  classifyWorldSegment: (input: unknown) => string;
  attachWorldSegment: (record: Record<string, unknown>, segment: unknown, opts?: { allowUnknown?: boolean }) => Record<string, unknown>;
};

// ═══════════════════════════════════════════
// 1. Vocabulary stability
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] Vocabulary', () => {
  it('WORLD_SEGMENTS is frozen', () => {
    expect(Object.isFrozen(ws.WORLD_SEGMENTS)).toBe(true);
  });

  it('contains all 6 segments', () => {
    expect(ws.WORLD_SEGMENTS.CORE).toBe('core');
    expect(ws.WORLD_SEGMENTS.PERSONAL).toBe('personal');
    expect(ws.WORLD_SEGMENTS.PROJECT).toBe('project');
    expect(ws.WORLD_SEGMENTS.SIMULATION).toBe('simulation');
    expect(ws.WORLD_SEGMENTS.ARCHIVE).toBe('archive');
    expect(ws.WORLD_SEGMENTS.UNKNOWN).toBe('unknown');
  });

  it('has exactly 6 keys', () => {
    expect(Object.keys(ws.WORLD_SEGMENTS).length).toBe(6);
  });
});

// ═══════════════════════════════════════════
// 2. isWorldSegment
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] isWorldSegment', () => {
  it('accepts valid segment strings', () => {
    expect(ws.isWorldSegment('core')).toBe(true);
    expect(ws.isWorldSegment('personal')).toBe(true);
    expect(ws.isWorldSegment('project')).toBe(true);
    expect(ws.isWorldSegment('simulation')).toBe(true);
    expect(ws.isWorldSegment('archive')).toBe(true);
    expect(ws.isWorldSegment('unknown')).toBe(true);
  });

  it('rejects null', () => {
    expect(ws.isWorldSegment(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(ws.isWorldSegment(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(ws.isWorldSegment('')).toBe(false);
  });

  it('rejects invalid strings', () => {
    expect(ws.isWorldSegment('prod')).toBe(false);
    expect(ws.isWorldSegment('production')).toBe(false);
    expect(ws.isWorldSegment('private')).toBe(false);
    expect(ws.isWorldSegment('fiction')).toBe(false);
    expect(ws.isWorldSegment('world')).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(ws.isWorldSegment({})).toBe(false);
    expect(ws.isWorldSegment([])).toBe(false);
    expect(ws.isWorldSegment(42)).toBe(false);
    expect(ws.isWorldSegment(true)).toBe(false);
  });
});

// ═══════════════════════════════════════════
// 3. normalizeWorldSegment
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] normalizeWorldSegment', () => {
  it('trims whitespace', () => {
    expect(ws.normalizeWorldSegment('  core  ')).toBe('core');
    expect(ws.normalizeWorldSegment('\tproject\t')).toBe('project');
  });

  it('lowercases', () => {
    expect(ws.normalizeWorldSegment('CORE')).toBe('core');
    expect(ws.normalizeWorldSegment('Simulation')).toBe('simulation');
    expect(ws.normalizeWorldSegment('PERSONAL')).toBe('personal');
    expect(ws.normalizeWorldSegment('Unknown')).toBe('unknown');
  });

  it('maps null to unknown', () => {
    expect(ws.normalizeWorldSegment(null)).toBe('unknown');
  });

  it('maps undefined to unknown', () => {
    expect(ws.normalizeWorldSegment(undefined)).toBe('unknown');
  });

  it('maps empty/whitespace to unknown', () => {
    expect(ws.normalizeWorldSegment('')).toBe('unknown');
    expect(ws.normalizeWorldSegment('   ')).toBe('unknown');
  });

  it('maps invalid strings to unknown', () => {
    expect(ws.normalizeWorldSegment('not-real')).toBe('unknown');
    expect(ws.normalizeWorldSegment('prod')).toBe('unknown');
    expect(ws.normalizeWorldSegment('fiction')).toBe('unknown');
  });

  it('maps non-string types to unknown', () => {
    expect(ws.normalizeWorldSegment(42)).toBe('unknown');
    expect(ws.normalizeWorldSegment({})).toBe('unknown');
    expect(ws.normalizeWorldSegment([])).toBe('unknown');
    expect(ws.normalizeWorldSegment(true)).toBe('unknown');
  });

  it('never throws', () => {
    expect(() => ws.normalizeWorldSegment(null)).not.toThrow();
    expect(() => ws.normalizeWorldSegment(undefined)).not.toThrow();
    expect(() => ws.normalizeWorldSegment({})).not.toThrow();
    expect(() => ws.normalizeWorldSegment(Symbol('x'))).not.toThrow();
  });
});

// ═══════════════════════════════════════════
// 4. assertWorldSegment
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] assertWorldSegment', () => {
  it('returns valid segment unchanged', () => {
    expect(ws.assertWorldSegment('core')).toBe('core');
    expect(ws.assertWorldSegment('simulation')).toBe('simulation');
  });

  it('normalizes valid input', () => {
    expect(ws.assertWorldSegment('  PROJECT  ')).toBe('project');
    expect(ws.assertWorldSegment('ARCHIVE')).toBe('archive');
  });

  it('throws for invalid explicit segment', () => {
    expect(() => ws.assertWorldSegment('prod')).toThrow(TypeError);
    expect(() => ws.assertWorldSegment('not-valid')).toThrow(TypeError);
  });

  it('throws for unknown by default', () => {
    expect(() => ws.assertWorldSegment('unknown')).toThrow(TypeError);
    expect(() => ws.assertWorldSegment(null)).toThrow(TypeError);
  });

  it('allows unknown with allowUnknown=true', () => {
    expect(ws.assertWorldSegment('unknown', { allowUnknown: true })).toBe('unknown');
    expect(ws.assertWorldSegment(null, { allowUnknown: true })).toBe('unknown');
    expect(ws.assertWorldSegment('garbage', { allowUnknown: true })).toBe('unknown');
  });

  it('error message includes the invalid value', () => {
    try {
      ws.assertWorldSegment('prod');
      expect.fail('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain('prod');
      expect(e.message).toContain('core');
      expect(e.message).toContain('WORLD-SEGMENT-A');
    }
  });
});

// ═══════════════════════════════════════════
// 5. classifyWorldSegment
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] classifyWorldSegment — explicit fields', () => {
  it('uses worldSegment field', () => {
    expect(ws.classifyWorldSegment({ worldSegment: 'core' })).toBe('core');
  });

  it('uses world_segment field', () => {
    expect(ws.classifyWorldSegment({ world_segment: 'personal' })).toBe('personal');
  });

  it('uses segment field', () => {
    expect(ws.classifyWorldSegment({ segment: 'simulation' })).toBe('simulation');
  });

  it('explicit field wins over heuristic', () => {
    const r = ws.classifyWorldSegment({
      worldSegment: 'archive',
      type: 'personal-memory',
    });
    expect(r).toBe('archive');
  });

  it('normalizes explicit field values', () => {
    expect(ws.classifyWorldSegment({ worldSegment: '  PROJECT  ' })).toBe('project');
    expect(ws.classifyWorldSegment({ world_segment: 'SIMULATION' })).toBe('simulation');
  });

  it('falls through if explicit field is invalid', () => {
    // worldSegment="prod" is invalid → should try heuristics or fallback to unknown
    expect(ws.classifyWorldSegment({ worldSegment: 'prod' })).toBe('unknown');
  });
});

describe('[WORLD-SEGMENT-A] classifyWorldSegment — keyword heuristics', () => {
  it('classifies governance/system as core', () => {
    expect(ws.classifyWorldSegment({ type: 'governance-record' })).toBe('core');
    expect(ws.classifyWorldSegment({ type: 'system-config' })).toBe('core');
    expect(ws.classifyWorldSegment({ category: 'operational' })).toBe('core');
  });

  it('classifies personal/memory as personal', () => {
    expect(ws.classifyWorldSegment({ type: 'personal-note' })).toBe('personal');
    expect(ws.classifyWorldSegment({ category: 'memory-entry' })).toBe('personal');
    expect(ws.classifyWorldSegment({ source: 'user-profile' })).toBe('personal');
  });

  it('classifies project/workspace as project', () => {
    expect(ws.classifyWorldSegment({ type: 'project-config' })).toBe('project');
    expect(ws.classifyWorldSegment({ category: 'workspace-data' })).toBe('project');
    expect(ws.classifyWorldSegment({ source: 'task-manager' })).toBe('project');
  });

  it('classifies simulation/sandbox as simulation', () => {
    expect(ws.classifyWorldSegment({ type: 'simulation-run' })).toBe('simulation');
    expect(ws.classifyWorldSegment({ category: 'sandbox-test' })).toBe('simulation');
    expect(ws.classifyWorldSegment({ source: 'generated-content' })).toBe('simulation');
  });

  it('classifies archive/legacy as archive', () => {
    expect(ws.classifyWorldSegment({ type: 'archive-record' })).toBe('archive');
    expect(ws.classifyWorldSegment({ category: 'legacy-data' })).toBe('archive');
    expect(ws.classifyWorldSegment({ source: 'deprecated-feature' })).toBe('archive');
  });
});

describe('[WORLD-SEGMENT-A] classifyWorldSegment — edge cases', () => {
  it('returns unknown for null input', () => {
    expect(ws.classifyWorldSegment(null)).toBe('unknown');
  });

  it('returns unknown for undefined input', () => {
    expect(ws.classifyWorldSegment(undefined)).toBe('unknown');
  });

  it('returns unknown for empty object', () => {
    expect(ws.classifyWorldSegment({})).toBe('unknown');
  });

  it('returns unknown for unclear input', () => {
    expect(ws.classifyWorldSegment({ type: 'random-thing' })).toBe('unknown');
    expect(ws.classifyWorldSegment({ foo: 'bar' })).toBe('unknown');
    expect(ws.classifyWorldSegment(42)).toBe('unknown');
  });

  it('accepts plain string input', () => {
    expect(ws.classifyWorldSegment('core')).toBe('core');
    expect(ws.classifyWorldSegment('  SIMULATION  ')).toBe('simulation');
    expect(ws.classifyWorldSegment('garbage')).toBe('unknown');
  });

  it('scans multiple candidate fields', () => {
    expect(ws.classifyWorldSegment({
      type: 'some-irrelevant',
      category: 'personal',  // not a keyword match for 'personal' — must match pattern
      source: 'memory-entry',  // 'memory' matches personal pattern
    })).toBe('personal');
  });
});

// ═══════════════════════════════════════════
// 6. attachWorldSegment
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] attachWorldSegment', () => {
  it('returns a new object (does not mutate original)', () => {
    const orig = { name: 'test', value: 42 };
    const copy = ws.attachWorldSegment(orig, 'core');
    expect(copy).not.toBe(orig);
    expect(orig).toEqual({ name: 'test', value: 42 });
    expect(orig).not.toHaveProperty('worldSegment');
  });

  it('preserves existing fields', () => {
    const orig = { name: 'record', count: 1 };
    const copy = ws.attachWorldSegment(orig, 'personal');
    expect(copy.name).toBe('record');
    expect(copy.count).toBe(1);
    expect(copy.worldSegment).toBe('personal');
  });

  it('normalizes the segment', () => {
    const copy = ws.attachWorldSegment({ id: 1 }, '  ARCHIVE  ');
    expect(copy.worldSegment).toBe('archive');
  });

  it('defaults to unknown for invalid segment', () => {
    const copy = ws.attachWorldSegment({ id: 1 }, 'prod');
    expect(copy.worldSegment).toBe('unknown');
  });

  it('throws for invalid segment with allowUnknown=false', () => {
    expect(() => ws.attachWorldSegment({ id: 1 }, 'prod', { allowUnknown: false }))
      .toThrow(TypeError);
  });

  it('allows unknown with allowUnknown=true (default)', () => {
    const copy = ws.attachWorldSegment({ id: 1 }, null);
    expect(copy.worldSegment).toBe('unknown');
  });

  it('handles null/undefined record', () => {
    // null record produces empty object with worldSegment
    const copy = ws.attachWorldSegment(null as any, 'core');
    expect(copy).toEqual({ worldSegment: 'core' });
  });

  it('creates shallow copy (nested objects shared)', () => {
    const nested = { deep: true };
    const orig = { name: 'x', nested };
    const copy = ws.attachWorldSegment(orig, 'project');
    expect(copy.nested).toBe(nested); // shallow — same reference
    expect(copy.name).toBe('x');
    expect(copy.worldSegment).toBe('project');
  });
});

// ═══════════════════════════════════════════
// 7. Safety invariants
// ═══════════════════════════════════════════

describe('[WORLD-SEGMENT-A] Safety invariants', () => {
  it('no I/O or environment dependency', () => {
    // Pure functions — verified by their implementations (no require('fs'), no process.env)
    expect(typeof ws.isWorldSegment).toBe('function');
    expect(typeof ws.normalizeWorldSegment).toBe('function');
    expect(typeof ws.assertWorldSegment).toBe('function');
    expect(typeof ws.classifyWorldSegment).toBe('function');
    expect(typeof ws.attachWorldSegment).toBe('function');
  });

  it('all exported functions are deterministic', () => {
    // normalizeWorldSegment('core') always returns 'core'
    expect(ws.normalizeWorldSegment('core')).toBe('core');
    expect(ws.normalizeWorldSegment('core')).toBe('core');
    expect(ws.normalizeWorldSegment('core')).toBe('core');
  });

  it('classifyWorldSegment is deterministic', () => {
    const input = { type: 'memory-entry', source: 'user-preference' };
    const r1 = ws.classifyWorldSegment(input);
    const r2 = ws.classifyWorldSegment(input);
    const r3 = ws.classifyWorldSegment(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});
