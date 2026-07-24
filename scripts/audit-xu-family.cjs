const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});

const XU = ['徐诗雨','徐诗韵','徐诗涵','徐东伟','阿苏'];

console.log('=== 徐家FG全量边审计 ===\n');

for (const name of XU) {
  const node = fg.prepare(`SELECT * FROM nodes WHERE name='${name}'`).get();
  if (!node) { console.log(name + ': FG无节点\n'); continue; }

  const outE = fg.prepare('SELECT e.relation,n2.name as target FROM edges e JOIN nodes n2 ON e.target_id=n2.id WHERE e.source_id=?').all(node.id);
  const inE = fg.prepare('SELECT e.relation,n2.name as source FROM edges e JOIN nodes n2 ON e.source_id=n2.id WHERE e.target_id=?').all(node.id);

  console.log(name + ' (id=' + node.id.substring(0,10) + ')');
  console.log('  出去的边:');
  for (const e of outE) console.log('    → ' + e.relation + ' → ' + e.target);
  console.log('  进来的边:');
  for (const e of inE) console.log('    ' + e.source + ' ' + e.relation + ' →');

  // Check properties
  const p = JSON.parse(node.properties || '{}');
  console.log('  relation_to_user: ' + (p.relation_to_user || 'NULL'));
  console.log('');
}

fg.close();
