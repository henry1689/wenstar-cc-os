/**
 * clean-orphan-memories.cjs — 一次性：删除无 UUID 归属的垃圾记忆
 *
 * 背景：1587→0（上一轮误删），新记忆由 persistence-stage 生成并写入 belongEntityUuid
 * 此脚本仅清理残留的无归属碎片，不删除已正确定义的记忆
 */
const Database = require('better-sqlite3');
const db = new Database('data/webui/fusion_memory.db');

const total = db.prepare('SELECT COUNT(*) as c FROM memories').get();
const hasUUID = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
const noUUID = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''").get();

console.log('memories: 总计=' + total.c + ' 有UUID=' + hasUUID.c + ' 无UUID=' + noUUID.c);

if (noUUID.c === 0) {
  console.log('✅ 无需清理');
} else {
  // 只删除超短碎片（<10字），保留可能有用的
  const delShort = db.prepare("DELETE FROM memories WHERE (belong_entity_uuid IS NULL OR belong_entity_uuid = '') AND length(raw_input) < 10").run();
  console.log('删除超短碎片(<10字): ' + delShort.changes + ' 条');

  // 尝试 V2 回填剩余的
  const GARBAGE = new Set(['妈妈','爸爸','爷爷','奶奶','姐姐','妹妹','哥哥','弟弟','叔叔','姑姑','老婆','老公','儿子','女儿','老板','同事','同学','朋友','客户','学生','男朋友','小时','明天','那个','单员','水了','小嘛','和鸿艺','家里','家有谁','解剖学','那你说','加班','出差','方案','焦虑','小说','开心','关系','兴奋','舒服','安排','谈谈','老家','时候','那年','别老','老说','那不','那你','方呢','小的','单嘛','关了','别好','阿苏','阴蒂','小逼','小屄','小奶','小小','老盼','小孩','小我','小芳','小龙','小酒','于进','小生','别这么','舒服呀','那么一','和阿珍','管了','和小屄','那给我','时你就','计划吗','纪实小','解一下','华聊聊','别开心','习怎样','熊勇哥','熊总聊','司新来','罗权彬','刘云新','罗权斌']);
  const ents = db.prepare("SELECT name,uuid FROM entities WHERE type='person' AND uuid IS NOT NULL").all()
    .filter(e => e.name.length >= 3 && !GARBAGE.has(e.name))
    .sort((a, b) => b.name.length - a.name.length);

  let filled = 0;
  for (const {name, uuid} of ents) {
    const r = db.prepare("UPDATE memories SET belong_entity_uuid=? WHERE (belong_entity_uuid IS NULL OR belong_entity_uuid='') AND raw_input LIKE ?").run(uuid, '%' + name + '%');
    if (r.changes > 0) filled += r.changes;
  }
  console.log('V2回填: ' + filled + ' 条');

  // 仍然没有 UUID 的全删
  const remaining = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''").get();
  if (remaining.c > 0) {
    const del = db.prepare("DELETE FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''").run();
    console.log('删除剩余垃圾: ' + del.changes + ' 条');
  }
}

const final = db.prepare('SELECT COUNT(*) as c FROM memories').get();
console.log('最终: ' + final.c + ' 条 (全部有UUID)');
db.close();
