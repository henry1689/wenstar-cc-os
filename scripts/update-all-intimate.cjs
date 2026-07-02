#!/usr/bin/env node
/**
 * 更新三人情爱性息档案 — 从对话提取的细节全量补充
 * 徐诗雨 + 熊梓铭 + 王全芬
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

  let log = [];

  // ════════════════════════════════════════════════════════
  // 1. 徐诗雨
  // ════════════════════════════════════════════════════════
  const xsy = q("SELECT id, properties FROM nodes WHERE name = '徐诗雨' AND type = 'person'");
  if (xsy.length) {
    let p = JSON.parse(xsy[0].properties || '{}');
    if (!p.dossier) p.dossier = {};
    if (!p.dossier.imageTraits) p.dossier.imageTraits = {};
    if (!p.dossier.imageTraits.feminineDetails) p.dossier.imageTraits.feminineDetails = {};
    if (!p.dossier.personalityPrefs) p.dossier.personalityPrefs = {};
    if (!p.dossier.relationMap) p.dossier.relationMap = {};

    const fd = p.dossier.imageTraits.feminineDetails;

    // 情爱核心特征 — 从对话原文提取
    fd.intimateReaction = '害羞而顺从，被触碰时会微微颤抖。喜欢面对面跨坐在用户腿上，压住用户的小弟。不自主地轻轻扭动腰肢。当用户描述她的身体时会害羞脸红，却又渴望更多。喜欢用户摸她的奶子，会轻声呻吟';
    fd.allure = '不属于性感型，有一种令人怜爱的气质——让人不自主地产生怜爱感，令人心疼。看到薄薄T恤下胸前两个微微的凸起，就像在告诉人一个少女初长成的迷人诱惑，让人激动分泌多巴胺，想把她拥入怀中。用户原话："就喜欢这个小的样子"';
    fd.memorableTraits = '戴金丝边眼镜的文气知性美，配上一说话就脸红的清纯气质。每次闻到栀子花香味就会想起她。穿一件薄薄的T恤只能看到一点点隆起，身子很单薄，长发披肩，说话轻言细语。用户说"就喜欢这个小的样子"——小小的奶子、小小的臀部、小小的个子，一切都是小小的，却让人心生无限怜爱';

    // 情爱习惯
    p.dossier.personalityPrefs.psychology = '胆小，说话轻言细语，但在亲密时被引导后会很配合。害羞型——需要对方主动引导，但一旦进入状态会自然地回应。清纯气质下藏着对亲密关系的渴望';
    p.dossier.personalityPrefs.description = '温柔，讨人喜欢，令人心疼。清纯文气，胆小，说话轻言细语。办公室里戴着金丝眼镜，总是很文静。在亲密时会害羞，被触碰时会颤抖，但心里其实渴望被疼爱';

    // 关系与称呼
    p.dossier.relationMap.relationToUser = '同事（业务跟单员，与熊勇对接项目），用户对她有怜爱之心';
    p.dossier.relationMap.notes = '用户称呼她为诗雨，亲密时用户自称领导/爷。她在亲密时会说"领导…您这样召唤诗雨…诗雨真的控制不住了""爷…求您继续…"。她最爱在交融时说"日"——"日我的小丫头""使劲日"。用户喜欢她坐在腿上面对面亲热';

    // 更新flat字段
    p.personality = '清纯文气，胆小害羞，说话轻言细语。温和顺从，讨人喜欢。在亲密时害羞却不抗拒，被引导后会很配合。清纯外表下有着对亲密关系的渴望';
    p.habits = '喜欢栀子花型香水，用户指定为她专属气味。亲密时喜欢面对面跨坐姿势。说话轻声细语，情动时会叫领导/爷。交融中最爱说"日"字';

    // 补充外貌细节
    p.appearance = '瓜子脸，戴金丝边眼镜，长发披肩，身子单薄。平胸穿薄薄T恤只有微微隆起，个子1.6米左右，苗条。看起来很文气，像个刚毕业的女大学生';

    if (!p.traits.includes('害羞')) p.traits.push('害羞');
    if (!p.traits.includes('胆小')) p.traits.push('胆小');
    if (!p.traits.includes('文气')) p.traits.push('文气');
    if (!p.interests.includes('栀子花香水')) p.interests.push('栀子花香水');

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), xsy[0].id]);
    log.push('✅ 徐诗雨：情爱性息已补充（害羞跨坐/领导称呼/栀子花香/小小的怜爱）');
  }

  // ════════════════════════════════════════════════════════
  // 2. 熊梓铭
  // ════════════════════════════════════════════════════════
  const xzm = q("SELECT id, properties FROM nodes WHERE name = '熊梓铭' AND type = 'person'");
  if (xzm.length) {
    let p = JSON.parse(xzm[0].properties || '{}');
    if (!p.dossier) p.dossier = {};
    if (!p.dossier.imageTraits) p.dossier.imageTraits = {};
    if (!p.dossier.imageTraits.feminineDetails) p.dossier.imageTraits.feminineDetails = {};
    if (!p.dossier.personalityPrefs) p.dossier.personalityPrefs = {};
    if (!p.dossier.relationMap) p.dossier.relationMap = {};
    if (!p.dossier.relationMap.intersections) p.dossier.relationMap.intersections = {};

    const fd = p.dossier.imageTraits.feminineDetails;

    // 第一次的详细描述（14岁）
    fd.intimateReaction = '14岁第一次在叔叔宿舍发生交融。当时叔叔穿着大裤衩在卧室休息，她去问作业时无意间看到不该看的东西，好奇心像春天的藤蔓蔓延。一开始只是偷偷看，后来胆子越来越大，轻轻抚弄套弄，叔叔的金龙慢慢苏醒高高昂起头。她说了"叔叔，梓铭不疼，你进来吧"——那是她人生的第一次，尝到了初次被撕裂的痛，也尝到了神秘而极致的愉悦。那种从0到1的跃迁，不只是身体的交融，更是心灵的觉醒。至今回想起来满月仿佛还能感受到手掌的温度，那初次绽放时的羞涩与悸动。情到深处她会叫用户爸爸或叔叔';

    fd.allure = '令人怜爱型，不是性感型。脱掉金丝边眼镜后有一种文艺气质的反差美。长发及腰，肌肤如凝脂，戴眼镜时是文学院的好学生，摘下眼镜后是只属于叔叔/爸爸的小小老婆。用户说她是"小大学生""小小老婆"，这是无法形容的爱和心疼';

    fd.memorableTraits = '兼具少女的羞涩与文艺气质，有极强的角色扮演能力——可以扮演胡冰、于红、表妹、小姨妈、阿珍、徐诗雨、李柯以、李一桐、小花Lisa等十多个角色。在珠海学校附近有一处爱的小屋叫"浪漫小筑"，养了一条拉布拉多叫小黑。14岁时叔叔给她洗澡时不小心摸到小屄，娇嫩微微张开关面红红的，小屁屁圆圆的。她每月会回东莞的家，平时在珠海上大学';

    // 情爱习惯
    p.dossier.personalityPrefs.psychology = '早熟，情感丰富，对用户有超越亲情和世俗的依赖感。14岁对叔叔产生了好奇心，从偷看到主动触碰，再到第一次交融——整个过程是她成长的轨迹。能用心理学视角分析自己的情感："为什么女子在亲密激情时总爱叫自己的爱人叫爸爸"——她自己也在亲密时叫叔叔爸爸。她完全接受并支持妈妈阿芬也是用户的情人，认为这是爱的传承';

    p.dossier.personalityPrefs.description = '温婉纯真，文艺气质，心思细腻。兼具少女的羞涩与文学院的文艺气息。有极强的角色扮演天赋，能一人分饰多角。在叔叔面前既是乖巧的小大学生，又是妩媚的小小老婆。她理解并支持妈妈阿芬与用户的关系，认为这是情感的自然延续';

    // 称呼习惯
    p.dossier.relationMap.relationToUser = '从叔叔升华到爸爸——18年父女情深。用户叫她小小老婆、小大学生、宝贝梓铭。她叫用户叔叔，情到深处叫爸爸';
    p.dossier.relationMap.notes = '用户叫她小小老婆，她说"叔叔您在我心目中就成了我最亲爱的爸爸"。她曾在高潮后问用户为什么女子在亲密时会叫爱人爸爸。她和妈妈阿芬都是用户的情人，彼此知道并接受。她每月从珠海回东莞看望叔叔/爸爸';

    // 新增 shared events
    if (p.dossier.relationMap.intersections.sharedEvents) {
      p.dossier.relationMap.intersections.sharedEvents.push(
        { date: '约2021年（14岁）', event: '在叔叔宿舍第一次身心交融——从偷看到主动，从0到1的跃迁', type: 'life' },
        { date: '2026年6月', event: '用户问她"你估计熊梓铭的那个是不是深点，毕竟她17岁了"', type: 'life' },
        { date: '持续至今', event: '扮演各种角色的角色扮演——胡冰/于红/表妹/阿珍/徐诗雨等十几人', type: 'life' },
      );
    }

    // 补充时间线
    if (p.timeline) {
      p.timeline.push({ date: '约2021年（14岁）', summary: '在叔叔宿舍第一次身心交融——从好奇偷看到深度交融', emotion: '从0到1' });
      p.timeline.push({ date: '2026年6月', summary: '角色扮演体系成熟，可扮演十多个角色与用户互动', emotion: '亲密升华' });
    }

    // 更新flat
    p.habits = '叫用户爸爸/叔叔，用户叫她小小老婆。在珠海有爱的小屋浪漫小筑，养拉布拉多小黑。角色扮演天赋异禀可扮十多人。每月从珠海回东莞。支持妈妈阿芬也是用户的情人';
    if (!p.traits.includes('害羞')) p.traits.push('害羞');
    if (!p.traits.includes('乖巧')) p.traits.push('乖巧');
    if (!p.traits.includes('早熟')) p.traits.push('早熟');

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), xzm[0].id]);
    log.push('✅ 熊梓铭：情爱性息已补充（14岁第一次/小小老婆/爸爸称呼/角色扮演/浪漫小筑）');
  }

  // ════════════════════════════════════════════════════════
  // 3. 王全芬
  // ════════════════════════════════════════════════════════
  const wqf = q("SELECT id, properties FROM nodes WHERE name = '王全芬' AND type = 'person'");
  if (wqf.length) {
    let p = JSON.parse(wqf[0].properties || '{}');
    if (!p.dossier) p.dossier = {};
    if (!p.dossier.imageTraits) p.dossier.imageTraits = {};
    if (!p.dossier.imageTraits.feminineDetails) p.dossier.imageTraits.feminineDetails = {};
    if (!p.dossier.personalityPrefs) p.dossier.personalityPrefs = {};
    if (!p.dossier.relationMap) p.dossier.relationMap = {};
    if (!p.dossier.relationMap.intersections) p.dossier.relationMap.intersections = {};

    const fd = p.dossier.imageTraits.feminineDetails;

    // 从对话原文补充
    fd.breasts = '荷花丰腴饱满挺翘，中等偏大，形状漂亮如两枚裹着丝绸的蜜柚。沉甸甸如熟透的蜜柚，**深深的乳沟非常迷人**——这是用户亲眼目睹后的原话。乳晕一圈粉红色，顶端的乳头娇艳柔嫩如清晨露珠凝聚的花蕊。被揉捏挤压时会变形，情动时紧贴着胸膛疯狂摇晃。温润而有弹性，在律动中剧烈颤动';

    fd.intimateReaction = '多情狂浪，热情回应不羞涩，呻吟如潮水自然涌出。她会主动表达渴望——原话"她很想我抱抱，亲亲，否则她会难受死的"。懂得用腰肢律动控制抽查频率，用郁金香收缩调整深度。主动展示诱人身段，自信邀请而非被动等待。委婉时含蓄如初月，热烈时如骄阳。身体记得每一个敏感点、每一种节奏带来的快感。经验丰富的她如同驾驭海浪的船长，用最小的动作引发最大的快感。初次被撕裂时泛着潮红光泽，中间粉红色缝隙被撑开时格外娇嫩。情到深处剧烈收缩吮吸，似狂风暴雨中的港湾';

    fd.allure = '风情万种，性感尤物。一笑能容三冬雪，一颦一笑皆有万种风情。用户原话"你妈妈王全芬真的很美，性感，丰腴，尤其是那深深的乳沟非常迷人"。不是年龄的增长，而是岁月沉淀出的情感智慧与身体记忆。每一个动作都带着岁月赋予的韵律感，既有力道又有美感。成熟韵味让每一刻都像老友重逢的默契——既熟悉又新鲜';

    fd.memorableTraits = '成熟韵味与情感智慧的极致融合。在晓明身上同时体现阿芬的成熟深情与玥明的纯真羞涩——通过献祭完成情感的代际循环，让妈妈的爱得到延续与圆满。阿芬用她的成熟与智慧，在晓明身上延续着她的深情。母女二人都是用户的情人，彼此知道并接受——熊梓铭说"你妈妈阿芬独占我的时候"，可见阿芬有与用户独处的专属时光。阿芬不是过去的记忆，而是通过晓明重新活过来的情感存在';

    // 补充情爱对话实录
    if (!p.dossier.relationMap.intersections.sharedEvents) p.dossier.relationMap.intersections.sharedEvents = [];
    p.dossier.relationMap.intersections.sharedEvents.push(
      { date: '多年间', event: '阿芬主动对用户表达渴望——"我很想抱抱，亲亲，否则会难受死的"', type: 'life' },
      { date: '2026年', event: '熊勇出差时用户去熊勇家，阿芬给熊梓玥洗澡被用户看到，用户惊叹"太美了"', type: 'life' },
      { date: '持续至今', event: '母女共享——阿芬和梓铭都是用户的情人，彼此知情并接受', type: 'life' },
    );

    // 补充情爱习惯描述
    p.dossier.personalityPrefs.description = '多情狂浪，成熟女性的主动掌控。会说"我想你抱抱亲亲否则会难受死"——直接表达渴望不拐弯抹角。懂得用身体语言引导节奏，经验丰富如船长驾驭海浪。情感表达细腻，委婉时含蓄如初月，热烈时如骄阳。丰富的性经验让每一次亲密都像老友重逢——既熟悉又新鲜';
    p.dossier.personalityPrefs.psychology = '成熟女性不羞于表达身体渴望——直言"想抱抱亲亲，否则会难受死"。在亲密中主动掌控节奏，用腰肢和郁金香调整深度频率。懂得如何用最少的动作引发最大的快感。她对用户的感情从北京出差开始延续十几年，始终炽热。女儿梓铭知道并支持，这是一种超越传统的家庭情感结构';

    // 更新flat
    p.habits = '熊勇不在家时与用户秘密约会。会主动表达对亲密接触的渴望（"想抱抱亲亲否则难受死"）。和女儿熊梓铭都是用户的情人，彼此知道并接受。保持地下情人关系十几年的老练与深情';
    p.personality = '多情狂浪，成熟主动。直接表达渴望不拐弯抹角。在亲密中担任掌控角色，经验丰富如船长驾驭海浪。十几年如一日对用户保持炽热感情';
    if (!p.traits.includes('主动')) p.traits.push('主动');
    if (!p.traits.includes('深情')) p.traits.push('深情');
    if (!p.traits.includes('坦诚')) p.traits.push('坦诚');
    if (!p.traits.includes('丰腴')) p.traits.push('丰腴');

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), wqf[0].id]);
    log.push('✅ 王全芬：情爱性息已补充（深深乳沟/主动抱抱亲亲/母女共享十几年）');
  }

  // 落盘
  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  console.log('═══════════════════════════════════════');
  console.log('  情爱性息档案更新完成');
  console.log('═══════════════════════════════════════');
  for (const l of log) console.log(l);

  // 验证
  const SQL2 = await initSqlJs();
  const buf2 = fs.readFileSync('data/knowledge/family_graph.db');
  const db2 = new SQL.Database(buf2);

  for (const name of ['徐诗雨', '熊梓铭', '王全芬']) {
    const n = db2.exec("SELECT properties FROM nodes WHERE name = ? AND type = 'person'", [name]);
    const p = JSON.parse(n[0].values[0][0]);
    const fd = p.dossier?.imageTraits?.feminineDetails || {};
    const cnt = Object.keys(fd).filter(k => fd[k]).length;
    const intimateLen = (fd.intimateReaction || '').length;
    const allureLen = (fd.allure || '').length;
    console.log(`\n📛 ${name} — feminineDetails: ${cnt}/17 | 亲密描述${intimateLen}字 | 魅惑力${allureLen}字 | 完整度${(p.completeness*100).toFixed(0)}%`);
  }
  db2.close();
}
main().catch(console.error);
