// safe-backfill.cjs — 修正后回填算法 + 安全垃圾清除
// 🔴 修正: 禁止将对话标注到垃圾实体UUID
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db');
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});
db.pragma('journal_mode=DELETE');

// 🔴 垃圾UUID黑名单——永不被标注
const GARBAGE_UUIDS = fg.prepare(`SELECT uuid FROM nodes WHERE name IN
  ('什么名字','那你再','那你说','那继续','加班','姐姐','老家',
   '公司','学生','小说','开心','时候你','纪实小','计划吗','姑姑','上司','小龙','老邱','老大','焦虑','方案','无聊','徐茜','徐敏')`).all().map(r => r.uuid).filter(Boolean);
const GARBAGE_SET = new Set(GARBAGE_UUIDS);

console.log('垃圾UUID名单: ' + GARBAGE_SET.size + '个');
console.log('');

// 合法角色
const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶')").all()
  .filter(c => !GARBAGE_SET.has(c.uuid));

console.log('合法角色: ' + CHARS.length + '个');
console.log('');

// === PHASE 1: 回填 (禁止标注到垃圾UUID) ===
let convAdded = 0, memAdded = 0;

for (const c of CHARS) {
  const n = c.name, u = c.uuid;

  // 关键词回填 — 但只在内容真正匹配时才标注
  try {
    const r = db.prepare(`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND content LIKE '%${n}%'`).run();
    convAdded += r.changes;
  } catch(e) {}

  // 自称检测
  const selfPatterns = [
    `content LIKE '%我是${n}%'`, `content LIKE '%我就是${n}%'`, `content LIKE '%我叫${n}%'`,
    `content LIKE '%${n}来了%'`, `content LIKE '%${n}在呢%'`, `content LIKE '%是${n}呀%'`,
    `content LIKE '%${n}就在%'`, `content LIKE '%${n}说%'`,
  ];
  for (const p of selfPatterns) {
    try {
      const r = db.prepare(`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND ${p}`).run();
      convAdded += r.changes;
    } catch(e) {}
  }
}

// memories 从 conversations 回填
const mr = db.prepare(`UPDATE memories SET belong_entity_uuid = (
  SELECT DISTINCT c.belong_entity_uuid FROM conversations c
  WHERE c.belong_entity_uuid IS NOT NULL
  AND c.content LIKE '%' || SUBSTR(memories.raw_input, 1, 30) || '%'
  LIMIT 1
) WHERE belong_entity_uuid IS NULL`).run();
memAdded = mr.changes;

// 时间窗口扩散
const anchors = db.prepare('SELECT DISTINCT created_at, belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
let tw = 0;
for (const a of anchors) {
  if (GARBAGE_SET.has(a.belong_entity_uuid)) continue; // 🔴 跳过垃圾
  try {
    const s = new Date(new Date(a.created_at).getTime() - 2*60*60*1000).toISOString();
    const e = new Date(new Date(a.created_at).getTime() + 2*60*60*1000).toISOString();
    const r = db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid, s, e);
    tw += r.changes;
  } catch(e) {}
}

// black_diamond
const bdr = db.prepare("UPDATE black_diamond SET belong_entity_uuid = (SELECT m.belong_entity_uuid FROM memories m WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").run();

console.log('Phase 1 回填: convs +' + convAdded + ' mems +' + memAdded + '(JOIN) +' + tw + '(TW) BD +' + bdr.changes);

// 标记
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('');
console.log('convs: ' + cl + '/' + ct + ' (' + (cl/ct*100).toFixed(1) + '%)');
console.log('mems:  ' + ml + '/' + mt + ' (' + (ml/mt*100).toFixed(1) + '%)');

// === PHASE 2: 安全清除 ===
let delConv = 0, delMem = 0, delGarbage = 0;

// 清除标注到垃圾UUID的对话
for (const gu of GARBAGE_SET) {
  try {
    const dc = db.prepare(`DELETE FROM conversations WHERE belong_entity_uuid='${gu}'`).run();
    const dm = db.prepare(`DELETE FROM memories WHERE belong_entity_uuid='${gu}'`).run();
    delGarbage += dc.changes + dm.changes;
  } catch(e) {}
}
console.log('');
console.log('Phase 2: 删除标注在垃圾UUID的记录: ' + delGarbage + '条');

// 删除完全未标注的
const dc = db.prepare('DELETE FROM conversations WHERE belong_entity_uuid IS NULL').run();
const dm = db.prepare('DELETE FROM memories WHERE belong_entity_uuid IS NULL').run();
const dbd = db.prepare('DELETE FROM black_diamond WHERE belong_entity_uuid IS NULL AND source_id IS NULL').run();
delConv = dc.changes; delMem = dm.changes;
console.log('删除未标注: convs ' + delConv + ' mems ' + delMem + ' BD ' + dbd.changes);

// 验证
const cta = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cla = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const cua = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
const mta = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const mla = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const mua = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
console.log('');
console.log('convs: ' + cta + '条, 标注=' + cla + ' (' + (cla/cta*100).toFixed(1) + '%), NULL=' + cua);
console.log('mems:  ' + mta + '条, 标注=' + mla + ' (' + (mla/mta*100).toFixed(1) + '%), NULL=' + mua);

// 关键角色
console.log('');
console.log('═══ 关键角色验证 ═══');
for (const name of ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬','熊勇','林土锋','阿珍']) {
  const u = fg.prepare(`SELECT uuid FROM nodes WHERE name='${name}'`).get().uuid;
  const cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  console.log(name + ': convs=' + cc + ' mems=' + cm);
}

db.close();
fg.close();
console.log('\n✅ 安全回填完成');
