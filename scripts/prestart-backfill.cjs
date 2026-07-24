// prestart-backfill.cjs — 在服务启动前用 better-sqlite3 直接写磁盘
// sql.js 的 flush() 无法持久化子查询 UPDATE，必须用本机 better-sqlite3
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const path = require('path');

const dbPath = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const db = new D(dbPath);
db.pragma('journal_mode=DELETE');

const memBefore = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const memTotal = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
console.log('memories标注: ' + memBefore + '/' + memTotal + ' (' + (memBefore/memTotal*100).toFixed(1) + '%)');

// 直接 JOIN 更新——better-sqlite3 直接写磁盘
const r = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('JOIN回填: +' + r.changes + '条');

// 时间窗口补充
const anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
let tw = 0;
for (const a of anchors) {
  try {
    const s = new Date(new Date(a.created_at).getTime() - 2*60*60*1000).toISOString();
    const e = new Date(new Date(a.created_at).getTime() + 2*60*60*1000).toISOString();
    const rr = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    tw += rr.changes;
  } catch(e) {}
}
console.log('时间窗口: +' + tw + '条');

const memAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('修复后: ' + memAfter + '/' + memTotal + ' (' + (memAfter/memTotal*100).toFixed(1) + '%)');

// 验证几个关键角色
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
for (const name of ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬']) {
  const u = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get().uuid;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  const ck = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%${name}%'`).get().c;
  console.log(name + ': mems=' + cm + '/' + ck);
}
fg.close();

// checkpoint to flush
try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
db.close();

const fs = require('fs');
const sz = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1);
console.log('\nDB文件: ' + sz + 'MB');
console.log('✅ prestart-backfill 完成');
