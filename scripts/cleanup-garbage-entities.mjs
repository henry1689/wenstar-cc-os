/**
 * cleanup-garbage-entities.mjs — FG 垃圾实体一次性清理
 * ====================================================
 * 删除 M1 误提取的 10 个垃圾实体（称谓/词语/片段）。
 * 在 GarbageEntityGuard 接入 addNode() 之前创建。
 *
 * 幂等安全：可重复运行，只删已知垃圾名。
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

const DB_PATH = 'data/webui/knowledge/family_graph.db';

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(DB_PATH));

const GARBAGE = [
  '什么名字','那继续','老家','快乐','小嘛','解剖学',
  '于我来','小生','小时','那你再',
];

let deletedNodes = 0;
let deletedEdges = 0;

for (const name of GARBAGE) {
  // 删除边（以该节点为 source 或 target 的全部边）
  const edges = db.exec(
    "SELECT COUNT(*) as cnt FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE name=? AND type='person') OR target_id IN (SELECT id FROM nodes WHERE name=? AND type='person')",
    [name, name]
  );
  const edgeCount = edges[0]?.values[0]?.[0] || 0;

  if (edgeCount > 0) {
    db.run(
      "DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE name=? AND type='person') OR target_id IN (SELECT id FROM nodes WHERE name=? AND type='person')",
      [name, name]
    );
    deletedEdges += edgeCount;
  }

  // 删除节点
  const nodes = db.exec("SELECT COUNT(*) as cnt FROM nodes WHERE name=? AND type='person'", [name]);
  const nodeCount = nodes[0]?.values[0]?.[0] || 0;

  if (nodeCount > 0) {
    db.run("DELETE FROM nodes WHERE name=? AND type='person'", [name]);
    deletedNodes += nodeCount;
    console.log(`  已删: "${name}" (${edgeCount} 边 + ${nodeCount} 节点)`);
  } else {
    console.log(`  跳: "${name}" (不存在)`);
  }
}

console.log(`\n总计: ${deletedNodes} 个节点 + ${deletedEdges} 条边`);

// Also remove garbage from entities table (fusion_memory.db)
const FM_DB_PATH = 'data/webui/fusion_memory.db';
try {
  const fmDb = new SQL.Database(readFileSync(FM_DB_PATH));
  let entCleaned = 0;
  for (const name of GARBAGE) {
    const r = fmDb.exec("SELECT COUNT(*) as cnt FROM entities WHERE name=? AND type='person'", [name]);
    if (r[0]?.values[0]?.[0] > 0) {
      fmDb.run("DELETE FROM entities WHERE name=? AND type='person'", [name]);
      entCleaned++;
    }
  }
  if (entCleaned > 0) {
    const fmData = fmDb.export();
    writeFileSync(FM_DB_PATH, Buffer.from(fmData));
    console.log(`entities 清理: ${entCleaned} 条`);
  }
  fmDb.close();
} catch(e) {
  console.warn('entities 同步清理失败:', e.message);
}

const data = db.export();
writeFileSync(DB_PATH, Buffer.from(data));
db.close();
console.log('Done.');
