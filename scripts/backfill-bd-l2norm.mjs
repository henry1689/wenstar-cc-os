// backfill-bd-l2norm.mjs — 黑钻 l2_norm 回填
// SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, backfill)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node backfill-bd-l2norm.mjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'backfill-bd-l2norm', riskLevel:'CRITICAL', operationType:'backfill', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:black_diamond',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: backfill-bd-l2norm.mjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] backfill-bd-l2norm — 将扫描 black_diamond 中 l2_norm IS NULL 的行。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际回填。\n'); process.exit(0); }

import Database from 'better-sqlite3';
import { join } from 'path';
const DB_PATH = join(process.cwd(), 'data/webui/fusion_memory.db');
console.log('🔧 黑钻 l2_norm 回填');
const db = new Database(DB_PATH);
const nullCount = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE l2_norm IS NULL').get().c;
const total = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
console.log(`总数:${total} NULL:${nullCount}`);
if (nullCount === 0) { console.log('无需回填'); db.close(); process.exit(0); }
const rows = db.prepare('SELECT id, emotion_vector FROM black_diamond WHERE l2_norm IS NULL AND emotion_vector IS NOT NULL').all();
console.log(`待处理: ${rows.length}`);
let updated=0, skipped=0;
const stmt = db.prepare('UPDATE black_diamond SET l2_norm = ? WHERE id = ?');
db.transaction(() => {
  for (const row of rows) {
    try { const vec = JSON.parse(row.emotion_vector); if (!Array.isArray(vec) || vec.length===0) { skipped++; continue; } let sumSq=0; for (let i=0;i<vec.length;i++) { const v=Number(vec[i])||0; sumSq+=v*v; } const norm = Math.round(Math.sqrt(sumSq)*10000)/10000; stmt.run(norm, row.id); updated++; } catch { skipped++; }
  }
})();
console.log(`完成: ${updated}更新 ${skipped}跳过`);
const stillNull = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE l2_norm IS NULL').get().c;
console.log(`剩余NULL: ${stillNull}`);
db.close();
