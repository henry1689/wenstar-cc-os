const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db');
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
db.pragma('journal_mode=DELETE');

const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶','什么名字','那你再','那你说','那继续','加班','姐姐','老家')").all();

console.log('=== 最终深度标注扫尾 ===');

let totalAdded = 0;
for (const c of CHARS) {
  const n = c.name, u = c.uuid;
  if (n.length < 2) continue;

  // Deep self-identification patterns
  const deepPatterns = [
    `content LIKE '%我是${n}%'`,
    `content LIKE '%${n}在这里%'`,
    `content LIKE '%${n}在呢%'`,
    `content LIKE '%我就是${n}%'`,
    `content LIKE '%是${n}呀%'`,
    `content LIKE '%是${n}啦%'`,
    `content LIKE '%叫我${n}%'`,
    `content LIKE '%${n}说%'`,
    `content LIKE '%${n}记得%'`,
    `content LIKE '%${n}怎么会忘%'`,
    `content LIKE '%${n}怎么不记得%'`,
  ];

  for (const p of deepPatterns) {
    try {
      const sql = `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND ${p}`;
      const r = db.prepare(sql).run();
      totalAdded += r.changes;
    } catch(e) {}
  }

  // Time-window clustering
  const anchors = db.prepare('SELECT timestamp FROM conversations WHERE belong_entity_uuid=? ORDER BY timestamp LIMIT 50').all(u);
  for (const a of anchors) {
    const ts = a.timestamp;
    const s = new Date(new Date(ts).getTime() - 30 * 60 * 1000).toISOString();
    const e = new Date(new Date(ts).getTime() + 30 * 60 * 1000).toISOString();
    try {
      const sql2 = `UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND timestamp BETWEEN '${s}' AND '${e}'`;
      const r2 = db.prepare(sql2).run();
      totalAdded += r2.changes;
    } catch(ee) {}
  }
}

console.log('1. 深度标注: +' + totalAdded + '条');

// Memories: wider time window (2h) + exact content match
let memAdded = 0;
const memAnchors = db.prepare('SELECT DISTINCT created_at,belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
for (const a of memAnchors) {
  const ts = a.created_at;
  const s = new Date(new Date(ts).getTime() - 2 * 60 * 60 * 1000).toISOString();
  const e = new Date(new Date(ts).getTime() + 2 * 60 * 60 * 1000).toISOString();
  try {
    const r = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    memAdded += r.changes;
  } catch(e) {}
}
console.log('2. memories时间窗口(2h): +' + memAdded + '条');

const mrb = db.prepare("UPDATE memories SET belong_entity_uuid = (SELECT DISTINCT c.belong_entity_uuid FROM conversations c WHERE c.belong_entity_uuid IS NOT NULL AND c.content LIKE '%'||substr(memories.raw_input,1,40)||'%' LIMIT 1) WHERE belong_entity_uuid IS NULL").run();
console.log('3. memories内容精确匹配: +' + mrb.changes + '条');

// Black diamond
const bdr = db.prepare("UPDATE black_diamond SET belong_entity_uuid = (SELECT m.belong_entity_uuid FROM memories m WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").run();
console.log('4. BD回填: +' + bdr.changes + '条');

// Per character
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const bdt = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const bdl = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NOT NULL').get().c;

console.log('');
console.log('convs: ' + cl + '/' + ct + ' (' + (cl/ct*100).toFixed(1) + '%)');
console.log('mems: ' + ml + '/' + mt + ' (' + (ml/mt*100).toFixed(1) + '%)');
console.log('BD: ' + bdl + '/' + bdt);

for (const name of ['熊梓铭','徐诗韵','徐诗雨','徐诗涵']) {
  const u = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get().uuid;
  const cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  console.log(name + ': convs=' + cc + ' mems=' + cm);
}

db.close(); fg.close();
console.log('✅ 扫尾完成');
