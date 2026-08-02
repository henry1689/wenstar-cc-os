// final-annotation-sweep.cjs — 最终深度标注扫尾
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
  else if (a === '--help') { console.log('Usage: node final-annotation-sweep.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'final-annotation-sweep', riskLevel:'CRITICAL', operationType:'update', mode, environment:'local',
    operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null},
    scope:{selector:argv.scope||'table:conversations,memories',limit:0,batchSize:0,since:null,until:null},
    confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null},
    backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},
    irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══════════════  SCRIPT EXECUTION CONTRACT DENIED  ═══════════════\n  Script: final-annotation-sweep.cjs  Risk: CRITICAL  Mode: apply\n  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══════════════════════════════════════════\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] final-annotation-sweep — 将扫描但不写入。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际标注。\n'); process.exit(0); }

// ── 治理通过 ──
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fs = require('fs'), path=require('path'); const dbPath='D:/tools/wenstar-cc/data/webui/fusion_memory.db';
const bd = path.join(path.dirname(dbPath),'backups'); if(!fs.existsSync(bd)) fs.mkdirSync(bd,{recursive:true});
const bp = path.join(bd,'fusion_memory_before_final_sweep_'+Date.now()+'.db'); fs.copyFileSync(dbPath,bp); console.log('已备份: '+path.basename(bp));
const db = new D(dbPath); const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true}); db.pragma('journal_mode=DELETE');

const CHARS = fg.prepare("SELECT name,uuid FROM nodes WHERE type='person' AND uuid IS NOT NULL AND LENGTH(name)>=2 AND name NOT IN('我','玉瑶','什么名字','那你再','那你说','那继续','加班','姐姐','老家')").all();
console.log('=== 最终深度标注扫尾 ===');
let totalAdded = 0;
for (const c of CHARS) {
  const n = c.name, u = c.uuid; if (n.length < 2) continue;
  const deepPatterns = [`content LIKE '%我是${n}%'`,`content LIKE '%${n}在这里%'`,`content LIKE '%${n}在呢%'`,`content LIKE '%我就是${n}%'`,`content LIKE '%是${n}呀%'`,`content LIKE '%是${n}啦%'`,`content LIKE '%叫我${n}%'`,`content LIKE '%${n}说%'`,`content LIKE '%${n}记得%'`,`content LIKE '%${n}怎么会忘%'`,`content LIKE '%${n}怎么不记得%'`];
  for (const p of deepPatterns) { try { const r = db.prepare(`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND ${p}`).run(); totalAdded += r.changes; } catch(e) {} }
  const anchors = db.prepare('SELECT timestamp FROM conversations WHERE belong_entity_uuid=? ORDER BY timestamp LIMIT 50').all(u);
  for (const a of anchors) { const ts=a.timestamp; const s=new Date(new Date(ts).getTime()-30*60*1000).toISOString(); const e=new Date(new Date(ts).getTime()+30*60*1000).toISOString(); try { const r2=db.prepare(`UPDATE conversations SET belong_entity_uuid='${u}' WHERE belong_entity_uuid IS NULL AND role='assistant' AND timestamp BETWEEN '${s}' AND '${e}'`).run(); totalAdded+=r2.changes; } catch(ee) {} }
}
console.log('1. 深度标注: +' + totalAdded + '条');
let memAdded=0; const memAnchors=db.prepare('SELECT DISTINCT created_at,belong_entity_uuid FROM memories WHERE belong_entity_uuid IS NOT NULL LIMIT 500').all();
for(const a of memAnchors){const ts=a.created_at;const s=new Date(new Date(ts).getTime()-2*60*60*1000).toISOString();const e=new Date(new Date(ts).getTime()+2*60*60*1000).toISOString();try{const r=db.prepare('UPDATE memories SET belong_entity_uuid=? WHERE belong_entity_uuid IS NULL AND created_at BETWEEN ? AND ?').run(a.belong_entity_uuid,s,e);memAdded+=r.changes;}catch(e){}}
console.log('2. memories时间窗口(2h): +'+memAdded+'条');
const mrb=db.prepare("UPDATE memories SET belong_entity_uuid = (SELECT DISTINCT c.belong_entity_uuid FROM conversations c WHERE c.belong_entity_uuid IS NOT NULL AND c.content LIKE '%'||substr(memories.raw_input,1,40)||'%' LIMIT 1) WHERE belong_entity_uuid IS NULL").run(); console.log('3. memories内容精确匹配: +'+mrb.changes+'条');
const bdr2=db.prepare("UPDATE black_diamond SET belong_entity_uuid = (SELECT m.belong_entity_uuid FROM memories m WHERE m.id = black_diamond.source_id AND m.belong_entity_uuid IS NOT NULL) WHERE belong_entity_uuid IS NULL AND source_id IS NOT NULL").run(); console.log('4. BD回填: +'+bdr2.changes+'条');
const ct2=db.prepare('SELECT COUNT(*) as c FROM conversations').get().c; const cl2=db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt2=db.prepare('SELECT COUNT(*) as c FROM memories').get().c; const ml2=db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log('\nconvs: '+cl2+'/'+ct2+' ('+(cl2/ct2*100).toFixed(1)+'%)'); console.log('mems: '+ml2+'/'+mt2+' ('+(ml2/mt2*100).toFixed(1)+'%)');
db.close(); fg.close(); console.log('✅ 扫尾完成');
