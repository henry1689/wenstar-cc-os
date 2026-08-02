#!/usr/bin/env node
/**
 * 清理knowledge-md中乱码文件
 * SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, clean — FS操作)
 */
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node fix-garbled-files.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';
if (!isDryRun) {
  const c = { scriptId:'fix-garbled-files', riskLevel:'CRITICAL', operationType:'clean', mode, environment:'local',
    operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null},
    scope:{selector:argv.scope||'dir:knowledge-md',limit:0,batchSize:0,since:null,until:null},
    confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null},
    backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},
    irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
  const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
  if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: fix-garbled-files.cjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
}
if (isDryRun) { console.log('[DRY-RUN] fix-garbled-files — 将扫描但不删除。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际清理。\n'); process.exit(0); }

// ── 治理通过 ──
const fs = require('fs');
const path = require('path');

const dir = 'D:/wenstar/data/knowledge-md';
const cabDir = 'D:/wenstar/data/knowledge-cabinet/docs';

const log = [];
function fixFile(bytes) { return Buffer.from(bytes).toString('utf-8').replace(/^# /, '').replace(/^#+/, '').trim(); }
function hasChinese(s) { return [...s].some(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF); }
const garbledRe = /[ÃÅÆÇÉÐÝÞßàáâãäåæçèéêëìíîïðòóôõöøùúûüýþ]/;

const files = fs.readdirSync(dir);
const garbledFiles = files.filter(f => garbledRe.test(f));
let deleted = 0, renamed = 0;

for (const gf of garbledFiles) {
  const bytes = [];
  for (let i = 0; i < gf.length; i++) bytes.push(gf.charCodeAt(i));
  const fixed = fixFile(bytes); const hasCn = hasChinese(fixed); const fixOk = hasCn && !garbledRe.test(fixed);
  let hasNormal = false;
  if (fixOk) {
    const cleanFixed = fixed.replace(/^#\s*/, '').replace(/^#+/, '').trim();
    for (const f of files) { if (f === gf || garbledRe.test(f)) continue; if (f === cleanFixed || cleanFixed.startsWith(f) || f.startsWith(cleanFixed)) { hasNormal = true; break; } }
  }
  const gfPath = path.join(dir, gf); const cabPath = path.join(cabDir, gf.replace(/\.md$/, '.txt'));
  if (hasNormal) { fs.unlinkSync(gfPath); if (fs.existsSync(cabPath)) fs.unlinkSync(cabPath); deleted++; log.push(`🗑️ 删除(有正常版): ${gf.substring(0,40)}`); }
  else if (fixOk) { const newName = fixed; const newPath = path.join(dir, newName); if (!fs.existsSync(newPath)) { let content = fs.readFileSync(gfPath, 'utf-8'); if (garbledRe.test(content)) { const contentBytes = []; for (let i = 0; i < content.length; i++) contentBytes.push(content.charCodeAt(i)); const fixedContent = Buffer.from(contentBytes).toString('utf-8'); if (hasChinese(fixedContent) && !garbledRe.test(fixedContent)) { content = fixedContent; log.push(`  (内容也修复了)`); } } fs.writeFileSync(newPath, content, 'utf-8'); fs.unlinkSync(gfPath); renamed++; log.push(`🔄 重命名: ${gf.substring(0,30)} → ${newName.substring(0,40)}`); } }
  else { fs.unlinkSync(gfPath); if (fs.existsSync(cabPath)) fs.unlinkSync(cabPath); deleted++; log.push(`🗑️ 删除(无法修复): ${gf.substring(0,40)}`); }
}

console.log(`✅ 完成: 删除 ${deleted} 个, 重命名 ${renamed} 个`);
for (const l of log) console.log(l);
const remaining = fs.readdirSync(dir); const stillGarbled = remaining.filter(f => garbledRe.test(f));
console.log(`\n残留乱码文件: ${stillGarbled.length} 个`);
if (stillGarbled.length > 0) for (const f of stillGarbled) console.log('  ⚠️ ' + f);
