#!/usr/bin/env node
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  function q(sql, params) {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const r = [];
    while (stmt.step()) r.push(stmt.getAsObject());
    stmt.free();
    return r;
  }
  function run(sql, params) { db.run(sql, params); }

  const node = q("SELECT id, properties FROM nodes WHERE name = '熊梓铭' AND type = 'person'");
  if (!node.length) { console.log('❌ 未找到'); return; }

  const pid = node[0].id;
  let p = JSON.parse(node[0].properties || '{}');

  // 更新基础信息
  p.relation_to_user = '熊勇的大女儿（合作伙伴的女儿），从叔叔升华到"爸爸"般的18年羁绊';
  p.occupation = '学生（北师大海珠学校，心理学专业，兼修医学）';
  p.mention_count = (p.mention_count || 0) + 5;
  p.last_mentioned = new Date().toISOString();

  // 外貌
  p.appearance = '长发及腰，青春靓丽，瓜子脸，肌肤如凝脂般细腻光洁，戴金丝边眼镜，很有文气';
  p.body_features = '体态匀称柔美，苗条，身高约1.6米，胸部微凸恰似14少女初长成，臀部小小的，不属于性感型，令人怜爱型';
  p.style = '清纯少女风，文艺气质';
  p.voice = '温婉，带着少女的羞涩';

  // 性格
  p.traits = ['漂亮', '令人怜爱', '聪明', '温柔', '文气', '文艺', '害羞', '清纯', '情感丰富'];
  p.personality = '温婉纯真，神情浓郁悠远，有文艺气质。兼具少女的羞涩与文学院的文艺气息，心思细腻，情感丰富。能用心理学视角理解情感，用文学美感表达心意。';

  // 兴趣
  p.interests = ['钢琴（英皇8级）', '芭蕾舞', '健身', '心理学', '阅读', '电影', '角色扮演'];
  p.habits = '养了一条拉布拉多叫小黑，常用角色扮演增加情趣，喜欢角色扮演各种人物';

  // 累计描述
  p.description = '熊梓铭，又叫梓铭、小明、子明、玥明。熊勇和王全芬的大女儿，妹妹熊梓玥。17-18岁，在北师大海珠学校读心理学专业，兼修医学。一岁时随母亲阿芬坐飞机去北京出差时与用户相识。18年来有深厚的感情羁绊：3岁随父参加工厂聚会穿开裆裤唱歌，6岁学英语，8岁学钢琴，10岁通过英皇钢琴8级，12岁去海边学游泳穿比基尼拖鞋丢了她穿用户的拖鞋回酒店开始知道害羞，14岁与用户有了第一次身心交融，18岁考上北师大海珠学校。用户常去珠海出差时与她见面，一起散步、喝咖啡、看电影。她有极强的角色扮演能力，常扮演胡冰、于红、表妹、小姨妈、阿珍、徐诗雨、李柯以、李一桐、小花Lisa等角色。有一条拉布拉多叫小黑，和用户有一处爱的小屋叫"浪漫小筑"。妈妈阿芬曾经也是用户的情人。';

  // 时间线
  p.timeline = [
    { date: '约2008年（一岁）', summary: '随母亲阿芬坐飞机去北京出差，第一次遇见用户', emotion: '初见' },
    { date: '约2010年（3岁）', summary: '随父亲参加工厂聚会，穿开裆裤围着桌子转圈圈唱歌', emotion: '天真' },
    { date: '约2013年（6岁）', summary: '开始学英语', emotion: '启蒙' },
    { date: '约2015年（8岁）', summary: '开始学钢琴', emotion: '成长' },
    { date: '约2017年（10岁）', summary: '通过英皇钢琴8级', emotion: '成就' },
    { date: '约2019年（12岁）', summary: '去海边玩耍，穿比基尼学游泳，拖鞋丢了穿用户的拖鞋回酒店，开始知道害羞', emotion: '懵懂' },
    { date: '约2021年（14岁）', summary: '和用户有了第一次身心交融——从0到1的跃迁', emotion: '刻骨铭心' },
    { date: '约2025年（18岁）', summary: '考上北师大海珠学校，主修心理学选修医学', emotion: '新起点' },
    { date: '2026年6月', summary: '放暑假，九月开学读大二。用户常去珠海出差见面，一起散步喝咖啡看电影', emotion: '温暖' },
  ];

  // Dossier 10模块
  p.dossier = {
    basicInfo: {
      gender: '女',
      birthYear: 2008,
      education: '北师大海珠学校心理学专业（兼修医学）',
      maritalStatus: '未婚',
    },
    contact: {
      address: '珠海',
    },
    lifeResume: {
      timeline: p.timeline,
      careerHistory: '学生',
      notableEvents: ['英皇钢琴8级', '考入北师大海珠学校心理学专业'],
    },
    imageTraits: {
      looks: '长发及腰，青春靓丽，瓜子脸，肌肤如凝脂般细腻光洁，戴金丝边眼镜，很有文气',
      bodyFeatures: '体态匀称柔美，苗条，身高约1.6米，胸部微凸恰似14少女初长成，臀部小小的',
      style: '清纯少女风，文艺气质',
      voice: '温婉，带着少女的羞涩',
      distinguishingMarks: '戴金丝边眼镜',
      feminineDetails: {
        firstImpression: '风华气度不逊仙子，温婉纯真，像春风拂过般清新',
        stature: '身高约1.6米，体态匀称柔美，苗条',
        breasts: '胸部微凸，恰似14少女初长成的样子，盈盈一握的小荷花，荷花尖尖就像小红豆',
        buttocks: '臀部小小的，紧致的小满月',
        waist: '纤腰',
        legs: '细长腿',
        skin: '肌肤如凝脂般细腻光洁',
        hands: '纤细手指',
        eyes: '眼神带着少女的羞涩和文艺气息',
        hair: '长发及腰',
        allure: '令人怜爱型，不是性感型，但有一种让人心生怜爱的气质',
        bodyScent: '体香清淡',
        touch: '肌肤细腻嫩滑',
        intimateReaction: '14岁初次身心交融，痛并快乐着，从0到1的跃迁——不仅是身体的交融，更是心灵的觉醒',
        memorableTraits: '兼具少女的羞涩与文艺气质，会叫用户爸爸和叔叔，有极强的角色扮演能力',
      },
    },
    personalityPrefs: {
      traits: p.traits,
      description: p.personality,
      interests: p.interests,
      habits: p.habits,
      psychology: '早熟，情感丰富，对用户有超越亲情和世俗的依赖感。能用心理学视角理解情感',
    },
    relationMap: {
      relationToUser: '从叔叔升华到了爸爸般的存在——18年的父女情深羁绊',
      intersections: {
        metWhen: '一岁随母亲阿芬（王全芬）坐飞机去北京出差时第一次见用户',
        lifeIntersection: '从一岁到18岁一路相伴：学英语、学钢琴（英皇8级）、学游泳、14岁身心交融、考上大学。用户常去珠海出差见面，一起散步喝咖啡看电影',
        emotionalAssessment: '十八年的羁绊——用户是她生命中最重要的男人。她自述：叔叔您在我心目中就成了我最亲爱的爸爸',
        sharedEvents: [
          { date: '约2008年', event: '北京出差初遇', type: 'family' },
          { date: '约2010年', event: '工厂聚会穿开裆裤唱歌', type: 'family' },
          { date: '约2019年', event: '海边游泳丢拖鞋穿用户的拖鞋回酒店', type: 'life' },
          { date: '约2021年', event: '14岁第一次身心交融', type: 'life' },
          { date: '约2025年', event: '考上北师大海珠学校', type: 'education' },
          { date: '2026年', event: '珠海散步喝咖啡看电影', type: 'life' },
        ],
      },
      notes: '用户对她的感情复杂而深刻——既是长辈对晚辈的疼爱，又有超越世俗的亲密羁绊。她叫用户爸爸',
    },
    familyNetwork: {
      parents: ['熊勇（父亲）', '王全芬/阿芬（母亲）'],
      children: undefined,
      siblings: ['熊梓玥（妹妹，8岁）'],
      extended: '母亲阿芬曾经也是用户的情人',
    },
    health: {
      condition: '健康，青春活力',
      lifestyle: '大学生活，课余钢琴、芭蕾舞、健身',
    },
    lifeMilestones: [
      { date: '约2008年', event: '出生', type: 'birth', detail: '熊勇和王全芬的大女儿' },
      { date: '约2008年（一岁）', event: '北京出差初遇用户', type: 'other', detail: '随母亲阿芬坐飞机去北京' },
      { date: '约2015年（8岁）', event: '开始学钢琴', type: 'education' },
      { date: '约2017年（10岁）', event: '英皇钢琴8级', type: 'education', detail: '通过英皇钢琴最高级别' },
      { date: '约2019年（12岁）', event: '海边学游泳', type: 'other', detail: '穿比基尼学游泳开始知道害羞' },
      { date: '约2021年（14岁）', event: '与用户第一次交融', type: 'other', detail: '从0到1的跃迁——身心交融' },
      { date: '约2025年', event: '考上大学', type: 'education', detail: '北师大海珠学校心理学专业' },
    ],
    socialCapital: {
      friends: ['小黑（拉布拉多犬）'],
      description: '室友有混血小花Lisa',
    },
    memoryAnchors: { diamondIds: [] },
  };

  // 清理pendingItems（已确认入库）
  p.pendingItems = [];

  // 完整度计算
  let score = 0;
  if (p.relation_to_user && !p.relation_to_user.includes('认识的人')) score += 0.2;
  if (p.traits?.length > 0) score += 0.1;
  if (p.occupation) score += 0.08;
  if (p.interests?.length > 0) score += 0.08;
  if (p.timeline?.length > 0) score += 0.1;
  if (p.description) score += 0.04;
  if (p.appearance) score += 0.05;
  if (p.body_features) score += 0.03;
  const d = p.dossier;
  if (d) {
    if (d.basicInfo?.gender) score += 0.03;
    if (d.basicInfo?.birthYear) score += 0.03;
    if (d.imageTraits?.feminineDetails?.firstImpression) score += 0.02;
    if (d.imageTraits?.feminineDetails?.intimateReaction) score += 0.03;
    if (d.imageTraits?.feminineDetails?.memorableTraits) score += 0.02;
    if (d.imageTraits?.feminineDetails?.breasts) score += 0.03;
    if (d.imageTraits?.feminineDetails?.skin) score += 0.02;
    if (d.imageTraits?.feminineDetails?.allure) score += 0.02;
    if (d.imageTraits?.feminineDetails?.bodyScent) score += 0.02;
    if (d.imageTraits?.feminineDetails?.touch) score += 0.02;
    if (d.relationMap?.intersections?.metWhen) score += 0.03;
    if (d.relationMap?.intersections?.lifeIntersection) score += 0.03;
    if (d.relationMap?.intersections?.emotionalAssessment) score += 0.03;
    if (d.relationMap?.intersections?.sharedEvents?.length > 0) score += 0.04;
    if (d.familyNetwork?.parents?.length) score += 0.05;
    if (d.familyNetwork?.siblings?.length) score += 0.03;
    if (d.health?.condition) score += 0.03;
    if (d.lifeMilestones?.length > 0) score += 0.05;
    if (d.socialCapital?.friends?.length) score += 0.02;
  }
  p.completeness = Math.round(Math.min(1, score) * 100) / 100;

  // 保存
  run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), pid]);
  run("UPDATE nodes SET aliases = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(['梓铭', '小明', '子明', '玥明']), pid]);

  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  console.log('✅ 熊梓铭档案已完善');
  console.log('  完整度: ' + (p.completeness * 100).toFixed(0) + '%');
  console.log('  别名: 梓铭, 小明, 子明, 玥明');
  console.log('  时间线: ' + p.timeline.length + ' 个关键节点');
  const fd = p.dossier.imageTraits.feminineDetails || {};
  console.log('  feminineDetails: ' + Object.keys(fd).filter(k => fd[k]).length + ' 个字段');
  console.log('  关系交集: ' + (p.dossier.relationMap.intersections?.sharedEvents?.length || 0) + ' 个共同事件');
}

main().catch(console.error);
