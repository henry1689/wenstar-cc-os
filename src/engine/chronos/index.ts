/**
 * engine/chronos/ — 时空系统（自然时间线管理）
 * ============================================
 * 原 engine/temporal/ — 为避免与 engine/tianquan/temporal/ (海马记忆域) 混淆而重命名。
 *
 * 本目录职责: 日历 / 天气 / 节气 / 时间事件调度 — 自然时间
 * tianquan/temporal/ 职责: 海马体记忆 / 巩固 / 快照 — 仿生记忆时序
 *
 * 使用:
 *   import { TimeKeeper, CalendarEngine } from '../engine/chronos/index.js';
 *   // 旧路径 '../engine/temporal/index.js' 仍可用 (向后兼容)
 */
export * from '../temporal/index.js';
