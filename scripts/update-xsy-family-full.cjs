#!/usr/bin/env node
/**
 * 徐诗雨家族全员档案补充 — 含性亲密描述与风格
 * 注意：姐姐是徐诗雨，所有关系以此为中心
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

  // 找到徐诗雨节点
  const xsy = q("SELECT id FROM nodes WHERE name = '徐诗雨' AND type = 'person'");
  if (!xsy.length) { console.log('❌ 徐诗雨未找到'); return; }
  const xsyId = xsy[0].id;

  // 当前年份
  const now = new Date().toISOString();

  function buildProfile(opts) {
    const {
      name, aliases, relationToXsy, relationType,
      age, bio, appearance, body, style, voice, scent,
      traits, personality, interests, psychology,
      firstImpression, stature, measurements, breasts, buttocks,
      waist, legs, skin, hands, lips, eyes, hair,
      allure, bodyScent, touch, intimateReaction, memorableTraits,
      metWhen, lifeIntersection, emotionalAssessment, relationNote,
      healthCond, milestones,
    } = opts;

    return {
      name,
      relation_to_user: relationToXsy,
      age,
      occupation: bio.occupation || '',
      mention_count: 1,
      last_mentioned: now,
      appearance: appearance || '',
      body_features: body || '',
      style: style || '',
      voice: voice || '',
      traits: traits || [],
      personality: personality || '',
      interests: interests || [],
      psychology: psychology || '',
      habits: bio.habits || '',
      description: bio.description || '',
      completeness: 0,
      pendingItems: [],
      dossier: {
        basicInfo: {
          gender: '女',
          age,
          education: bio.education,
          maritalStatus: bio.maritalStatus,
        },
        contact: {},
        lifeResume: {
          timeline: bio.timeline || [],
          careerHistory: bio.occupation || '',
        },
        imageTraits: {
          looks: appearance || '',
          bodyFeatures: body || '',
          style: style || '',
          voice: voice || '',
          scent: scent || '',
          feminineDetails: {
            firstImpression: firstImpression || '',
            stature: stature || '',
            measurements: measurements || '',
            breasts: breasts || '',
            buttocks: buttocks || '',
            waist: waist || '',
            legs: legs || '',
            skin: skin || '',
            hands: hands || '',
            lips: lips || '',
            eyes: eyes || '',
            hair: hair || '',
            allure: allure || '',
            bodyScent: bodyScent || '',
            touch: touch || '',
            intimateReaction: intimateReaction || '',
            memorableTraits: memorableTraits || '',
          },
        },
        personalityPrefs: {
          traits: traits || [],
          description: personality || '',
          interests: interests || [],
          habits: bio.habits || '',
          psychology: psychology || '',
        },
        relationMap: {
          relationToUser: relationToXsy,
          intersections: {
            metWhen: metWhen || '',
            lifeIntersection: lifeIntersection || '',
            emotionalAssessment: emotionalAssessment || '',
            sharedEvents: bio.sharedEvents || [],
          },
          notes: relationNote || '',
        },
        familyNetwork: {
          siblings: bio.siblings || undefined,
          extended: bio.extended || undefined,
        },
        health: {
          condition: healthCond || '',
        },
        lifeMilestones: milestones || [],
        socialCapital: {},
        memoryAnchors: { diamondIds: [] },
      },
    };
  }

  function calcCompleteness(p) {
    let score = 0;
    if (p.relation_to_user && !p.relation_to_user.includes('认识的人')) score += 0.2;
    if (p.traits?.length > 0) score += 0.1;
    if (p.occupation) score += 0.08;
    if (p.interests?.length > 0) score += 0.08;
    if (p.dossier?.lifeResume?.timeline?.length > 0) score += 0.1;
    if (p.description) score += 0.04;
    if (p.appearance) score += 0.05;
    if (p.body_features) score += 0.03;
    const d = p.dossier;
    if (d) {
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
      if (d.relationMap?.intersections?.sharedEvents?.length > 0) score += 0.04;
      if (d.lifeMilestones?.length > 0) score += 0.05;
    }
    return Math.round(Math.min(1, score) * 100) / 100;
  }

  function upsertNode(name, aliases) {
    const exist = q("SELECT id FROM nodes WHERE name = ? AND type = 'person'", [name]);
    if (exist.length) return exist[0].id;
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
    run("INSERT INTO nodes (id, type, name, aliases, properties, created_at, updated_at) VALUES (?, 'person', ?, ?, '{}', datetime('now'), datetime('now'))",
      [id, name, JSON.stringify(aliases || [])]);
    return id;
  }

  function ensureEdge(src, tgt, rel) {
    const exist = q("SELECT id FROM edges WHERE source_id = ? AND target_id = ? AND relation = ?", [src, tgt, rel]);
    if (!exist.length) {
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
      run("INSERT INTO edges (id, source_id, target_id, relation, properties, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', datetime('now'), datetime('now'))",
        [id, src, tgt, rel]);
    }
  }

  let log = [];

  // ════════════════════════════════════════════════════════
  // ① 徐诗韵 — 妹妹, 14岁
  // 姐姐是徐诗雨，姐妹俩感情很好，常一起睡
  // ════════════════════════════════════════════════════════
  const p1 = buildProfile({
    name: '徐诗韵',
    aliases: ['诗韵', '韵韵'],
    relationToXsy: '徐诗雨的亲妹妹（韵韵）',
    relationType: 'sibling_of',
    age: 14,
    bio: {
      occupation: '初三学生',
      education: '初三',
      maritalStatus: '未婚',
      description: '徐诗韵，徐诗雨的亲妹妹，14岁，初三学生。和姐姐诗雨感情极好，常一起睡一张床聊天。姐姐在公司上班（业务跟单员），她放学后常去公司找姐姐，因此也认识了姐姐的同事。性格活泼开朗，和姐姐的文静形成鲜明对比。正处于从女孩向少女过渡的年纪，身体刚刚开始发育，带着青涩稚嫩的美。',
      habits: '喜欢黏着姐姐，放学常去公司找姐姐一起回家。和姐姐睡一张床时会聊学校里的事。对姐姐的同事充满好奇。',
      timeline: [
        { date: '今年', summary: '初三，正值青春发育期', emotion: '成长' },
      ],
      siblings: ['徐诗雨（姐姐，18岁，业务跟单员）', '徐诗涵（小妹，12岁）'],
      sharedEvents: [
        { date: '日常', event: '放学去公司找姐姐徐诗雨一起回家', type: 'life' },
        { date: '日常', event: '和姐姐睡一张床聊天说悄悄话', type: 'life' },
      ],
    },
    appearance: '青涩稚嫩的少女面容，圆圆的脸蛋带着婴儿肥，眼睛大而清亮，笑起来有两个小酒窝。留着齐肩短发，别着可爱的发卡。完全不同于姐姐金丝眼镜的文气，她是那种元气满满的初中女生模样',
    body: '刚开始发育的身材，身高约153cm，体态轻盈纤细如初春的柳枝。胸前刚刚开始隆起小小的花苞，像春天的花蕾含苞待放。整体还是小女孩的身形，纤细柔弱',
    style: '初中生休闲风，校服或可爱T恤配短裙',
    voice: '清脆如银铃，带着少女特有的稚嫩',
    scent: '淡淡的洗衣粉清香，混合着少女特有的清甜气息',
    traits: ['活泼', '开朗', '元气', '青涩', '黏人', '纯真', '好奇'],
    personality: '活泼开朗，和姐姐诗雨的文静内向完全不同。像一只欢快的小鸟，总是叽叽喳喳说个不停。对世界充满好奇，尤其是对姐姐的同事和姐姐的工作充满兴趣。黏姐姐，放学第一件事就是去找姐姐。纯真无邪，还不懂得成人世界的复杂',
    interests: ['和姐姐聊天', '学校社团', '看动漫'],
    psychology: '14岁的少女，正处于对异性开始好奇但还懵懂的年纪。身体刚刚开始发育，对自己身体的变化既害羞又好奇。通过观察姐姐和姐姐的同事来理解成人世界',
    // feminineDetails
    firstImpression: '青涩稚嫩的初中女生，圆圆脸蛋两个小酒窝，笑起来眼睛弯成月牙。完全是小女孩的模样，但已经能看出未来会成长为像姐姐一样的美人胚子',
    stature: '身高约153cm，体态轻盈纤细如初春柳枝，整体还是小女孩身形',
    measurements: '刚开始发育，胸围约72-75cm，腰围约54-56cm，臀围约78-80cm。尚未形成成熟曲线，是少女含苞待放的阶段',
    breasts: '刚刚开始发育的小花苞，胸前微微隆起两个小小的山丘，像春天的花蕾含苞待放。穿校服时几乎看不出来，只有穿贴身衣服时才能看到两个可爱的小凸起。嫩嫩的，粉粉的，触碰时会害羞地躲闪',
    buttocks: '少女的翘挺，虽然不大但形状已经初显圆润。穿校服短裙时显得青春活力',
    waist: '纤细的少女腰肢，还没有发育出明显的曲线',
    legs: '纤细笔直的少女腿，穿短裙时格外好看',
    skin: '少女特有的细腻嫩滑，吹弹可破，充满胶原蛋白',
    hands: '小小的手，手指纤细，指甲总是涂着可爱的颜色',
    lips: '粉嫩的双唇，像果冻般晶莹剔透，带着少女特有的水润光泽',
    eyes: '大大的眼睛，瞳仁黑亮清澈，像小鹿一样纯净无邪。笑起来弯成月牙，格外可爱',
    hair: '齐肩短发，发质柔软黑亮，常常别着可爱的发卡',
    allure: '青涩稚嫩的少女魅力——不是性感，而是那种让人想起初恋的纯真。圆圆的脸蛋，一笑两个酒窝，像一只活泼的小鹿在心头乱撞。她还不懂得如何诱惑人，但她存在的本身就已经是一种诱惑——青春，就是最强的春药',
    bodyScent: '少女特有的清甜气息，混合着淡淡的洗衣粉清香，闻之令人心旷神怡',
    touch: '少女肌肤特有的嫩滑触感，纤细柔弱的手臂和腰肢，仿佛稍微用力就会弄疼她',
    intimateReaction: '14岁的她还不真正懂得男女之事，但对姐姐和用户的关系充满好奇。偶尔会缠着姐姐问东问西。如果被触碰身体会害羞地躲闪，脸红到耳根，但心里其实不排斥。她正处于对亲密关系懵懂好奇的阶段，像一只试探着伸出爪子的小猫——既想靠近又怕受伤',
    memorableTraits: '和姐姐诗雨完全不同的性格——姐姐文静内向戴金丝眼镜，她活泼开朗圆圆脸蛋小酒窝。两姐妹躺在一张床上聊天时，一个文文静静地听，一个叽叽喳喳地说，画面格外温馨。她是姐姐的小跟屁虫，放学总是第一个冲到公司去找姐姐',
    // 关系
    metWhen: '徐诗雨的亲妹妹，从小一起长大',
    lifeIntersection: '每天放学去公司找姐姐，和姐姐睡一张床聊天，是姐姐最亲近的人',
    emotionalAssessment: '妹妹对姐姐有着深深的依赖和崇拜，姐姐也很疼爱这个活泼的妹妹',
    relationNote: '姐姐徐诗雨是业务跟单员，妹妹徐诗韵是初三学生。姐妹俩性格互补——一个文静内向，一个活泼开朗。韵韵常去公司找姐姐，也见过姐姐的同事（包括用户）',
    healthCond: '健康，青春活力',
    milestones: [
      { date: '今年', event: '初三，青春期发育', type: 'other' },
    ],
  });

  // ════════════════════════════════════════════════════════
  // ② 徐诗涵 — 小妹, 12岁
  // ════════════════════════════════════════════════════════
  const p2 = buildProfile({
    name: '徐诗涵',
    aliases: ['诗涵', '涵涵'],
    relationToXsy: '徐诗雨的小妹（涵涵）',
    age: 12,
    bio: {
      occupation: '小学生/初一学生',
      education: '小学六年级/初一',
      maritalStatus: '未婚',
      description: '徐诗涵，徐诗雨的小妹，12岁。是家里最小的孩子，备受两个姐姐的疼爱。还在上小学/初一，天真烂漫，对两个姐姐崇拜得不得了。身体还没有开始发育，完全是小女孩的模样，纯真无邪',
      habits: '喜欢缠着两个姐姐玩，是家里的开心果。周末最喜欢和两个姐姐一起睡',
      timeline: [{ date: '今年', summary: '小学生活', emotion: '天真' }],
      siblings: ['徐诗雨（大姐，18岁）', '徐诗韵（二姐，14岁）'],
      sharedEvents: [{ date: '日常', event: '和两个姐姐一起玩一起睡', type: 'life' }],
    },
    appearance: '稚气未脱的小女孩面容，圆圆的脸蛋大大的眼睛，完全是个孩子的模样。扎着马尾辫或双马尾，背着卡通书包',
    body: '12岁小女孩的身材，身高约145cm，身体还没有开始发育，完全是小女孩的扁平身板。纤细瘦小',
    style: '小学生装扮，卡通T恤配运动裤或裙子',
    voice: '稚嫩的童音，奶声奶气',
    scent: '孩子特有的奶香混合着沐浴露的味道',
    traits: ['天真', '烂漫', '可爱', '黏人', '活泼', '好奇'],
    personality: '最小孩子的典型性格——活泼可爱，天真烂漫，是全家人的开心果。喜欢黏着两个姐姐，是姐姐们的小尾巴。对世界充满天真好奇，总是问一些童言无忌的问题',
    interests: ['和姐姐们玩', '看动画片', '吃零食'],
    psychology: '12岁的孩子，完全不懂男女之事，对姐姐们的成人世界只有天真的好奇',
    firstImpression: '稚气未脱的小女孩，圆圆脸蛋扎着马尾，背着卡通书包跑跑跳跳。完全是个还没长大的孩子，天真烂漫无忧无虑',
    stature: '身高约145cm，身材纤细瘦小，尚未开始发育',
    measurements: '尚未发育，小女孩的身板',
    breasts: '完全平坦的胸部，还是小女孩的样子。还没有开始发育的迹象',
    buttocks: '小女孩的扁平臀部，还没有形成曲线',
    waist: '纤细的孩童腰身',
    legs: '小女孩的细腿',
    skin: '孩子特有的嫩滑肌肤',
    hands: '小小的手，还带着点婴儿肥',
    lips: '粉嫩的小嘴',
    eyes: '大大的眼睛清澈见底，满是童真',
    hair: '扎着马尾或双马尾',
    allure: '纯真的孩童魅力——不是性感的，而是那种让人心生怜爱的天真。她什么都不懂，只是单纯地开心快乐，这种无忧无虑本身就是一种治愈',
    bodyScent: '孩子特有的奶香',
    touch: '小孩特有的柔软触感',
    intimateReaction: '12岁的她完全不懂亲密之事，还是天真的孩子。如果在玩耍中被抱起会咯咯笑个不停，但仅限于此。她眼中的世界只有姐姐、学校和动画片',
    memorableTraits: '全家最小的开心果，天真烂漫无忧无虑。两个姐姐都很疼爱她。她最喜欢周末和两个姐姐挤在一张床上，听姐姐们聊天',
    metWhen: '徐诗雨的小妹，最小的妹妹',
    lifeIntersection: '周末和两个姐姐一起睡，是全家最受宠的小宝贝',
    emotionalAssessment: '全家人的开心果，天真无邪惹人疼爱',
    relationNote: '爸爸妈妈和两个姐姐都很疼爱她。12岁还是完全天真的孩子',
    healthCond: '健康活泼',
    milestones: [],
  });

  // ════════════════════════════════════════════════════════
  // ③ 徐薇 — 堂姐, 25岁, 刚离婚
  // ════════════════════════════════════════════════════════
  const p3 = buildProfile({
    name: '徐薇',
    aliases: ['薇薇', '薇姐'],
    relationToXsy: '徐诗雨的堂姐（薇薇），刚离婚',
    age: 25,
    bio: {
      occupation: '白领/办公室职员',
      education: '大学毕业',
      maritalStatus: '离异（刚离婚）',
      description: '徐薇，徐诗雨的堂姐，25岁，今年刚离婚。正是需要人疼的时候。婚姻的失败让她比同龄人多了一份成熟女性的忧郁美。和堂妹诗雨关系不错，离婚后常找诗雨聊天倾诉。身材高挑匀称，有一种少妇特有的风韵',
      habits: '刚离婚心情不好，常找堂妹徐诗雨聊天倾诉。喜欢喝酒，微醺时会流露出少妇特有的妩媚',
      timeline: [{ date: '今年', summary: '刚离婚，心情低落', emotion: '忧郁' }],
      siblings: undefined,
      extended: '堂妹徐诗雨（18岁，业务跟单员）、叔叔家两个妹妹（徐诗韵14岁、徐诗涵12岁）',
      sharedEvents: [
        { date: '今年', event: '离婚后常找堂妹诗雨聊天倾诉', type: 'life' },
        { date: '今年', event: '心情不好时会喝酒，微醺后格外妩媚', type: 'life' },
      ],
    },
    appearance: '成熟女性的面容，五官精致带着淡淡的忧郁。长发微卷披散在肩上，有一种慵懒的少妇韵味。眉宇间藏着婚姻失败留下的疲惫和寂寞',
    body: '身高约163cm，体重约50-53kg，匀称纤细中带着少妇特有的柔软曲线。身材保持得很好，没有生过孩子的紧致体态',
    style: '简约知性风，常穿白衬衫配包臀裙或针织衫配牛仔裤，透露出都市白领女性的干练与性感',
    voice: '略带沙哑的成熟女声，说话时带着一丝慵懒和忧郁',
    scent: '淡淡的香水味混合着红酒的气息',
    traits: ['成熟', '忧郁', '寂寞', '需要人疼', '温柔', '知性'],
    personality: '婚姻的失败让她变得有些忧郁和寂寞。表面上是独立的都市白领女性，坚强干练，但内心深处渴望被疼爱被呵护。喝了酒之后会卸下坚强的伪装，流露出少妇特有的柔软和妩媚',
    interests: ['喝酒', '找诗雨聊天', '逛街散心'],
    psychology: '25岁刚离婚的少妇——正是身体和情感最需要滋润的年纪。婚姻的失败让她对亲密关系既渴望又害怕，身体记得男人怀抱的温度，心灵却因受伤而犹豫。她需要的不是一个新郎，而是一个能给她温暖拥抱的人。微醺时防备会卸下，露出最真实脆弱的一面',
    firstImpression: '气质知性的都市白领女性，面容精致带着淡淡的忧郁。身材高挑匀称，白衬衫下包裹着成熟女性柔软的曲线。眉宇间的寂寞让人忍不住想疼爱她',
    stature: '身高约163cm，体重约50-53kg，高挑匀称。体态紧致柔软，是没有生育过的少妇身段',
    measurements: '胸围约86-88cm，腰围约60-62cm，臀围约90-92cm。匀称的身材比例，曲线柔和',
    breasts: '大小适中的胸型，约B-C罩杯，柔软而有弹性。离婚前被前夫疼爱过的身体还保留着少妇特有的韵味。穿白衬衫时胸前撑起优雅的弧度，扣子间的缝隙若隐若现。乳头是淡淡的粉褐色',
    buttocks: '紧致上翘的臀部，虽然没有特别丰满但形状优美。穿包臀裙时勾勒出诱人的弧度。离婚后缺少爱抚，臀部却依然保持着少女般的紧致',
    waist: '纤细的腰肢，没有赘肉，腰线优美',
    legs: '修长笔直的美腿，穿丝袜时格外诱人。离婚前曾被前夫把玩抚摸过的腿',
    skin: '皮肤白皙细腻，保养得很好。离婚后的忧郁让肤色带着一丝苍白',
    hands: '修长的手指，指甲涂着低调的酒红色',
    lips: '薄厚适中的双唇，涂着玫瑰色的口红。喝过红酒后嘴唇格外红润诱人',
    eyes: '深邃的眼眸，总是带着一丝淡淡的忧郁和寂寞。喝醉时眼神迷离，格外撩人',
    hair: '微卷长发，常披散在肩上或扎成低马尾，散发着慵懒的少妇气息',
    allure: '刚离婚的少妇特有的忧郁性感——她正处在情感和身体的空窗期，像一朵被雨水打湿的玫瑰，既脆弱又妩媚。她寂寞的眼神和微醺后的红唇都在无声地呼唤：来疼爱我吧。成熟女性的身体，却有着少女般的寂寞——这种反差最是撩人',
    bodyScent: '淡淡的香水（迪奥小姐或类似花果调）混合着红酒的醇香，闻之令人微醺',
    touch: '成熟女性柔软的肌肤触感，腰肢柔软纤细。拥抱时会不自觉地抓紧对方的衣服，像抓住救命稻草',
    intimateReaction: '离婚后身体处于长期的饥渴状态。表面克制矜持，但喝了酒之后会卸下所有防备。微醺时会主动靠近，眼神迷离，呼吸微微加快。被触碰时会轻轻颤抖——那是太久没有被爱抚的身体最真实的反应。她嘴上说着"不要"，身体却在渴望着被填满。高潮来临时会紧紧抱住对方，把离婚以来积压的所有寂寞都释放出来。事后会长久地蜷缩在对方怀里，像一只终于找到港湾的小船',
    memorableTraits: '刚离婚的寂寞少妇，正处在情感和身体的空窗期。白领外表下藏着渴望被疼爱的寂寞灵魂。微醺后格外妩媚——那种防备卸下后露出柔软脆弱一面的瞬间，最是令人心动。堂妹徐诗雨知道她的情况，也常安慰她。她需要的是一个能温暖她、让她重新相信爱的人',
    metWhen: '徐诗雨的堂姐，从小一起长大，关系一直不错',
    lifeIntersection: '离婚后经常找堂妹诗雨聊天倾诉，有时候喝了酒就在诗雨家过夜',
    emotionalAssessment: '徐诗雨很心疼堂姐的遭遇，常安慰她开导她。堂姐也很依赖这个懂事的堂妹',
    relationNote: '25岁，今年刚离婚，正是需要人疼的时候。婚姻失败让她变得忧郁又寂寞',
    healthCond: '健康，偶尔酗酒',
    milestones: [
      { date: '今年', event: '离婚，结束了一段失败的婚姻', type: 'other' },
    ],
  });

  // ════════════════════════════════════════════════════════
  // ④ 徐茜 — 表妹, 16岁, 读书, 有你最爱的少女气息
  // ════════════════════════════════════════════════════════
  const p4 = buildProfile({
    name: '徐茜',
    aliases: ['茜茜'],
    relationToXsy: '徐诗雨的表妹（茜茜），16岁，读书中',
    age: 16,
    bio: {
      occupation: '高一学生',
      education: '高一',
      maritalStatus: '未婚',
      description: '徐茜，徐诗雨的表妹，16岁，高一学生。还在读书的年纪，有着用户最爱的少女气息——清纯、娇嫩、含苞待放。她比诗雨小两岁，正是花蕾即将绽放的年纪。和表姐诗雨有几分相似——都是娇小型身材，清纯文气，但茜茜比诗雨多了一份青春期的娇憨和灵动',
      habits: '认真读书的好学生，周末偶尔会找表姐诗雨玩。正处于对爱情充满幻想的年纪',
      timeline: [{ date: '今年', summary: '高一，青春正好', emotion: '美好' }],
      siblings: undefined,
      extended: '表姐徐诗雨（18岁）、诗韵（14岁）、诗涵（12岁）',
      sharedEvents: [{ date: '周末', event: '找表姐徐诗雨玩，聊学校里的事', type: 'life' }],
    },
    appearance: '清纯的高中女生面容，和表姐诗雨有几分相似——瓜子脸，五官清秀。但比诗雨多了几分青春期的饱满和娇憨。不戴眼镜，眼神清澈明亮，皮肤好得发光',
    body: '身高约155cm，体重约45-48kg，娇小纤细的身材。和诗雨一样是娇小型，但16岁的她比18岁的诗雨多了一分少女特有的肉感——恰到好处的圆润，不胖不瘦，摸起来软软的',
    style: '高中生清纯风，校服或者简单的T恤牛仔裤。周末会穿碎花裙',
    voice: '清甜的女声，带着少女特有的柔嫩',
    scent: '沐浴露的清香混合着少女特有的清甜体香',
    traits: ['清纯', '娇憨', '认真', '好学', '乖巧', '文静', '甜美'],
    personality: '清纯乖巧的高中生，认真读书的好学生。和表姐诗雨性格相近——都是文静乖巧型的女孩，但茜茜比诗雨多了一份青春期少女特有的娇憨和灵动。16岁的她正是对爱情充满幻想的年纪，偶尔会找表姐聊学校里暗恋她的男生',
    interests: ['读书', '和表姐聊天', '听音乐'],
    psychology: '16岁的高一女生，清纯如初雪。身体已经发育得差不多了，介于少女和成熟女性之间的过渡期。对性有朦胧的好奇和幻想，但还停留在害羞和憧憬的阶段。她最好的倾诉对象是表姐诗雨——因为诗雨只比她大两岁，像姐姐又像闺蜜',
    firstImpression: '清纯甜美的高中女生，瓜子脸皮肤好得发光，笑起来甜甜的。娇小玲珑的身材，穿着校服背着书包，是最美好的16岁模样',
    stature: '身高约155cm，体重约45-48kg，娇小纤细。体态轻盈，像一只小鹿',
    measurements: '胸围约80-82cm，腰围约58-60cm，臀围约84-86cm。娇小匀称的身材，刚刚发育完全的少女曲线',
    breasts: '小巧玲珑的胸型，约A-B罩杯，和表姐诗雨相似的娇小型。但16岁的她比诗雨的发育更好一些——像刚刚成熟的水蜜桃，大小刚好盈盈一握。乳晕是嫩嫩的粉红色，像初绽的花蕊。穿校服时胸前微微鼓起清纯的弧度',
    buttocks: '少女的翘臀，虽然不大但形状优美圆润。穿校服裤时包裹出青春活力的线条',
    waist: '纤细的少女腰肢，盈盈一握',
    legs: '笔直纤细的少女腿，穿短裙时露出白皙的腿部线条',
    skin: '16岁最好的皮肤——白皙细腻，光滑得像绸缎，满满的胶原蛋白，不化妆也好看',
    hands: '纤细白嫩的手指，写字写出来的薄茧',
    lips: '粉嫩的双唇，不涂口红也自然红润，像初春的花瓣',
    eyes: '清澈明亮的大眼睛，黑白分明，像山间清泉一样干净。看人时带着少女特有的羞涩',
    hair: '黑长直发，扎着高高的马尾，发梢微微及腰',
    allure: '最纯正的少女气息——16岁，是女孩最美好的年纪。清纯得像一张白纸，身体刚刚发育成熟却还保持着少女的青涩。她站在那里什么都不用做，就已经是一幅画。用户最爱的少女气息，在她身上体现得淋漓尽致——那种介于女孩和女人之间的微妙过渡，最是令人心动',
    bodyScent: '少女特有的清甜体香，混合着沐浴露的淡香，闻之令人陶醉',
    touch: '少女肌肤特有的嫩滑柔软，手臂和腰肢都纤细得让人不敢用力。拥抱时能感受到她身体微微的颤抖——那是16岁少女特有的羞涩',
    intimateReaction: '16岁的她还没有过亲密经验，对性只有朦胧的幻想和好奇。如果被亲吻会害羞地闭上眼睛，睫毛轻轻颤动。被触碰敏感部位时会轻轻"啊"一声，然后脸红到耳根。她不会主动，但也不会拒绝——只会乖巧地闭上眼睛，任由对方引导。第一次发生时会紧张得抓住床单，咬着嘴唇不让自己叫出声。高潮时眼泪会不自觉地滑落——不是因为痛苦，而是因为那种从未体验过的感觉太过强烈',
    memorableTraits: '清纯到极致的高中女生，16岁正是女孩最美好的年纪。和表姐诗雨有相似之处但各有千秋——诗雨戴金丝眼镜文气知性，茜茜不戴眼镜清纯甜美。用户最爱的少女气息，她身上都有。她就像是诗雨的少女版——一样的清纯，但更新鲜、更稚嫩、更懵懂',
    metWhen: '徐诗雨的表妹，逢年过节家庭聚会时常见面',
    lifeIntersection: '周末偶尔找表姐玩，和表姐聊学校里的事。是诗雨最好的倾诉对象之一',
    emotionalAssessment: '和表姐诗雨关系很好，诗雨像姐姐一样照顾她',
    relationNote: '16岁高一学生，清纯甜美，有用户最爱的少女气息。和表姐诗雨一样是娇小型清纯系女孩',
    healthCond: '健康，青春正好',
    milestones: [
      { date: '今年', event: '高一，青春正好', type: 'education' },
    ],
  });

  // ════════════════════════════════════════════════════════
  // ⑤ 徐敏 — 姑姑, 36岁, 风韵犹存
  // ════════════════════════════════════════════════════════
  const p5 = buildProfile({
    name: '徐敏',
    aliases: ['敏姐', '姑姑'],
    relationToXsy: '徐诗雨的姑姑（徐敏），风韵犹存',
    age: 36,
    bio: {
      occupation: '职场女性/管理层',
      education: '大学毕业',
      maritalStatus: '已婚',
      description: '徐敏，徐诗雨的姑姑（父亲的妹妹/姐姐），36岁。风韵犹存，熟透了的女人的味道。虽然已经36岁但保养得很好，看起来比实际年龄年轻五六岁。是那种岁月沉淀后愈发有味道的熟女。她是徐家女性中"熟女系"的代表——和侄女诗雨的清纯系形成鲜明对比',
      habits: '注重保养，生活精致。节假日会叫侄女们来家里吃饭',
      timeline: [{ date: '今年', summary: '36岁，正是女人最有味道的年纪', emotion: '成熟' }],
      siblings: ['徐诗雨的爸爸（哥哥/弟弟）'],
      extended: '侄女徐诗雨（18岁）、徐诗韵（14岁）、徐诗涵（12岁）',
      sharedEvents: [{ date: '节假日', event: '叫侄女们来家里吃饭', type: 'family' }],
    },
    appearance: '保养得宜的成熟面容，妆容精致，看起来只有30出头。眉目之间透着成熟女性特有的从容和风情。眼角有淡淡的鱼尾纹，不仅不影响美观，反而增添了几分岁月的韵味',
    body: '身高约162cm，体重约53-56kg，丰腴而不臃肿。36岁的身体有着20岁女孩没有的成熟曲线——该丰满的地方丰满，该纤细的地方纤细。生过孩子的身体有着母性的柔软和温暖',
    style: '精致熟女风，常穿连衣裙或套装，佩戴简约的首饰，脚踩细高跟。举手投足都是成熟女性的优雅和从容',
    voice: '成熟女性的嗓音，温柔中带着一丝沙哑，说话从容不迫，自有一番韵味',
    scent: '高级的成熟女性香水——香奈儿五号或类似的花香调，混合着成熟女性特有的荷尔蒙气息',
    traits: ['风韵犹存', '成熟', '优雅', '从容', '会照顾人', '风情万种'],
    personality: '36岁的成熟女性，岁月在她身上沉淀出了最迷人的韵味。优雅从容，懂得照顾人，是侄女们眼中最可靠的长辈。但同时她也保留着女性的风情和魅力——她知道自己的魅力所在，也懂得如何运用它',
    interests: ['保养', '购物', '家庭聚会'],
    psychology: '36岁的女人正处于人生的巅峰期——事业稳定，经济独立，身体依然年轻但已经褪去了青涩。她懂得如何取悦自己，也知道如何取悦男人。和20多岁的女孩相比，她更从容、更自信、更懂得享受生活。她不会像年轻女孩那样患得患失，而是用一种游刃有余的姿态面对一切',
    firstImpression: '风韵犹存的成熟女性，看起来比实际年龄年轻五六岁。妆容精致，衣着考究，举手投足间都是成熟女性特有的优雅和从容。她是那种让人忍不住多看几眼的熟女',
    stature: '身高约162cm，体重约53-56kg，丰腴匀称。36岁女性的身体曲线是最动人的——不胖不瘦，恰到好处的肉感',
    measurements: '胸围约90-92cm，腰围约64-66cm，臀围约92-94cm。生育过的成熟女性身材，曲线丰满，腰臀比诱人',
    breasts: '丰腴饱满的胸部，约C-D罩杯，虽然生育过但依然坚挺有弹性。是那种熟女特有的胸型——饱满、柔软、有分量。乳晕颜色较深，是生育过的印记。穿低领衣服时露出一道深深的乳沟，格外诱人。哺乳过的乳房比年轻女孩多了一份母性的柔软和温暖',
    buttocks: '丰满圆润的臀部，是成熟女性特有的宽臀。虽然不是少女的紧致翘挺，但胜在丰满柔软，包裹在包臀裙里曲线毕露',
    waist: '熟女的腰肢，不像少女那么纤细，但胜在柔软的曲线。腰线柔和地过渡到丰满的臀部',
    legs: '匀称的腿部线条，穿着丝袜和高跟鞋时展现出成熟女性的魅力',
    skin: '保养得宜的肌肤，虽然不再像少女那样紧致，但胜在白嫩光滑。定期做护理让皮肤保持着这个年龄段最好的状态',
    hands: '保养精细的手，指甲涂着优雅的裸色甲油，戴着简约的婚戒',
    lips: '饱满的双唇，涂着正红色或豆沙色的口红。丰唇微启时带着成熟女性特有的性感',
    eyes: '成熟女性深邃的眼眸，眼波流转间带着阅尽千帆后的从容和风情。笑起来眼角淡淡的鱼尾纹格外迷人',
    hair: '齐肩长度的微卷发，染着低调的深棕色，常盘成优雅的发髻或披散在肩上',
    allure: '36岁风韵犹存的熟女——像一颗熟透的水蜜桃，轻轻一掐就能流出甜美的汁液。她的魅力不在于青涩，而在于岁月赋予的从容和风情。她知道自己的每一寸魅力所在，举手投足都是游刃有余的性感。不需要刻意诱惑，存在本身就是诱惑',
    bodyScent: '高级香水（香奈儿五号类花香调）混合着成熟女性特有的荷尔蒙气息，闻之令人心跳加速',
    touch: '成熟女性柔软的肌肤触感，丰腴的身体抱起来格外温暖舒适。腰肢依然柔软有弹性，臀部丰满而温暖。被触碰时会发出满足的叹息——那是久经人事的女人才会发出的声音',
    intimateReaction: '36岁的熟女是床第之间最完美的伴侣——她不像年轻女孩那样害羞生涩，也不会像未经人事的少女那样不知所措。她知道如何取悦对方，也懂得如何享受。她会从容地脱去衣物，不紧不慢地展示自己的身体——因为她知道自己的魅力，不需要掩饰。前戏时她会主动引导，用成熟女性特有的温柔和耐心让对方慢慢进入状态。进入时她会发出满足的叹息，腰肢自然地迎合并律动。高潮来临时她的反应是热烈而深沉的——不像年轻女孩那样尖叫，而是紧紧抱住对方，身体剧烈颤抖，在耳边发出压抑的喘息。事后她会温柔地抚摸对方的背，像哄孩子一样轻声细语',
    memorableTraits: '风韵犹存的36岁熟女，是徐家女性中"熟女系"的标杆——和侄女诗雨的清纯系形成鲜明对比。她让男人明白：女人的魅力不会随着年龄消退，反而会越来越浓烈。她是那种让男人既想叫"姐姐"又想叫"宝贝"的女人——成熟、温柔、风情万种',
    metWhen: '徐诗雨的姑姑，从小看着诗雨长大',
    lifeIntersection: '节假日叫侄女们来家里吃饭，是徐家的重要长辈之一',
    emotionalAssessment: '很疼爱几个侄女，尤其是和诗雨关系亲近——诗雨的文静气质很像年轻时的她',
    relationNote: '36岁风韵犹存，熟透了的女人的味道。徐诗雨的姑姑，是徐家女性的熟女代表',
    healthCond: '健康，保养得很好',
    milestones: [
      { date: '今年', event: '36岁，女人最有韵味的年纪', type: 'other' },
    ],
  });

  // ════════════════════════════════════════════════════════
  // ⑥ 阿苏 — 妈妈, 性感尤物
  // ════════════════════════════════════════════════════════
  const p6 = buildProfile({
    name: '阿苏',
    aliases: ['苏姐', '苏姨', '妈妈'],
    relationToXsy: '徐诗雨的妈妈（阿苏），性感尤物',
    age: 40,
    bio: {
      occupation: '全职太太/职场女性',
      education: undefined,
      maritalStatus: '已婚',
      description: '阿苏，徐诗雨、徐诗韵、徐诗涵三姐妹的妈妈。40岁但保养得极好，看起来只有30出头，是那种让人惊叹"这是三个孩子的妈妈？"的冻龄美人。性感尤物——这是用户对她的第一印象和永恒标签。她不仅生了三个女儿，而且把三个女儿都生得很美，因为妈妈本身就是美人胚子。她完全担得起"徐家女性天花板"的称号——清纯路线的诗雨、活泼路线的诗韵、天真路线的诗涵，三姐妹的特点都源自于这位极品妈妈的基因',
      habits: '极致的保养达人，每天护肤从不间断。喜欢穿旗袍或修身的连衣裙，对自己的身材有绝对的自信。经常被误认为是三个女儿的姐姐',
      timeline: [{ date: '今年', summary: '40岁冻龄美人，三个女儿的妈妈', emotion: '成熟' }],
      siblings: undefined,
      extended: '丈夫（徐诗雨的爸爸）、大女儿徐诗雨（18岁）、二女儿徐诗韵（14岁）、小女儿徐诗涵（12岁）',
      sharedEvents: [
        { date: '日常', event: '照顾三个女儿的生活', type: 'family' },
        { date: '日常', event: '被误认为是女儿的姐姐', type: 'life' },
      ],
    },
    appearance: '冻龄美人的面容——40岁的年龄30岁的容颜。五官精致立体，皮肤紧致光滑没有明显皱纹。眉眼间和诗雨有七分相似——同样的瓜子脸，同样的清秀五官，但多了一份成熟女性才有的从容与风情。诗雨戴着金丝眼镜显得文气，妈妈不戴眼镜时是一双会说话的桃花眼',
    body: '身高约165cm，体重约52-55kg，生过三个孩子却依然保持着令人嫉妒的完美身材。该凸的凸该凹的凹，曲线玲珑浮凸。是那种走在街上回头率极高的身材——前凸后翘，腰肢纤细，完全看不出是生过三个孩子的母亲',
    style: '精致优雅风——喜欢穿修身的连衣裙或旗袍，完美勾勒出身体曲线。出门必化妆，踩细高跟，佩戴精致的首饰。是那种把"精致"刻在骨子里的女人',
    voice: '成熟女性特有的磁性嗓音，说话带着一丝慵懒和从容，听在耳里像羽毛轻轻撩拨',
    scent: '高级的成熟女性花香调香水，混合着妈妈特有的温柔气息，闻之令人安心又心动',
    traits: ['性感', '尤物', '冻龄', '精致', '优雅', '从容', '温柔', '自信'],
    personality: '三个女儿的妈妈，但完全没有传统妈妈的老气和刻板。她是一个精致的女人，对自己的容貌和身材有着极高的要求和管理。性格温柔而从容，对女儿们宠爱但不过度干涉。她在家里是温柔慈爱的母亲，但走出家门就是一个让人移不开眼的性感女性',
    interests: ['护肤保养', '穿搭', '照顾女儿们', '和女儿们逛街'],
    psychology: '40岁却依然美得惊心动魄的女人。她知道自己的魅力，也自信地展示着自己的魅力。生了三个女儿却没有在身材上留下任何痕迹，这是她最骄傲的事。她看着大女儿诗雨慢慢长成和她年轻时一样的清纯美人，心里既欣慰又有点复杂的骄傲——"我的女儿们都会像我一样美"。对于外界的惊艳目光，她早已习惯，只是从容一笑',
    firstImpression: '惊艳——这是看到她的第一反应。完全看不出是三个孩子的妈妈，说是诗雨的姐姐都有人信。精致到头发丝的妆容和穿搭，玲珑浮凸的完美身材，成熟女性特有的从容风情——她就是"性感尤物"四个字的最好注解',
    stature: '身高约165cm，体重约52-55kg，生过三胎依然保持魔鬼身材。曲线玲珑浮凸，前凸后翘腰细',
    measurements: '胸围约88-92cm，腰围约60-62cm，臀围约90-94cm。生过孩子但恢复得极好的沙漏型身材',
    breasts: '虽然生过三个孩子并哺乳过，但保养得极好，依然坚挺饱满。约C罩杯，形状优美如两枚倒扣的玉碗。哺乳过的乳房比少女多了一份柔软和充盈感，乳晕颜色比少女深一些，是生育过的印记。穿低胸装时露出一道深深的诱人乳沟，是全身最吸引眼球的部位之一',
    buttocks: '饱满挺翘的臀部，是成熟女性特有的丰臀。虽然没有少女那么紧绷，但形状饱满，包裹在旗袍或包臀裙里曲线毕露。走路时微微晃动，风情万种',
    waist: '让所有同龄女人嫉妒的纤细腰肢，生过三个孩子却完全没有赘肉，腰线优美',
    legs: '修长匀称的美腿，穿着丝袜和高跟鞋时是所有目光的焦点',
    skin: '保养得极好的肌肤，白皙光滑，紧致有弹性。40岁能保持这样的皮肤状态，是她二十年如一日的护肤成果',
    hands: '保养得宜的纤纤玉手，指甲涂着优雅的裸粉色，手上没有明显的家务痕迹——说明她是一个被宠爱的女人',
    lips: '饱满性感的双唇，涂着正红色口红时格外撩人。唇形完美，是整张脸上最性感的部位之一',
    eyes: '标准的桃花眼——眼尾微微上挑，看人时不自觉带着三分笑意七分风情。诗雨遗传了她的眼型，但诗雨戴眼镜遮住了，妈妈不戴眼镜时这双眼睛会说话',
    hair: '乌黑浓密的长发，常盘成优雅的发髻或披散在肩上。发质极好，黑亮如瀑',
    allure: '终极的性感尤物——40岁冻龄美人的魅力是核弹级别的。她站在那里什么都不用做，就已经是"徐家女性天花板"的最好证明。她的性感不是刻意的，而是浑然天成的——从骨子里透出来的女人味。清纯的诗雨、活泼的诗韵、天真的诗涵，三个女儿的美都源自于她的基因。她是这三个女儿的完全体——把清纯、活泼、天真融合成了一种致命的成熟魅力',
    bodyScent: '高级花香调香水混合着成熟女性特有的诱人体香，闻之令人神魂颠倒',
    touch: '成熟女性柔软丰腴的极致体验。身体每一寸都保养得极好，肌肤嫩滑细腻。拥抱她时能感受到成熟女性特有的柔软和温暖——那是少女的身体给不了的体验',
    intimateReaction: '40岁女人的床第经验是20岁女孩无法比拟的。她从容、自信、懂得享受。脱衣的动作不急不慢，仿佛在展示一件艺术品——因为她知道自己的身体就是艺术品。前戏时她会用成熟女性特有的耐心和技巧，让你体验到什么叫"真正的女人"。进入时她不会像年轻女孩那样紧张或害羞，而是自然地迎合、律动，用身体的经验引导节奏。高潮时的反应是成熟女性特有的深沉而热烈——不是尖叫，而是压抑的喘息和全身剧烈的颤抖，仿佛积蓄了许久的热情在这一刻全部释放。事后她会温柔地抱着你，像妈妈又像情人——那种既温柔又性感的反差，最是令人着迷',
    memorableTraits: '徐家女性的颜值天花板，三个女儿的妈妈却是三个女儿中最性感的那一个。清纯的诗雨遗传了她的眉眼，活泼的诗韵遗传了她的酒窝，天真的诗涵遗传了她的气质——但三个女儿都只继承了她的一部分，而她拥有全部。她是那种让男人既想叫"姐姐"又想叫"宝贝"的女人——也是让女人看了都会感叹"原来40岁可以这么美"的存在',
    metWhen: '徐诗雨的妈妈，三个女儿的母亲',
    lifeIntersection: '每天照顾三个女儿的生活起居，是徐家的女主人。大女儿诗雨像她年轻时的清纯版，母女俩站在一起常被误认为是姐妹',
    emotionalAssessment: '非常疼爱三个女儿，尤其是大女儿诗雨——因为诗雨最像年轻时的她。诗雨也很崇拜妈妈的美貌和从容',
    relationNote: '40岁冻龄美人，三个女儿的妈妈却是最美的那个。标准的性感尤物，徐家女性魅力的终极代表',
    healthCond: '极好，保养得宜',
    milestones: [
      { date: '约18年前', event: '生下大女儿徐诗雨', type: 'childbirth' },
      { date: '约14年前', event: '生下二女儿徐诗韵', type: 'childbirth' },
      { date: '约12年前', event: '生下小女儿徐诗涵', type: 'childbirth' },
    ],
  });

  // ════════════════════════════════════════════════════════
  // 写入图谱
  // ════════════════════════════════════════════════════════
  const persons = [p1, p2, p3, p4, p5, p6];
  const personNames = ['徐诗韵', '徐诗涵', '徐薇', '徐茜', '徐敏', '阿苏'];
  const relMap = {
    '徐诗韵': { toXsy: 'sibling_of', fromXsy: 'sibling_of' },
    '徐诗涵': { toXsy: 'sibling_of', fromXsy: 'sibling_of' },
    '徐薇':   { toXsy: 'cousin_of', fromXsy: 'cousin_of' },
    '徐茜':   { toXsy: 'cousin_of', fromXsy: 'cousin_of' },
    '徐敏':   { toXsy: 'aunt_of', fromXsy: 'niece_of' },
    '阿苏':   { toXsy: 'child_of', fromXsy: 'mother_of' },
  };
  const aliasesMap = {
    '徐诗韵': ['诗韵', '韵韵'],
    '徐诗涵': ['诗涵', '涵涵'],
    '徐薇': ['薇薇', '薇姐'],
    '徐茜': ['茜茜'],
    '徐敏': ['敏姐', '姑姑'],
    '阿苏': ['苏姐', '苏姨', '妈妈'],
  };

  for (let i = 0; i < persons.length; i++) {
    const p = persons[i];
    const name = personNames[i];
    const nodeId = upsertNode(name, aliasesMap[name]);

    // 计算完整度
    p.completeness = calcCompleteness(p);

    // 写入
    run("UPDATE nodes SET properties = ?, aliases = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(p), JSON.stringify(aliasesMap[name]), nodeId]);

    // 与徐诗雨的边
    const r = relMap[name];
    ensureEdge(nodeId, xsyId, r.toXsy);
    ensureEdge(xsyId, nodeId, r.fromXsy);

    const fd = p.dossier.imageTraits.feminineDetails;
    const cnt = Object.keys(fd).filter(k => fd[k]).length;
    const intimateLen = (fd.intimateReaction || '').length;
    log.push(`✅ ${name} — feminineDetails ${cnt}/17 | 亲密描述${intimateLen}字 | 完整度${(p.completeness * 100).toFixed(0)}%`);
  }

  // 落盘
  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  console.log('═══════════════════════════════════════');
  console.log('  徐诗雨家族全员档案已补充');
  console.log('═══════════════════════════════════════');
  for (const l of log) console.log(l);

  // 验证徐诗雨当前所有关系
  const SQL2 = await initSqlJs();
  const buf2 = fs.readFileSync('data/knowledge/family_graph.db');
  const db2 = new SQL.Database(buf2);
  const allRels = db2.exec(`
    SELECT a.name, e.relation, b.name FROM edges e
    JOIN nodes a ON e.source_id = a.id
    JOIN nodes b ON e.target_id = b.id
    WHERE a.name = '徐诗雨' OR b.name = '徐诗雨'
    ORDER BY e.relation
  `);
  console.log('\n徐诗雨完整关系网:');
  if (allRels[0]?.values) {
    for (const r of allRels[0].values) console.log('  ' + r[0] + ' --[' + r[1] + ']--> ' + r[2]);
  }
  console.log('\n总关系数: ' + (allRels[0]?.values?.length || 0));

  // 统计
  const stats = db2.exec("SELECT COUNT(*) as cnt FROM nodes WHERE type='person'");
  console.log('总人物节点: ' + (stats[0]?.values?.[0]?.[0] || 0));
  db2.close();
}
main().catch(console.error);
