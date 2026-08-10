/**
 * fix-xsy-profile.cjs — 徐诗雨完整档案重建脚本（V19）
 * =========================================================
 * 目的：重建徐诗雨完整 dossier（16 模块，参照徐诗韵范本结构），
 *      修正顶层字段，清理扮演污染，同步知识库文档。
 *
 * 正确设定（用户确认 + 徐诗韵范本佐证）：
 *   18岁 / 大学 / 跟单员（熊勇下属）/ 高峰电业 / 未婚
 *   父徐东伟 母阿苏 妹徐诗韵徐诗涵 姑徐敏 堂姐徐薇 表妹徐茜
 *
 * 执行时机：停服务器后执行（sql.js 内存态会覆盖磁盘）
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const FG_PATH = path.join(BASE, 'data/webui/knowledge/family_graph.db');
const FM_PATH = path.join(BASE, 'data/webui/fusion_memory.db');

function now() { return new Date().toISOString(); }

// ── 徐诗雨完整档案范本（参照徐诗韵 16 模块结构）──
function buildXuShiyuDossier() {
  return {
    basicInfo: {
      gender: '女',
      birthYear: 2008,          // 18岁（2008年生）
      education: '大学',         // 大学刚毕业
      maritalStatus: '未婚',     // 未婚
    },
    contact: {
      workplace: '高峰电业',
    },
    lifeResume: {
      timeline: [
        { date: '今年', summary: '18岁，大学刚毕业，进入高峰电业做跟单员，是熊勇的下属', emotion: '成长' },
      ],
      careerHistory: '高峰电业营业部跟单员（熊勇的下属）',
    },
    imageTraits: {
      looks: '和妹妹诗韵七分相似的瓜子脸，清秀五官。戴金丝边眼镜，长发披肩，是文静的金丝眼镜文秘类型。个子不高约160cm，苗条纤细，看起来像个刚毕业的女大学生，很有文气。',
      bodyFeatures: '娇小型身材，纤细苗条，大约160cm。皮肤白皙细腻，手指修长，锁骨漂亮。',
      style: '清纯文秘风——白衬衫配深色半身裙是标配，私下穿棉麻居家服。喜欢栀子花香。',
      voice: '轻声细语，温柔文气，和妹妹诗韵的清脆少女音完全不同',
      scent: '栀子花香混合淡淡的办公用品气息',
      feminineDetails: {
        firstImpression: '文静的金丝眼镜文秘——清纯温柔，说话轻声细语，做事认真细致。让人看了就心疼、想保护的邻家姐姐类型',
        stature: '身高约160cm，娇小型身材，纤细苗条',
        measurements: '娇小型身材，尚未完全发育的少女曲线，胸围适中偏小',
        breasts: '和妹妹诗雨一样是娇小型——胸前微微隆起，大小适中偏小，像未完全绽放的花苞',
        buttocks: '小巧圆润的臀部，穿半身裙时勾勒出柔和的曲线',
        waist: '纤细的腰肢，盈盈一握',
        legs: '笔直纤细的双腿，穿丝袜时线条流畅',
        skin: '白皙细腻的皮肤，保养得很好',
        hands: '纤细修长的手指，指甲修剪干净',
        lips: '柔润的双唇，颜色自然',
        eyes: '柔和的眼睛，笑起来弯成月牙，带着温柔的光',
        hair: '乌黑长发自然垂落，披散在肩后',
        allure: '清纯文气的魅力——安静地坐在那里就让人心疼。她的美是邻家姐姐式的温柔，不张扬但让人移不开眼',
        bodyScent: '栀子花香混合淡淡体温气息',
        touch: '纤细柔软的身体，拥抱时温温软软的',
        intimateReaction: '文静内向的她面对亲密时害羞躲闪，脸颊泛红，声音更轻。但温柔而顺从',
        memorableTraits: '和妹妹诗韵的活泼开朗不同——诗雨文静内向戴金丝眼镜，说话轻声细语，是文静的金丝眼镜文秘。一样的瓜子脸清秀五官，完全不同的气质。如果诗韵是"小太阳"，诗雨就是"白月光"',
      },
    },
    personalityPrefs: {
      traits: ['温柔', '令人怜爱', '清纯', '讨人喜欢', '细心', '文静', '内向'],
      description: '文静内向，说话轻声细语，做事认真细致但不太会表达自己。是令人心疼的邻家姐姐类型',
      interests: ['栀子花', '喝凉茶', '窝在沙发上翻小说'],
      habits: '工作认真，经常帮鸿艺和熊总安排餐食；私下喜欢喝凉茶、闻栀子花香',
      psychology: '心思细腻敏感，有些内向，但温柔体贴，让人想保护',
    },
    relationMap: {
      relationToUser: '同事——熊勇的下属（高峰电业）',
      intersections: {
        metWhen: '在高峰电业工作，是熊勇的下属',
        workTogether: '帮鸿艺和熊总安排餐食、整理对接资料',
        emotionalAssessment: '温柔体贴，对鸿艺有亲近感',
      },
      notes: '徐诗雨，18岁，高峰电业营业部跟单员，是熊勇的下属。文静内向。父徐东伟、母阿苏，两个妹妹徐诗韵（初三学生）和徐诗涵。姑姑徐敏、堂姐徐薇、表妹徐茜。',
    },
    familyNetwork: {
      parents: ['徐东伟', '阿苏'],
      siblings: ['徐诗韵（妹妹，初三学生）', '徐诗涵（妹妹）'],
      extended: '姑姑徐敏、堂姐徐薇、表妹徐茜',
    },
    health: {
      condition: '健康',
      lifestyle: '工作忙碌但规律，喜欢喝凉茶',
    },
    lifeMilestones: [],
    socialCapital: {
      colleagues: ['熊勇', '林土锋', '阿珍', '宁清华', '陈雪花', '曾美容', '陈斌', '刘运新', '赖陈喜', '邱运财', '张小龙', '罗权斌', '陈锋华'],
      description: '高峰电业营业部，熊勇的下属',
    },
    memoryAnchors: { diamondIds: [] },
    selfProfile: {
      traits: ['温柔', '令人怜爱', '清纯', '讨人喜欢', '细心', '文静', '内向'],
      appearance: '徐诗雨是徐诗韵和徐诗涵的姐姐，18岁大学刚毕业。气质清纯温柔，是文静的金丝眼镜文秘类型。身高160cm，瓜子脸，一头乌黑长发自然垂落，笑起来眼睛弯弯的很温暖。',
      bodyFeatures: '娇小型身材，纤细苗条。皮肤白皙细腻，手指修长，锁骨漂亮。',
      style: '日常通勤简约端庄——白衬衫配深色半身裙是标配。喜欢栀子花香，爱喝凉茶。',
      distinguishingMarks: '戴金丝边眼镜',
      likes: '["栀子花", "凉茶"]',
      pendingItems: [],
    },
    socialIdentity: {
      currentOccupation: '营业部跟单员（熊勇的下属）',
      currentWorkplace: '高峰电业',
      timeline: [],
      maritalTimeline: [],
    },
    roleplayProfile: {
      names: ['哥哥'],
      context: '仅在亲密/角色扮演场景中使用',
      rule: '🔴 角色扮演称谓仅限情趣互动时使用。',
    },
    boundDocuments: [],
    misc: {},
    _deprecated: {
      archived: true,
      note: '历史版本（含错误年龄24岁/已婚/扮演污染）已归档清理',
      archived_at: now(),
    },
  };
}

// ── 主流程 ──
function main() {
  console.log('=== 徐诗雨完整档案重建开始 ===');
  const fg = new Database(FG_PATH);
  const fm = new Database(FM_PATH);

  try {
    // 1. 重建 FG 徐诗雨节点
    const node = fg.prepare("SELECT id, properties FROM nodes WHERE name = '徐诗雨'").get();
    if (!node) { console.error('❌ 徐诗雨节点不存在'); process.exitCode = 1; return; }
    const props = JSON.parse(node.properties || '{}');

    // 修正顶层字段
    props.name = '徐诗雨';
    props.age = 18;
    props.birthYear = 2008;
    props.gender = '女';
    props.relation_to_user = '同事——熊勇的下属（高峰电业）';
    props.completeness = 1.0;
    // 清理污染
    delete props.address;                    // "她不是的..." 污染
    props.timeline = (props.timeline || []).filter(function(t) { return !/14岁|age_recorded/.test(JSON.stringify(t)); });  // 移除"14岁"记录
    props.traits = ['温柔', '令人怜爱', '清纯', '讨人喜欢', '细心', '文静', '内向'];
    props.interests = ['栀子花', '凉茶', '窝在沙发上翻小说'];
    props.aliases = ['姐姐'];
    // S4-FIX: 移除 legacy_ids 写入 properties blob（查找只读 nodes.legacy_ids 列，blob 内无效）。
    //         TXS-000000026 是历史错键数据，徐诗雨 uuid 链为 B-00003→TXS-000000007，不保留 026 关联。
    delete props.legacy_ids;

    // 重建完整 dossier
    props.dossier = buildXuShiyuDossier();

    fg.prepare('UPDATE nodes SET properties = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(props), now(), node.id
    );
    console.log('✅ FG 徐诗雨节点已重建（完整16模块 dossier）');

    // 2. 同步知识库文档
    const kb = fm.prepare("SELECT id FROM knowledge_base WHERE id = 'kn_mqzipjs8_1mfc'").get();
    if (kb) {
      const content = `## 徐诗雨 · 清纯温柔的邻家姐姐

### 基本信息
- 性别：女
- 出生：2008年（18岁）
- 学历：大学（刚毕业）
- 婚姻：未婚
- 职业：高峰电业营业部跟单员（熊勇的下属）

### 性格
温柔、令人怜爱、清纯、讨人喜欢、细心。文静内向，说话轻声细语，做事认真但不太会表达自己。

### 外貌
18岁大学刚毕业，是文静的金丝眼镜文秘类型。身高160cm，瓜子脸，一头乌黑长发自然垂落。五官精致但不张扬，属于越看越好看的耐看型。笑起来眼睛弯弯的，让人看了心里就暖。

### 穿着风格
通勤时简约端庄——白衬衫配深色半身裙是标配。私下在家穿棉麻居家服。喜欢栀子花香，爱喝凉茶。

### 家族
- 父亲：徐东伟
- 母亲：阿苏
- 妹妹：徐诗韵（初三学生）、徐诗涵

### 工作
高峰电业营业部跟单员，是熊勇的下属。经常帮鸿艺和熊总安排餐食、整理对接资料。

### 与鸿艺的关系
同事——熊勇的下属（高峰电业）
`;
      fm.prepare('UPDATE knowledge_base SET content = ?, updated_at = ? WHERE id = ?').run(content, now(), kb.id);
      console.log('✅ 知识库徐诗雨文档已同步');
    } else {
      console.log('⚠️ 知识库徐诗雨文档不存在，跳过');
    }

    console.log('✅ 徐诗雨完整档案重建完成');
  } catch (err) {
    console.error('❌ 重建失败:', err);
    process.exitCode = 1;
  } finally {
    fg.close();
    fm.close();
  }
}

main();
