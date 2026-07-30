/**
 * 一次性清洗脚本 — 修复熊梓铭 FamilyGraph 数据
 * 执行: cd D:\tools\wenstar-cc && npx tsx scripts/clean-xzm-profile.ts
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'webui', 'knowledge', 'family_graph.db');

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error('❌ FamilyGraph 数据库不存在: ' + DB_PATH);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const buf = readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // ═══ 1. 清洗节点 ═══
  const nodesRes = db.exec("SELECT id, name, properties FROM nodes WHERE name = '熊梓铭'");
  if (nodesRes.length === 0 || nodesRes[0].values.length === 0) {
    console.error('❌ 熊梓铭 不在 FamilyGraph 中');
    db.close();
    process.exit(1);
  }

  const row = nodesRes[0].values[0];
  const nodeId = row[0] as number;
  const nodeName = row[1] as string;
  let props: any;
  try { props = JSON.parse(row[2] as string); } catch { props = {}; }

  console.log('=== 清洗前 ===');
  console.log('  gender:', props.gender);
  console.log('  relation_to_user:', props.relation_to_user);
  console.log('  appearance:', String(props.appearance || '').substring(0, 60));
  console.log('  description:', String(props.description || '').substring(0, 60));
  console.log('  address:', String(props.address || '').substring(0, 60));
  console.log('  interests:', JSON.stringify(props.interests));
  console.log('  pendingItems 数:', (props.pendingItems || []).length);

  // ── 修复 ──
  props.gender = '女';
  props.relation_to_user = '熊勇的女儿，鸿艺的熟人';
  delete props.appearance;
  delete props.description;
  delete props.address;
  delete props.interests;
  delete props.pendingItems;

  // 清理 traits
  const VALID_TRAITS = new Set([
    '温柔', '稳重', '内向', '细心', '勤奋', '开朗', '大方',
    '漂亮', '聪明', '固执', '令人怜爱', '清纯', '活泼', '安静'
  ]);
  if (Array.isArray(props.traits)) {
    props.traits = props.traits.filter((t: string) => VALID_TRAITS.has(t));
  }

  // 清理 dossier
  let dossier = props.dossier;
  if (typeof dossier === 'string') {
    try { dossier = JSON.parse(dossier); } catch { dossier = {}; }
  }
  if (dossier && typeof dossier === 'object') {
    if ((dossier as any).selfProfile) {
      delete (dossier as any).selfProfile.appearance;
      delete (dossier as any).selfProfile.bodyFeatures;
      delete (dossier as any).selfProfile.pendingItems;
    }
    if ((dossier as any).basicInfo) {
      (dossier as any).basicInfo.gender = '女';
    }
    props.dossier = dossier;
  }

  // category 修复
  if (props.category === 'X') {
    props.category = 'A';
    console.log('  category: X → A');
  }

  // 回写
  db.run("UPDATE nodes SET properties = (?) WHERE id = (?)", [JSON.stringify(props), nodeId]);

  console.log('\n=== 清洗后 ===');
  console.log('  gender: 女');
  console.log('  relation_to_user: 熊勇的女儿，鸿艺的熟人');
  console.log('  appearance: (已清除)');
  console.log('  description: (已清除)');
  console.log('  address: (已清除)');
  console.log('  interests: (已清除)');
  console.log('  pendingItems: (已清除)');
  console.log('  traits:', JSON.stringify(props.traits));

  // ═══ 2. 清洗关系边 ═══
  const edgesRes = db.exec(
    `SELECT e.id, n1.name as source_name, e.relation, n2.name as target_name
     FROM edges e JOIN nodes n1 ON e.source_id = n1.id JOIN nodes n2 ON e.target_id = n2.id
     WHERE (n1.name = '熊梓铭' AND (e.relation = 'father_of' OR e.relation = 'parent_of'))`
  );
  const badEdges: any[] = [];
  if (edgesRes.length > 0) {
    for (const row of edgesRes[0].values) {
      badEdges.push({ id: row[0], source: row[1], relation: row[2], target: row[3] });
    }
  }

  console.log('\n=== 坏关系边 ===');
  if (badEdges.length === 0) {
    console.log('  (无)');
  }
  for (const e of badEdges) {
    console.log('  删除: ' + e.source + ' --[' + e.relation + ']--> ' + e.target);
    db.run("DELETE FROM edges WHERE id = (?)", [e.id]);
  }
  console.log('  已删除 ' + badEdges.length + ' 条');

  // ═══ 3. 落盘 ═══
  writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('\n✅ 已落盘: ' + DB_PATH);

  // ═══ 4. 验证 ═══
  const verifyNode = db.exec(
    "SELECT properties FROM nodes WHERE name = '熊梓铭'"
  );
  const vProps = JSON.parse(verifyNode[0].values[0][0] as string);
  const verifyEdges = db.exec(
    `SELECT n1.name as source_name, e.relation, n2.name as target_name
     FROM edges e JOIN nodes n1 ON e.source_id = n1.id JOIN nodes n2 ON e.target_id = n2.id
     WHERE n1.name = '熊梓铭' OR n2.name = '熊梓铭'`
  );
  const vEdges: any[] = [];
  if (verifyEdges.length > 0) {
    for (const row of verifyEdges[0].values) {
      vEdges.push({ source: row[0], relation: row[1], target: row[2] });
    }
  }

  console.log('\n=== 验证 ===');
  console.log('  gender:', vProps.gender);
  console.log('  relation_to_user:', vProps.relation_to_user);
  console.log('  appearance:', vProps.appearance || '(已清除 ✅)');
  console.log('  description:', vProps.description || '(已清除 ✅)');
  console.log('  category:', vProps.category);
  console.log('  关系边 (' + vEdges.length + '条):');
  for (const e of vEdges) {
    const isOut = e.source === '熊梓铭';
    if (isOut) {
      console.log('    熊梓铭 --[' + e.relation + ']--> ' + e.target);
    } else {
      console.log('    ' + e.source + ' --[' + e.relation + ']--> 熊梓铭');
    }
  }

  db.close();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
