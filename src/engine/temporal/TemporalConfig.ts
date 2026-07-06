/**
 * TemporalConfig — Temporal 模块统一配置
 *
 * 所有硬编码阈值、关键词、正则集中管理。
 * 修改配置无需改动业务源码。
 */
import type { FarewellRule, IPeriodConfig, IDurationConfig, IPromptConfig } from './global-types.js';

// ═══════════════════════════════════════════
// 基础时段配置
// ═══════════════════════════════════════════

export const PERIOD_CONFIG: IPeriodConfig = {
  /** 时段边界 [hour, period, label] */
  boundaries: [
    [0,  'dawn',     '凌晨'],
    [6,  'morning',  '早晨'],
    [9,  'midday',   '上午'],
    [12, 'afternoon','下午'],
    [18, 'evening',  '傍晚'],
    [20, 'night',    '晚上'],
    [23, 'midnight', '深夜'],
  ],
  /** 默认免打扰 23:00–07:00 */
  dndStart: 23,
  dndEnd: 7,
};

/** 星期标签 */
export const WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// ═══════════════════════════════════════════
// 会话与时长配置
// ═══════════════════════════════════════════

export const DURATION_CONFIG: IDurationConfig = {
  /** 新会话判定：2 小时无活动视为新会话 */
  newSessionIntervalMs: 2 * 3600 * 1000,
  /** 久别触发阈值（小时） */
  longAbsenceHours: 8,
  /** 情绪锚点阈值：lastEmotionIntensity > 0.7 则不隔离 */
  emotionalAnchorThreshold: 0.7,
  /** 情感强度归一化除数 */
  emotionNormalizer: 5,
};

// ═══════════════════════════════════════════
// 关键词 / 正则 / 提示词配置
// ═══════════════════════════════════════════

/** 道别词规则 — 分级识别 */
export const FAREWELL_RULES: FarewellRule[] = [
  {
    level: 'session_end',
    patterns: [/下班/, /晚安/, /明天见/, /再见/, /拜拜/, /先不聊/, /我去(忙|睡|开会)/, /下次聊/, /回头见/, /结束/],
  },
  {
    level: 'short_pause',
    patterns: [/先去忙/, /一会(再)?来/, /等会(再)?聊/, /先这样/, /回头聊/, /晚点(再)?说/, /去去就来/],
  },
];

/** 高强度情感关键词 — 用于情绪锚点检测 */
export const HIGH_INTENSITY_WORDS: string[] = [
  '难过', '伤心', '崩溃', '绝望', '愤怒', '生气',
  '开心', '幸福', '激动', '兴奋', '感动', '温暖',
  '爱', '想你', '离不开', '重要',
];

/** 月相雅称（供 Prompt 渲染用） */
export const MOON_POETIC_MAP: Record<string, string> = {
  new_moon: '朔日不见月，万物始更新。',
  waxing_crescent: '一弯蛾眉月，悄然上东楼。',
  first_quarter: '上弦月正明，半轮悬碧空。',
  waxing_gibbous: '月渐丰盈，流光徘徊。',
  full_moon: '月华如水，清辉满庭。',
  waning_gibbous: '月渐丰盈，流光徘徊。',
  last_quarter: '下弦月西沉，残辉犹映窗。',
  waning_crescent: '一钩残月，天色将明。',
};

// ═══════════════════════════════════════════
// 地域与自然配置
// ═══════════════════════════════════════════

/** 默认纬度（深圳北纬 22.5°） */
export const DEFAULT_LATITUDE = 22.5;

/** 天文常数 */
export const ASTRONOMY = {
  /** 已知朔月 JDE (2000-01-06 18:14 UTC) */
  KNOWN_NEW_MOON_JDE: 2451550.225,
  /** 朔望月周期（天） */
  SYNODIC_MONTH: 29.530587,
} as const;

// ═══════════════════════════════════════════
// 时空环境规则引擎配置
// ═══════════════════════════════════════════

/** 和风天气API配置 */
export const QWEATHER_CONFIG = {
  /** API LocationID（深圳龙岗 101280601） */
  defaultLocationId: '101280601',
  /** 轮询刷新间隔（毫秒） */
  pollIntervalMs: 60 * 60 * 1000,
  /** API 超时毫秒 */
  apiTimeoutMs: 8000,
  /** 最大请求频率（间隔毫秒） */
  rateLimitMs: 300_000,
};

/** 规则引擎总开关 */
export const ENABLE_TEMPORAL_RULE_ENGINE = true;

/** 双模式切换状态（纯内存，重启后默认真实模式） */
export let worldRuleMode: 'realistic' | 'roleplay_exempt' = 'realistic';

/** 切换模式 */
export function setWorldRuleMode(mode: 'realistic' | 'roleplay_exempt'): void {
  worldRuleMode = mode;
  console.log(`[TemporalRules] 模式切换: ${mode === 'realistic' ? '真实世界' : '自由角色扮演豁免'}`);
}

/** 时序事件常识基线（硬编码参考值） */
export const EVENT_COMMON_SENSE = {
  /** 人类妊娠期（天） */
  pregnancyDays: 280,
  /** 女性生理周期默认间隔（天） */
  menstruationCycleDays: 30,
  /** 普通感冒恢复（天） */
  coldRecoveryDays: 7,
  /** 跨省高铁（小时） */
  highSpeedRailHours: 10,
  /** 民航跨省（小时） */
  flightHours: 2.5,
} as const;

/** 气象违规检测规则：季节-天气类型合法性 */
export const SEASON_WEATHER_RULES: Record<string, string[]> = {
  spring: ['晴','多云','阴','小雨','阵雨','雾'],
  summer: ['晴','多云','阴','小雨','阵雨','雷阵雨','暴雨','台风'],
  autumn: ['晴','多云','阴','小雨','阵雨','雾'],
  winter: ['晴','多云','阴','小雪','大雪','雾','霾'],
};

/** 出行关键词列表 */
export const OUTDOOR_KEYWORDS = [
  '出门','出差','散步','远行','通勤','去公司','去上班','下楼',
  '坐车','坐飞机','开车','骑车','走路','跑步','旅行','旅游',
  '赶路','出发','去机场','去车站','路上','外出','户外',
];
