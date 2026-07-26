// qa-uuid-audit.cjs — 综合 UUID 标注率审计
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db', {readonly: true});
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});

console.log('═══════════════════════════════════════');
console.log('  WenStarOS QA — UUID 标注率审计');
console.log('  时间: ' + new Date().toISOString());
console.log('═══════════════════════════════════════');
console.log('');

// === 1. conversations 表 ===
console.log('═══ 1. conversations (对话表) ═══');
const convTotal = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const convAnnotated = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const convNull = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NULL').get().c;
console.log('  总量: ' + convTotal);
console.log('  已标注: ' + convAnnotated + ' (' + (convTotal > 0 ? (convAnnotated/convTotal*100).toFixed(1) : '0') + '%)');
console.log('  未标注: ' + convNull);
console.log('');

// 按 role 分
console.log('  按 role 分布:');
const convByRole = db.prepare('SELECT role, COUNT(*) as c, SUM(CASE WHEN belong_entity_uuid IS NOT NULL THEN 1 ELSE 0 END) as annotated FROM conversations GROUP BY role ORDER BY c DESC').all();
for (const r of convByRole) {
  console.log('    ' + r.role + ': total=' + r.c + ' annotated=' + r.annotated + ' (' + (r.c > 0 ? (r.annotated/r.c*100).toFixed(1) : '0') + '%)');
}

// === 2. memories 表 ===
console.log('');
console.log('═══ 2. memories (记忆表) ═══');
const memTotal = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const memAnnotated = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const memNull = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL').get().c;
console.log('  总量: ' + memTotal);
console.log('  已标注: ' + memAnnotated + ' (' + (memTotal > 0 ? (memAnnotated/memTotal*100).toFixed(1) : '0') + '%)');
console.log('  未标注: ' + memNull);

// 按 calcium_level 分
console.log('');
console.log('  按 calcium_level 分布:');
const memByCL = db.prepare('SELECT calcium_level, COUNT(*) as c, SUM(CASE WHEN belong_entity_uuid IS NOT NULL THEN 1 ELSE 0 END) as annotated FROM memories GROUP BY calcium_level ORDER BY calcium_level').all();
for (const r of memByCL) {
  console.log('    L' + r.calcium_level + ': total=' + r.c + ' annotated=' + r.annotated + ' (' + (r.c > 0 ? (r.annotated/r.c*100).toFixed(1) : '0') + '%)');
}

// === 3. black_diamond 表 ===
console.log('');
console.log('═══ 3. black_diamond (黑钻表) ═══');
const bdTotal = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const bdAnnotated = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NOT NULL').get().c;
const bdNull = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NULL').get().c;
console.log('  总量: ' + bdTotal);
console.log('  已标注: ' + bdAnnotated + ' (' + (bdTotal > 0 ? (bdAnnotated/bdTotal*100).toFixed(1) : '0') + '%)');
console.log('  未标注: ' + bdNull);

// 按 calcium_level 分
console.log('');
console.log('  按 calcium_level 分布:');
const bdByCL = db.prepare('SELECT calcium_level, COUNT(*) as c, SUM(CASE WHEN belong_entity_uuid IS NOT NULL THEN 1 ELSE 0 END) as annotated FROM black_diamond GROUP BY calcium_level ORDER BY calcium_level').all();
for (const r of bdByCL) {
  console.log('    L' + r.calcium_level + ': total=' + r.c + ' annotated=' + r.annotated + ' (' + (r.c > 0 ? (r.annotated/r.c*100).toFixed(1) : '0') + '%)');
}

// === 4. 关键角色验证 ===
console.log('');
console.log('═══ 4. 关键角色标注验证 ═══');
const keyNames = ['玉瑶','熊梓铭','徐诗雨','徐诗韵','徐诗涵','王全芬','熊勇','林土锋','阿珍','熊鸿艺','熊鸿轩','徐康','徐轩'];
for (const name of keyNames) {
  const row = fg.prepare("SELECT uuid FROM nodes WHERE name=? AND type='person'").get(name);
  if (!row) { console.log('  ' + name + ': 未找到角色'); continue; }
  const u = row.uuid;
  const cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(u).c;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(u).c;
  const cb = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid=?').get(u).c;
  console.log('  ' + name + ': convs=' + cc + ' mems=' + cm + ' BD=' + cb);
}

// === 5. 垃圾UUID标注检测 ===
console.log('');
console.log('═══ 5. 垃圾UUID标注检测 ═══');
const garbageNames = ['什么名字','那你再','那你说','那继续','加班','姐姐','老家','公司','学生','小说','开心','时候你','纪实小','计划吗','姑姑','上司','小龙','老邱','老大','焦虑','方案','无聊','徐茜','徐敏'];
const garbageRows = fg.prepare('SELECT uuid,name FROM nodes WHERE name IN (' + garbageNames.map(n => "'" + n + "'").join(',') + ')').all();
let totalGarbage = 0;
for (const g of garbageRows) {
  const cc = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(g.uuid).c;
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(g.uuid).c;
  if (cc > 0 || cm > 0) {
    console.log('  ⚠️  ' + g.name + ': convs=' + cc + ' mems=' + cm);
    totalGarbage += cc + cm;
  }
}
if (totalGarbage === 0) console.log('  ✅ 无垃圾UUID标注');
else console.log('  ❌ 总垃圾标注: ' + totalGarbage + '条');

// === 6. FG 真人被角色扮演检测 ===
console.log('');
console.log('═══ 6. FG 真人 relation_to_user 检测 ═══');
const realPersons = fg.prepare("SELECT name, uuid, relation_to_user FROM nodes WHERE type='person' AND relation_to_user IS NOT NULL AND relation_to_user != ''").all();
console.log('  真人数量: ' + realPersons.length);
for (const p of realPersons) {
  const cm = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(p.uuid).c;
  console.log('  ' + p.name + ' (' + p.relation_to_user + '): 记忆=' + cm);
}

// === 7. 关联表明细 ===
console.log('');
console.log('═══ 7. 关联表明细 ═══');
const me = db.prepare('SELECT COUNT(*) as c FROM memory_entities').get().c;
const er = db.prepare('SELECT COUNT(*) as c FROM entity_relations').get().c;
const km = db.prepare('SELECT COUNT(*) as c FROM knowledge_memories').get().c;
console.log('  memory_entities: ' + me);
console.log('  entity_relations: ' + er);
console.log('  knowledge_memories: ' + km);

// === 8. 标注率汇总 ===
console.log('');
console.log('═══════════════════════════════════════');
console.log('  标注率汇总');
console.log('═══════════════════════════════════════');
const overallTotal = convTotal + memTotal + bdTotal;
const overallAnnotated = convAnnotated + memAnnotated + bdAnnotated;
console.log('  对话: ' + convAnnotated + '/' + convTotal + ' = ' + (convTotal > 0 ? (convAnnotated/convTotal*100).toFixed(1) : '0') + '%');
console.log('  记忆: ' + memAnnotated + '/' + memTotal + ' = ' + (memTotal > 0 ? (memAnnotated/memTotal*100).toFixed(1) : '0') + '%');
console.log('  黑钻: ' + bdAnnotated + '/' + bdTotal + ' = ' + (bdTotal > 0 ? (bdAnnotated/bdTotal*100).toFixed(1) : '0') + '%');
console.log('  合计: ' + overallAnnotated + '/' + overallTotal + ' = ' + (overallTotal > 0 ? (overallAnnotated/overallTotal*100).toFixed(1) : '0') + '%');

db.close();
fg.close();
console.log('');
console.log('✅ QA 审计完成');
