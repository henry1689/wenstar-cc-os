# Agent CNC Governance Harness

A task-scoped governance and audit harness for controlled Agent-driven repository work.

Built to mature the harness before supporting a clean GitHub release path for Wenstar OS.

---

## Current Status

| Metric | Value |
|:---|:---|
| Governance modules accepted | **36** |
| Pending-review entries | **0** |
| Test baseline | **270/270 PASS** |
| Latest accepted task | HARNESS-QUICKSTART-A |
| Mission charter | GOVERNANCE-MISSION.md |

---

## What the Harness Provides

| Capability | Status | Description |
|:---|:---|:---|
| Governance ledger | ✅ | 36 modules tracked with full history and acceptance status |
| Task-scoped review | ✅ | Two-tier model (workspace-wide + task-scoped diff guard) |
| Meta-governance guard | ✅ | `check-harness-diff.cjs` — forbidden/protected pattern detection |
| Script gate | ✅ | 37/37 scripts governed: default dry-run, DENIED = exit 2 |
| Audit events | ✅ | JSONL audit log for all 37 script denial paths |
| DB test isolation | ✅ | Temp SQLite fixtures with production-path guards |
| World-segment vocabulary | ✅ | 6 segments (core/personal/project/simulation/archive/unknown) |
| World-aware audit | ✅ | `worldSegment` metadata in audit JSONL events |
| `--world` CLI flag | ✅ | Single-script pilot on `apply-migrations.mjs` |
| Mission charter | ✅ | 22 hard invariants, drift detection signals, recovery steps |

---

## Quickstart Commands

### Run All Tests

```bash
npm test
```

### Run a Specific Test Suite

```bash
npx vitest run scripts/__tests__/world-segment-c2-cli-smoke.test.ts
npx vitest run scripts/__tests__/script-gov-a2d-batch-2-smoke.test.ts
```

### Verify a Script's Governance Gate

```bash
# Denial check — no metadata, must exit 2
node scripts/apply-migrations.mjs --apply

# World-segment audit tag
node scripts/apply-migrations.mjs --apply --world simulation

# Self-check
node --check scripts/apply-migrations.mjs
```

### Meta-Governance Diff Guard

```bash
# Check current workspace diff against forbidden/protected rules
node scripts/check-harness-diff.cjs

# Task-scoped check (isolate only your files)
META_GOV_CHANGED_FILES="README.md
docs/governance/QUICKSTART.md
docs/governance/GOVERNANCE-LEDGER.md" node scripts/check-harness-diff.cjs

# Strict mode with protected-file allow
META_GOV_CHANGED_FILES="README.md
docs/governance/QUICKSTART.md
docs/governance/GOVERNANCE-LEDGER.md" META_GOV_ALLOW_PROTECTED=1 node scripts/check-harness-diff.cjs --strict
```

---

## Safety Model

| Principle | Enforcement |
|:---|:---|
| **Default-deny** | Scripts without `--apply` are dry-run only |
| **Dry-run first** | All governed scripts default to scan-not-write |
| **Metadata required** | `--apply` needs `--operator`, `--reason`, `--ticket`, `--scope`, `--confirm` |
| **Exit 2 on denial** | `SCRIPT戈CONTRACT DENIED` banner + validation issues printed |
| **Audit every denial** | JSONL audit event written before exit |
| **worldSegment is metadata only** | `--world <segment>` is a classification tag — does not affect allow/deny |
| **No DB on denial** | Denied scripts never touch DB or create backups |

---

## Governance Structure

```
docs/governance/
  GOVERNANCE-MISSION.md      — Mission charter with 22 hard invariants
  GOVERNANCE-LEDGER.md       — Full module ledger with acceptance status
  QUICKSTART.md              — Governance bootstrap guide
  META-GOV-A.md / META-GOV-A1.md — Harness self-modification guard + dirty-baseline protocol
  WORLD-SEGMENT-A.md / B.md / C1.md / C2.md — World segmentation foundation
  SCRIPT-GOV-A2d-*.md        — Script governance rollout documentation

scripts/
  check-harness-diff.cjs     — META-GOV-A diff guard
  _governance-gate.cjs       — Contract validator (DENY-BY-DEFAULT)
  _governance-audit.cjs      — Audit event creation + JSONL sink
  lib/world-segment.cjs      — Pure world-segment classification helpers

scripts/__tests__/
  10 smoke test suites covering all governance dimensions
```

---

## Repository Maturity

**Honest assessment of current gaps:**

| Gap | Status |
|:---|:---|
| LICENSE | Not yet added |
| CI configuration | Not yet configured |
| Public/private boundary audit | Not yet complete |
| Wenstar OS clean-path release | Not started |
| CHANGELOG / release notes | Not yet created |
| Contributing guide | Not yet created |

---

## Deferred Tracks

The following tracks are chartered but deferred until explicitly authorized:

- **WORLD-SEGMENT-C3** — `--world` batch rollout to remaining 36 scripts
- **WUID-A2–A7** — Global UID backfill governance
- **Receipt v1 / Policy v1 Lite** — Not chartered
- **Phase B** — DDL atomic write, DAG symmetry fixes

---

## License

Pending.
