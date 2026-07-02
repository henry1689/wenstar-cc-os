/**
 * base 子层类型定义
 */
import type { IStorageProvider } from '../../types.js';

export type TimePeriod =
  | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'midnight';

export type SessionState = 'active' | 'sealed' | 'emotional_anchor';
export type FarewellLevel = 'none' | 'short_pause' | 'session_end';
export type TimerTaskStatus = 'pending' | 'silent' | 'completed' | 'cancelled';
export type TimerTriggerType = 'delay_ms' | 'specific_time' | 'next_day';

export interface TemporalContextBlock {
  currentTime: string;
  periodLabel: string;
  dateLabel: string;
  weekdayLabel: string;
  sessionState: SessionState;
  hoursSinceLastChat: number;
  silentMessage?: string;
  farewellLevel: FarewellLevel;
}

export interface TimerTask {
  id: string;
  sessionId: string;
  triggerType: TimerTriggerType;
  triggerAt: number;
  contextSnapshot: string;
  snapshotTTL: number;
  status: TimerTaskStatus;
  createdAt: string;
  doNotDisturb: boolean;
}

export interface TemporalConfig {
  storage: IStorageProvider;
  newSessionThreshold?: number;
  userActiveOffset?: number;
  emotionalAnchorEnabled?: boolean;
  doNotDisturbStart?: number;
  doNotDisturbEnd?: number;
}

export interface FarewellRule {
  level: FarewellLevel;
  patterns: RegExp[];
}
