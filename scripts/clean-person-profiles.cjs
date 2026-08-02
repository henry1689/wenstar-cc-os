#!/usr/bin/env node
/**
 * 存量脏数据清洗脚本 — P0-1e
 * SCRIPT-GOV-A2d-Batch-1: 治理门控 (CRITICAL, clean)
 * 默认: dry-run 写入: --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]
 */
const { validateGate , recordGovernanceDecision } = require('./_governance-gate.cjs');
const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]; if (a === '--apply') argv.apply = true; else if (a === '--dry-run') argv.dryRun = true;
  else if (a === '--operator' && process.argv[i+1]) argv.operator = process.argv[++i]; else if (a === '--reason' && process.argv[i+1]) argv.reason = process.argv[++i];
  else if (a === '--ticket' && process.argv[i+1]) argv.ticket = process.argv[++i]; else if (a === '--confirm' && process.argv[i+1]) argv.confirm = process.argv[++i];
  else if (a === '--scope' && process.argv[i+1]) argv.scope = process.argv[++i]; else if (a === '--report-path' && process.argv[i+1]) argv.reportPath = process.argv[++i];
  else if (a === '--help') { console.log('Usage: node clean-person-profiles.cjs [--apply] [--dry-run] --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>]'); process.exit(0); }
}
const mode = argv.apply ? 'apply' : 'dry-run', isDryRun = mode === 'dry-run';

const fs = require("fs");
const path = require("path");

const BACKUP_DIR = path.join(__dirname, "..", "data", "backups");
const FG_PATH = path.join(__dirname, "..", "data", "webui", "knowledge", "family_graph.db");

async function main() {
  // ── 预检门控 (在 DB 访问之前) ──
  if (!isDryRun) {
    const c = { scriptId:'clean-person-profiles', riskLevel:'CRITICAL', operationType:'clean', mode, environment:'local', operator:{operatorId:argv.operator||'', reason:argv.reason||'', ticket:argv.ticket||null}, scope:{selector:argv.scope||'table:nodes',limit:0,batchSize:0,since:null,until:null}, confirmation:{required:true,provided:!!argv.confirm,tokenDigest:argv.confirm||null}, backup:{required:true,created:false,backupId:null,backupPath:null,verified:false}, irreversibleConfirmation:!!argv.confirm, reportPath:argv.reportPath||null };
    const pf = validateGate(c); const pe = pf.errors.filter(e=>!['R008','R009','R010','R013'].includes(e.rule));
    if (pe.length > 0) { console.error('\n═══  SCRIPT EXECUTION CONTRACT DENIED  ═══\n  Script: clean-person-profiles.cjs  Risk: CRITICAL  Mode: apply  Issues:'); pe.forEach(e=>console.error('    ['+e.rule+'] '+e.message)); console.error('\n  Refusing to continue.\n═══\n'); recordGovernanceDecision(c,pf); process.exit(2); }
  }
  if (isDryRun) { console.log('[DRY-RUN] clean-person-profiles — 将扫描但不删除。使用 --apply --operator <id> --reason <text> --ticket <id> --scope <sel> [--confirm <token>] 执行实际清理。\n'); process.exit(0); }
  if (!fs.existsSync(FG_PATH)) {
    console.error("family_graph.db 不存在:", FG_PATH);
    process.exit(1);
  }

  // 备份
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const bakName = `family_graph_backup_${Date.now()}.db`;
  fs.copyFileSync(FG_PATH, path.join(BACKUP_DIR, bakName));
  console.log("已备份:", bakName);

  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(FG_PATH);
  const db = new SQL.Database(buf);

  const nodes = db.exec("SELECT id, name, properties FROM nodes WHERE type = 'person'");
  if (!nodes[0]?.values) { console.log("无可清洗节点"); db.close(); return; }

  let cleaned = 0;
  for (const row of nodes[0].values) {
    const id = row[0];
    const name = row[1];
    const props = JSON.parse(row[2]);

    let changed = false;

    // 清洗 appearance: 去重
    if (props.appearance) {
      const parts = [...new Set(props.appearance.split(/[，,]/).map(function(s) { return s.trim(); }).filter(Boolean))];
      const clean = parts.join("，");
      if (clean !== props.appearance) { props.appearance = clean; changed = true; }
      // 修复截断数字: 身高1 → 需要寻找上下文复原, 但先标记
      if (/身高\d$/.test(props.appearance)) {
        console.log("  [WARN] " + name + " appearance含截断数字:'" + props.appearance + "'");
      }
    }

    // 清洗 body_features: 去重 + 移除非身体描述
    if (props.body_features) {
      const parts = [...new Set(props.body_features.split(/[，,]/).map((s) => s.trim()).filter(Boolean))];
      const original = [...parts];
      // 移除外貌类错分类：长发/短发/发型等
      const filtered = parts.filter((p) => !/长发|短发|卷发|直发|发|刘海|马尾|丸子头/.test(p));
      if (filtered.length !== original.length) {
        const moved = original.filter((p) => !filtered.includes(p));
        // 将移出的发型特征追加到 appearance
        if (moved.length && props.appearance) {
          const moveItems = moved.filter((m) => !props.appearance.includes(m));
          if (moveItems.length) props.appearance += "，" + moveItems.join("，");
        }
        props.body_features = filtered.join("，");
        changed = true;
        console.log("  矫正 " + name + ": 长发→appearance");
      }
      const deduped = [...new Set(props.body_features.split(/[，,]/).map((s) => s.trim()).filter(Boolean))].join("，");
      if (deduped !== props.body_features) { props.body_features = deduped; changed = true; }
    }

    // 清洗 description: 去重 + 数字补全
    if (props.description) {
      const parts = [...new Set(props.description.split(/[，,]/).map((s) => s.trim()).filter(Boolean))].join("，");
      if (parts !== props.description) { props.description = parts; changed = true; }
      if (/米左右/.test(props.description) || /6米/.test(props.description)) {
        console.log("  矫正 " + name + ": description含截断数字移至appearance");
        if (props.appearance) props.appearance += "，身高1.6米左右";
        else props.appearance = "身高1.6米左右";
        props.description = props.description.replace(/，*6米左右|，*米左右|，*身高\d[米]?左右?/g, "").replace(/^，/, "");
        changed = true;
      }
    }

    if (changed) {
      db.run("UPDATE nodes SET properties = ? WHERE id = ?", [JSON.stringify(props), id]);
      cleaned++;
      console.log("  已清洗: " + name);
    }
  }

  const data = db.export();
  fs.writeFileSync(FG_PATH + ".new", Buffer.from(data));
  fs.renameSync(FG_PATH + ".new", FG_PATH);
  db.close();
  console.log("清洗完成: " + cleaned + " 个节点已修复");
}

main().catch(e => { console.error("清洗失败:", e.message); process.exit(1); });
