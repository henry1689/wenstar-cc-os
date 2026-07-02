#!/usr/bin/env node
/**
 * 徐诗韵档案完善 — 以徐诗雨为基底 + 14岁初三学生 + 开朗活泼性格
 * 姐妹关系：徐诗雨（姐姐，18岁，业务跟单员，文静内向）
 *         徐诗韵（妹妹，14岁，初三学生，活泼开朗）
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

  const now = new Date().toISOString();

  // 找徐诗雨档案来参考
  const xsy = q("SELECT properties FROM nodes WHERE name = '徐诗雨' AND type = 'person'");
  const xsyP = xsy.length ? JSON.parse(xsy[0].properties) : null;
  const xsyFd = xsyP?.dossier?.imageTraits?.feminineDetails || {};
  const xsyLooks = xsyP?.appearance || '';
  const xsyBody = xsyP?.body_features || '';
  const xsyTraits = xsyP?.traits || [];

  // 找徐诗韵现有节点
  const nd = q("SELECT id FROM nodes WHERE name = '徐诗韵' AND type = 'person'");
  if (!nd.length) { console.log('❌ 徐诗韵节点未找到'); return; }
  const pid = nd[0].id;

  // ===== 徐诗韵完整档案 =====
  // 基底：徐诗雨的清纯文气相貌 + 诗韵独有的活泼开朗 + 14岁少女的青涩

  const p = {
    name: '徐诗韵',
    relation_to_user: '徐诗雨的亲妹妹（韵韵），14岁初三学生',
    age: 14,
    occupation: '初三学生',
    mention_count: 1,
    last_mentioned: now,
    first_mentioned: now,

    // 外貌 — 和诗雨有七分相似的姐妹脸，但气质完全不同
    appearance: '和姐姐诗雨有七分相似的瓜子脸，同样的清秀五官，但比姐姐多了一分婴儿肥和青春的红润。不戴眼镜，大眼睛又圆又亮，笑起来弯成月牙，露出两颗小虎牙，格外可爱。扎着高高的马尾辫，额前几缕碎发，是标准的元气初中女生模样。如果说姐姐诗雨是"文气的金丝眼镜女郎"，那诗韵就是"阳光下的田径少女"',
    body_features: '刚开始发育的少女身材，身高约153cm，体态轻盈纤细如柳枝。胸前刚刚开始隆起小小的花苞——像姐姐诗雨一样是娇小型，但比姐姐多了一分青春期的活力感。整体还是小女孩的纤细身板，但已经能看出和姐姐一样的好底子',
    style: '初中女生休闲风——白色T恤配运动短裤或百褶裙，脚踩帆布鞋，背着双肩书包。和姐姐诗雨的知性OL风完全不同',
    voice: '清脆如银铃，说话带着少女特有的元气和活力。笑起来声音格外好听，咯咯咯地像一串风铃',
    scent: '淡淡的洗衣粉清香混合着少女特有的清甜气息，运动后会有微微的汗香，是14岁少女最真实的味道',

    // 性格 — 和诗雨形成鲜明对比
    traits: ['活泼', '开朗', '元气', '青涩', '黏人', '纯真', '好奇', '直率', '阳光', '可爱'],
    personality: '和姐姐诗雨的文静内向完全相反——诗韵是个阳光开朗的元气少女。像一只欢快的小鸟，总是叽叽喳喳说个不停，笑起来咯咯响，露出两颗小虎牙。14岁的她对世界充满好奇，对姐姐的公司和同事尤其感兴趣——放学后总是第一个冲到姐姐公司去。黏人，尤其是黏姐姐诗雨。直率坦诚，心里想什么就说什么，不懂得隐藏。纯真无邪，对成人世界既好奇又懵懂',
    interests: ['放学去姐姐公司', '和姐姐睡一张床聊天', '学校田径队', '看动漫', '吃零食', '听姐姐讲公司的事'],
    psychology: '14岁的初三女生，正处于从女孩向少女过渡的关键期。身体刚刚开始发育，对自己身体的变化既害羞又好奇。性格开朗的她不像姐姐那样把心事藏起来——她会直接问姐姐"那个是什么感觉""谈恋爱是什么样子的"。对性有朦胧的好奇，但还停留在理论阶段，像一只试探着伸出爪子的小猫——既想靠近又怕受伤。她最信任的人是姐姐诗雨，姐妹俩无话不谈',
    habits: '放学第一件事就是跑去姐姐公司找姐姐一起回家。周末喜欢和姐姐挤一张床聊到深夜。对姐姐的"那位领导"（用户）充满好奇，老缠着姐姐问东问西。运动完后一身汗就往姐姐身上扑',

    description: '徐诗韵，14岁，初三学生，徐诗雨的亲妹妹。和姐姐感情极好，放学总是第一个冲到姐姐公司找她。和姐姐诗雨的文静内向不同——诗韵是个阳光开朗的元气少女，笑起来露出两颗小虎牙，扎着高高的马尾辫。她正处于从女孩向少女过渡的年纪，身体刚刚开始发育（和姐姐一样是娇小型的底子），性格直率坦诚，心里想什么就说什么。她对姐姐的"那位领导"充满好奇，老缠着姐姐问东问西。她还不真正懂男女之事，但已经开始对爱情有了朦胧的憧憬和好奇',

    // feminineDetails 17字段全填充
    dossier: {
      basicInfo: {
        gender: '女',
        age: 14,
        education: '初三',
        maritalStatus: '未婚',
      },
      contact: {},
      lifeResume: {
        timeline: [
          { date: '今年', summary: '初三，青春发育期，活泼开朗的元气少女', emotion: '成长' },
        ],
        careerHistory: '学生',
      },
      imageTraits: {
        looks: '和姐姐诗雨七分相似的瓜子脸，同样的清秀五官。不戴眼镜，大而圆的杏眼，笑起来弯成月牙，露出两颗小虎牙。扎高马尾，额前碎发，满脸的胶原蛋白，是标准的元气初中女生。如果说姐姐诗雨是文静的金丝眼镜文秘，诗韵就是阳光下奔跑的田径少女——同样的底子，完全不同的气质',
        bodyFeatures: '身高约153cm，体重约43-45kg，体态轻盈纤细如初春柳枝。和姐姐一样是娇小型身材，但14岁的她比18岁的姐姐更纤细。胸前微微隆起两个小花苞，像春天的花蕾刚刚开始绽放',
        style: '初中生休闲风——T恤运动裤或百褶裙，帆布鞋，高马尾。青春活力，充满阳光气息',
        voice: '清脆的少女音，笑起来咯咯响像风铃。说话带着元气和活力，和姐姐诗雨轻声细语完全不同',
        scent: '洗衣粉清香混合少女清甜体香，运动后微微的汗香也是14岁特有的清涩味道',
        feminineDetails: {
          firstImpression: '阳光元气初中女生——和姐姐诗雨七分像的瓜子脸，但比姐姐多了一份婴儿肥和阳光气息。扎着高马尾跑跑跳跳地过来，笑起来两颗小虎牙，让人看了就心情变好。是那种"看着她笑自己也会跟着笑"的女孩',

          stature: '身高约153cm，体重约43-45kg，纤细轻盈的少女身段。还在长身体的年纪，像一株正在抽条的柳树',

          measurements: '刚刚开始发育的身材，胸围约74-76cm，腰围约55-57cm，臀围约79-81cm。整体的少女直板身材，尚未形成明显的曲线，但已经开始有了少女的雏形',

          breasts: '和姐姐诗雨一样是娇小型——胸前微微隆起两个小小的山丘，像春天的花蕾刚刚含苞待放。比姐姐诗雨的还要小一些，毕竟她才14岁刚发育。形状是少女特有的圆锥形，小巧玲珑，乳晕是嫩嫩的粉红色。穿校服时几乎看不出，但穿紧身T恤时能看出胸前淡淡鼓起两个可爱的小包。触碰时会害羞地缩起来——那是14岁少女最娇嫩敏感的部位',

          buttocks: '少女的翘臀初显雏形——虽然不大但形状已经有了圆润的线条。穿百褶裙时蹦蹦跳跳，裙摆飞扬间隐约可见的少女轮廓。比姐姐诗雨的更翘更弹，毕竟运动量更大',

          waist: '纤细的少女腰肢，没有一丝赘肉，因为还在长身体所以格外纤细，盈盈一握',

          legs: '虽然个子不高但腿型笔直纤细，穿短裙时露出白皙的腿部线条。经常运动所以小腿线条比姐姐更紧致',

          skin: '14岁最好的皮肤——满满的胶原蛋白，白里透红，吹弹可破。运动后脸颊泛起健康的红晕，像刚摘的水蜜桃',

          hands: '小小的手还带着点婴儿肥，手指纤细，指甲剪得干干净净——标准初中女生的手',

          lips: '粉嫩的双唇像果冻一样晶莹，不涂口红也自然红润。笑起来嘴角上扬露出两颗小虎牙',

          eyes: '大而圆的杏眼，瞳仁黑亮清澈，看人时带着少女特有的好奇和纯真。比姐姐诗雨的眼睛更大更亮——因为她不戴眼镜',

          hair: '乌黑浓密的长发扎成高马尾，发尾及肩。跑起来马尾左右晃动，充满青春活力',

          allure: '14岁少女最纯真的魅力——她还不懂得什么叫性感，她的魅力在于青春本身。阳光般的笑容、两颗小虎牙、清脆的笑声、跑跑跳跳的活力——这些都是14岁独有的、过了就不会再有的美好。她像初夏清晨的第一缕阳光——不炽热，但温暖又明亮。和姐姐诗雨的清纯文气让人"心疼"不同，她是让人看了就心情变好、忍不住想摸摸她头的存在',

          bodyScent: '少女特有的清甜体香混合着淡淡的洗衣粉清香，运动后会有微微的汗味——但那不是难闻的汗臭，而是14岁少女特有的青涩气息，像青草刚刚被阳光晒过的味道',

          touch: '14岁少女肌肤特有的触感——嫩滑得像剥了壳的鸡蛋，摸上去满满的都是胶原蛋白。手臂纤细得让人不敢用力，腰肢柔软又富有弹性。拥抱时她整个人都软软的、小小的，像抱着一只温暖的小猫。她会像小动物一样往你怀里钻',

          intimateReaction: '14岁的她对亲密还处于懵懂好奇的阶段。她不像姐姐诗雨那样害羞躲闪——性格开朗的她，如果有男生牵她的手她会大大方方地握住，然后好奇地看对方的表情。被亲吻脸颊时会咯咯笑着躲开，脸蛋红扑扑的，不是因为害羞而是因为觉得好玩。但如果被亲到嘴唇，她会瞬间安静下来，大眼睛呆呆地望着你，心跳加速到像要从胸口跳出来——那是她的初吻，她完全没有准备好，身体却已经有了最真实的反应。如果被触碰敏感的胸部，她会像触电一样弹开，双手护在胸前，脸红到耳根——那里太敏感了，她自己洗澡时都不敢多碰。但她不会生气太久，过了一会儿又会忍不住靠近你，因为她好奇——好奇那种奇怪的感觉到底是什么。她的身体像一座刚刚苏醒的花园——每一寸肌肤都是新的，每一个反应都是最真实的第一次',

          memorableTraits: '和姐姐诗雨最不同的地方——诗雨文静内向戴金丝眼镜，说话轻声细语；诗韵活泼开朗扎高马尾，笑得咯咯响露出两颗小虎牙。两姐妹站在一起时像一对"反差姐妹花"——一样的瓜子脸清秀五官，完全不同的气质。如果姐姐诗雨是"白月光"，那诗韵就是"小太阳"。诗雨会安静地坐在那里让你心疼，诗韵会跑过来拉着你的手说"带我去玩嘛"。她的直率和阳光，是14岁少女最珍贵的礼物——因为过了这个年纪，就再也不会有这样的纯粹了',
        },
      },
      personalityPrefs: {
        traits: ['活泼', '开朗', '元气', '青涩', '黏人', '纯真', '好奇', '直率', '阳光', '可爱'],
        description: '和姐姐诗雨完全不同的性格——诗雨文静内向，诗韵开朗活泼。像一只欢快的小鸟，总是叽叽喳喳地说个不停。笑起来咯咯响露出两颗小虎牙，让人看了就想跟着笑。黏姐姐，也好奇姐姐身边的人。直率坦诚，心里想什么就说什么。14岁的她正处在最天真美好的年纪',
        interests: ['放学去姐姐公司', '和姐姐睡一张床聊天', '学校田径队', '看动漫', '听姐姐讲公司的事'],
        habits: '放学冲去姐姐公司、周末和姐姐挤一张床聊天到深夜、缠着姐姐问公司的事尤其是"那位领导"',
        psychology: '14岁开朗少女的好奇心——她还不懂男女之事，但已经开始有了朦胧的意识。性格直率的她会直接问姐姐"那个是什么感觉""他摸你的时候你什么感觉"。她像一只试探的小猫，既好奇又害羞。她的开朗让她比同龄人更大胆地探索这些未知领域',
      },
      relationMap: {
        relationToUser: '徐诗雨的亲妹妹（韵韵），14岁初三学生',
        intersections: {
          metWhen: '从小一起长大，徐诗雨的亲妹妹',
          lifeIntersection: '每天放学去公司找姐姐，和姐姐睡一张床聊天的亲密姐妹。通过姐姐认识了公司的同事（包括用户）',
          emotionalAssessment: '姐妹感情极好——姐姐文静妹妹活泼，性格互补。妹妹黏姐姐，姐姐疼妹妹。诗韵对姐姐的"领导"充满好奇',
          sharedEvents: [
            { date: '日常', event: '放学去姐姐公司找姐姐一起回家，对姐姐的领导（用户）充满好奇', type: 'life' },
            { date: '日常', event: '和姐姐睡一张床聊到深夜，缠着姐姐问公司的有趣事', type: 'life' },
            { date: '今年', event: '14岁初三，正值青春发育期，身体开始变化', type: 'life' },
          ],
        },
        notes: '姐姐徐诗雨（18岁，业务跟单员，文静内向）。诗韵（14岁，初三，活泼开朗）。两姐妹感情极好，性格互补。诗韵对姐姐的"那位领导"（用户）很好奇，老缠着姐姐问他的事——但他不知道，姐姐诗雨和领导之间不只是工作关系',
      },
      familyNetwork: {
        parents: undefined,
        siblings: ['徐诗雨（大姐，18岁，业务跟单员）', '徐诗涵（小妹，12岁）'],
        extended: '妈妈阿苏、姑姑徐敏、堂姐徐薇、表妹徐茜',
      },
      health: {
        condition: '健康，青春活力，经常运动',
        lifestyle: '初三学生，参加学校田径队，活泼好动',
      },
      lifeMilestones: [
        { date: '今年', event: '14岁，初三，身体开始发育', type: 'other', detail: '从女孩向少女过渡的年纪' },
      ],
      socialCapital: {
        description: '初三学生，社交圈主要是同学和姐姐的同事们',
      },
      memoryAnchors: { diamondIds: [] },
    },
  };

  // 计算完整度
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
    if (d.imageTraits?.looks) score += 0.04;
    if (d.relationMap?.intersections?.sharedEvents?.length > 0) score += 0.04;
    if (d.lifeMilestones?.length > 0) score += 0.05;
    if (d.personalityPrefs?.psychology) score += 0.03;
    if (d.personalityPrefs?.description) score += 0.03;
  }
  p.completeness = Math.round(Math.min(1, score) * 100) / 100;

  // 写入
  run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(p), pid]);
  run("UPDATE nodes SET aliases = ?, updated_at = datetime('now') WHERE id = ?",
    [JSON.stringify(['诗韵', '韵韵']), pid]);

  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  const fd2 = p.dossier.imageTraits.feminineDetails;
  const cnt = Object.keys(fd2).filter(k => fd2[k]).length;
  const intimateLen = (fd2.intimateReaction || '').length;

  console.log('✅ 徐诗韵档案已完善');
  console.log('  完整度: ' + (p.completeness * 100).toFixed(0) + '%');
  console.log('  feminineDetails: ' + cnt + '/17 字段');
  console.log('  亲密描述: ' + intimateLen + ' 字');
  console.log('  traits: ' + p.traits.join(', '));

  // 和姐姐诗雨画风对比
  console.log('\n=== 徐家姐妹画风对比 ===');
  console.log('  ' + '━'.repeat(50));
  console.log('  维度\t\t徐诗雨（姐·18）\t徐诗韵（妹·14）');
  console.log('  ' + '━'.repeat(50));
  console.log('  性格\t\t文静内向\t\t活泼开朗');
  console.log('  外貌\t\t金丝眼镜文气\t\t高马尾虎牙阳光');
  console.log('  胸部\t\t平胸微凸\t\t小花苞初绽');
  console.log('  身材\t\t1.6m苗条\t\t1.53m纤细');
  console.log('  情爱风格\t害羞顺从被引导\t\t懵懂好奇试探型');
  console.log('  对异性的态度\t害羞躲闪\t\t好奇直率');
  console.log('  经典气质\t让人心疼\t\t让人心情变好');
  console.log('  ' + '━'.repeat(50));
}
main().catch(console.error);
