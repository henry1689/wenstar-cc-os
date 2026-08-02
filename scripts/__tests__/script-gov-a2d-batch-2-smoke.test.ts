// SCRIPT-GOV-A2d-batch-2 — 12 integrated script refusal smoke tests
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const REPO = path.resolve(import.meta.dirname, '..', '..');
function run(args: string[]) { return spawnSync('node', args, { cwd: REPO, encoding: 'utf8', timeout: 15000, env: { ...process.env, NODE_ENV: 'test' } }); }

// 回填 (1)
const BF = [['backfill-blackdiamond-vectors.cjs', 'CRITICAL', 'backfill']];
// 更新 (8)
const UP = ['update-wangquanfen','update-xiongziming','update-xushiyu-fd','update-all-polish','update-all-intimate','update-shiyun-full','update-wangquanfen-full','update-xsy-family-full'].map(s => [s+'.cjs', 'CRITICAL', 'update']);
// 增强 (1)
const EN = [['enrich-fg-profiles.cjs', 'CRITICAL', 'update']];
// 清理 (1)
const CL = [['cleanup-knowledge-contam.cjs', 'CRITICAL', 'clean']];
// 种子 (1)
const SD = [['seed-social.cjs', 'CRITICAL', 'sync']];

// 无 main() 脚本 (4) — 包装在 main() 中
const NM = [['backfill-memory-labels.cjs','CRITICAL','backfill'],['purge-unlabeled.cjs','CRITICAL','clean'],['rebuild-bd-vectors.mjs','CRITICAL','backfill'],['recalibrate-calcium.mjs','CRITICAL','update']];

// DDL/顶层 I/O (2) — Phase A 标准门控
const AM = [['apply-migrations.mjs','CRITICAL','migrate']];
const BD = [['build-dag-edges.mjs','CRITICAL','update']];

const ALL = [...BF, ...UP, ...EN, ...CL, ...SD, ...NM, ...AM, ...BD];

describe('[A2d-Batch-2] 12 脚本: --apply 无元数据 → exit 2 + DENIED', () => {
  for (const [script, risk, op] of ALL) {
    it(`${script}: --apply → exit 2 + DENIED`, () => {
      const r = run([`scripts/${script}`, '--apply']);
      expect(r.status, `${script}: got ${r.status}, expected 2`).toBe(2);
      expect(r.stderr + r.stdout).toContain('SCRIPT EXECUTION CONTRACT DENIED');
    });
  }
});

describe('[A2d-Batch-2] 部分元数据仍被拒绝', () => {
  it('update-xiongziming: --apply --operator X → exit 2 (缺 reason/ticket/scope/confirm)', () => {
    const r = run(['scripts/update-xiongziming.cjs', '--apply', '--operator', 'TXS-000000001']);
    expect(r.status).toBe(2);
  });
  it('cleanup-knowledge-contam: --apply --operator X --reason test → exit 2 (缺 ticket/scope/confirm)', () => {
    const r = run(['scripts/cleanup-knowledge-contam.cjs', '--apply', '--operator', 'TXS-000000001', '--reason', 'test']);
    expect(r.status).toBe(2);
  });
});

describe('[A2d-Batch-2] --help works', () => {
  for (const [script] of ALL) {
    it(`${script}: --help → exit 0`, () => {
      const r = run([`scripts/${script}`, '--help']);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Usage');
    });
  }
});
