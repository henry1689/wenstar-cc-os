/**
 * LunarPhaseCalc — 月相计算器
 *
 * 基于天文算法，输入时间戳输出月相状态。
 * 月球朔望周期（synodic month）≈ 29.530587 天。
 */
import type { MoonPhase } from './celestial-types.js';
import { MOON_PHASE_LABELS } from './celestial-types.js';
import { TimeKeeper } from '../base/TimeKeeper.js';

// 已知朔月（2000-01-06 18:14 UTC，JDE=2451550.225）
const KNOWN_NEW_MOON_JDE = 2451550.225;
const SYNODIC_MONTH = 29.530587;

export class LunarPhaseCalc {
  private timeKeeper: TimeKeeper;

  constructor(timeKeeper: TimeKeeper) {
    this.timeKeeper = timeKeeper;
  }

  async init(): Promise<void> {}
  reset(): void {}
  destroy(): void {}

  /**
   * 计算当前月相
   */
  compute(): { phase: MoonPhase; label: string; illumination: number; fullMoonStart?: Date; fullMoonEnd?: Date } {
    const now = this.timeKeeper.now();
    return this.computeForDate(now);
  }

  /**
   * 计算指定日期的月相
   */
  computeForDate(date: Date): { phase: MoonPhase; label: string; illumination: number; fullMoonStart?: Date; fullMoonEnd?: Date } {
    const jde = this.gregorianToJDE(date);
    const daysSinceNewMoon = jde - KNOWN_NEW_MOON_JDE;
    const cycles = daysSinceNewMoon / SYNODIC_MONTH;
    const phase = cycles - Math.floor(cycles); // 0-1

    return this.phaseToResult(phase, date);
  }

  /**
   * 获取当前月相中文雅称（供对话使用）
   */
  getPoeticName(): string {
    const { phase, label } = this.compute();
    switch (phase) {
      case 'new_moon': return '朔月·不见月';
      case 'waxing_crescent': return '蛾眉·初月如钩';
      case 'first_quarter': return '上弦·半月悬空';
      case 'waxing_gibbous': return '盈凸·月渐丰盈';
      case 'full_moon': return '满月·月华如水';
      case 'waning_gibbous': return '亏凸·月始消瘦';
      case 'last_quarter': return '下弦·残月西沉';
      case 'waning_crescent': return '残月·一弯寒钩';
    }
  }

  /**
   * 是否为满月周期（前后12小时内）
   */
  isFullMoonWindow(): boolean {
    const result = this.compute();
    return result.phase === 'full_moon';
  }

  // ── 内部方法 ──

  /** 公历 → 儒略日（JDE） */
  private gregorianToJDE(date: Date): number {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate() +
      date.getUTCHours() / 24 +
      date.getUTCMinutes() / 1440 +
      date.getUTCSeconds() / 86400;

    let year = y;
    let month = m;
    if (month <= 2) { year--; month += 12; }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + d + B - 1524.5;
  }

  /** 月相值 → 月相类型 */
  private phaseToResult(phase: number, date: Date): {
    phase: MoonPhase; label: string; illumination: number;
    fullMoonStart?: Date; fullMoonEnd?: Date;
  } {
    // 月相映射（以 0=朔月 为基准）
    let moonPhase: MoonPhase;
    let illumination: number;

    if (phase < 0.03 || phase >= 0.97) {
      moonPhase = 'new_moon';
      illumination = 0;
    } else if (phase < 0.15) {
      moonPhase = 'waxing_crescent';
      illumination = (phase - 0.03) / 0.12;
    } else if (phase < 0.28) {
      moonPhase = 'first_quarter';
      illumination = 0.25 + (phase - 0.15) * 1.5;
    } else if (phase < 0.4) {
      moonPhase = 'waxing_gibbous';
      illumination = 0.45 + (phase - 0.28) * 2;
    } else if (phase < 0.53) {
      // 满月窗口 (±0.03 ≈ ±21小时)
      moonPhase = 'full_moon';
      illumination = 0.85 + (1 - Math.abs(phase - 0.5) * 10);
      if (illumination > 1) illumination = 1;
    } else if (phase < 0.65) {
      moonPhase = 'waning_gibbous';
      illumination = 0.85 - (phase - 0.53) * 2;
    } else if (phase < 0.78) {
      moonPhase = 'last_quarter';
      illumination = 0.55 - (phase - 0.65) * 1.5;
    } else {
      moonPhase = 'waning_crescent';
      illumination = 0.25 * (1 - (phase - 0.78) / 0.19);
    }

    const result: any = {
      phase: moonPhase,
      label: MOON_PHASE_LABELS[moonPhase],
      illumination: Math.round(Math.max(0, Math.min(1, illumination)) * 100) / 100,
    };

    // 满月窗口：计算精确满月时间
    if (moonPhase === 'full_moon') {
      const jde = this.gregorianToJDE(date);
      const nearestNewMoon = Math.round((jde - KNOWN_NEW_MOON_JDE) / SYNODIC_MONTH);
      const fullMoonJDE = KNOWN_NEW_MOON_JDE + (nearestNewMoon + 0.5) * SYNODIC_MONTH;
      const fullMoonDate = this.jdeToGregorian(fullMoonJDE);
      result.fullMoonStart = new Date(fullMoonDate.getTime() - 12 * 3600000);
      result.fullMoonEnd = new Date(fullMoonDate.getTime() + 12 * 3600000);
    }

    return result;
  }

  /** 儒略日 → 公历（简化） */
  private jdeToGregorian(jde: number): Date {
    const T = (jde - 2451545) / 36525;
    const totalDays = Math.floor(jde - 2451545);
    const ms = 2451545 - 2440588; // Unix 偏移
    const timeMs = (jde - 2440588) * 86400000;
    return new Date(timeMs);
  }
}
