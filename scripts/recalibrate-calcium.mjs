/**
 * recalibrate-calcium.mjs — 全量钙化重算
 * =========================================
 * 问题：V10.0 改了 M3_CONFIG 阈值（0.3/0.6/0.8 → 0.25/0.45/0.65），
 * 但 3060 条历史记忆的 calcium_level 是用旧阈值写入的，导致 97% 都是 L1。
 *
 * 此脚本：读每条记忆的 calcium_score，用新阈值重算 calcium_level，回写。
 *
 * 运行：node scripts/recalibrate-calcium.mjs
 */
import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'data/webui/fusion_memory.db');

// V10.0 当前阈值（与 M3Config.ts 一致）
const LEVEL0_MAX = 0.25;
const LEVEL1_MAX = 0.45;
const LEVEL2_MAX = 0.65;

function calcLevel(score) {
  if (score < LEVEL0_MAX) return 0;
  if (score < LEVEL1_MAX) return 1;
  if (score < LEVEL2_MAX) return 2;
  return 3;
}

function label(level) {
  return ['粉末','液体','固体','晶体'][level] || `未知(${level})`;
}

console.log('═'.repeat(60));
console.log('🧪 钙化重算工具 V10.1');
console.log(`   阈值: L0<${LEVEL0_MAX} L1<${LEVEL1_MAX} L2<${LEVEL2_MAX} L3≥${LEVEL2_MAX}`);
console.log('═'.repeat(60));

const db = new Database(DB_PATH);

// 1. 快照当前分布
console.log('\n📊 重算前分布:');
const before = db.prepare('SELECT calcium_level, COUNT(*) as c FROM memories GROUP BY calcium_level ORDER BY calcium_level').all();
for (const r of before) {
  console.log(`   L${r.calcium_level} (${label(r.calcium_level)}): ${String(r.c).padStart(5)} 条`);
}

// 2. 读取所有需要重算的记录
const rows = db.prepare('SELECT id, calcium_score, calcium_level FROM memories').all();
console.log(`\n📋 共 ${rows.length} 条记忆待重算`);

// 3. 逐条重算并收集统计
let changed = 0;
const migration = { '0→1': 0, '0→2': 0, '0→3': 0, '1→2': 0, '1→3': 0, '2→3': 0, other: 0 };

const updateStmt = db.prepare('UPDATE memories SET calcium_level = ? WHERE id = ?');

db.transaction(() => {
  for (const row of rows) {
    const newLevel = calcLevel(row.calcium_score);
    if (newLevel !== row.calcium_level) {
      updateStmt.run(newLevel, row.id);
      changed++;
      const key = `${row.calcium_level}→${newLevel}`;
      if (migration[key] !== undefined) migration[key]++;
      else migration.other++;
    }
  }
})();

// 4. 重算后分布
console.log('\n📊 重算后分布:');
const after = db.prepare('SELECT calcium_level, COUNT(*) as c FROM memories GROUP BY calcium_level ORDER BY calcium_level').all();
for (const r of after) {
  const beforeCount = before.find(b => b.calcium_level === r.calcium_level)?.c || 0;
  const delta = r.c - beforeCount;
  const sign = delta >= 0 ? '+' : '';
  console.log(`   L${r.calcium_level} (${label(r.calcium_level)}): ${String(r.c).padStart(5)} 条  (${sign}${delta})`);
}

// 5. 迁移详情
console.log('\n📋 等级迁移:');
console.log(`   变更总数: ${changed} / ${rows.length} (${(changed/rows.length*100).toFixed(1)}%)`);
for (const [k, v] of Object.entries(migration)) {
  if (v > 0) console.log(`   ${k}: ${v} 条`);
}

// 6. 验证钙化分分布
console.log('\n📈 钙化分分布:');
const ranges = [
  [0, 0.25], [0.25, 0.45], [0.45, 0.65], [0.65, 1.0],
];
for (const [lo, hi] of ranges) {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM memories WHERE calcium_score >= ? AND calcium_score < ?').get(lo, hi).c;
  const pct = (cnt / rows.length * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(cnt / rows.length * 50));
  console.log(`   [${lo.toFixed(2)}, ${hi.toFixed(2)}): ${String(cnt).padStart(5)} (${pct.padStart(5)}%) ${bar}`);
}

// 7. 特殊：L3 晶体详情
const crystals = db.prepare("SELECT id, raw_input, calcium_score, calcium_level FROM memories WHERE calcium_level = 3 ORDER BY calcium_score DESC LIMIT 10").all();
console.log(`\n💎 黑钻候选 (L3): ${crystals.length} 条`);
for (const c of crystals) {
  console.log(`   score=${c.calcium_score.toFixed(3)} | ${(c.raw_input || '').substring(0, 80)}`);
}

db.close();
console.log('\n✅ 重算完成。');
