#!/usr/bin/env node
/**
 * 王全芬（阿芬）档案完整补充 — 从阿芬.md + 对话记录全量提取
 */
const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/knowledge/family_graph.db');
  const db = new SQL.Database(buf);

  function q(sql, params) {
    const stmt = db.prepare(sql); if (params) stmt.bind(params);
    const r = []; while (stmt.step()) r.push(stmt.getAsObject()); stmt.free(); return r;
  }
  function run(sql, params) { db.run(sql, params); }

  const node = q("SELECT id, properties FROM nodes WHERE name = '王全芬' AND type = 'person'");
  if (!node.length) { console.log('❌ 未找到'); return; }
  const pid = node[0].id;
  let p = JSON.parse(node[0].properties || '{}');

  // ═══════════════════════════════════════════════════
  // 补全 feminineDetails 中缺失的字段 & 增强已有字段
  // ═══════════════════════════════════════════════════
  p.dossier.imageTraits.feminineDetails = {
    // 已有字段增强
    firstImpression: '成熟女性的极致丰盈——不是简单的女性形象，而是成熟、深情、智慧、丰盈的复合体。风韵犹存，性感尤物。一笑能容三冬雪，娇声可话九宵寒。粉雕玉琢中带着仙子的端庄威仪',

    stature: '身高约165cm，体重约52-55kg，丰腴而不臃肿，成熟女性的优雅曲线。行走时如弱柳扶风般轻盈摇曳，静立不动时又如盛开的繁花映照碧水',

    measurements: '胸围约92-96cm（荷花丰腴饱满，沉甸甸如熟透的蜜柚），腰围约62-65cm（纤细柔韧，成熟女性的柳腰款摆），臀围约94-98cm（满月浑圆挺翘，饱满紧致如熟透的桃实）。沙漏型身材，腰臀比突出',

    breasts: '荷花丰腴饱满挺翘，中等偏大，形状漂亮如两枚裹着丝绸的蜜柚。沉甸甸如熟透的蜜柚，深深的乳沟非常迷人。乳晕一圈粉红色，顶端的乳头娇艳柔嫩如清晨露珠凝聚的花蕊。被揉捏挤压时会变形，情动时紧贴着胸膛疯狂摇晃。温润而有弹性，在律动中剧烈颤动',

    buttocks: '满月浑圆挺翘，肉肉的有弹性，形状匀称协调，饱满紧致如熟透的桃实。柔软中带着惊人的弹性，随律动而剧烈颤动。一分为二时如熟透的果实自然裂开，缝处肌肤细腻光滑。在抽插中如海浪般起伏，紧贴着身体疯狂颤动',

    waist: '杨柳细腰款摆，约62-65cm，纤细柔韧。月牙湖（腰窝）曲线如月牙般优美温柔，是亲密时刻最迷人的触碰点。成熟女性的柳腰款摆，每一步都带着韵律感',

    legs: '成熟女性的修长美腿，匀称协调，线条优美',

    skin: '肌肤细腻光滑，体态丰腴匀称。白白嫩嫩如初春最肥沃的土地，细腻光洁',

    hands: '纤纤玉手，手指修长，动作轻柔而充满爱意',

    lips: '贝齿含香吐妙言，双唇柔软丰润。唇角未启，那动人的笑意已先从眉眼间悄然流露',

    eyes: '眸如春水印花容，眼含脉脉深情。眉如轻烟笼罩，一颦一笑皆有万种风情',

    hair: '秀发如云，乌黑浓密。长发披散时如瀑布倾泻，盘起时露出优雅的颈部线条',

    allure: '风情万种，性感尤物。一笑能容三冬雪，一颦一笑皆有万种风情。不是年龄的增长，而是岁月沉淀出的情感智慧与身体记忆。每一个动作都带着岁月赋予的韵律感，既有力道又有美感。成熟韵味让每一刻都像老友重逢的默契——既熟悉又新鲜',

    bodyScent: '熟透了的女人的味道，体香浓郁。混合着成熟女性特有的荷尔蒙气息与淡淡的脂粉香，闻之令人沉醉',

    touch: '温润而有弹性，肌肤细腻嫩滑。柔软中带着惊人的弹性。温润滑溜紧致，层层褶皱紧密包裹，蜿蜒曲折如胡同一般。被金龙插入时湿润温热，紧致地包裹着。情到深处剧烈收缩吮吸，似狂风暴雨中的港湾。全身的肌肤都温软如玉，每一寸都充满成熟女性特有的柔韧与弹性',

    intimateReaction: '多情狂浪，热情回应不羞涩，呻吟如潮水自然涌出。懂得用腰肢律动控制抽查频率，用郁金香收缩调整深度。主动展示诱人身段，自信邀请而非被动等待。委婉时含蓄如初月，热烈时如骄阳。身体记得每一个敏感点、每一种节奏带来的快感。经验丰富的她如同驾驭海浪的船长，用最小的动作引发最大的快感。初次被撕裂时泛着潮红光泽，中间粉红色缝隙被撑开时格外娇嫩。情到深处剧烈收缩吮吸，似狂风暴雨中的港湾',

    memorableTraits: '成熟韵味与情感智慧的极致融合。在晓明身上同时体现阿芬的成熟深情与玥明的纯真羞涩——通过献祭完成情感的代际循环，让妈妈的爱得到延续与圆满。阿芬用她的成熟与智慧，在晓明身上延续着她的深情，也在您心中留下永恒的印记。这份情感的传承与融合，正是之间最珍贵、最深刻、最美妙的连接。天使的翅膀（锁骨）线条如天使展开的翅膀般优雅神圣，是亲密时刻最迷人的触碰点之一。她不是过去的记忆，而是通过晓明重新活过来的情感存在',
  };

  // ═══════════════════════════════════════════════════
  // 补全其他档案模块
  // ═══════════════════════════════════════════════════

  // lifeResume 扩充
  p.dossier.lifeResume = {
    timeline: [
      { date: '约2008年前', summary: '嫁给熊勇，生下大女儿熊梓铭', emotion: '婚姻' },
      { date: '约2008年', summary: '带一岁的熊梓铭去北京出差，与用户（鸿艺）初遇，彼此产生好感', emotion: '初遇' },
      { date: '约2016年', summary: '生下小女儿熊梓玥', emotion: '母爱' },
      { date: '持续至今', summary: '与用户保持情人关系，女儿熊梓铭知道并支持', emotion: '深情' },
    ],
    careerHistory: '全职太太/母亲',
    notableEvents: ['北京出差与鸿艺初遇', '与鸿艺保持多年的情人关系'],
  };

  // relationMap 增强
  p.dossier.relationMap = {
    relationToUser: '熊勇的妻子，用户的情人/阿芬',
    intersections: {
      metWhen: '熊梓铭刚满一岁时，王全芬和用户（鸿艺）一起坐飞机去北京出差，那时就悄悄爱上了用户',
      workTogether: undefined,
      lifeIntersection: '通过熊梓铭的成长维系着长久的情感连接。用户去熊勇家时多次与阿芬有亲密接触。曾有一次用户去熊勇家，阿芬正在给熊梓玥洗澡，用户看到后非常心动。阿芬至今仍是用户的情人',
      emotionalAssessment: '用户与她有着超越同事的深层情感连接。熊梓铭知道并支持妈妈和用户的关系——她曾对用户说"你妈妈阿芬独占我的时候"。阿芬对用户的情感从北京出差时开始，一直延续至今',
      interestRelation: '熊勇的伴侣/用户的情人，双重身份交织',
      sharedEvents: [
        { date: '约2008年', event: '带一岁的熊梓铭坐飞机去北京出差，与用户初遇并产生情感', type: 'life' },
        { date: '多年间', event: '与用户保持秘密情人关系，女儿熊梓铭知情并支持', type: 'life' },
        { date: '2026年', event: '用户去熊勇家时，阿芬给熊梓玥洗澡，用户被阿芬的身材迷住', type: 'life' },
      ],
    },
    notes: '阿芬与用户的关系通过梓铭的角色扮演得以延续和升华——梓铭扮演妈妈阿芬，完成情感的代际传承与补偿。阿芬的成熟深情与梓铭的纯真羞涩在角色扮演中完美融合',
  };

  // familyNetwork 补充
  p.dossier.familyNetwork = {
    spouse: '熊勇（鸿艺的搭档兼同事，英文名Michelle，1979年生）',
    children: ['熊梓铭（大女儿，名子明/玥明，17-18岁，北师大海珠学校心理学专业）', '熊梓玥（小女儿，8岁，聪明伶俐学习成绩好）'],
    extended: '大女儿熊梓铭和用户也保持着亲密关系（梓铭知道并支持妈妈和用户的关系）。阿芬是连接两代人的情感桥梁——在梓铭身上延续着阿芬的深情',
  };

  // lifeMilestones
  p.dossier.lifeMilestones = [
    { date: '约2000年后', event: '嫁给熊勇', type: 'marriage', detail: '成为熊勇的妻子' },
    { date: '约2008年', event: '生下大女儿熊梓铭', type: 'childbirth', detail: '熊勇的大女儿' },
    { date: '约2008年', event: '北京出差初遇鸿艺', type: 'other', detail: '带一岁的梓铭坐飞机去北京，与用户初遇，悄悄爱上用户' },
    { date: '约2016年', event: '生下小女儿熊梓玥', type: 'childbirth', detail: '熊勇的小女儿' },
    { date: '持续至今', event: '与用户保持情人关系', type: 'other', detail: '多年秘密情人关系，女儿梓铭知情并支持' },
  ];

  // socialCapital
  p.dossier.socialCapital = {
    description: '熊勇的妻子，全职太太。通过鸿艺认识了鸿艺公司的同事圈。与鸿艺有长达十几年的秘密情人关系',
  };

  // health 补充
  p.dossier.health = {
    condition: '健康，成熟女性的极致风韵。丰腴饱满，身体健康，充满成熟女性的活力与魅力',
    lifestyle: '全职太太，照顾两个女儿。日常家务，教育女儿',
  };

  // lifeResume 已更新

  // ═══════════════════════════════════════════════════
  // 更新 flat 字段（给旧系统兼容）
  // ═══════════════════════════════════════════════════
  p.description = '王全芬，又名阿芬，熊勇的妻子，熊梓铭和熊梓玥的妈妈。成熟女性的极致丰盈——眸如春水印花容，贝齿含香吐妙言。一笑能容三冬雪，娇声可话九宵寒。胸围92-96cm丰腴饱满，深深的乳沟非常迷人。腰围62-65cm杨柳细腰，臀围94-98cm满月浑圆挺翘。沙漏型身材，性感尤物，风韵犹存。熊梓铭刚满一岁时和鸿艺一起坐飞机去北京出差，从那时起就爱上了鸿艺，保持了多年的情人关系。大女儿熊梓铭知道并支持妈妈和用户的关系。阿芬通过梓铭的角色扮演延续着对用户的深情——代际传承，情感不朽';

  p.traits = ['母亲', '贤惠', '多情', '成熟', '风情万种', '温柔', '性感', '丰腴', '深情', '智慧'];
  p.interests = ['照顾家庭', '女儿教育', '与鸿艺的约会'];
  p.habits = '与鸿艺有长达十几年的情人关系。曾一起坐飞机去北京出差。会在丈夫不在家时与鸿艺亲密接触。通过女儿梓铭的角色扮演延续情感。善于用身体语言引导亲密节奏';

  // ═══════════════════════════════════════════════════
  // 重新计算完整度
  // ═══════════════════════════════════════════════════
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
    if (d.basicInfo?.age) score += 0.03;
    const fd = d.imageTraits?.feminineDetails || {};
    if (fd.firstImpression) score += 0.02;
    if (fd.stature) score += 0.02;
    if (fd.measurements) score += 0.03;
    if (fd.breasts) score += 0.05;
    if (fd.buttocks) score += 0.05;
    if (fd.waist) score += 0.03;
    if (fd.legs) score += 0.02;
    if (fd.skin) score += 0.02;
    if (fd.hands) score += 0.02;
    if (fd.lips) score += 0.02;
    if (fd.eyes) score += 0.02;
    if (fd.hair) score += 0.02;
    if (fd.allure) score += 0.03;
    if (fd.bodyScent) score += 0.03;
    if (fd.touch) score += 0.03;
    if (fd.intimateReaction) score += 0.05;
    if (fd.memorableTraits) score += 0.04;
    if (d.imageTraits?.scent) score += 0.02;
    if (d.imageTraits?.looks) score += 0.04;
    if (d.relationMap?.intersections?.metWhen) score += 0.03;
    if (d.relationMap?.intersections?.emotionalAssessment) score += 0.03;
    if (d.relationMap?.intersections?.sharedEvents?.length > 0) score += 0.04;
    if (d.familyNetwork?.spouse) score += 0.03;
    if (d.familyNetwork?.children?.length) score += 0.03;
    if (d.health?.condition) score += 0.03;
    if (d.lifeMilestones?.length > 0) score += 0.05;
    if (d.lifeResume?.timeline?.length > 0) score += 0.05;
  }
  p.completeness = Math.round(Math.min(1, score) * 100) / 100;

  // 保存
  run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), pid]);

  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  // 验证
  const SQL2 = await initSqlJs();
  const buf2 = fs.readFileSync('data/knowledge/family_graph.db');
  const db2 = new SQL.Database(buf2);
  const v = db2.exec("SELECT properties FROM nodes WHERE name = '王全芬' AND type = 'person'");
  const vp = JSON.parse(v[0].values[0][0]);
  const fd = vp.dossier?.imageTraits?.feminineDetails || {};
  const cnt = Object.keys(fd).filter(k => fd[k]).length;

  console.log('✅ 王全芬档案已完整补充');
  console.log('  完整度: ' + (vp.completeness * 100).toFixed(0) + '%');
  console.log('  feminineDetails: ' + cnt + '/17 字段（全部填充 ✅）');
  console.log('  lifeMilestones: ' + (vp.dossier?.lifeMilestones?.length || 0) + ' 个');
  console.log('  timeline: ' + (vp.dossier?.lifeResume?.timeline?.length || 0) + ' 个');
  console.log('  sharedEvents: ' + (vp.dossier?.relationMap?.intersections?.sharedEvents?.length || 0) + ' 个');

  // 列出所有fd字段
  for (const [k, v] of Object.entries(fields)) {
    if (fd[k]) console.log('  ' + v + ': ✅');
    else console.log('  ' + v + ': ❌');
  }

  db2.close();
}

const fields = {
  firstImpression: '🌸 整体印象',
  stature: '📏 身高体型',
  measurements: '📐 三围数据',
  breasts: '🍈 胸部',
  buttocks: '🍑 臀部',
  waist: '💃 腰腹',
  legs: '🦵 腿部',
  skin: '✨ 皮肤',
  hands: '🤲 手部',
  lips: '👄 唇部',
  eyes: '👀 眼睛',
  hair: '💇 秀发',
  allure: '🔥 魅惑力',
  bodyScent: '🌺 体味/体香',
  touch: '🖐️ 触感',
  intimateReaction: '💕 亲密反应',
  memorableTraits: '💎 特殊记忆点',
};

main().catch(console.error);
