/**
 * V17: 人物档案维护 + 垃圾边清理
 * 仅操作 family_graph.db（唯一引擎，无竞争）。Entity_relations 已迁入 SQLiteAdapter。
 * 职责: dossier 补全 / relation_to_user 设置 / 垃圾边清理。
 * 🔴 V17: 不再删除+重建边 — 边管理由 FamilyGraph 自身负责。
 */
const Database = require('better-sqlite3');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const fg = new Database(path.join(BASE, 'data/webui/knowledge/family_graph.db'));
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
      // 🔴 徐诗雨设定：18岁（2008年生，高中毕业后进高峰电业当跟单员）。勿改回 24岁/2002/已婚。
      basicInfo: { gender: '女', birthYear: 2008, education: '高中', maritalStatus: '未婚' },
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

  // 2. V17: 垃圾边清理 + 方向修复
  const garbage = ['grandmother_of','grandfather_of','grandchild_of','grandparent_of'];
  for (const gr of garbage) {
    fg.prepare('DELETE FROM edges WHERE (source_id = ? OR target_id = ?) AND relation = ?').run(node.id, node.id, gr);
  }
  // 删除重复方向边（仅保留 child_of，清除错误方向的 parent_of/mother_of/father_of）
  fg.prepare("DELETE FROM edges WHERE source_id = ? AND relation = 'parent_of'").run(node.id);
  fg.prepare("DELETE FROM edges WHERE source_id = ? AND relation = 'mother_of'").run(node.id);
  fg.prepare("DELETE FROM edges WHERE source_id = ? AND relation = 'father_of'").run(node.id);
  // 确保正确的 keeps 存在
  for (const ke of person.keeps) {
    const tn = fg.prepare('SELECT id FROM nodes WHERE name = ?').get(ke.target);
    if (!tn) continue;
    // child_of: source=child(person) → target=parent(ke.target)
    // sister_of: source=sibling(person) → target=sibling(ke.target)
    // Both: person → target (source=node, target=tn)
    let sid = node.id, tid = tn.id;
    // 删除 person-target 之间的旧边（含错误方向），再插入正确边
    fg.prepare('DELETE FROM edges WHERE ((source_id=? AND target_id=?) OR (source_id=? AND target_id=?)) AND (relation LIKE ? OR relation LIKE ?)').run(node.id, tn.id, tn.id, node.id, '%sister%', '%child%');
    fg.prepare('INSERT OR IGNORE INTO edges(id,source_id,target_id,relation,properties,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(require('crypto').randomUUID(), sid, tid, ke.rel, '{}', now, now);
  }
}

fg.close();
console.log('✅ V17 档案补全+边修复+垃圾清理 完成');
