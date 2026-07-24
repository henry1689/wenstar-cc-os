const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db');

const XU_SISTERS = ['徐诗雨','徐诗韵','徐诗涵'];

// 1. 删除徐家三姐妹与熊家之间错误的虚构家族边
const WRONG_EDGES_TO_BEAR = ['熊梓铭','熊勇','王全芬','熊梓玥'];
let deleted = 0;

for (const xuName of XU_SISTERS) {
  const xu = fg.prepare(`SELECT id FROM nodes WHERE name='${xuName}'`).get();
  if (!xu) { console.log(xuName + ': 节点不存在'); continue; }

  for (const bearName of WRONG_EDGES_TO_BEAR) {
    const bear = fg.prepare(`SELECT id FROM nodes WHERE name='${bearName}'`).get();
    if (!bear) { console.log('  ' + bearName + ': 节点不存在'); continue; }

    // 删除双向边
    const r1 = fg.prepare('DELETE FROM edges WHERE source_id=? AND target_id=? AND relation NOT IN (\'acquaintance_of\',\'colleague_of\')').run(xu.id, bear.id);
    const r2 = fg.prepare('DELETE FROM edges WHERE source_id=? AND target_id=? AND relation NOT IN (\'acquaintance_of\',\'colleague_of\')').run(bear.id, xu.id);
    deleted += r1.changes + r2.changes;
  }
}

console.log('1. 删除虚构家族边: ' + deleted + '条');

// 2. 修正 relation_to_user: FG nodes.properties
const REL_FIXES = {
  '徐诗雨': '同事——高峰电业营业部跟单员',
  '徐诗韵': '密友——通过姐姐诗雨认识',
  '徐诗涵': '密友——通过姐姐诗雨认识',
  '徐东伟': '徐家姐妹的父亲',
  '阿苏': '徐家姐妹的母亲',
};

for (const [name, newRel] of Object.entries(REL_FIXES)) {
  const row = fg.prepare(`SELECT properties FROM nodes WHERE name='${name}'`).get();
  if (!row) { console.log(name + ': 节点不存在，跳过'); continue; }
  const p = JSON.parse(row.properties);
  const oldRel = p.relation_to_user || 'NULL';
  p.relation_to_user = newRel;
  // 清除 pendingItems 中的 relationToUser 项
  if (p.pendingItems) {
    p.pendingItems = p.pendingItems.filter(item => !item.field || item.field !== 'relationToUser');
  }
  fg.prepare(`UPDATE nodes SET properties=? WHERE name='${name}'`).run(JSON.stringify(p));
  console.log('2. ' + name + ': ' + oldRel + ' → ' + newRel);
}

// 3. 验证
console.log('\n=== 修复后验证 ===');
for (const xuName of XU_SISTERS) {
  const xu = fg.prepare(`SELECT id,properties FROM nodes WHERE name='${xuName}'`).get();
  const p = JSON.parse(xu.properties);
  const edges = fg.prepare(`SELECT e.relation,n2.name FROM edges e JOIN nodes n2 ON e.target_id=n2.id WHERE e.source_id='${xu.id}' AND (e.relation LIKE '%child%' OR e.relation LIKE '%parent%' OR e.relation LIKE '%grand%' OR e.relation LIKE '%niece%' OR e.relation LIKE '%aunt%' OR e.relation LIKE '%sister%' OR e.relation LIKE '%brother%') ORDER BY e.relation`).all();
  const keepEdges = edges.filter(e => {
    // Only show edges that are REAL family (徐家内部, NOT acquaintance_of)
    return !['acquaintance_of','colleague_of','subordinate_of','boss_of'].includes(e.relation);
  });
  console.log(xuName + ': rel=' + p.relation_to_user);
  console.log('  家族边: ' + keepEdges.map(e => e.relation + '→' + e.name).join(', ') || '无错误家族边');
}

const dirtyBear = fg.prepare(`SELECT e.relation,n1.name as xu,n2.name as bear FROM edges e JOIN nodes n1 ON e.source_id=n1.id JOIN nodes n2 ON e.target_id=n2.id WHERE n1.name IN ('徐诗雨','徐诗韵','徐诗涵') AND n2.name IN ('熊梓铭','熊勇','王全芬','熊梓玥') AND e.relation NOT IN ('acquaintance_of','colleague_of')`).all();
console.log('\n3. 残留的徐→熊虚构边: ' + dirtyBear.length + '条（应为0）');
if (dirtyBear.length > 0) for (const d of dirtyBear) console.log('  ' + d.xu + ' → ' + d.relation + ' → ' + d.bear);

fg.close();
console.log('\n✅ 徐家FG关系修正完成');
