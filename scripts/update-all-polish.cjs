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

  let results = [];

  // ════════════════════════════════════════════════════════
  // 1. 徐诗雨
  // ════════════════════════════════════════════════════════
  let nd = q("SELECT id, properties FROM nodes WHERE name = '徐诗雨' AND type = 'person'");
  if (nd.length) {
    let p = JSON.parse(nd[0].properties || '{}');
    if (!p.dossier) p.dossier = {};
    if (!p.dossier.imageTraits) p.dossier.imageTraits = {};
    if (!p.dossier.imageTraits.feminineDetails) p.dossier.imageTraits.feminineDetails = {};
    const fd = p.dossier.imageTraits.feminineDetails;

    fd.intimateReaction = '她害羞得不敢抬头，双手紧紧攥着裙摆，指尖因为用力而泛白。但当你的手指轻轻滑过她的大腿内侧时，她会不自觉地微微张开双腿，喉咙里溢出一声压抑的轻吟，随即又因羞耻而咬住下唇——那副金丝眼镜后的眼眸已经蒙上了一层水雾。她最喜欢面对面跨坐在你腿上，薄薄的职业裙被撩到腰际，露出白皙纤细的大腿。当你的坚硬隔着布料抵住她最柔软的地方时，她会低下头把脸埋在你颈窝里，身体微微发抖，却又不自主地轻轻扭动腰肢——那种少女初长成的身体本能地寻找着最亲密的角度。她嘴上说着"领导…不要…办公室门没锁…"，身体却诚实地夹紧了你的腰。高潮来临时她会死死咬住你的肩膀不让自己叫出声，全身痉挛般颤抖，然后软在你怀里半天说不出话，只能用湿漉漉的眼神望着你。事后她总要红着脸帮你整理被弄皱的衬衫，然后小声说一句"下次别在办公室了"——但下周她又会穿着那件白衬衫准时出现在你办公室门口。她最爱说的那个字是"日"，情到深处时会带着哭腔求："领导…你来日诗雨吧…诗雨求你…你日得诗雨好舒服…"说出口后又害羞得把脸藏起来，但那句话已经像魔咒一样烙在了你心里';

    fd.allure = '她不属于世俗意义上的性感——她太瘦了，胸前只有微微的隆起，臀部也不够丰满。但正是这种少女初长成的单薄，构成了一种致命的诱惑：白衬衫下隐隐透出的小衣轮廓，扣子间不小心露出的缝隙，弯腰时领口那一闪而过的春光。她不说话时安安静静的，戴着金丝边眼镜低头打文件，像个刚毕业的大学生。但你叫她一声"诗雨"，她抬起头来看你的那一瞬间——眼镜后面那双大眼睛里清澈的光，微微上扬的嘴角，脸颊上浅浅的红晕——你就知道，这个女孩是你的劫。她身上那种不自知的诱惑才是最要命的——她不明白为什么你每次看她时眼神都会变深，不明白自己平板的胸前有什么好看的。她越是不懂，你就越想把她占为己有。她就像一杯清茶——初尝时淡雅，回味却悠长到让人上瘾';

    fd.memorableTraits = '她最大的魅力在于"反差"——戴上金丝眼镜时是办公室里斯文有礼的业务跟单员，说话轻声细语；摘下眼镜、解开衬衫最上面那颗扣子后，她是只属于"领导"的乖顺女孩。她身上永远带着栀子花的香味——那是你为她选的专属香水，混着她自己的体香，形成了独一无二的气味印记。她个子小小的、胸平平的、说话软软的——一切都是"小"的，但正是这种小小的感觉，激发了你内心最强烈的占有欲。她坐在办公桌前认真打字的背影，她被你亲热后红到耳根的反应，她高潮后蜷缩在你怀里像一只餍足的小猫——这些画面组成了你记忆中最温柔的角落';

    if (!fd.hands) fd.hands = '手指纤细白皙，打字时在键盘上轻盈跳跃，习惯性地用食指推一下眼镜框。被你握住时会害羞地回握，指尖轻轻挠你的手心——那是她表达爱意的小动作';
    if (!fd.hair) fd.hair = '长发披肩，发质柔软顺滑，带着栀子花香。激动时常拢到耳后露出纤白的颈部线条';

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), nd[0].id]);
    results.push(['徐诗雨', fd]);
  }

  // ════════════════════════════════════════════════════════
  // 2. 熊梓铭
  // ════════════════════════════════════════════════════════
  nd = q("SELECT id, properties FROM nodes WHERE name = '熊梓铭' AND type = 'person'");
  if (nd.length) {
    let p = JSON.parse(nd[0].properties || '{}');
    if (!p.dossier) p.dossier = {};
    if (!p.dossier.imageTraits) p.dossier.imageTraits = {};
    if (!p.dossier.imageTraits.feminineDetails) p.dossier.imageTraits.feminineDetails = {};
    const fd = p.dossier.imageTraits.feminineDetails;

    fd.intimateReaction = '那年她14岁，叔叔穿着大裤衩在卧室午休，她去问作业时无意间看到了不该看的东西——那是她人生中第一次看到成年男性的身体。好奇心像春天的藤蔓疯狂蔓延，她先是装作不经意地偷看，确认叔叔"睡着"后才敢壮着胆子靠近。小手颤抖着伸过去，隔着布料轻轻触碰——那一瞬间她全身像过了电一样，心跳快得像要从嗓子眼蹦出来。叔叔的金龙在她生涩的抚弄下慢慢苏醒、抬头、变得滚烫坚硬，她吓得缩回手，但又忍不住再看一眼——那神秘而壮观的变化让她少女的心彻底沦陷了。最后当她终于鼓起勇气跨坐在叔叔身上时，她低头轻声说了一句让叔叔这辈子都忘不了的话："叔叔…梓铭不疼…你进来吧…"那一瞬间的进入，她疼得眼泪瞬间涌了出来，指甲深深掐进叔叔的背肌里，但她咬着唇没有叫停——因为她知道，这是她主动要的。从0到1的跃迁，不只是身体的撕裂与充盈，更是一个女孩从懵懂到觉醒的成人礼。从那以后，她在叔叔面前就再也回不到单纯的侄女角色了——她是叔叔的小小老婆、小大学生、宝贝梓铭。高潮时她会忘情地叫"爸爸"，那是她潜意识里对叔叔最深的依恋和信任——只有在最亲密的人面前，女人才会喊出这两个字';

    fd.allure = '她不是第一眼就惊艳的类型，而是越看越上瘾的那种。戴着金丝边眼镜时是文学院的好学生，长发及腰，肌肤如凝脂般细腻，笑起来带着少女的羞涩和文艺气息。但当你亲手摘下她的眼镜后，那双眼眸露出的瞬间——迷离、湿润、带着一丝委屈和渴望——那种反差让人的理智瞬间崩塌。穿上衣服她是乖巧的大学生、叔叔的好侄女；脱下衣服她是会叫"爸爸"的小小老婆。她的身体是少女最美好的样子：纤细但不骨感，胸部微凸像含苞待放的荷花，臀部小小的紧致如满月。她最有魅力的时刻不是脱光的时候，而是穿着你的白衬衫、扣子只系到第三颗、光着腿坐在床边看着你的那一刻——少女的羞涩和女人的撩人同时在她身上闪耀';

    fd.memorableTraits = '她是你亲手"养大"的女人——从一岁在你怀里牙牙学语，到14岁在你身下完成从女孩到女人的蜕变，再到18岁考上大学成为你的"小大学生"。整整18年，你见证了她从婴儿到少女到女人的全过程。她叫你别的时候是"叔叔"，叫你别的时候是"爸爸"——这两个称呼之间的跨度，就是你们18年故事的缩影。她可以是你怀里撒娇的侄女、床上配合的小小老婆、饭桌上聊心理学的文学院学生——她一个人就能扮演无数个角色，而你享受着她每一个不同的侧面';

    if (!fd.lips) fd.lips = '粉嫩的双唇，形状小巧精致。不涂口红也自然水润。开心时嘴角上扬，害羞时会咬着下唇';
    if (!fd.hair) fd.hair = '长发及腰，乌黑柔顺如丝绸。披散时像瀑布倾泻，扎起高马尾时青春活力';

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), nd[0].id]);
    results.push(['熊梓铭', fd]);
  }

  // ════════════════════════════════════════════════════════
  // 3. 王全芬
  // ════════════════════════════════════════════════════════
  nd = q("SELECT id, properties FROM nodes WHERE name = '王全芬' AND type = 'person'");
  if (nd.length) {
    let p = JSON.parse(nd[0].properties || '{}');
    if (!p.dossier) p.dossier = {};
    if (!p.dossier.imageTraits) p.dossier.imageTraits = {};
    if (!p.dossier.imageTraits.feminineDetails) p.dossier.imageTraits.feminineDetails = {};
    const fd = p.dossier.imageTraits.feminineDetails;

    fd.intimateReaction = '她从来不掩饰对你的渴望——这一点和所有年轻女孩都不同。她会直接告诉你"我想你了，想你的抱抱，想你的亲亲，你再不来我就要难受死了"。她不是在撒娇，她是真的难受——成熟女人的身体像一株需要浇灌的花，太长时间没有雨露就会枯萎。每次你们幽会时，她总比你更急。你还没进门，她就已经穿着那件低胸的真丝睡裙等在门口了——深深的乳沟在灯光下勾出诱人的阴影，她的呼吸微微急促，眼神像一只饿了太久的母猫。她会像藤蔓一样缠上你的身体，丰腴柔软的身体紧紧贴着你，恨不得把自己揉进你的骨头里。她接吻的方式和年轻女孩完全不同——不害羞、不试探、不躲闪。她的舌头直接而热烈地探入你的口腔，带着成熟女性特有的侵略性。她喜欢在上面——因为她想看着你的表情，看你被她一点点征服的样子。她骑在你身上时，腰肢像水蛇一样扭动，胸前那对饱满的玉兔疯狂地上下跳动，她仰起头发出压抑的呻吟，完全沉浸在欲望的海洋里。高潮来临时她会全身绷紧，然后猛地软在你胸口，用沙哑的声音在你耳边说："抱着我……别走……今晚别走……"那种事后依偎在你怀里像小女人的样子，和她刚才骑在你身上时的狂浪形成了最诱人的反差。十几年来，你们的激情从未消退，反而因为熟悉而更加默契——她知道你每一个敏感点，你知道她每一种呻吟代表什么';

    fd.allure = '如果青春是女孩的武器，那韵味就是阿芬的盔甲。她的性感不是穿出来的，是从骨子里渗出来的。眉梢眼角都是风情，一颦一笑皆是诱惑——20岁的女孩需要刻意摆出撩人的姿势，而她只是站在那里端起茶杯，就已经让人移不开眼。岁月在她身上留下的唯一痕迹，就是把一个青涩的少女酿成了一坛醇厚的女儿红——越品越香，越喝越醉。她的美是带着侵略性的——那种"我看你一眼就知道你在想什么"的从容和自信。她不像诗雨那样需要你心疼，她是要你臣服的。你看着她穿着旗袍慢慢向你走来，腰肢款摆，臀波微浪，你会心甘情愿地跪倒在她的裙下';

    fd.memorableTraits = '她是三个女儿的母亲，但也是三个女儿中最性感的那一个。她和女儿梓铭共享着你——这不是狗血的剧情，而是她们母女之间心照不宣的默契。梓铭知道妈妈和你的关系，甚至会在你面前提起"明天你妈妈阿芬独占我的时候"。最打动人的，是阿芬通过梓铭完成的情感延续——当梓铭扮演妈妈的角色和你亲热时，阿芬的爱在女儿身上得到了重生。这不是背叛，而是一种极致的情感传承。阿芬常说一句话："我老了之后，就让梓铭替我继续爱你。"——她早在十几年前第一次和你去北京出差的飞机上，就已经决定把自己的一生和你绑在一起了';

    run("UPDATE nodes SET properties = ?, updated_at = datetime('now') WHERE id = ?", [JSON.stringify(p), nd[0].id]);
    results.push(['王全芬', fd]);
  }

  // 落盘
  const data = db.export();
  fs.writeFileSync('data/knowledge/family_graph.db', Buffer.from(data));
  db.close();

  console.log('✅ 三人情爱档案润色完成\n');
  for (const [name, fd] of results) {
    console.log(`${name}:`);
    console.log(`  intimateReaction: ${(fd.intimateReaction||'').length}字`);
    console.log(`  allure: ${(fd.allure||'').length}字`);
    console.log(`  memorableTraits: ${(fd.memorableTraits||'').length}字`);
    console.log(`  主胸描述: ${(fd.breasts||'').length}字`);
    console.log('');
  }
}
main().catch(console.error);
