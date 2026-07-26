/**
 * fix-xiongziming-edges.cjs — 熊梓铭FG关系边清理+重建
 * ====================================================
 * S3: 数据修复 —— 删除11条垃圾/矛盾边，重建正确关系链
 * Harness: run_ms1klhp1_2r61
 */
const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = 'D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db';

// 备份
const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = DB_PATH.replace('.db', `_backup_${now}.db`);
fs.copyFileSync(DB_PATH, backupPath);
console.log('备份: ' + backupPath);

const fg = new D(DB_PATH);

// ── 辅助函数 ──
function getNodeId(name) {
  const r = fg.prepare("SELECT id FROM nodes WHERE name = ?").get(name);
  return r ? r.id : null;
}

function deleteEdgesBetween(a, b) {
  const aId = getNodeId(a);
  const bId = getNodeId(b);
  if (!aId || !bId) return 0;
  const r1 = fg.prepare('DELETE FROM edges WHERE source_id = ? AND target_id = ?').run(aId, bId);
  const r2 = fg.prepare('DELETE FROM edges WHERE source_id = ? AND target_id = ?').run(bId, aId);
  return r1.changes + r2.changes;
}

function addEdge(source, target, relation) {
  const srcId = getNodeId(source);
  const tgtId = getNodeId(target);
  if (!srcId || !tgtId) {
    console.log(`  ⚠️ 跳过: ${source}(${srcId}) → ${target}(${tgtId})`);
    return;
  }
  // 检查是否已存在
  const exist = fg.prepare(
    'SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?'
  ).get(srcId, tgtId, relation);
  if (exist) {
    console.log(`  ⏭ 已存在: ${source} —${relation}→ ${target}`);
    return;
  }
  fg.prepare("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))")
    .run('e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), srcId, tgtId, relation);
  console.log(`  ✅ 新增: ${source} —${relation}→ ${target}`);
}

// ═══════════════════════════════════════════════════
// 第一步：删除11条垃圾/矛盾边
// ═══════════════════════════════════════════════════
console.log('\n=== 第一步：删除垃圾边 ===');

// 孙辈→垃圾实体（出差/妈/玉瑶/同事）
const garbageTargets = ['出差', '妈', '玉瑶', '同事'];
for (const t of garbageTargets) {
  const cnt = deleteEdgesBetween('熊梓铭', t);
  if (cnt) console.log('  删除: 熊梓铭 ↔ ' + t + ' (' + cnt + '条)');
}

// 矛盾边：王全芬（既有"孙辈"又有"子女"——全删后重建）
const cnt_wqf = deleteEdgesBetween('熊梓铭', '王全芬');
console.log('  删除: 熊梓铭 ↔ 王全芬 (' + cnt_wqf + '条——重建为child_of)');

// 错误边：叔叔→徐诗雨/徐诗涵（熊梓铭是女性）
const cnt_xsy = deleteEdgesBetween('熊梓铭', '徐诗雨');
console.log('  删除: 熊梓铭 ↔ 徐诗雨 (' + cnt_xsy + '条——重建为younger_sister_of)');

const cnt_xsh = deleteEdgesBetween('熊梓铭', '徐诗涵');
console.log('  删除: 熊梓铭 ↔ 徐诗涵 (' + cnt_xsh + '条——重建为younger_sister_of)');

// 侄女→徐诗韵（方向反了，熊梓铭比诗韵小）
const cnt_xsy2 = deleteEdgesBetween('熊梓铭', '徐诗韵');
console.log('  删除: 熊梓铭 ↔ 徐诗韵 (' + cnt_xsy2 + '条——重建为younger_sister_of)');

// ═══════════════════════════════════════════════════
// 第二步：确保必要节点存在
// ═══════════════════════════════════════════════════
console.log('\n=== 第二步：确保节点存在 ===');
const neededNodes = ['熊勇', '王全芬', '熊梓玥'];
for (const name of neededNodes) {
  const existing = fg.prepare("SELECT id FROM nodes WHERE name = ?").get(name);
  if (existing) {
    console.log('  ✅ 已存在: ' + name + ' (' + existing.id + ')');
  } else {
    const newId = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    fg.prepare("INSERT INTO nodes (id, name, type, properties, created_at, updated_at) VALUES (?, ?, 'person', '{}', datetime('now'), datetime('now'))")
      .run(newId, name);
    console.log('  🆕 新建: ' + name + ' (' + newId + ')');
  }
}

// ═══════════════════════════════════════════════════
// 第三步：重建正确关系边
// ═══════════════════════════════════════════════════
console.log('\n=== 第三步：重建正确边 ===');

// 熊梓铭 —child_of→ 熊勇  (熊梓铭是熊勇的女儿)
addEdge('熊梓铭', '熊勇', 'child_of');

// 熊梓铭 —child_of→ 王全芬  (熊梓铭是王全芬的女儿)
addEdge('熊梓铭', '王全芬', 'child_of');

// 熊勇 —colleague_of→ 我  (熊勇是用户同事)
addEdge('熊勇', '我', 'colleague_of');

// 熊勇 —spouse_of→ 王全芬  (熊勇和王全芬是夫妻)
addEdge('熊勇', '王全芬', 'spouse_of');

// 熊梓铭 —younger_sister_of→ 徐诗雨  (梓铭比诗雨小)
addEdge('熊梓铭', '徐诗雨', 'younger_sister_of');

// 熊梓铭 —younger_sister_of→ 徐诗韵
addEdge('熊梓铭', '徐诗韵', 'younger_sister_of');

// 熊梓铭 —younger_sister_of→ 徐诗涵
addEdge('熊梓铭', '徐诗涵', 'younger_sister_of');

// 熊梓铭 —elder_sister_of→ 熊梓玥  (梓铭是梓玥的姐姐)
addEdge('熊梓铭', '熊梓玥', 'elder_sister_of');

// 熊梓玥 —younger_sister_of→ 熊梓铭  (梓玥是梓铭的妹妹)
addEdge('熊梓玥', '熊梓铭', 'younger_sister_of');

// ═══════════════════════════════════════════════════
// 第四步：验证
// ═══════════════════════════════════════════════════
console.log('\n=== 第四步：验证 ===');
const zzmId = getNodeId('熊梓铭');
const edges = fg.prepare(
  'SELECT e.relation, n.name FROM edges e JOIN nodes n ON e.target_id = n.id WHERE e.source_id = ? ORDER BY e.relation'
).all(zzmId);
console.log('熊梓铭当前边 (' + edges.length + '条):');
edges.forEach(e => console.log('  ' + e.relation + ' → ' + e.name));

// 检查 我 的连接
const meId = getNodeId('我');
const meEdges = fg.prepare(
  'SELECT e.relation, n.name FROM edges e JOIN nodes n ON e.target_id = n.id WHERE e.source_id = ? ORDER BY e.relation'
).all(meId);
console.log('\n我的当前边 (' + meEdges.length + '条):');
meEdges.forEach(e => console.log('  ' + e.relation + ' → ' + e.name));

fg.close();
console.log('\n✅ 熊梓铭FG关系边修复完成');
console.log('   备份: ' + backupPath);
console.log('   如需回滚: cp ' + backupPath + ' ' + DB_PATH);
