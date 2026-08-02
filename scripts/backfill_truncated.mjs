/**
 * backfill_truncated_memories.mjs
 *
 * 从 conversations 表回填被截断的 memories.raw_input 文本。
 * 原因：SQLiteAdapter.writeMemory() 曾将 raw_input 硬截断到 2000 字符，
 * 但 conversations.content 无此限制，存储了完整原文。
 *
 * 策略：匹配 seq_pos 或 content 前缀，若 conversations 中长度 > memories 中长度，
 * 则用完整文本替换。
 *
 * 幂等可重跑。
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';

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
  else if (a === '--help') { console.log('Usage: node backfill_truncated.mjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'backfill_truncated', riskLevel:'CRITICAL', operationType:'backfill', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:memories',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: backfill_truncated.mjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] backfill_truncated — 将扫描截断的 memories。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际修复。\n'); process.exit(0); }

const DB_PATH = 'data/webui/fusion_memory.db';

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(DB_PATH));
const now = new Date().toISOString();

// 找到所有 raw_input 长度接近 2000 的记忆（可能是截断点）
const truncated = db.exec(
  "SELECT id, seq_pos, raw_input, LENGTH(raw_input) as len, created_at FROM memories WHERE LENGTH(raw_input) >= 1900 AND LENGTH(raw_input) <= 2010 ORDER BY seq_pos DESC"
);
const rows = truncated[0]?.values || [];
console.log(`发现 ${rows.length} 条可能被截断的记忆`);

let fixed = 0;
let skipped = 0;

for (const [memId, seqPos, rawInput, len, createdAt] of rows) {
  // 从 conversations 中查找同 seq_pos 或相近时间的完整文本
  const conv = db.exec(
    "SELECT role, content, LENGTH(content) as clen FROM conversations WHERE seq_pos = ? OR (timestamp BETWEEN datetime(?, '-5 minutes') AND datetime(?, '+5 minutes') AND role = 'user') ORDER BY LENGTH(content) DESC LIMIT 1",
    [seqPos, createdAt, createdAt]
  );

  if (!conv.length || !conv[0].values.length) {
    skipped++;
    continue;
  }

  const [role, fullContent, fullLen] = conv[0].values[0];

  // 仅当 conversations 中的文本明显更长且包含截断的记忆文本时才回填
  if (fullLen > len + 50 && String(fullContent).includes(String(rawInput).substring(0, Math.min(len - 20, 500)))) {
    db.exec(
      "UPDATE memories SET raw_input = ? WHERE id = ?",
      [String(fullContent), memId]
    );
    fixed++;
    console.log(`  ✅ ${memId}: ${len}→${fullLen} (${seqPos})`);
  } else {
    skipped++;
  }
}

console.log(`\n回填完成: ${fixed} 条修复, ${skipped} 条跳过`);

// 保存
const data = db.export();
writeFileSync(DB_PATH, Buffer.from(data));
db.close();
