/**
 * TemporalContextAggregator — 时空上下文聚合器
 *
 * 合并 base 层（公历时间/会话/定时）+ celestial 层（农历/节气/月相/物候）
 * 统一输出给 PromptComposer，上层只需调一个接口。
 */
import type { TemporalContextBlock } from './types.js';
import type { CelestialContext } from './celestial/celestial-types.js';
import { TemporalContextBuilder } from './base/TemporalContext.js';
import { CalendarEngine } from './celestial/CalendarEngine.js';
import { LunarPhaseCalc } from './celestial/LunarPhaseCalc.js';
import { PhenologyTimeline } from './celestial/PhenologyTimeline.js';
import { NaturalCycle } from './celestial/NaturalCycle.js';
import { TimeKeeper } from './base/TimeKeeper.js';
import { SessionTracker } from './base/SessionTracker.js';
import { SOLAR_TERM_LABELS } from './celestial/celestial-types.js';

export interface UnifiedTemporalContext {
  /** 基础时空块（供 PromptComposer 注入） */
  promptBlock: string;
  /** 完整时空元数据（供上层业务逻辑使用） */
  celestial: CelestialContext;
  /** 当前时间（标准格式） */
  currentTime: string;
  /** 复合时段标签 */
  compositeLabel: string;
}

export class TemporalContextAggregator {
  private baseContext: TemporalContextBuilder;
  private calendar: CalendarEngine;
  private moonCalc: LunarPhaseCalc;
  private phenology: PhenologyTimeline;
  private naturalCycle: NaturalCycle;
  private timeKeeper: TimeKeeper;
  private sessionTracker: SessionTracker;

  constructor(
    timeKeeper: TimeKeeper,
    sessionTracker: SessionTracker,
    calendar: CalendarEngine,
    moonCalc: LunarPhaseCalc,
    phenology: PhenologyTimeline,
    naturalCycle: NaturalCycle,
  ) {
    this.timeKeeper = timeKeeper;
    this.sessionTracker = sessionTracker;
    this.baseContext = new TemporalContextBuilder(timeKeeper, sessionTracker);
    this.calendar = calendar;
    this.moonCalc = moonCalc;
    this.phenology = phenology;
    this.naturalCycle = naturalCycle;
  }

  /**
   * 获取完整时空上下文（一键聚合）
   */
  getFullContext(): UnifiedTemporalContext {
    const now = this.timeKeeper.now();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();

    // 天象数据
    const moonResult = this.moonCalc.compute();
    const lunar = this.calendar.getCurrentLunar();
    const term = this.calendar.getCurrentTerm();
    const sun = this.naturalCycle.getSunCycle();
    const season = this.naturalCycle.getSeason();
    const subSeason = this.naturalCycle.getSubSeason();
    const phenologyEntry = this.phenology.getCurrent();
    const festivals = this.calendar.getFestivals(y, m, d);

    // 构建 celestial context
    const celestial: CelestialContext = {
      solarDate: this.timeKeeper.dateString(),
      weekday: this.timeKeeper.weekdayLabel(),
      dayOfYear: this.dayOfYear(now),
      lunarDate: `${lunar.monthName}${lunar.dayName}`,
      lunarYear: lunar.yearName,
      isLeapMonth: lunar.isLeap,
      currentTerm: term.current,
      currentTermLabel: term.currentLabel,
      nextTerm: term.next,
      nextTermLabel: term.nextLabel,
      nextTermDate: term.nextDate,
      moonPhase: moonResult.phase,
      moonPhaseLabel: moonResult.label,
      moonIllumination: moonResult.illumination,
      season,
      seasonLabel: this.seasonToLabel(season),
      subSeason,
      subSeasonLabel: this.subSeasonToLabel(subSeason),
      sunCycle: sun,
      phenology: phenologyEntry.phenology,
      flowers: phenologyEntry.flowers,
      scenes: phenologyEntry.scenes,
    };

    // 构建 prompt 块（base 层 + celestial 层合并）
    const baseBlock = this.baseContext.buildPromptBlock();
    const celestialBlock = this.buildCelestialPromptBlock(celestial, festivals);
    const promptBlock = baseBlock + '\n' + celestialBlock;

    return {
      promptBlock,
      celestial,
      currentTime: this.timeKeeper.fullDateTimeLabel(),
      compositeLabel: this.naturalCycle.getCompositeTimeLabel(),
    };
  }

  /**
   * 构建天象物候提示块（注入 PromptComposer）
   */
  private buildCelestialPromptBlock(ctx: CelestialContext, festivals: string[]): string {
    const parts: string[] = ['【天象】'];

    // 农历
    parts.push(`农历${ctx.lunarYear} ${ctx.lunarDate}`);

    // 节气
    if (ctx.currentTermLabel) {
      parts.push(`节气：${ctx.currentTermLabel}（下一个：${ctx.nextTermLabel} ${ctx.nextTermDate}）`);
    }

    // 月相
    const moonPoetic = this.getMoonPoetic(ctx.moonPhase, ctx.moonIllumination);
    parts.push(`月相：${ctx.moonPhaseLabel} ${moonPoetic}`);

    // 日出日落
    const sunDesc = this.naturalCycle.getSunDescription();
    parts.push(`天时：${sunDesc}`);

    // 物候
    parts.push(`物候：${ctx.phenology.join('，')}`);

    // 花卉
    if (ctx.flowers.length) {
      parts.push(`当季：${ctx.flowers.join('、')}正盛`);
    }

    // 季节氛围
    const compositeLabel = this.naturalCycle.getCompositeTimeLabel();
    parts.push(`氛围：${compositeLabel}`);

    // 节日
    if (festivals.length) {
      parts.push(`节日：${festivals.join('、')}`);
    }

    return parts.join(' | ');
  }

  private getMoonPoetic(phase: string, illumination: number): string {
    if (phase === 'full_moon') return '月华如水，清辉满庭。';
    if (phase === 'new_moon') return '朔日不见月，万物始更新。';
    if (phase === 'waxing_crescent') return '一弯蛾眉月，悄然上东楼。';
    if (phase === 'first_quarter') return '上弦月正明，半轮悬碧空。';
    if (phase === 'waning_gibbous' || phase === 'waxing_gibbous') return '月渐丰盈，流光徘徊。';
    if (phase === 'last_quarter') return '下弦月西沉，残辉犹映窗。';
    if (phase === 'waning_crescent') return '一钩残月，天色将明。';
    return '';
  }

  private seasonToLabel(s: string): string {
    const map: Record<string, string> = { spring:'春季', summer:'夏季', autumn:'秋季', winter:'冬季' };
    return map[s] ?? '';
  }

  private subSeasonToLabel(s: string): string {
    const map: Record<string, string> = {
      early_spring:'初春', mid_spring:'仲春', late_spring:'暮春',
      early_summer:'初夏', mid_summer:'仲夏', late_summer:'盛夏',
      early_autumn:'初秋', mid_autumn:'仲秋', late_autumn:'晚秋',
      early_winter:'初冬', mid_winter:'仲冬', late_winter:'深冬',
    };
    return map[s] ?? '';
  }

  private dayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date.getTime() - start.getTime()) / 86400000);
  }
}
