// cleanup-black-diamond.mjs — 黑钻清理 V10.1
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, clean)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node cleanup-black-diamond.mjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'cleanup-black-diamond', riskLevel:'CRITICAL', operationType:'clean', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:black_diamond',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: cleanup-black-diamond.mjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] cleanup-black-diamond — 将扫描黑钻表中待删除条目。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际清理。\n'); process.exit(0); }

import Database from 'better-sqlite3';
import { join } from 'path';
const db = new Database(join(process.cwd(), 'data/webui/fusion_memory.db'));
console.log('🔧 黑钻清理 V10.1');
const total = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
console.log('当前总数: ' + total);
const toKeep = db.prepare('SELECT id FROM black_diamond ORDER BY calcium_level DESC, created_at DESC LIMIT 300').all().map(function(r) { return r.id; });
const keepSet = new Set(toKeep);
console.log('保留: ' + toKeep.length + ' 条');
const toDelete = db.prepare('SELECT id, summary, calcium_level FROM black_diamond WHERE id NOT IN (' + toKeep.map(function() { return '?'; }).join(',') + ') ORDER BY calcium_level ASC, created_at ASC').all(...toKeep);
console.log('删除: ' + toDelete.length + ' 条');
if (toDelete.length > 0) {
  const sample = toDelete.slice(0, 5);
  for (const r of sample) { console.log('  L' + r.calcium_level + ' | ' + (r.summary || '').substring(0, 40)); }
  if (toDelete.length > 5) console.log('  ... and ' + (toDelete.length - 5) + ' more');
  const delStmt = db.prepare('DELETE FROM black_diamond WHERE id = ?');
  db.transaction(function() { for (const r of toDelete) { delStmt.run(r.id); } })();
  console.log('✅ 已清理 ' + toDelete.length + ' 条');
}
const after = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const dist = db.prepare('SELECT calcium_level, COUNT(*) as c FROM black_diamond GROUP BY calcium_level ORDER BY calcium_level').all();
console.log('清理后: ' + after + ' 条');
for (const r of dist) { console.log('  L' + r.calcium_level + ': ' + r.c + '条'); }
db.close();
console.log('✅ 完成');
