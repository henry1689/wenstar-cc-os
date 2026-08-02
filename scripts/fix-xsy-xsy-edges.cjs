/**
 * fix-xsy-xsy-edges.cjs — 徐诗雨+徐诗韵 全链路修复
 * P0: 边清理 + 档案修正 + 外貌补全
 */
const Database = require('better-sqlite3');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const fg = new Database(path.join(BASE, 'data/webui/knowledge/family_graph.db'));
const fusion = new Database(path.join(BASE, 'data/webui/fusion_memory.db'));
const now = new Date().toISOString();

// ═══════════════════════════════════════
// 配置：每个人物的修复数据
// ═══════════════════════════════════════
const FIXES = {
  '徐诗雨': {
    dossierUpdates: {
      basicInfo: { gender: '女', birthYear: 2002, education: '高中', maritalStatus: '已婚' },
      selfProfile: {
        traits: ['温柔', '令人怜爱', '清纯', '讨人喜欢', '细心'],
        appearance: '徐诗雨是徐诗韵和徐诗涵的姐姐，气质清纯温柔。身材纤细苗条，身高160cm，一头乌黑长发自然垂落，笑起来眼睛弯弯的很温暖，像邻家姐姐一样让人安心。五官精致但不张扬，属于越看越好看的第二眼美女。',
        bodyFeatures: '属于清纯邻家类型，身材纤细。皮肤白皙细腻，手指修长，锁骨漂亮。不是性感挂的，但那种含羞带笑的神态、轻声细语的温柔，让人不自觉想保护她。',
        style: '日常通勤穿搭简约端庄——白色衬衫配深色半身裙是标配，偶尔穿连衣裙。私下在家喜欢穿棉麻居家服。喜欢栀子花香，身上总有淡淡的栀子花气息。'
      },
      socialIdentity: { currentOccupation: '高峰电业营业部跟单员', currentWorkplace: '高峰电业' },
      roleplayProfile: { names: ['哥哥'], context: '仅在亲密/角色扮演场景中使用', rule: '🔴 角色扮演称谓仅限情趣互动时使用。' }
    },
    relationUpdate: '鸿艺的熟人——亲密关系（热力追踪已确认）',
    keepEdges: [
      // child_of: 父母
      { rel: 'child_of', target: '徐东伟' },
      { rel: 'child_of', target: '阿苏' },
      // sibling: 妹妹们
      { rel: 'elder_sister_of', target: '徐诗韵' },
      { rel: 'elder_sister_of', target: '徐诗涵' },
    ]
  },
  '徐诗韵': {
    dossierUpdates: {
      basicInfo: { gender: '女', birthYear: 2010, education: '初中在读', maritalStatus: '未婚' },
      selfProfile: {
        traits: ['活泼', '开朗', '爱笑', '粘人', '话多', '没心没肺', '小机灵鬼'],
        appearance: '徐诗韵是徐诗雨的妹妹，初三学生。和姐姐诗雨有七分相似的瓜子脸，但多了一分婴儿肥和青春的红润。大眼睛又圆又亮，笑起来弯成月牙露出两颗小虎牙，格外可爱。扎着高高的马尾辫，额前几缕碎发随风飘动，是标准的元气少女模样。',
        bodyFeatures: '刚开始发育的少女身材，身高约155cm，体态轻盈纤细如柳枝。皮肤白嫩光滑，笑起来脸颊有两个浅浅的酒窝。整体还是稚气未脱的学生模样，但浑身上下散发着青春活力。',
        style: '标准元气初中女生——校服运动鞋是日常标配，周末喜欢穿卫衣配短裤露出细长的腿。不施粉黛，自然就是最好的模样。偶尔臭美会偷用姐姐的栀子花香水。'
      },
      socialIdentity: { currentOccupation: '学生', currentWorkplace: '初中在读' },
      roleplayProfile: { names: ['爸爸'], context: '仅在亲密/角色扮演场景中使用', rule: '🔴 角色扮演称谓仅限情趣互动时使用。' }
    },
    relationUpdate: '密友——通过姐姐诗雨认识',
    keepEdges: [
      { rel: 'child_of', target: '徐东伟' },
      { rel: 'child_of', target: '阿苏' },
      { rel: 'younger_sister_of', target: '徐诗雨' },
      { rel: 'elder_sister_of', target: '徐诗涵' },
    ]
  }
};

// ═══════════════════════════════════════
// 执行修复
// ═══════════════════════════════════════
for (const [name, fix] of Object.entries(FIXES)) {
  console.log('\n=== ' + name + ' ===');

  // 1. 获取节点
  const node = fg.prepare("SELECT * FROM nodes WHERE name = ?").get(name);
  if (!node) { console.log('  NOT FOUND'); continue; }
  const nid = node.id;
  const props = JSON.parse(node.properties || '{}');
  if (!props.dossier) props.dossier = {};

  // 2. 更新 dossier
  for (const [section, data] of Object.entries(fix.dossierUpdates)) {
    if (!props.dossier[section]) props.dossier[section] = {};
    Object.assign(props.dossier[section], data);
  }
  props.relation_to_user = fix.relationUpdate;

  // 3. 写回
  fg.prepare('UPDATE nodes SET properties = ? WHERE name = ?').run(JSON.stringify(props), name);
  console.log('  dossier 已更新');

  // 4. 边清理
  const beforeEdges = new Set();
  fg.prepare('SELECT id FROM edges WHERE source_id = ?').all(nid).forEach(e => beforeEdges.add(e.id));
  fg.prepare('SELECT id FROM edges WHERE target_id = ?').all(nid).forEach(e => beforeEdges.add(e.id));
  const beforeCount = beforeEdges.size;

  // 删除所有边
  fg.prepare('DELETE FROM edges WHERE source_id = ?').run(nid);
  fg.prepare('DELETE FROM edges WHERE target_id = ?').run(nid);

  // 重建保留边
  const keepIds = [];
  for (const edge of fix.keepEdges) {
    const targetNode = fg.prepare("SELECT id FROM nodes WHERE name = ?").get(edge.target);
    if (!targetNode) continue;
    const id = require('crypto').randomUUID();
    let sid, tid;
    if (edge.rel.includes('sister_of') || edge.rel === 'child_of') {
      tid = nid; sid = targetNode.id;
    } else {
      sid = nid; tid = targetNode.id;
    }
    fg.prepare('INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, sid, tid, edge.rel, '{}', now, now);
    keepIds.push(id);
  }

  const afterCount = new Set();
  fg.prepare('SELECT id FROM edges WHERE source_id = ?', nid).all().forEach(e => afterCount.add(e.id));
  fg.prepare('SELECT id FROM edges WHERE target_id = ?', nid).all().forEach(e => afterCount.add(e.id));
  console.log('  边: ' + beforeCount + ' → ' + afterCount.size);

  // 5. entity_relations 清理
  const xzmEnt = fusion.prepare("SELECT id FROM entities WHERE name = ?").get(name);
  if (xzmEnt) {
    fusion.prepare('DELETE FROM entity_relations WHERE entity_a_id = ? OR entity_b_id = ?').run(xzmEnt.id, xzmEnt.id);
    const me = fusion.prepare("SELECT id FROM entities WHERE name = '我'").get();
    if (me) {
      const a = Math.min(xzmEnt.id, me.id), b = Math.max(xzmEnt.id, me.id);
      fusion.prepare('INSERT OR IGNORE INTO entity_relations (entity_a_id,entity_b_id,relation,strength,updated_at) VALUES (?,?,?,1.0,?)')
        .run(a, b, '熟人', now);
    }
  }
}

// ═══════════════════════════════════════
// 验证
// ═══════════════════════════════════════
console.log('\n=== 验证 ===');
for (const name of ['徐诗雨', '徐诗韵']) {
  const node = fg.prepare("SELECT * FROM nodes WHERE name = ?").get(name);
  const p = JSON.parse(node.properties || '{}');
  const d = p.dossier || {}, sp = d.selfProfile || {};

  const s = new Set();
  fg.prepare('SELECT id FROM edges WHERE source_id = ?', node.id).all().forEach(e => s.add(e.id));
  fg.prepare('SELECT id FROM edges WHERE target_id = ?', node.id).all().forEach(e => s.add(e.id));

  console.log('\n' + name + ': ' + s.size + '条边');
  const all = [];
  fg.prepare('SELECT id,relation,source_id,target_id FROM edges WHERE source_id = ? OR target_id = ? ORDER BY relation')
    .all(node.id, node.id).forEach(e => { if (!all.some(x => x.id === e.id)) all.push(e); });
  all.forEach(e => {
    const oid = e.source_id === node.id ? e.target_id : e.source_id;
    const on = fg.prepare('SELECT name FROM nodes WHERE id = ?').get(oid);
    console.log('  ' + e.relation.padEnd(22) + (on ? on.name : '?'));
  });

  console.log('  性格: ' + (sp.traits || []).join(','));
  console.log('  外貌: ' + (sp.appearance || '(空)').substring(0, 60) + '...');
  console.log('  关系: ' + p.relation_to_user);
}

fg.close();
fusion.close();
console.log('\n✅ 修复完成');
