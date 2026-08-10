/**
 * cleanup-xsy-full.cjs — 徐诗雨全链路清理脚本（D 方向 + E 方向）
 * =========================================================
 * 职责（S1 审计 + S2 方案 D/E）：
 *   D1 清理 entities 表垃圾实体（对话碎片/淫秽内容/错误类型）
 *   D2 清理 FG 垃圾节点（对话碎片，16 个）
 *   D3 清理 FG 孤儿边 + 徐诗雨残留边（aunt_of/niece_of/匿名 ms4dsqmp）
 *   D4 保留真实人物（22 个白名单）
 *   E1 徐诗雨顶层 age=24（由 birthYear 推导）
 *   E2 relationToUser 修正
 *   E3 pendingItems 清理（删除对话碎片条目）
 *   E4 interests 清理（保留真实兴趣）
 *   E5 顶层 appearance 删除"上班是6天制"
 *   E6 gender 统一"女"
 *   E7 删除孤儿边（家里/家有谁/和鸿艺）
 *   E8 清理 dossier._deprecated 贬损描述
 *
 * 执行时机：必须停服务器后执行（sql.js 内存态会覆盖磁盘）
 * 幂等：可重复执行
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const FM_PATH = path.join(BASE, 'data/webui/fusion_memory.db');
const FG_PATH = path.join(BASE, 'data/webui/knowledge/family_graph.db');

// ── 白名单：真实人物（22 个 FG 节点名）──
const REAL_PERSONS = new Set([
  '熊梓铭','熊勇','王全芬','林土锋','徐诗雨','阿珍','宁清华','陈雪花','曾美容',
  '徐诗韵','陈斌','刘运新','赖陈喜','邱运财','张小龙','阿苏','徐诗涵','熊梓玥',
  '罗权斌','徐东伟','玉瑶','陈锋华',
]);

// ── 徐诗雨修复配置 ──
const XSY = '徐诗雨';
const XSY_RELATION = '鸿艺的熟人——亲密关系（热力追踪已确认）';
// 保留的真实 interests（其余全删）
const REAL_INTERESTS = new Set(['栀子花','栀子花的味道','窝在沙发上翻小说','用栀子花味的香水']);
// pendingItems 删除关键词（对话碎片特征）
const PENDING_GARBAGE_RE = /打印签字|自己搞定|发烫|问徐诗雨要|也不急|那个项目|就写你的名字|你去搞定|的14岁|你的理由|这个文雅|梓铭阿姨|她这个描述|她这段身世|听…|栀…|凉茶|发烫/;
// pendingItems 强过滤：动作描写碎片（无档案价值）
const PENDING_ACTION_RE = /^(点点头|微微一怔|听了这话|放下手机|放下手里的|轻轻推了推|推了推鼻梁|理了理|轻声答道|一起聊聊|好的|嗯|肩上的长发|备忘录上|手机备忘录|看了一眼|低下头|抬起头|转过身|走过来|站起身来|接着说|继续说|顿了顿|沉默|叹了口气|笑了笑|笑了|开口|应了一声|答了一句|问道|说道|话还没说完|想了想|回忆了一下|认真地|仔细地|微微颔首|颔首|点头|摇头|皱眉|抬眼|垂眸|低语|呢喃|试探着|带着|语气|声音也轻了|接话|接过|拿起|搁下|放下|翻开|合上|站起|坐下)/;

function now() { return new Date().toISOString(); }

const results = {};

// ═══════════════════════════════════════════════════════════
// 1. 清理 fusion_memory.db — entities 表
// ═══════════════════════════════════════════════════════════
function cleanupEntities(fm) {
  const before = fm.prepare('SELECT COUNT(*) c FROM entities').get().c;
  const all = fm.prepare('SELECT id, name, type, uuid FROM entities').all();
  let kept = 0, deleted = 0;
  const deletedNames = [];
  const delStmt = fm.prepare('DELETE FROM entities WHERE id = ?');
  for (const e of all) {
    if (REAL_PERSONS.has(e.name)) { kept++; continue; }
    delStmt.run(e.id);
    deleted++;
    if (deleted <= 30) deletedNames.push(e.name);
  }
  const after = fm.prepare('SELECT COUNT(*) c FROM entities').get().c;
  results.entities = { before, after, kept, deleted, deletedNames };
  console.log(`[Cleanup] entities: ${before}->${after} (保留${kept}, 删除${deleted})`);
  if (deletedNames.length) console.log('[Cleanup]   删除样例:', deletedNames.join(', '));
}

// ═══════════════════════════════════════════════════════════
// 2. 清理 family_graph.db — 垃圾节点 + 边
// ═══════════════════════════════════════════════════════════
function cleanupFG(fg) {
  const beforeNodes = fg.prepare('SELECT COUNT(*) c FROM nodes').get().c;
  const nodes = fg.prepare('SELECT id, name FROM nodes').all();
  let delNodes = 0;
  const delNodeStmt = fg.prepare('DELETE FROM nodes WHERE id = ?');
  for (const n of nodes) {
    if (!REAL_PERSONS.has(n.name)) {
      fg.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(n.id, n.id);
      delNodeStmt.run(n.id);
      delNodes++;
    }
  }
  const afterNodes = fg.prepare('SELECT COUNT(*) c FROM nodes').get().c;
  results.fg_nodes = { before: beforeNodes, after: afterNodes, delNodes };

  const beforeEdges = fg.prepare('SELECT COUNT(*) c FROM edges').get().c;
  const orphanInfo = fg.prepare(`
    DELETE FROM edges WHERE
      (SELECT COUNT(*) FROM nodes WHERE id = edges.source_id) = 0 OR
      (SELECT COUNT(*) FROM nodes WHERE id = edges.target_id) = 0
  `).run();
  const afterEdges = fg.prepare('SELECT COUNT(*) c FROM edges').get().c;
  results.fg_edges = { before: beforeEdges, after: afterEdges, orphanDeleted: orphanInfo.changes };

  const xsy = fg.prepare('SELECT id FROM nodes WHERE name = ?').get(XSY);
  if (xsy) {
    const delWrong = fg.prepare("DELETE FROM edges WHERE (source_id=? OR target_id=?) AND relation IN ('aunt_of','niece_of')").run(xsy.id, xsy.id);
    results.xsy_wrong_edges = delWrong.changes;
  }
  console.log(`[Cleanup] FG nodes: ${beforeNodes}->${afterNodes} (删除${delNodes}个垃圾节点)`);
  console.log(`[Cleanup] FG edges: ${beforeEdges}->${afterEdges} (孤儿边${orphanInfo.changes}条)`);
}

// ═══════════════════════════════════════════════════════════
// 3. 清理 entity_relations — 指向已删除实体的边
// ═══════════════════════════════════════════════════════════
function cleanupEntityRelations(fm) {
  const before = fm.prepare('SELECT COUNT(*) c FROM entity_relations').get().c;
  const info = fm.prepare(`
    DELETE FROM entity_relations WHERE
      (SELECT COUNT(*) FROM entities WHERE id = entity_relations.entity_a_id) = 0 OR
      (SELECT COUNT(*) FROM entities WHERE id = entity_relations.entity_b_id) = 0
  `).run();
  const after = fm.prepare('SELECT COUNT(*) c FROM entity_relations').get().c;
  results.entity_relations = { before, after, deleted: info.changes };
  console.log(`[Cleanup] entity_relations: ${before}->${after} (删除${info.changes})`);
}

// ═══════════════════════════════════════════════════════════
// 4. 徐诗雨 FG 档案修复
// ═══════════════════════════════════════════════════════════
function fixXuShiyu(fg) {
  const node = fg.prepare('SELECT id, properties FROM nodes WHERE name = ?').get(XSY);
  if (!node) { console.log('[Fix] 徐诗雨节点不存在'); return; }
  const props = JSON.parse(node.properties || '{}');

  // E1: age 修正（2002 生 -> 24 岁）
  props.age = 24;
  // E2: relation_to_user
  props.relation_to_user = XSY_RELATION;
  // E5: 顶层 appearance 删除"上班是6天制"
  if (props.appearance === '上班是6天制') delete props.appearance;
  // E6: gender 统一
  props.gender = '女';
  // E4: interests 清理
  if (Array.isArray(props.interests)) {
    props.interests = props.interests.filter(i => REAL_INTERESTS.has(String(i)));
  }

  // E3: pendingItems 清空 — 审计确认顶层183条+selfProfile23条全是
  //     角色扮演对话/动作描写的误提取（"14岁""平胸""学生妹""肩上的长发"等），
  //     无真实档案价值且含不当内容。真实档案已在 selfProfile.appearance/traits
  //     /bodyFeatures 等规范字段维护。清空避免污染后续会晤上下文注入。
  const d = props.dossier || {};
  if (Array.isArray(d.selfProfile?.pendingItems) && d.selfProfile.pendingItems.length > 0) {
    results.xsy_pending = { before: d.selfProfile.pendingItems.length, after: 0 };
    d.selfProfile.pendingItems = [];
  }
  if (Array.isArray(props.pendingItems) && props.pendingItems.length > 0) {
    results.xsy_pending_top = { before: props.pendingItems.length, after: 0 };
    props.pendingItems = [];
  }
  // E8: 清理 dossier._deprecated 贬损描述
  if (d._deprecated?.imageTraits) {
    d._deprecated.imageTraits = {
      archived: true,
      note: '历史图像特征，含过时/不当描述，已归档清理',
      archived_at: now(),
    };
  }
  // 清空 voice "不详"
  if (d.selfProfile?.voice === '不详') delete d.selfProfile.voice;

  props.dossier = d;
  fg.prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(props), now(), node.id);
  results.xsy_fixed = true;
  console.log('[Fix] 徐诗雨档案已修复 (age=24, relationToUser, pendingItems/interests/appearance/gender/_deprecated)');
}

// ═══════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════
function main() {
  console.log('=== 徐诗雨全链路清理开始 ===');
  const fm = new Database(FM_PATH);
  const fg = new Database(FG_PATH);

  try {
    cleanupEntities(fm);
    cleanupEntityRelations(fm);
    cleanupFG(fg);
    fixXuShiyu(fg);

    console.log('\n=== 清理统计 ===');
    console.log(JSON.stringify(results, null, 2));
    console.log('\n✅ 清理完成');
  } catch (err) {
    console.error('❌ 清理失败:', err);
    process.exitCode = 1;
  } finally {
    fm.close();
    fg.close();
  }
}

main();
