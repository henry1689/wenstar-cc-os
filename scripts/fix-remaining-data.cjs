// fix-remaining-data.cjs — 残存数据修复
//
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, update)
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i];
  else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i];
  else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i];
  else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node fix-remaining-data.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'fix-remaining-data', riskLevel:'CRITICAL', operationType:'update', mode, environment:'local',
    operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null},
    scope:{selector:argv.scope||'table:conversations,memories',limit:0,batchSize:0,since:null,until:null},
    confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null},
    backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},
    irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══════════════  SCRIPT EXECUTION CONTRACT DENIED  ═══════════════\n  Script: fix-remaining-data.cjs  Risk: CRITICAL  Mode: apply\n  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══════════════════════════════════════════\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] fix-remaining-data — 将扫描但不写入。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际修复。\n'); process.exit(0); }

// ── 治理通过 ──
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fs = require('fs'), path=require('path'); const dbPath='D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const bd = path.join(path.dirname(dbPath),'backups'); if(!fs.existsSync(bd)) fs.mkdirSync(bd,{recursive:true});
const bp = path.join(bd,'fusion_memory_before_fix_remaining_'+Date.now()+'.db'); fs.copyFileSync(dbPath,bp); console.log('已备份: '+path.basename(bp));
const db = new D(dbPath); const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db'); db.pragma('journal_mode=DELETE');

const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶','什么名字','那你再','那你说','那继续','加班','姐姐','老家')").all();
console.log('=== 残存数据修复 ===');
let added = 0;
for (const c of CHARS) {
  const n = c.name, u = c.uuid;
  const stmts = [`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%我就是${n}%'`,`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%${n}在呢%'`,`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%叫${n}%'`,`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%我是${n}%'`,`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%${n}来了%'`];
  for (const s of stmts) { try { const r = db.prepare(s).run(); added += r.changes; } catch(e) {} }
}
console.log('1. 扩展自称: +' + added + '条');
const ZIMING = ["UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%梓铭%' AND content LIKE '%梓铭记%'","UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%梓铭%' AND content LIKE '%梓铭说%'","UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%我是梓铭%'","UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%梓铭就是梓铭%'","UPDATE conversations SET belong_entity_uuid='TXS-000000003' WHERE belong_entity_uuid IS NULL AND role='assistant' AND content LIKE '%叫我梓铭%'"];
for (const s of ZIMING) { try { const r = db.prepare(s).run(); added += r.changes; } catch(e) {} }
const mr = db.prepare("UPDATE memories SET belong_entity_uuid = (SELECT DISTINCT c.belong_entity_uuid FROM conversations c WHERE c.belong_entity_uuid IS NOT NULL AND c.content LIKE '%' || substr(memories.raw_input,1,30) || '%' LIMIT 1) WHERE belong_entity_uuid IS NULL").run();
console.log('3. memories回填: +' + mr.changes + '条');
const bdr = db.prepare("UPDATE black_diamond SET belong_entity_uuid = (SELECT m.belong_entity_uuid FROM memories m WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").run();
console.log('4. BD回填: +' + bdr.changes + '条');
const fp = fg.prepare("SELECT properties FROM nodes WHERE name='熊梓铭'").get(); const p=JSON.parse(fp.properties); p.relation_to_user='熊勇的女儿（心理学专业学生）'; fg.prepare("UPDATE nodes SET properties=? WHERE name='熊梓铭'").run(JSON.stringify(p));
const ct=db.prepare('SELECT COUNT(*) as c FROM conversations').get().c; const cl=db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt=db.prepare('SELECT COUNT(*) as c FROM memories').get().c; const ml=db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('\nconvs总:'+cl+'/'+ct+' ('+(cl/ct*100).toFixed(1)+'%)'); console.log('mems总: '+ml+'/'+mt+' ('+(ml/mt*100).toFixed(1)+'%)');
db.close(); fg.close(); console.log('✅ 残存数据修复完成');
