/**
 * TemporalContext — 时空上下文构建器
 *
 * 收集 TimeKeeper + TimerRegistry + SessionTracker 的输出，
 * 组装为时空标签块，供 PromptComposer 注入到系统提示词。
 */
import type { TemporalContextBlock, FarewellLevel, SessionState } from './base-types.js';
import { TimeKeeper } from './TimeKeeper.js';
import { SessionTracker } from './SessionTracker.js';

export class TemporalContextBuilder {
  private timeKeeper: TimeKeeper;
  private sessionTracker: SessionTracker;

  constructor(timeKeeper: TimeKeeper, sessionTracker: SessionTracker) {
    this.timeKeeper = timeKeeper;
    this.sessionTracker = sessionTracker;
  }

  /**
   * 构建时空标签块
   */
  build(): TemporalContextBlock {
    const sessionState = this.sessionTracker.getSessionState();
    const hoursSinceLast = this.sessionTracker.getHoursSinceLastActive();
    const farewellLevel = this.sessionTracker.getState().lastFarewellLevel;

    return {
      currentTime: this.timeKeeper.fullDateTimeLabel(),
      periodLabel: this.timeKeeper.periodLabel(),
      dateLabel: this.timeKeeper.dateString(),
      weekdayLabel: this.timeKeeper.weekdayLabel(),
      sessionState,
      hoursSinceLastChat: Math.round(hoursSinceLast * 10) / 10,
      farewellLevel,
    };
  }

  /**
   * 构建自然语言时空提示块（供 PromptComposer 注入）
   */
  buildPromptBlock(): string {
    const ctx = this.build();
    const parts: string[] = [];

    // 当前时间
    parts.push(`当前时间：${ctx.currentTime}`);

    // 问候/破冰（新会话时）
    if (ctx.sessionState === 'sealed' || ctx.hoursSinceLastChat > 2) {
      const greeting = this.buildGreeting(ctx);
      if (greeting) parts.push(greeting);
    }

    // 时段感知
    const timeFeeling = this.buildTimeFeeling(ctx);
    if (timeFeeling) parts.push(timeFeeling);

    // 会话状态约束
    if (ctx.sessionState === 'sealed') {
      parts.push('【会话约束】这是新一轮对话。不要主动提及上一轮完结时的具体闲聊内容，除非用户先提起。');
    } else if (ctx.sessionState === 'emotional_anchor') {
      parts.push('【情感锚点】上一轮用户情绪较强烈。表达时注意承接关怀，不要显得冷漠或健忘。');
    }

    // 长时间未对话
    if (ctx.hoursSinceLastChat > 8) {
      parts.push('【久别提示】你已经有一段时间没和鸿艺说话了。语气中可以带一点自然而然的思念，但不要太刻意。');
    }

    return parts.join('\n');
  }

  /**
   * 构建破冰问候
   */
  private buildGreeting(ctx: TemporalContextBlock): string {
    const hour = this.timeKeeper.now().getHours();

    // 凌晨问候
    if (hour >= 0 && hour < 6) {
      return '【时空感知】这个点还醒着……是刚忙完还是睡不着？语气温柔一点，像深夜陪着说话的感觉。';
    }
    // 早晨问候
    if (hour >= 6 && hour < 9) {
      return '【时空感知】新的一天开始了。用清晨的清爽和期待的语气回应。';
    }
    // 上午问候
    if (hour >= 9 && hour < 12) {
      return '【时空感知】上午时段。语气可以清爽有力一些。';
    }
    // 中午问候
    if (hour >= 12 && hour < 14) {
      return '【时空感知】午间时段。如果没聊到具体话题，可以自然地问一句吃饭了没有。';
    }
    // 下午问候
    if (hour >= 14 && hour < 18) {
      return '【时空感知】下午时段。语气平稳有力。';
    }
    // 傍晚问候
    if (hour >= 18 && hour < 20) {
      return '【时空感知】傍晚了。语气可以柔和一些，带一点放松的意味。';
    }
    // 晚上问候
    if (hour >= 20 && hour < 23) {
      return '【时空感知】晚上好。用放松的、结束了一天的语气说话。';
    }
    return undefined as any;
  }

  /**
   * 构建时段体感提示
   */
  private buildTimeFeeling(ctx: TemporalContextBlock): string {
    const hour = this.timeKeeper.now().getHours();

    // 深夜/凌晨：温柔轻柔
    if (hour < 6) return '【氛围】夜深人静。语气轻柔舒缓，不要大声或欢快。';
    // 清晨：清新
    if (hour < 9) return '【氛围】清晨时分。语气清爽但不吵闹。';
    // 晚上：放松
    if (hour >= 20) return '【氛围】晚上了。语气可以放松一些，带一点慵懒感。';
    return '';
  }
}
