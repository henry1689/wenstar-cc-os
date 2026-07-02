/**
 * 时空感知层 - 顶层类型定义
 *
 * 统一导出所有子层类型
 */
// base 层类型
export type { TimePeriod, SessionState, FarewellLevel, TimerTaskStatus, TimerTriggerType } from './base/base-types.js';
export type { TemporalContextBlock, TimerTask, TemporalConfig, FarewellRule } from './base/base-types.js';

// celestial 层类型
export type {
  MoonPhase, SolarTerm, Season, SubSeason, StemBranch,
  PhenologyEntry, SunCycle, CelestialContext, CelestialConfig,
} from './celestial/celestial-types.js';

export { MOON_PHASE_LABELS, SOLAR_TERM_LABELS, SEASON_LABELS, SUB_SEASON_LABELS } from './celestial/celestial-types.js';
