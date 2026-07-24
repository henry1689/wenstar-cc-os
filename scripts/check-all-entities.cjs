const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db', {readonly: true});
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});

console.log('=== memories UUID 标注分布 TOP 20 ===');
const dist = db.prepare('SELECT belong_entity_uuid,COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL GROUP BY belong_entity_uuid ORDER BY c DESC LIMIT 20').all();
if (dist.length === 0) {
  console.log('❌ memories 没有任何 belong_entity_uuid 标注！');
} else {
  for (const r of dist) {
    const n = fg.prepare('SELECT name FROM nodes WHERE uuid=?').all(r.belong_entity_uuid);
    console.log((n.length ? n[0].name : '?') + ' ' + r.belong_entity_uuid + ': ' + r.c + '条');
  }
}

console.log('');
console.log('=== 五角色完整状态 ===');
const CHARS = ['徐诗韵','徐诗雨','徐诗涵','王全芬','玉瑶','熊梓铭'];
for (const name of CHARS) {
  const node = fg.prepare(`SELECT uuid,status FROM nodes WHERE name='${name}'`).get();
  if (!node) { console.log(name + ': FG无节点'); continue; }
  const u = node.uuid;

  // conversations
  const convsKeyword = db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE content LIKE '%${name}%'`).get().c;
  const convsUuid = u ? db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c : 0;
  const convsUuidAst = u ? db.prepare("SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=? AND role='assistant'").get(u).c : 0;

  // memories
  const memsKeyword = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%${name}%'`).get().c;
  const memsUuid = u ? db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c : 0;

  // FG
  const p = JSON.parse(fg.prepare(`SELECT properties FROM nodes WHERE name='${name}'`).get().properties);
  const rel = p.relation_to_user || 'NULL';

  console.log(name + ':');
  console.log('  convs: ' + convsKeyword + '条(关键词)/' + convsUuid + '条(UUID)/' + convsUuidAst + '条(assistant本人)');
  console.log('  mems:  ' + memsKeyword + '条(关键词)/' + memsUuid + '条(UUID)');
  console.log('  FG:    rel=' + rel.substring(0, 30) + ' status=' + node.status);
}

// Total
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('');
console.log('总计: convs=' + cl + '/' + ct + ' (' + (cl/ct*100).toFixed(1) + '%) mems=' + ml + '/' + mt + ' (' + (ml/mt*100).toFixed(1) + '%)');

db.close(); fg.close();
