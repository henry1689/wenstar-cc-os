// purge-unlabeled.cjs — 清除所有无法标注的数据
// 执行顺序: 先回填可标注的 → 再删除剩余的 → 最后验证
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db');
db.pragma('journal_mode=DELETE');
const fs = require('fs');

const dbFile = 'D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const beforeSize = (fs.statSync(dbFile).size / 1024 / 1024).toFixed(1);

console.log('═══════════════════════════════════════');
console.log('   未标注数据彻底清除 (磁盘级)');
console.log('═══════════════════════════════════════\n');

// === PHASE 1: 能标注的先标注 (最后一次机会) ===
console.log('Phase 1: 最后一次回填...');
const cBefore = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mBefore = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('  标注前: convs=' + cBefore + ' mems=' + mBefore);

// memories 从 conversations JOIN 回填
const r1 = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
console.log('  mems JOIN: +' + r1.changes);

// 时间窗口
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
console.log('  mems 时间窗口: +' + tw);

const mAfterLabel = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('  标注后: mems=' + mAfterLabel);

// === PHASE 2: 删除所有仍未标注的数据 ===
console.log('\nPhase 2: 清除未标注数据...');

// conversations
const toDeleteConv = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
if (toDeleteConv > 0) {
  const dc = db.prepare('DELETE FROM conversations WHERE belong_entity_uuid IS NULL').run();
  console.log('  conversations: 删除' + dc.changes + '条');
}

// memories
const toDeleteMem = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
if (toDeleteMem > 0) {
  const dm = db.prepare('DELETE FROM memories WHERE belong_entity_uuid IS NULL').run();
  console.log('  memories:      删除' + dm.changes + '条');
}

// black_diamond
const toDeleteBD = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NULL').get().c;
if (toDeleteBD > 0) {
  const dbd = db.prepare('DELETE FROM black_diamond WHERE belong_entity_uuid IS NULL').run();
  console.log('  black_diamond: 删除' + dbd.changes + '条');
}

// vault_log —— 无UUID列，但是系统自动生成的不删(对会晤检索无影响)
const vlTotal = db.prepare('SELECT COUNT(*) as c FROM vault_log').get().c;
console.log('  vault_log:    保留' + vlTotal + '条(无UUID列，不影响检索)');

// 清理垃圾人物 对话 (标注在了 TXS-000000023~TXS-000000030 等垃圾上)
const garbage = db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IN (
  SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家')
)`).get().c;
if (garbage > 0) {
  db.prepare(`DELETE FROM conversations WHERE belong_entity_uuid IN (
    SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家')
  )`).run();
  console.log('  垃圾角色对话:  删除' + garbage + '条');
}

// 垃圾角色 memories
const garbageMem = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IN (
  SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家')
)`).get().c;
if (garbageMem > 0) {
  db.prepare(`DELETE FROM memories WHERE belong_entity_uuid IN (
    SELECT uuid FROM entities WHERE name IN ('什么名字','那你再','那你说','那继续','加班','姐姐','老家')
  )`).run();
  console.log('  垃圾角色记忆:  删除' + garbageMem + '条');
}

// === PHASE 3: 验证 ===
console.log('\nPhase 3: 验证...');
const ctAfter = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const clAfter = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mtAfter = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const mlAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const btAfter = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const blAfter = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NOT NULL').get().c;
const muAfter = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
const cuAfter = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
const buAfter = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NULL').get().c;

console.log('conversations: ' + ctAfter + '条, 标注=' + clAfter + ', NULL=' + cuAfter + ' (' + (clAfter/ctAfter*100).toFixed(1) + '%)');
console.log('memories:      ' + mtAfter + '条, 标注=' + mlAfter + ', NULL=' + muAfter + ' (' + (mtAfter>0?(mlAfter/mtAfter*100).toFixed(1):'100') + '%)');
console.log('black_diamond: ' + btAfter + '条, 标注=' + blAfter + ', NULL=' + buAfter);
console.log('vault_log:     ' + vlTotal + '条 (保留)');

// 关键角色验证
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
console.log('\n═══ 关键角色验证 ═══');
for (const name of ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬','熊勇','林土锋','阿珍']) {
  const u = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get().uuid;
  const cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  console.log(name + ': convs=' + cc + ' mems=' + cm);
}
fg.close();

// Vacuum to reclaim disk space
try { db.pragma('vacuum'); } catch(e) {}
const afterSize = (fs.statSync(dbFile).size / 1024 / 1024).toFixed(1);
console.log('\n磁盘: ' + beforeSize + 'MB → ' + afterSize + 'MB (释放 ' + (beforeSize-afterSize).toFixed(1) + 'MB)');

db.close();
console.log('✅ 未标注数据清除完成');
