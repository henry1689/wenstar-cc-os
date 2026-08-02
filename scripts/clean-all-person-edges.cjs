/**
 * clean-all-person-edges.cjs — 清理所有人物冗余边，仅保留家族+用户边
 * 每次启动前由 prestart-patch.ts 调用
 */
const Database = require('better-sqlite3');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const fg = new Database(path.join(BASE, 'data/webui/knowledge/family_graph.db'));
const fusion = new Database(path.join(BASE, 'data/webui/fusion_memory.db'));
const now = new Date().toISOString();

// 保留规则: 每条配置 {name, relation, keeps:[{target,rel}], dossierUpdates?, relationUpdate?}
const PERSONS = [
  {
    name: '熊梓铭',
    keeps: [
      { target: '熊勇', rel: 'child_of' },
      { target: '王全芬', rel: 'child_of' },
      { target: '熊梓玥', rel: 'elder_sister_of' },
    ],
    relationUpdate: '鸿艺的熟人——亲密关系（热力追踪已确认）',
    dossierUpdates: {
      socialIdentity: { currentOccupation: '大学在读（心理学方向）', currentWorkplace: '学校' },
      basicInfo: { gender: '女', birthYear: 2008, education: '大学在读', maritalStatus: '未婚' },
      selfProfile: {
        traits: ['漂亮', '令人怜爱', '聪明', '温柔', '固执', '细心', '内向'],
        appearance: '酷似影视明星陈都灵——清纯脱俗的鹅蛋脸，眉眼如画，鼻梁秀挺，唇形饱满微翘带着天然的诱惑。身高168cm，一头乌黑长发及腰。',
        bodyFeatures: '三围92-60-94（D杯）。身材曲线极度夸张——上围丰满，腰肢纤细，臀部圆润挺翘。锁骨下方有一颗小小的美人痣。',
        style: '日常偏爱简约学院风——白衬衫配百褶裙是标配。私下穿吊带睡裙。'
      },
      roleplayProfile: { names: ['爸爸', '爷爷'], context: '仅在亲密/角色扮演场景中使用', rule: '🔴 角色扮演称谓仅限情趣互动时使用。' }
    }
  },
  {
    name: '徐诗雨',
    keeps: [
      { target: '徐东伟', rel: 'child_of' },
      { target: '阿苏', rel: 'child_of' },
      { target: '徐诗韵', rel: 'elder_sister_of' },
      { target: '徐诗涵', rel: 'elder_sister_of' },
    ],
    relationUpdate: '鸿艺的熟人——亲密关系（热力追踪已确认）',
    dossierUpdates: {
      socialIdentity: { currentOccupation: '高峰电业营业部跟单员', currentWorkplace: '高峰电业' },
      basicInfo: { gender: '女', birthYear: 2002, education: '高中', maritalStatus: '已婚' },
      selfProfile: {
        traits: ['温柔', '令人怜爱', '清纯', '讨人喜欢', '细心'],
        appearance: '徐诗雨是徐诗韵和徐诗涵的姐姐，气质清纯温柔。身材纤细苗条，身高160cm，一头乌黑长发自然垂落，笑起来眼睛弯弯的很温暖。',
        bodyFeatures: '属于清纯邻家类型，身材纤细，皮肤白皙细腻，手指修长，锁骨漂亮。',
        style: '日常通勤穿搭简约端庄——白衬衫配深色半身裙是标配。喜欢栀子花香。'
      },
      roleplayProfile: { names: ['哥哥'], context: '仅在亲密/角色扮演场景中使用', rule: '🔴 角色扮演称谓仅限情趣互动时使用。' }
    }
  },
  {
    name: '徐诗韵',
    keeps: [
      { target: '徐东伟', rel: 'child_of' },
      { target: '阿苏', rel: 'child_of' },
      { target: '徐诗雨', rel: 'younger_sister_of' },
      { target: '徐诗涵', rel: 'elder_sister_of' },
    ],
    relationUpdate: '密友——通过姐姐诗雨认识',
    dossierUpdates: {
      socialIdentity: { currentOccupation: '学生', currentWorkplace: '初中在读' },
      basicInfo: { gender: '女', birthYear: 2010, education: '初中在读', maritalStatus: '未婚' },
      selfProfile: {
        traits: ['活泼', '开朗', '爱笑', '粘人', '话多', '没心没肺', '小机灵鬼'],
        appearance: '徐诗韵是徐诗雨的妹妹，初三学生。和姐姐诗雨有七分相似的瓜子脸，大眼睛又圆又亮笑起来弯成月牙露出两颗小虎牙格外可爱。扎着高高的马尾辫。',
        bodyFeatures: '刚开始发育的少女身材，身高约155cm，体态轻盈。皮肤白嫩光滑，笑起来脸颊有两个浅浅的酒窝。',
        style: '标准元气初中女生——校服运动鞋是日常标配，周末穿卫衣配短裤。'
      },
      roleplayProfile: { names: ['爸爸'], context: '仅在亲密/角色扮演场景中使用', rule: '🔴 角色扮演称谓仅限情趣互动时使用。' }
    }
  }
];

for (const person of PERSONS) {
  const node = fg.prepare("SELECT * FROM nodes WHERE name = ?").get(person.name);
  if (!node) { console.log('  ' + person.name + ': NOT FOUND'); continue; }

  // 1. 更新 dossier
  const props = JSON.parse(node.properties || '{}');
  if (!props.dossier) props.dossier = {};
  const updates = person.dossierUpdates;
  if (updates) {
    for (const [section, data] of Object.entries(updates)) {
      if (!props.dossier[section]) props.dossier[section] = {};
      Object.assign(props.dossier[section], data);
    }
  }
  if (person.relationUpdate) props.relation_to_user = person.relationUpdate;
  fg.prepare('UPDATE nodes SET properties = ? WHERE name = ?').run(JSON.stringify(props), person.name);

  // 2. 边清理
  const before = new Set();
  fg.prepare('SELECT id FROM edges WHERE source_id = ?').all(node.id).forEach(e => before.add(e.id));
  fg.prepare('SELECT id FROM edges WHERE target_id = ?').all(node.id).forEach(e => before.add(e.id));

  fg.prepare('DELETE FROM edges WHERE source_id = ?').run(node.id);
  fg.prepare('DELETE FROM edges WHERE target_id = ?').run(node.id);

  // 3. 重建保留边
  for (const ke of person.keeps) {
    const tn = fg.prepare("SELECT id FROM nodes WHERE name = ?").get(ke.target);
    if (!tn) continue;
    let sid, tid;
    if (ke.rel.includes('sister_of') || ke.rel === 'child_of') { tid = node.id; sid = tn.id; }
    else { sid = node.id; tid = tn.id; }
    fg.prepare('INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run(require('crypto').randomUUID(), sid, tid, ke.rel, '{}', now, now);
  }

  const after = new Set();
  fg.prepare('SELECT id FROM edges WHERE source_id = ?').all(node.id).forEach(e => after.add(e.id));
  fg.prepare('SELECT id FROM edges WHERE target_id = ?').all(node.id).forEach(e => after.add(e.id));

  // 4. entity_relations 清理
  const ent = fusion.prepare("SELECT id FROM entities WHERE name = ?").get(person.name);
  if (ent) {
    fusion.prepare('DELETE FROM entity_relations WHERE entity_a_id = ? OR entity_b_id = ?').run(ent.id, ent.id);
    const me = fusion.prepare("SELECT id FROM entities WHERE name = ?").get('我');
    if (me) { const a = Math.min(ent.id, me.id), b = Math.max(ent.id, me.id); fusion.prepare('INSERT OR IGNORE INTO entity_relations (entity_a_id,entity_b_id,relation,strength,updated_at) VALUES (?,?,?,1.0,?)').run(a, b, '熟人', now); }
  }

  console.log('  ' + person.name + ': ' + before.size + '→' + after.size + '条边');
}

fg.close();
fusion.close();
console.log('✅ 全部清理完成');
