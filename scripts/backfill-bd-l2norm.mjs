import Database from 'better-sqlite3';
import { join } from 'path';
const DB_PATH = join(process.cwd(), 'data/webui/fusion_memory.db');
console.log('🔧 黑钻 l2_norm 回填');
const db = new Database(DB_PATH);
const nullCount = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE l2_norm IS NULL').get().c;
const total = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
console.log(`总数:${total} NULL:${nullCount}`);
if (nullCount === 0) { console.log('无需回填'); db.close(); process.exit(0); }
const rows = db.prepare('SELECT id, emotion_vector FROM black_diamond WHERE l2_norm IS NULL AND emotion_vector IS NOT NULL').all();
console.log(`待处理: ${rows.length}`);
let updated=0, skipped=0;
const stmt = db.prepare('UPDATE black_diamond SET l2_norm = ? WHERE id = ?');
db.transaction(() => {
  for (const row of rows) {
    try {
      const vec = JSON.parse(row.emotion_vector);
      if (!Array.isArray(vec) || vec.length===0) { skipped++; continue; }
      let sumSq=0;
      for (let i=0;i<vec.length;i++) { const v=Number(vec[i])||0; sumSq+=v*v; }
      const norm = Math.round(Math.sqrt(sumSq)*10000)/10000;
      stmt.run(norm, row.id);
      updated++;
    } catch { skipped++; }
  }
})();
console.log(`完成: ${updated}更新 ${skipped}跳过`);
const stillNull = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE l2_norm IS NULL').get().c;
console.log(`剩余NULL: ${stillNull}`);
db.close();
