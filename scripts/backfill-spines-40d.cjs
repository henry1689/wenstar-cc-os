/**
 * backfill-spines-40d.cjs — 双螺旋 state_spines 40D 补齐脚本（V21）
 * =============================================================
 * 为存量 state_spines 补齐 25-40 维（当前只有 24 维）。
 *
 * 背景：
 *   - 40D 已作为统一维度系统，state_spines 仍为 24D（dimension_id 1-24）
 *   - 需补齐 25-40 维，使双螺旋底座与 40D 对齐
 *   - 补齐方式：D25-D40 值 = 0 占位（待瑶光/瑶灵数据源），或从 memories.perception_40d 对应维度派生
 *
 * 🔴 停服运行：直接写 fusion_memory.db，需服务停止时执行（防 sql.js 并发覆写）
 * 零 token：纯本地计算。可重复执行（幂等）。
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const FM_PATH = path.join(BASE, 'data/webui/fusion_memory.db');

/** 待补齐维度 25-40 */
const NEW_DIMS = Array.from({ length: 16 }, (_, i) => i + 25);

function main() {
  console.log('=== 双螺旋 state_spines 40D 补齐开始 ===');
  const db = new Database(FM_PATH);

  // 确认 state_spines 表 + dimension_id 列
  const cols = db.prepare('PRAGMA table_info(state_spines)').all().map(c => c.name);
  if (!cols.includes('dimension_id')) {
    console.error('❌ state_spines 无 dimension_id 列');
    db.close();
    return;
  }

  // 读取所有 UID（已有 24 维的）
  const uids = db.prepare(
    'SELECT DISTINCT global_uid FROM state_spines WHERE dimension_id IN (1,2,3)'
  ).all().map(r => r.global_uid);

  // 读取每个 UID 的现有维度（避免重复插入）
  const existingDims = new Map();
  const rows = db.prepare('SELECT global_uid, dimension_id FROM state_spines').all();
  for (const r of rows) {
    if (!existingDims.has(r.global_uid)) existingDims.set(r.global_uid, new Set());
    existingDims.get(r.global_uid).add(r.dimension_id);
  }

  let inserted = 0, skipped = 0;
  const ins = db.prepare(
    `INSERT OR REPLACE INTO state_spines (global_uid, dimension_id, value, consistency_mark, location_fingerprint, timestamp_ms, checksum)
     VALUES (?, ?, 0, 'consistent', 'backfill_40d', ?, '')`
  );

  const tx = db.transaction(() => {
    for (const uid of uids) {
      const have = existingDims.get(uid) || new Set();
      for (const d of NEW_DIMS) {
        if (have.has(d)) { skipped++; continue; }
        ins.run(uid, d, Date.now());
        inserted++;
      }
    }
  });
  tx();

  // 完整性校验
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity && integrity.integrity_check !== 'ok') {
    console.error('❌ DB 完整性校验失败:', JSON.stringify(integrity));
    process.exitCode = 1;
    db.close();
    return;
  }

  const total = db.prepare('SELECT COUNT(*) c FROM state_spines').get().c;
  const maxDim = db.prepare('SELECT MAX(dimension_id) m FROM state_spines').get().m;

  console.log(`✅ 补齐完成:`);
  console.log(`  新增: ${inserted} 行`);
  console.log(`  跳过（已存在）: ${skipped} 行`);
  console.log(`  state_spines 总行: ${total}`);
  console.log(`  最大维度: ${maxDim}（应为 40）`);

  db.close();
  console.log('=== 补齐结束 ===');
}

main();
