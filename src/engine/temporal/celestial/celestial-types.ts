/**
 * 天象物候系统类型定义
 */
import type { IStorageProvider } from '../../types.js';

// ── 月相 ──
export type MoonPhase =
  | 'new_moon'       // 朔月（新月）
  | 'waxing_crescent'// 蛾眉月
  | 'first_quarter'  // 上弦月
  | 'waxing_gibbous' // 盈凸
  | 'full_moon'      // 满月（望月）
  | 'waning_gibbous' // 亏凸
  | 'last_quarter'   // 下弦月
  | 'waning_crescent';// 残月

export const MOON_PHASE_LABELS: Record<MoonPhase, string> = {
  new_moon: '新月',
  waxing_crescent: '蛾眉月',
  first_quarter: '上弦月',
  waxing_gibbous: '盈凸月',
  full_moon: '满月',
  waning_gibbous: '亏凸月',
  last_quarter: '下弦月',
  waning_crescent: '残月',
};

// ── 二十四节气 ──
export type SolarTerm =
  | 'lichun' | 'yushui' | 'jingzhe' | 'chunfen' | 'qingming' | 'guyu'
  | 'lixia' | 'xiaoman' | 'mangzhong' | 'xiazhi' | 'xiaoshu' | 'dashu'
  | 'liqiu' | 'chushu' | 'bailu' | 'qiufen' | 'hanlu' | 'shuangjiang'
  | 'lidong' | 'xiaoxue' | 'daxue' | 'dongzhi' | 'xiaohan' | 'dahan';

export const SOLAR_TERM_LABELS: Record<SolarTerm, string> = {
  lichun:'立春', yushui:'雨水', jingzhe:'惊蛰', chunfen:'春分',
  qingming:'清明', guyu:'谷雨', lixia:'立夏', xiaoman:'小满',
  mangzhong:'芒种', xiazhi:'夏至', xiaoshu:'小暑', dashu:'大暑',
  liqiu:'立秋', chushu:'处暑', bailu:'白露', qiufen:'秋分',
  hanlu:'寒露', shuangjiang:'霜降', lidong:'立冬', xiaoxue:'小雪',
  daxue:'大雪', dongzhi:'冬至', xiaohan:'小寒', dahan:'大寒',
};

// ── 四季 ──
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_LABELS: Record<Season, string> = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
};

// ── 季节细分 ──
export type SubSeason =
  | 'early_spring' | 'mid_spring' | 'late_spring'
  | 'early_summer' | 'mid_summer' | 'late_summer'
  | 'early_autumn' | 'mid_autumn' | 'late_autumn'
  | 'early_winter' | 'mid_winter' | 'late_winter';

export const SUB_SEASON_LABELS: Record<SubSeason, string> = {
  early_spring:'初春', mid_spring:'仲春', late_spring:'暮春',
  early_summer:'初夏', mid_summer:'仲夏', late_summer:'盛夏',
  early_autumn:'初秋', mid_autumn:'仲秋', late_autumn:'晚秋',
  early_winter:'初冬', mid_winter:'仲冬', late_winter:'深冬',
};

// ── 天干地支 ──
export interface StemBranch {
  stem: string;    // 天干：甲乙丙丁戊己庚辛壬癸
  branch: string;  // 地支：子丑寅卯辰巳午未申酉戌亥
  full: string;    // 组合 如"甲子""丙午"
}

// ── 物候条目 ──
export interface PhenologyEntry {
  month: number;
  region: string;
  phenology: string[];   // 物候描述
  flowers: string[];     // 当季花卉
  scenes: string[];      // 典型场景
  foods?: string[];      // 当令食物
}

// ── 日出日落 ──
export interface SunCycle {
  sunriseHour: number;
  sunsetHour: number;
  dayLengthHours: number;
}

// ── 完整时空元数据（聚合器输出） ──
export interface CelestialContext {
  // 公历
  solarDate: string;        // 2026-07-01
  weekday: string;          // 星期三
  dayOfYear: number;        // 第几天
  // 农历
  lunarDate: string;        // 五月初七
  lunarYear: string;        // 丙午年
  isLeapMonth: boolean;
  // 节气
  currentTerm: SolarTerm | null;
  currentTermLabel: string;
  nextTerm: SolarTerm | null;
  nextTermLabel: string;
  nextTermDate: string;
  // 月相
  moonPhase: MoonPhase;
  moonPhaseLabel: string;
  moonIllumination: number;  // 0-1
  // 季节
  season: Season;
  seasonLabel: string;
  subSeason: SubSeason;
  subSeasonLabel: string;
  // 自然周期
  sunCycle: SunCycle;
  // 物候
  phenology: string[];
  flowers: string[];
  scenes: string[];
}

export interface CelestialConfig {
  storage: IStorageProvider;
  /** 地域，默认深圳 */
  region?: string;
}
