import Database from 'better-sqlite3';
import { join } from 'path';
const db = new Database(join(process.cwd(), 'data/webui/fusion_memory.db'));
console.log('🔧 黑钻 emotion_vector 重建 V2');
const joinRows = db.prepare(`
  SELECT bd.id as bd_id, bd.source_id, m.perception_json
  FROM black_diamond bd
  INNER JOIN memories m ON bd.source_id = m.id
  WHERE bd.source_id IS NOT NULL AND m.perception_json IS NOT NULL
`).all();
console.log('可关联: ' + joinRows.length + ' 条');
let rebuilt = 0, skipped = 0;
const updateStmt = db.prepare('UPDATE black_diamond SET emotion_vector = ?, l2_norm = ? WHERE id = ?');
for (const row of joinRows) {
  try {
    const arr = JSON.parse(row.perception_json);
    if (!Array.isArray(arr) || arr.length < 24) { skipped++; continue; }
    const vec = arr.slice(0, 24).map(function(v) { return Number(v) || 0; });
    if (vec.every(function(v) { return v === 0; })) { skipped++; continue; }
    let sumSq = 0;
    for (let i = 0; i < 24; i++) sumSq += vec[i] * vec[i];
    const l2norm = Math.round(Math.sqrt(sumSq) * 10000) / 10000;
    updateStmt.run(JSON.stringify(vec), l2norm, row.bd_id);
    rebuilt++;
  } catch { skipped++; }
}
console.log('重建: ' + rebuilt + ' | 跳过: ' + skipped);
const dist = db.prepare("SELECT CASE WHEN emotion_vector IS NULL THEN -1 WHEN l2_norm IS NULL OR l2_norm=0 THEN 0 WHEN l2_norm<1 THEN 1 ELSE 2 END as bucket, COUNT(*) as c FROM black_diamond GROUP BY bucket").all();
const nullC = dist.find(function(d) { return d.bucket === -1; });
const zeroC = dist.find(function(d) { return d.bucket === 0; });
const lowC = dist.find(function(d) { return d.bucket === 1; });
const highC = dist.find(function(d) { return d.bucket === 2; });
console.log('分布: NULL=' + (nullC?nullC.c:0) + ' zero=' + (zeroC?zeroC.c:0) + ' <1=' + (lowC?lowC.c:0) + ' >=1=' + (highC?highC.c:0));
db.close();
