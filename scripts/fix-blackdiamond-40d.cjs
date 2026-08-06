/**
 * fix-blackdiamond-40d.cjs — 修复 black_diamond.emotion_vector 为 40D（V21）
 * =============================================================
 * 背景：black_diamond.emotion_vector 被误存为时间戳（非向量）。
 * 动作：所有非 40D 数组的值 → 写 40D 默认数组（14 维从 summary 语义派生困难，先置 0 占位）。
 *
 * 🔴 停服运行：直接写 fusion_memory.db，需服务停止时执行。
 * 服务重启时 sql.js 加载磁盘（含修复）→ flush 持久。
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const FM_PATH = path.join(__dirname, '..', 'data/webui/fusion_memory.db');

function main() {
  console.log('=== black_diamond emotion_vector 40D 修复开始 ===');
  const db = new Database(FM_PATH);

  const rows = db.prepare('SELECT id, emotion_vector FROM black_diamond').all();
  let updated = 0, skipped = 0;
  const upd = db.prepare('UPDATE black_diamond SET emotion_vector = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const r of rows) {
      try {
        const v = JSON.parse(r.emotion_vector);
        if (Array.isArray(v) && v.length === 40) { skipped++; continue; } // 已是 40D
      } catch { /* 非 JSON（时间戳）→ 需修复 */ }
      upd.run(JSON.stringify(new Array(40).fill(0)), r.id);
      updated++;
    }
  });
  tx();

  const total = db.prepare('SELECT COUNT(*) c FROM black_diamond').get().c;
  const fixed = db.prepare("SELECT COUNT(*) c FROM black_diamond WHERE emotion_vector LIKE '[%'").get().c;
  console.log(`✅ 修复完成: 总数 ${total} | 已修复 ${updated} | 已跳过(40D) ${skipped} | 40D 数组 ${fixed}`);
  db.close();
  console.log('=== 修复结束 ===');
}

main();
