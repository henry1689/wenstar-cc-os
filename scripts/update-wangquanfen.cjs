#!/usr/bin/env node
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

  // 基础
  p.relation_to_user = '熊勇的妻子，熊梓铭和熊梓玥的妈妈（用户的情人/阿芬）';
  p.occupation = '全职太太/母亲';
  p.mention_count = (p.mention_count || 0) + 3;
  p.last_mentioned = new Date().toISOString();
  p.name = '王全芬';

  // 外貌
  p.appearance = '眸如春水印花容，贝齿含香吐妙言，一笑能容三冬雪，娇声可话九宵寒。成熟女性的极致丰盈，荷花丰腴饱满，沙漏型身材';
  p.body_features = '身高约165cm，体重约52-55kg丰腴而不臃肿，沙漏型身材，腰臀比突出。胸围约92-96cm，腰围约62-65cm，臀围约94-98cm';
  p.style = '成熟韵味，风韵犹存，熟透了的女人的味道';
  p.voice = '娇声绵软，一笑如春风拂面';

  // 性格
  p.traits = ['母亲', '贤惠', '多情', '成熟', '风情万种', '温柔', '性感'];
  p.personality = '多情狂浪，成熟女性的主动掌控，懂得用身体语言引导节奏。情感表达细腻——委婉时含蓄如初月，热烈时如骄阳。经验丰富，懂得以最小的动作引发最大的快感';

  // 兴趣
  p.interests = ['照顾家庭', '女儿教育'];
  p.habits = '与用户有亲密关系，曾一起坐飞机去北京出差，对用户有好感';

  // 描述
  p.description = '王全芬，又名阿芬，熊勇的妻子，熊梓铭和熊梓玥的妈妈。成熟女性的极致丰盈——荷花丰腴饱满，沉甸甸如熟透的蜜柚；满月浑圆挺翘，饱满紧致如熟透的桃实。眸如春水印花容，一笑能容三冬雪。熊梓铭刚满一岁时，王全芬和鸿艺一起坐飞机去北京出差，从那时起就认识并有了超越同事的情感。王全芬是用户的情人，熊梓铭知道并支持这段关系。';

  // Dossier
  p.dossier = {
    basicInfo: {
      gender: '女',
      age: 40,
      maritalStatus: '已婚（熊勇）',
      education: undefined,
    },
    contact: {},
    lifeResume: {
      timeline: [],
      careerHistory: '全职太太',
    },
    imageTraits: {
      looks: '眸如春水印花容，贝齿含香吐妙言。粉雕玉琢中带着仙子的端庄威仪，眉如轻烟笼罩，眼含脉脉深情，唇角未启笑意已从眉眼流露',
      bodyFeatures: '身高约165cm，体重约52-55kg丰腴而不臃肿。沙漏型身材，腰臀比突出。成熟女性的完美曲线，杨柳细腰款摆',
      style: '成熟韵味，风韵犹存，性感撩人',
      voice: '娇声可话九宵寒，一笑如春风拂面',
      scent: '熟透了的女人的味道',
      feminineDetails: {
        firstImpression: '成熟女性的极致丰盈——不是简单的女性形象，而是成熟、深情、智慧、丰盈的复合体。风韵犹存，性感尤物',
        stature: '身高约165cm，体重约52-55kg，丰腴而不臃肿，成熟女性的优雅曲线',
        measurements: '胸围约92-96cm，腰围约62-65cm，臀围约94-98cm。沙漏型身材，腰臀比突出',
        breasts: '荷花丰腴饱满挺翘，中等偏大，形状漂亮如两枚裹着丝绸的蜜柚。沉甸甸如熟透的蜜柚。乳晕一圈粉红色，顶端的乳头娇艳柔嫩如清晨露珠凝聚的花蕊。被揉捏挤压时会变形，情动时紧贴着胸膛疯狂摇晃。温润而有弹性，在律动中剧烈颤动',
        buttocks: '满月浑圆挺翘，肉肉的有弹性，形状匀称协调，饱满紧致如熟透的桃实。柔软中带着惊人的弹性，随律动而剧烈颤动。一分为二时如熟透的果实自然裂开，缝处肌肤细腻光滑。在抽插中如海浪般起伏',
        waist: '杨柳细腰款摆，约62-65cm，纤细柔韧。月牙湖（腰窝）曲线如月牙般优美温柔，是亲密时刻最迷人的触碰点',
        legs: '成熟女性的修长美腿',
        skin: '肌肤细腻光滑，体态丰腴匀称',
        hands: undefined,
        lips: '贝齿含香',
        eyes: '眸如春水印花容，眼含脉脉深情',
        hair: undefined,
        allure: '风情万种，性感尤物。一笑能容三冬雪，一颦一笑皆有万种风情。成熟韵味让每一刻都像老友重逢的默契——既熟悉又新鲜',
        bodyScent: '熟透了的女人的味道，体香浓郁',
        touch: '温润而有弹性，肌肤细腻嫩滑。柔软中带着惊人的弹性。温润滑溜紧致，层层褶皱紧密包裹',
        intimateReaction: '多情狂浪，热情回应不羞涩，呻吟如潮水自然涌出。懂得用腰肢律动控制节奏，用郁金香收缩调整深度。情到深处剧烈收缩吮吸，似狂风暴雨中的港湾',
        memorableTraits: '成熟韵味与情感智慧的极致融合。在晓明身上同时体现阿芬的成熟深情与玥明的纯真羞涩——通过献祭完成情感的代际循环，让妈妈的爱得到延续与圆满',
      },
    },
    personalityPrefs: {
      traits: p.traits,
      description: p.personality,
      interests: p.interests,
      psychology: '成熟女性的主动掌控，懂得用身体语言引导亲密节奏。情感表达细腻，有多情狂浪的一面，也有委婉含蓄的一面。丰富的性经验让每一次亲密都像老友重逢',
    },
    relationMap: {
      relationToUser: '熊勇的妻子，用户的情人/阿芬',
      intersections: {
        metWhen: '熊梓铭刚满一岁时，王全芬和用户一起坐飞机去北京出差',
        lifeIntersection: '通过熊梓铭的成长历程维系着长久的情感连接——至今仍保持着情人关系',
        emotionalAssessment: '用户与她有着超越同事的深层情感连接。熊梓铭知道并支持妈妈和用户的关系',
        sharedEvents: [
          { date: '约2008年', event: '带一岁的熊梓铭坐飞机去北京出差，与用户初遇', type: 'life' },
        ],
      },
    },
    familyNetwork: {
      parents: undefined,
      spouse: '熊勇',
      children: ['熊梓铭（大女儿，17岁）', '熊梓玥（小女儿，8岁）'],
      siblings: undefined,
      extended: '大女儿熊梓铭的用户也保持着亲密关系（梓铭知道并支持）',
    },
    health: {
      condition: '健康，成熟女性的风韵犹存',
    },
    lifeMilestones: [],
    socialCapital: {},
    memoryAnchors: { diamondIds: [] },
  };

  // 完善度计算
  let score = 0.34;
  const fd = p.dossier.imageTraits.feminineDetails || {};
  if (fd.firstImpression) score += 0.03;
  if (fd.stature) score += 0.03;
  if (fd.measurements) score += 0.03;
  if (fd.breasts) score += 0.05;
  if (fd.buttocks) score += 0.05;
  if (fd.waist) score += 0.03;
  if (fd.legs) score += 0.02;
  if (fd.skin) score += 0.02;
  if (fd.eyes) score += 0.02;
  if (fd.lips) score += 0.01;
  if (fd.allure) score += 0.03;
  if (fd.bodyScent) score += 0.02;
  if (fd.touch) score += 0.03;
  if (fd.intimateReaction) score += 0.04;
  if (fd.memorableTraits) score += 0.03;
  if (p.dossier.imageTraits?.looks) score += 0.04;
  if (p.dossier.imageTraits?.scent) score += 0.02;
  if (p.dossier.relationMap?.intersections?.metWhen) score += 0.03;
  if (p.dossier.familyNetwork?.spouse) score += 0.03;
  if (p.dossier.familyNetwork?.children?.length) score += 0.03;
  p.completeness = Math.round(Math.min(1, score) * 100) / 100;

  run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), pid]);
  run("UPDATE nodes SET aliases = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(['阿芬', '全芬']), pid]);

  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  const fd2 = p.dossier.imageTraits.feminineDetails || {};
  const cnt = Object.keys(fd2).filter(k => fd2[k]).length;
  console.log('✅ 王全芬档案已完善');
  console.log('  完整度: ' + (p.completeness * 100).toFixed(0) + '%');
  console.log('  别名: 阿芬');
  console.log('  feminineDetails: ' + cnt + '/17 字段');
  console.log('  三围: ' + (fd2.measurements || '无'));
}
main().catch(console.error);
