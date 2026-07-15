/**
 * learning/types.ts — 自学习引擎类型定义
 */
export interface DreamInsight {
  type: 'behavior_pattern' | 'emotion_trend' | 'social_pattern' | 'routine';
  title: string;
  content: string;
  confidence: number; // 0-1
  sourceMemories: string[];
}

export interface GrowthLogEntry {
  eventType: 'sprout' | 'branch' | 'lignify' | 'ring' | 'prune' | 'feedback_human' | 'feedback_distill';
  knId: string;
  detail: string;
  sourceMemoryIds?: string[];
  deltaCalcium?: number;
}
