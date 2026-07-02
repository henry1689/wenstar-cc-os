/**
 * 时空感知层 - 统一导出入口
 *
 * 外界只需：
 *   import { TimeKeeper, CalendarEngine, TemporalContextAggregator } from '../temporal/index.js';
 */

// ── base 子层 ──
export { TimeKeeper } from './base/TimeKeeper.js';
export { TimerRegistry } from './base/TimerRegistry.js';
export { SessionTracker } from './base/SessionTracker.js';
export { TemporalContextBuilder } from './base/TemporalContext.js';

// ── celestial 子层 ──
export { CalendarEngine } from './celestial/CalendarEngine.js';
export { LunarPhaseCalc } from './celestial/LunarPhaseCalc.js';
export { PhenologyTimeline } from './celestial/PhenologyTimeline.js';
export { NaturalCycle } from './celestial/NaturalCycle.js';

// ── 聚合层 ──
export { TemporalContextAggregator } from './TemporalContextAggregator.js';
export type { UnifiedTemporalContext } from './TemporalContextAggregator.js';

// ── 类型 ──
export * from './types.js';
