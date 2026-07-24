const { execSync } = require('child_process');
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const path = require('path');
const dbPath = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';

// 1. Stop service
try { execSync('taskkill //F //IM node.exe', { timeout: 5000 }); } catch(e) {}
console.log('服务已停');

// 2. Clear WAL
const walFile = dbPath + '-wal';
const shmFile = dbPath + '-shm';
const fs = require('fs');
try { fs.unlinkSync(walFile); } catch(e) {}
try { fs.unlinkSync(shmFile); } catch(e) {}
console.log('WAL已清理');

// 3. Open with better-sqlite3 (DIRECT disk writes)
const db = new D(dbPath);
db.pragma('journal_mode=DELETE');
console.log('数据库已打开 (DELETE mode, 直接写磁盘)\n');

// 4. Fix memories annotation
const memBefore = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const memTotal = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
console.log('修复前: ' + memBefore + '/' + memTotal + ' (' + (memBefore/memTotal*100).toFixed(1) + '%)');

// Step A: Content matching -直接从 conversations 复制 UUID
const r1 = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('A. 内容匹配: +' + r1.changes);

// Step B: Time window propagation for roleplay memories (2-hour windows)
const anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
let twAdded = 0;
for (const a of anchors) {
  try {
    const ts = a.created_at;
    const s = new Date(new Date(ts).getTime() - 2 * 60 * 60 * 1000).toISOString();
    const e = new Date(new Date(ts).getTime() + 2 * 60 * 60 * 1000).toISOString();
    const r = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    twAdded += r.changes;
  } catch(e) {}
}
console.log('B. 时间窗口(2h): +' + twAdded);

// Step C: Wider time window (4h) for remaining roleplay
if (twAdded > 0) {
  const anchors2 = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
  let tw2Added = 0;
  for (const a of anchors2) {
    try {
      const ts = a.created_at;
      const s = new Date(new Date(ts).getTime() - 4 * 60 * 60 * 1000).toISOString();
      const e = new Date(new Date(ts).getTime() + 4 * 60 * 60 * 1000).toISOString();
      const r = db.prepare("UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND memory_kind='roleplay' AND created_at BETWEEN ? AND ?").run(a.belong_entity_uuid, s, e);
      tw2Added += r.changes;
    } catch(e) {}
  }
  console.log('C. roleplay宽窗(4h): +' + tw2Added);
}

// Step D: Second content match with wider substring
const r2 = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 20) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('D. 二次内容匹配(20字): +' + r2.changes);

// Verify
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
const memAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('\n修复后: ' + memAfter + '/' + memTotal + ' (' + (memAfter/memTotal*100).toFixed(1) + '%)');

console.log('\n=== 逐角色验证 ===');
const CHARS = ['徐诗韵','徐诗雨','徐诗涵','王全芬','玉瑶','熊梓铭'];
for (const name of CHARS) {
  const node = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get();
  const u = node ? node.uuid : null;
  const cc = u ? db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c : 0;
  const cm = u ? db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c : 0;
  const memKeyword = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%${name}%'`).get().c;
  console.log(name + ': convs=' + cc + ' mems=' + cm + '/' + memKeyword);
}

// Checkpoint
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
fg.close();

console.log('\n数据库文件大小: ' + (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1) + 'MB');
console.log('✅ memories修复完成 — 立即启动服务验证');
