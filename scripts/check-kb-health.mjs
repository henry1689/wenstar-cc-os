import Database from 'better-sqlite3';
const db = new Database('data/webui/fusion_memory.db', {readonly: true});

console.log('=== 1. 字段 ===');
const cols = db.prepare('PRAGMA table_info(knowledge_base)').all();
console.log('  字段数:' + cols.length + ' | ' + cols.map(c => c.name).slice(0,10).join(',') + '...');

console.log('');
console.log('=== 2. 索引 ===');
const idxs = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_base'").all();
console.log('  索引数:' + idxs.length);
for (const i of idxs) console.log('  ' + i.name);

console.log('');
console.log('=== 3. 数据 ===');
const total = db.prepare('SELECT COUNT(*) as c FROM knowledge_base').get().c;
const byType = db.prepare('SELECT source_type, COUNT(*) as c, ROUND(AVG(LENGTH(content))) as l FROM knowledge_base GROUP BY source_type ORDER BY c DESC').all();
console.log('  总条目:' + total);
for (const r of byType) console.log('  ' + r.source_type + ':' + r.c + '条 avg=' + r.l + '字');

console.log('');
console.log('=== 4. 无垃圾 ===');
let found = 0;
for (const t of ['landmark','milestone','dream','spec','query']) {
  const c = db.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE source_type=?').get(t).c;
  if (c > 0) { console.log('  ❌ ' + t + ':' + c); found += c; }
}
if (!found) console.log('  ✅ 零垃圾');

console.log('');
console.log('=== 5. recall_count ===');
const rc = db.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE recall_count>0').get().c;
const imp = db.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE impression_score>0.5').get().c;
console.log('  recall_count>0:' + rc + ' | impression_score>0.5:' + imp);

console.log('');
console.log('=== 6. 分块 ===');
const ck = db.prepare('SELECT COUNT(DISTINCT kn_id) as c FROM knowledge_chunks').get().c;
const ct = db.prepare('SELECT COUNT(*) as c FROM knowledge_chunks').get().c;
const em = db.prepare('SELECT COUNT(*) as c FROM knowledge_chunks WHERE embedding IS NOT NULL').get().c;
console.log('  分块覆盖:' + ck + '/' + total + ' | 总分块:' + ct + ' | embedding:' + em);

console.log('');
console.log('=== 7. 户籍关联 ===');
const bl = db.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('  belong_entity_uuid:' + bl + '/' + total);

console.log('');
console.log('=== 8. 分类 ===');
const pd = db.prepare('SELECT COUNT(*) as c FROM knowledge_base WHERE classification_pending=1').get().c;
console.log('  待分类:' + pd + ' | 已分类:' + (total-pd));

db.close();
