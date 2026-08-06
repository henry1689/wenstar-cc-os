// 40维语义感知坐标系 — M3 输入契约（V2.0 目标态）
// Ref: 32D 通用规则细则（双规范结合）:
//   - WS-ARCH-32D-MEM 工程蓝皮书 spine.proto D1-D32（5 大类，field 10-55）
//   - DNA 双螺旋完整编码规范 V2.0 §1.1（海胆 32 根语义刺，0 下标）
//
// ╔═══════════════════════════════════════════════════════╗
// ║  perception-40d.ts  v1.0                              ║
// ║  归属: M3 (逻辑决策层)                                ║
// ║  40D = spine.proto D1-D32 + 新增 D33-D40（伴侣纹理）  ║
// ║  编号基准: D1 开头（对齐 spine.proto 存储坐标）       ║
// ║  日期: 2026-08-05                                    ║
// ╚═══════════════════════════════════════════════════════╝

// ────────────────────────────────────────────────────────
// 第一部分：40D 坐标系总览
// ────────────────────────────────────────────────────────
// 40D = 7 大类（扇区）
//   大类1 肉身实体基底   D01-D08   8D   来源: spine.proto  (瑶灵 D1-D8)
//   大类2 个体内在精神   D09-D14   6D   来源: spine.proto  (瑶灵 D9-D14)
//   大类3 圈层人际       D15-D20   6D   来源: spine.proto  (瑶灵 D15-D20)
//   大类4 时空环境       D21-D26   6D   来源: spine.proto  (瑶灵 D21-D26)
//   大类5 动态成长       D27-D32   6D   来源: spine.proto  (瑶灵 D27-D32)
//   大类6 伴侣情感纹理   D33-D40   8D   ★ 新增扇区 (24D 保留)
//                      ─────
//                       40D

/** 40D 感知向量：40 个命名键字段，按 D1-D40 编号 */
export interface PerceptionV40 {
  // ── 大类1: 肉身实体基底 D01-D08 (spine.proto) ──
  /** D01 肌肉疲劳/体能负荷: 0(轻松)~1(疲劳) */
  d01_muscle_fatigue: number;
  /** D02 躯体疼痛: 0(无痛)~1(剧痛) */
  d02_pain_level: number;
  /** D03 神经触觉觉醒: 0(迟钝)~1(高度敏感) */
  d03_nerve_arousal: number;
  /** D04 内分泌激素水平: 0(平稳)~1(极端)——综合值, 细分见未来对象态 */
  d04_hormones: number;
  /** D05 信息素气息: 0(无)~1(强烈) */
  d05_pheromone: number;
  /** D06 代谢周期: 0(低迷)~1(旺盛) */
  d06_metabolic_cycle: number;
  /** D07 躯体自愈: 0(无)~1(强自愈) */
  d07_self_heal: number;
  /** D08 感官环境: 0(封闭)~1(丰富) */
  d08_sensory_env: number;

  // ── 大类2: 个体内在精神 D09-D14 (spine.proto) ──
  /** D09 自我认知: 0(自我否定)~1(清晰定位) */
  d09_self_identity: number;
  /** D10 原生欲望/成长驱动: 0(无欲)~1(强烈) */
  d10_desire: number;
  /** D11 恐惧焦虑/倦怠: 0(无畏)~1(耗竭) */
  d11_fear_anxiety: number;
  /** D12 愉悦/松弛: 0(痛苦)~1(满足) */
  d12_pleasure: number;
  /** D13 共情恻隐: 0(冷漠)~1(强烈不忍) */
  d13_empathy: number;
  /** D14 个体自保: 0(无边界)~1(高防御) */
  d14_self_protect: number;

  // ── 大类3: 圈层人际 D15-D20 (spine.proto) ──
  /** D15 伴侣依恋: 0(疏离)~1(强烈附着) */
  d15_partner_attachment: number;
  /** D16 伴侣守护: 0(无)~1(强烈付出意愿) */
  d16_partner_protect: number;
  /** D17 家庭归属: 0(疏离)~1(强归属) */
  d17_family_belonging: number;
  /** D18 家庭守护: 0(无)~1(强守护) */
  d18_family_protect: number;
  /** D19 社交适配: 0(冒犯)~1(无可挑剔) */
  d19_social_fit: number;
  /** D20 团队保护: 0(无)~1(强防御) */
  d20_team_protect: number;

  // ── 大类4: 时空环境 D21-D26 (spine.proto) ──
  /** D21 私人居所感知: 0(陌生)~1(熟悉安全) */
  d21_private_space: number;
  /** D22 家庭氛围: 0(紧张)~1(温馨) */
  d22_home_atmosphere: number;
  /** D23 职场环境: 0(压力)~1(适应) */
  d23_workplace: number;
  /** D24 公共空间: 0(拥挤压力)~1(从容) */
  d24_public_space: number;
  /** D25 时空距离感: 0(遥远)~1(亲近) */
  d25_space_distance: number;
  /** D26 季节气候感知: 0(不适)~1(舒适) */
  d26_season_climate: number;

  // ── 大类5: 动态成长 D27-D32 (spine.proto) ──
  /** D27 微观生理演化: 0(停滞)~1(活跃) */
  d27_micro_physiology: number;
  /** D28 自然拓展: 0(封闭)~1(开放) */
  d28_nature_expand: number;
  /** D29 人文社交细化: 0(粗放)~1(精微) */
  d29_social_refine: number;
  /** D30 精神文化成长: 0(停滞)~1(升华) */
  d30_culture_growth: number;
  /** D31 主客观量子耦合: 0(割裂)~1(交融) */
  d31_subjective_objective: number;
  /** D32 全身统筹: 0(失衡)~1(健康) */
  d32_global_overview: number;

  // ── 大类6: 伴侣情感纹理 D33-D40 ★ 新增扇区 ──
  /** D33 性吸引力: 0(无)~1(强烈生理冲动) */
  d33_sexual_attraction: number;
  /** D34 能量交融: 0(无感)~1(灵魂共鸣合一) */
  d34_energy_merge: number;
  /** D35 真诚度: 0(虚伪)~1(本心流露) */
  d35_sincerity: number;
  /** D36 支配感: -1(被控)~0(平等)~1(掌控) */
  d36_dominance: number;
  /** D37 道德审判: -1(谴责)~0(中性)~1(赞扬) */
  d37_moral_judgment: number;
  /** D38 幽默感: 0(严肃)~1(玩笑/双关) */
  d38_humor: number;
  /** D39 依赖度: 0(独立)~1(强烈需要对方) */
  d39_dependency: number;
  /** D40 占有排他: 0(无)~1(强独占/吃醋) */
  d40_possessiveness: number;
}

// ────────────────────────────────────────────────────────
// 第二部分：扇区定义与常量
// ────────────────────────────────────────────────────────

/** 扇区定义：编号范围 + 名称 + 来源 + 当前填充状态 */
export const PERCEPTION_40D_SECTORS = [
  { key: 'physical_body',        label: '肉身实体基底', start: 1,  end: 8,  source: 'spine.proto' },
  { key: 'inner_spirit',         label: '个体内在精神', start: 9,  end: 14, source: 'spine.proto' },
  { key: 'social_bonds',         label: '圈层人际',     start: 15, end: 20, source: 'spine.proto' },
  { key: 'spatiotemporal',       label: '时空环境',     start: 21, end: 26, source: 'spine.proto' },
  { key: 'dynamic_growth',       label: '动态成长',     start: 27, end: 32, source: 'spine.proto' },
  { key: 'intimate_texture',     label: '伴侣情感纹理', start: 33, end: 40, source: '新增扇区' },
] as const;

/** 扇区检索权重（P3 前：肉身体验/时空/成长无数据源，权重降 0；伴侣纹理最高） */
export const PERCEPTION_40D_SECTOR_WEIGHTS: Record<string, number> = {
  physical_body:   0.0,   // D01-D08: 当前全 0，P3 瑶灵通道上线后激活
  inner_spirit:    0.15,  // D09-D14: 当前部分由 24D 派生
  social_bonds:    0.15,  // D15-D20: 当前部分由 24D 派生
  spatiotemporal:  0.0,   // D21-D26: 当前全 0，P3 瑶光通道上线后激活
  dynamic_growth:  0.0,   // D27-D32: 当前全 0，P3 激活
  intimate_texture: 0.30, // D33-D40: ★ 伴侣情感信号，检索权重最高
};

/** 维度总数 */
export const PERCEPTION_40D_DIM = 40;

/** 情绪共振检索切片：感知情绪 + 伴侣纹理 = 14D（40D 文档 §九） */
export const PERCEPTION_40D_RESONANCE_DIMS = [
  // D01-D08 感知情绪（来自大类1 的部分）——当前 P3 前全 0，但保留槽位
  // 实际情绪共振切片：伴侣纹理 D33-D40（8D）+ 精神/人际中可用的情绪维
  // 当前实现：伴侣纹理 8D 为主，P3 后并入 D01-D06
] as const;

/** 40D 维度键序（固定，用于编解码对齐） */
export const PERCEPTION_40D_KEYS: (keyof PerceptionV40)[] = [
  'd01_muscle_fatigue', 'd02_pain_level', 'd03_nerve_arousal', 'd04_hormones',
  'd05_pheromone', 'd06_metabolic_cycle', 'd07_self_heal', 'd08_sensory_env',
  'd09_self_identity', 'd10_desire', 'd11_fear_anxiety', 'd12_pleasure',
  'd13_empathy', 'd14_self_protect', 'd15_partner_attachment', 'd16_partner_protect',
  'd17_family_belonging', 'd18_family_protect', 'd19_social_fit', 'd20_team_protect',
  'd21_private_space', 'd22_home_atmosphere', 'd23_workplace', 'd24_public_space',
  'd25_space_distance', 'd26_season_climate', 'd27_micro_physiology', 'd28_nature_expand',
  'd29_social_refine', 'd30_culture_growth', 'd31_subjective_objective', 'd32_global_overview',
  'd33_sexual_attraction', 'd34_energy_merge', 'd35_sincerity', 'd36_dominance',
  'd37_moral_judgment', 'd38_humor', 'd39_dependency', 'd40_possessiveness',
];

/** 创建全 0 的 PerceptionV40 */
export function createEmptyPerceptionV40(): PerceptionV40 {
  const p = {} as PerceptionV40;
  for (const k of PERCEPTION_40D_KEYS) p[k] = 0;
  return p;
}
// mod 1785928475
