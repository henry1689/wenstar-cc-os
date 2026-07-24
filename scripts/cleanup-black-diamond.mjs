import Database from 'better-sqlite3';
import { join } from 'path';

const db = new Database(join(process.cwd(), 'data/webui/fusion_memory.db'));
console.log('🔧 黑钻清理 V10.1');

// 统计现状
const total = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
console.log('当前总数: ' + total);

// Keep top 300 (increased from 200 since we have 541 L2+ entries)
// 按 calcium_level DESC, created_at DESC 排序，保留前 300
const toKeep = db.prepare(
  'SELECT id FROM black_diamond ORDER BY calcium_level DESC, created_at DESC LIMIT 300'
).all().map(function(r) { return r.id; });

const keepSet = new Set(toKeep);
console.log('保留: ' + toKeep.length + ' 条');

// Delete the rest
const toDelete = db.prepare(
  'SELECT id, summary, calcium_level FROM black_diamond WHERE id NOT IN (' +
  toKeep.map(function() { return '?'; }).join(',') +
  ') ORDER BY calcium_level ASC, created_at ASC'
).all(...toKeep);

console.log('删除: ' + toDelete.length + ' 条');

if (toDelete.length > 0) {
  // Show what will be deleted
  const sample = toDelete.slice(0, 5);
  for (const r of sample) {
    console.log('  L' + r.calcium_level + ' | ' + (r.summary || '').substring(0, 40));
  }
  if (toDelete.length > 5) console.log('  ... and ' + (toDelete.length - 5) + ' more');

  // Execute deletion
  const delStmt = db.prepare('DELETE FROM black_diamond WHERE id = ?');
  db.transaction(function() {
    for (const r of toDelete) {
      delStmt.run(r.id);
    }
  })();
  console.log('✅ 已清理 ' + toDelete.length + ' 条');
}

// Verify
const after = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const dist = db.prepare('SELECT calcium_level, COUNT(*) as c FROM black_diamond GROUP BY calcium_level ORDER BY calcium_level').all();
console.log('清理后: ' + after + ' 条');
for (const r of dist) {
  console.log('  L' + r.calcium_level + ': ' + r.c + '条');
}

db.close();
console.log('✅ 完成');
