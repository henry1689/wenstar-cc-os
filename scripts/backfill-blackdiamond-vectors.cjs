#!/usr/bin/env node
/** 黑钻库旧数据 emotion_vector 批量回填脚本
 * SCRIPT-GOV-A2d-Batch-2: 治理门控 (CRITICAL, backfill) */
const {validateGate, recordGovernanceDecision }=require('./_governance-gate.cjs');
const argv={};for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(a==='--apply')argv.apply=1;else if(a==='--dry-run');else if(a==='--operator'&&process.argv[i+1])argv.operator=process.argv[++i];else if(a==='--reason'&&process.argv[i+1])argv.reason=process.argv[++i];else if(a==='--ticket'&&process.argv[i+1])argv.ticket=process.argv[++i];else if(a==='--confirm'&&process.argv[i+1])argv.confirm=process.argv[++i];else if(a==='--scope'&&process.argv[i+1])argv.scope=process.argv[++i];else if(a==='--report-path'&&process.argv[i+1])argv.rpt=process.argv[++i];else if(a==='--help'){console.log('Usage: node backfill-blackdiamond-vectors.cjs [--apply] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]');process.exit(0)}}
const mode=argv.apply?'apply':'dry-run',isDry=!argv.apply;
const path = require('path');
const fs = require('fs');

// ─── 情感标签 → 近似 24D 向量映射 ───
const TAG_VECTORS = {
  '开心': [0.7,0.6,0.5,0.1,0.6,0.4,0.2,0.3,0.5,0.2,0.3,0.3,0.4,0.1,0.3,0.4,0.5,0.5,0.3,0.2,0.3,0.1,0.4,0.6],
  '感动': [0.6,0.3,0.4,0.0,0.7,0.2,0.3,0.2,0.4,0.3,0.4,0.5,0.5,0.1,0.4,0.5,0.5,0.6,0.2,0.2,0.3,0.1,0.3,0.5],
  '难过': [-0.5,-0.3,-0.3,0.2,0.5,0.0,0.3,0.2,0.3,0.3,0.5,0.5,0.2,0.2,0.5,0.3,0.3,0.3,0.0,0.1,0.1,0.1,0.0,0.2],
  '思念': [0.3,0.2,0.2,0.0,0.6,0.1,0.3,0.2,0.3,0.4,0.5,0.6,0.5,0.1,0.4,0.4,0.4,0.5,0.2,0.2,0.2,0.2,0.2,0.4],
  '愤怒': [-0.6,0.7,0.3,0.8,0.1,0.0,0.4,0.3,0.6,0.1,0.2,0.3,0.0,0.5,0.2,0.2,0.2,0.1,0.1,0.3,0.0,0.4,0.1,0.1],
  '亲密': [0.7,0.6,0.4,0.0,0.5,0.3,0.1,0.2,0.4,0.2,0.3,0.4,0.7,0.2,0.5,0.3,0.4,0.5,0.6,0.5,0.6,0.5,0.6,0.5],
  '焦虑': [-0.3,0.6,-0.2,0.3,0.3,0.0,0.4,0.3,0.2,0.3,0.5,0.5,0.2,0.3,0.4,0.3,0.3,0.2,0.2,0.3,0.1,0.3,0.1,0.1],
  '温暖': [0.6,0.3,0.5,0.0,0.7,0.3,0.2,0.2,0.5,0.2,0.3,0.3,0.5,0.0,0.4,0.5,0.5,0.6,0.2,0.2,0.3,0.1,0.3,0.6],
  '中性': [0.0,0.0,0.0,0.0,0.3,0.1,0.3,0.3,0.3,0.2,0.3,0.3,0.0,0.0,0.2,0.3,0.3,0.3,0.0,0.0,0.0,0.0,0.0,0.3],
};

const PROJECT_ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'webui', 'fusion_memory.db');

async function main() {
  // ── 预检门控 ──
  if(!isDry){const c={scriptId:'backfill-blackdiamond-vectors',riskLevel:'CRITICAL',operationType:'backfill',mode,environment:'local',operator:{operatorId:argv.operator||'',reason:argv.reason||'',ticket:argv.ticket||null},scope:{selector:argv.scope||'table:black_diamond',limit:0,batchSize:0,since:null,until:null},confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null},backup:{required:true,created:false,backupId:null,backupPath:null,verified:false},irreversibleConfirmation:!!argv.confirm,reportPath:argv.rpt||null};const pf=validateGate(c);const pe=pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));if(pe.length>0){console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: backfill-blackdiamond-vectors.cjs  Risk: CRITICAL  Mode: apply\n  Issues:');pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message));console.error('\n  Refusing to continue.\n═══\n');recordGovernanceDecision(c,pf);process.exit(2)}}
  if(isDry){console.log('[DRY-RUN] backfill-blackdiamond-vectors — 将扫描 black_diamond 中 emotion_vector IS NULL 的行。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际回填。\n');process.exit(0)}
  let SQL;
  try {
    SQL = require('sql.js');
  } catch (e) {
    // sql.js might need dynamic import in ESM context
    const m = await import('sql.js');
    SQL = m.default || m;
  }
  const initSqlJs = SQL.default || SQL;
  const sql = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.error('数据库不存在:', DB_PATH);
    process.exit(1);
  }

  const buf = fs.readFileSync(DB_PATH);
  const db = new sql.Database(buf);

  // 查找所有 emotion_vector 为空的条目
  const rows = db.exec("SELECT id, emotion_tag FROM black_diamond WHERE emotion_vector IS NULL OR emotion_vector = ''");
  if (rows.length === 0 || !rows[0].values) {
    console.log('没有需要回填的条目');
    db.close();
    return;
  }

  const values = rows[0].values;
  let updated = 0;

  for (const row of values) {
    const id = row[0];
    const tag = row[1] || '中性';
    const vec = TAG_VECTORS[tag];
    const finalVec = vec || TAG_VECTORS['中性'];

    db.run("UPDATE black_diamond SET emotion_vector = ? WHERE id = ?", [JSON.stringify(finalVec), id]);
    updated++;
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('✅ 已回填 ' + updated + ' 条黑钻条目的 emotion_vector');
}

main().catch(function(err) {
  console.error('回填失败:', err.message);
  process.exit(1);
});
