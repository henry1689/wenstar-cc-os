/**
 * run-uuid-backfill — UUID 归属全量回填 CLI (V13)
 * ============================================================
 * 对 fusion_memory.db 中 belong_entity_uuid IS NULL 的历史记录分类回填归属。
 *
 * 用法:
 *   npx tsx scripts/run-uuid-backfill.ts            # dry-run：只统计 + 展示垃圾清单
 *   npx tsx scripts/run-uuid-backfill.ts --execute  # 执行：备份 → 回填 → 落盘
 *
 * 规则（见 src/app/entity/UuidBackfillService.ts）：
 *   ① 垃圾 → DELETE   ② 对话组传导   ③ 显式人名匹配   ④ 户主玉瑶兜底
 *
 * 各表处理：
 *   - conversations:  ①-④ 全规则（数字 id）
 *   - memories:       source_conversation_ids 传导 → 人名匹配 → 户主兜底
 *   - black_diamond:  source_id 链（实测 0%）→ summary 人名匹配 → 户主兜底
 *   - dream_logs:     summary 人名匹配 → 户主兜底
 *   - knowledge_base: 跳过（保留公共知识语义，用户决策）
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGroupOwnershipMap,
  analyzeUnowned,
  classifyRecord,
} from '../src/app/entity/UuidBackfillService.js';
import { FamilyGraph } from '../src/m4/household/FamilyGraph.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const DB_PATH = join(ROOT, 'data', 'webui', 'fusion_memory.db');
const FG_PATH = join(ROOT, 'data', 'webui', 'knowledge', 'family_graph.db');
const EXECUTE = process.argv.includes('--execute');
const GARBAGE_PREVIEW = 15; // dry-run 展示前 N 条垃圾

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(DB_PATH));

// ── FG 人名读取器（显式匹配用） ──
const fg = new FamilyGraph(FG_PATH);
await fg.initialize();
const fgReader = {
  getAllPersonNames: () => {
    try { return fg.getAllPersonNames(); } catch { return []; }
  },
  getUUIDByName: (name: string) => {
    try { return fg.getUUIDByName(name); } catch { return null; }
  },
};

function printStats(label: string, stats: { total: number; byRule: Record<string, number>; garbageToDelete: number }) {
  const pct = (n: number) => stats.total ? `(${Math.round(n / stats.total * 100)}%)` : '';
  console.log(`\n[${label}] 无UUID ${stats.total} 条`);
  const order = ['group_conduct', 'explicit_mention', 'self_ref', 'owner_fallback', 'garbage'];
  for (const rule of order) {
    const n = stats.byRule[rule] || 0;
    if (n > 0) console.log(`  ${rule}: ${n} ${pct(n)}`);
  }
  if (stats.garbageToDelete > 0) console.log(`  🔴 垃圾待删除: ${stats.garbageToDelete} ${pct(stats.garbageToDelete)}`);
}

// ── Phase 1: conversations ──
console.log(`\n========== UUID 归属回填 ${EXECUTE ? '【执行】' : '【dry-run 预览】'} ==========`);
console.log(`库: ${DB_PATH}`);

// 1. 构建对话组归属映射（组内多数 UUID）
const groupRes = db.exec(
  `SELECT dialog_group_id, belong_entity_uuid, COUNT(*) c FROM conversations
   WHERE dialog_group_id IS NOT NULL AND dialog_group_id != ''
     AND belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''
   GROUP BY dialog_group_id, belong_entity_uuid`
)[0];
const groupMap = buildGroupOwnershipMap(
  (groupRes?.values || []).map(v => ({ dialog_group_id: String(v[0]), belong_entity_uuid: String(v[1]), c: Number(v[2]) }))
);
console.log(`对话组归属映射: ${groupMap.size} 个组`);

// 2. 扫描 conversations 无 UUID
const convRes = db.exec(
  `SELECT id, role, content, dialog_group_id, is_test, namespace
   FROM conversations WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''`
)[0];
const convRows = (convRes?.values || []).map(v => ({
  id: v[0] as number,
  role: v[1] as 'user' | 'assistant',
  content: (v[2] as string) ?? '',
  dialogGroupId: v[3] as string | null,
  isTest: v[4] as boolean | number,
  namespace: v[5] as string | null,
}));
const convAnalysis = analyzeUnowned(convRows, groupMap, fgReader);
printStats('conversations', convAnalysis.stats);

// 3. dry-run 垃圾预览
if (!EXECUTE && convAnalysis.stats.garbageToDelete > 0) {
  console.log(`\n  ── 垃圾预览(前 ${GARBAGE_PREVIEW} 条) ──`);
  let shown = 0;
  for (const r of convAnalysis.results) {
    if (r.decision.rule === 'garbage') {
      const row = convRows.find(x => x.id === r.id);
      console.log(`    DELETE id=${r.id}: ${String(row?.content ?? '').substring(0, 50)}`);
      if (++shown >= GARBAGE_PREVIEW) break;
    }
  }
}

// 4. 构建 conversation 归属映射（memories 传导用）
//    H2 修复：source_conversation_ids 存的是 seq_pos 而非 conversations.id，
//    必须用 seq_pos 建映射才能传导命中。
const convUuidById = new Map<string | number, string>();
for (const r of convAnalysis.results) {
  if (r.decision.uuid) convUuidById.set(r.id, r.decision.uuid);
}
const seqPosRes = db.exec(`SELECT id, seq_pos FROM conversations WHERE seq_pos IS NOT NULL`)[0];
const convUuidBySeq = new Map<number, string>();
for (const v of (seqPosRes?.values || [])) {
  const id = Number(v[0]);
  const seqPos = v[1] != null ? Number(v[1]) : null;
  if (seqPos != null && convUuidById.has(id)) convUuidBySeq.set(seqPos, convUuidById.get(id)!);
}

// ── Phase 2: memories ──
const memRes = db.exec(
  `SELECT id, raw_input, source_conversation_ids FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''`
)[0];
const memRows = (memRes?.values || []).map(v => ({
  id: v[0] as string,
  content: (v[1] as string) ?? '',
  sourceIds: (v[2] as string) ?? '[]',
}));
// 传导：source_conversation_ids 里第一个已归属 conversation
const memDecisions: Array<{ id: string; decision: any }> = [];
const memStats: Record<string, number> = { total: memRows.length, byRule: {}, garbageToDelete: 0 };
for (const row of memRows) {
  let decision;
  let conducted = false;
  try {
    const ids: number[] = JSON.parse(row.sourceIds || '[]');
    for (const cid of ids) {
      if (convUuidById.has(cid)) {
        decision = { rule: 'group_conduct', uuid: convUuidById.get(cid) };
        conducted = true;
        break;
      }
    }
  } catch { /* 忽略解析失败 */ }
  if (!conducted) {
    decision = classifyRecord(row.content, { role: 'user', fg: fgReader });
  }
  memDecisions.push({ id: row.id, decision });
  memStats.byRule[decision.rule] = (memStats.byRule[decision.rule] || 0) + 1;
  if (decision.rule === 'garbage') memStats.garbageToDelete++;
}
printStats('memories', memStats as any);

// ── Phase 3: black_diamond + dream_logs ──
for (const [label, sql] of [
  ['black_diamond', `SELECT id, summary FROM black_diamond WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''`],
  ['dream_logs', `SELECT id, summary FROM dream_logs WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''`],
] as const) {
  const res = db.exec(sql)[0];
  const rows = (res?.values || []).map(v => ({ id: v[0] as string, content: (v[1] as string) ?? '' }));
  const results = analyzeUnowned(rows, new Map(), fgReader);
  printStats(label, results.stats);
  // 供 execute 使用
  (globalThis as any).__phase3 = (globalThis as any).__phase3 || [];
  (globalThis as any).__phase3.push({ label, rows, results });
}

// ═══════════════════════════════════════════════
// EXECUTE
// ═══════════════════════════════════════════════
if (EXECUTE) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${DB_PATH}.backup-${stamp}`;
  copyFileSync(DB_PATH, backupPath);
  console.log(`\n✅ 已备份: ${backupPath}`);

  let updated = 0, deleted = 0;

  // conversations
  for (const r of convAnalysis.results) {
    if (r.decision.rule === 'garbage') { db.run('DELETE FROM conversations WHERE id = ?', [r.id]); deleted++; }
    else { db.run('UPDATE conversations SET belong_entity_uuid = ? WHERE id = ?', [r.decision.uuid, r.id]); updated++; }
  }

  // memories
  for (const r of memDecisions) {
    if (r.decision.rule === 'garbage') { db.run('DELETE FROM memories WHERE id = ?', [r.id]); deleted++; }
    else { db.run('UPDATE memories SET belong_entity_uuid = ? WHERE id = ?', [r.decision.uuid, r.id]); updated++; }
  }

  // black_diamond / dream_logs
  const phase3 = (globalThis as any).__phase3 || [];
  for (const p of phase3) {
    for (const r of p.results.results) {
      if (r.decision.rule === 'garbage') { db.run(`DELETE FROM ${p.label} WHERE id = ?`, [r.id]); deleted++; }
      else { db.run(`UPDATE ${p.label} SET belong_entity_uuid = ? WHERE id = ?`, [r.decision.uuid, r.id]); updated++; }
    }
  }

  // 落盘
  writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log(`✅ 回填完成: 更新 ${updated} 条, 删除垃圾 ${deleted} 条, 已落盘`);
} else {
  console.log(`\n⚠️ dry-run 预览完成。确认无误后运行: npx tsx scripts/run-uuid-backfill.ts --execute`);
}

db.close();
await fg.flushAll?.().catch(() => {});