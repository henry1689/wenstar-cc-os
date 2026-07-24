// V10.0: 将 entity_relations 中的社交关系同步到 FamilyGraph edges 表
// entity_relations 在 fusion_memory.db，FG edges 在 family_graph.db
const sql = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await sql.default();

  // 加载 entity_relations 库
  const fusionDb = new SQL.Database(fs.readFileSync('D:/tools/wenstar-cc/data/webui/fusion_memory.db'));

  // 加载 FG 库
  const fgDb = new SQL.Database(fs.readFileSync('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db'));

  // 读取 entity_relations 中所有非垃圾关系
  const rows = fusionDb.exec(`SELECT ea.name as a, er.relation, eb.name as b
    FROM entity_relations er
    JOIN entities ea ON er.entity_a_id = ea.id
    JOIN entities eb ON er.entity_b_id = eb.id
    WHERE er.relation NOT IN (
      'child_of','parent_of','mother_of','father_of',
      'elder_sister_of','younger_sister_of','sister_of','brother_of','sibling_of',
      'grandchild_of','grandmother_of','grandfather_of','grandparent_of',
      'aunt_of','uncle_of','niece_of','nephew_of',
      'lives_in','residence_of','has_appearance','has_feature','其他','认识的人',
      '爷爷','奶奶','外公','外婆'
    )
    AND ea.name NOT IN ('我','妹妹','妈妈','老婆','爸爸','姐姐','哥哥','弟弟')
    AND eb.name NOT IN ('我','妹妹','妈妈','老婆','爸爸','姐姐','哥哥','弟弟')
  `);

  if (!rows[0]) { console.log('No social edges to sync'); return; }

  // 生成 unique ID
  const uid = () => 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  let synced = 0;
  let skipped = 0;

  for (const [aName, relation, bName] of rows[0].values) {
    // 在 FG 中查找节点
    const aNode = fgDb.exec('SELECT id FROM nodes WHERE name = ?', [aName]);
    const bNode = fgDb.exec('SELECT id FROM nodes WHERE name = ?', [bName]);

    if (!aNode[0]?.values[0] || !bNode[0]?.values[0]) {
      skipped++;
      continue;
    }

    const srcId = aNode[0].values[0][0];
    const tgtId = bNode[0].values[0][0];

    // 检查边是否已存在
    const exists = fgDb.exec(
      'SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?',
      [srcId, tgtId, relation]
    );

    if (exists[0]?.values?.length > 0) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    fgDb.run(
      'INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid(), srcId, tgtId, relation, '{"_social_sync":true}', now, now]
    );
    synced++;
  }

  // 保存
  const data = fgDb.export();
  const buf = Buffer.from(data);
  fs.writeFileSync('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', buf);
  console.log(`Synced: ${synced} edges, Skipped: ${skipped}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
