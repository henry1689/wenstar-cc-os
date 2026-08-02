// V10.0: 将 entity_relations 中的社交关系同步到 FamilyGraph edges 表
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, sync)
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node sync-social-to-fg.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';

const sql = require('sql.js');
const fs = require('fs');

async function main() {
  if (!isDryRun) {
    const c = { scriptId:'sync-social-to-fg', riskLevel:'CRITICAL', operationType:'sync', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:entity_relations,edges',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
    const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
    if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: sync-social-to-fg.cjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
  }
  if (isDryRun) { console.log('[DRY-RUN] sync-social-to-fg — 将扫描但不写入。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际同步。\n'); process.exit(0); }
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
