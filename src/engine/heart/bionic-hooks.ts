/**
 * bionic-hooks — 仿生钩子
 *
 * S2 实现：
 *   - applyEmotionStimulus → 24D 神经递质衰减 + 刺激量表
 *   - transitionRelation → 关系突触模型（Week 2 填充）
 *   - updateDesires → 内驱动机系统（Week 2 填充）
 */
import type { HeartGlobalState, RelationMetrics } from './types.js';
import type { UserInputEvent } from '../bus/types.js';
import { getStimulusDelta, type StimulusType } from './stimulus-table.js';
import { applyDecay, type DecayOutput } from './emotion-decay.js';
import { updateSynapse, computeSynapseStrength, type SynapseState, type SynapseInput } from './relation-synapse.js';
import { updateDesireStack, defaultDesireStack } from './desire-stack.js';

export interface StimulusInput {
  type: StimulusType;
  intensity: number;
  trustFactor: number;
}

/**
 * 情感刺激计算入口 — S2 完整实现
 *
 * 流程：
 * 1. 计算距上次更新的时间差 Δt（跨对话衰减）
 * 2. 查刺激量表获取 24D 增量
 * 3. 应用衰减公式 E_new = E_base × e^(-Δt/τ) + ΔE × k_margin
 * 4. 返回更新后的情感向量
 */
export function applyEmotionStimulus(
  stimulus: StimulusInput,
  current: HeartGlobalState
): { updatedVector: HeartGlobalState['emotionVector']; applied: boolean } {
  // 计算距上次更新的时间差（小时）
  const lastUpdated = current.updatedAt ? new Date(current.updatedAt).getTime() : Date.now();
  const deltaMs = Date.now() - lastUpdated;
  const deltaHours = Math.max(0, deltaMs / (1000 * 60 * 60));

  // 从关系阶段获取系数
  const relationStage = current.relationState;

  // 查刺激量表
  const delta = getStimulusDelta({
    type: stimulus.type,
    intensity: stimulus.intensity,
    trustFactor: stimulus.trustFactor,
    relationStage: relationStage,
    currentEmotion: current.emotionVector,
  });

  // 应用衰减 + 刺激
  const result: DecayOutput = applyDecay({
    current: current.emotionVector,
    delta: delta,
    deltaHours: deltaHours,
    relationStage: relationStage,
  });

  return {
    updatedVector: result.vector,
    applied: result.appliedDelta || result.decayed,
  };
}

/**
 * 关系状态跃迁判断入口 — 调用关系突触模型
 */
export function transitionRelation(
  current: HeartGlobalState,
  eventValence: 'positive' | 'negative' | 'neutral',
  eventIntensity: number,
  isRift: boolean,
  isRepair: boolean,
  deltaHours: number,
): {
  updatedMetrics: RelationMetrics;
  stageChanged: boolean;
  stageDirection?: 'upgrade' | 'downgrade';
} {
  // 将 HeartGlobalState 的 relationMetrics 转为 SynapseState
  const metrics = current.relationMetrics;
  const stage = current.relationState as any;
  const synapseState: SynapseState = {
    stage,
    metrics: {
      trust: metrics.trust,
      intimacy: metrics.intimacy,
      rapport: metrics.rapport,
      crack: metrics.crack,
      positiveStreak: metrics.positiveStreak,
    },
    confirmationTurns: 0,
    lastTransitionAt: current.updatedAt,
  };

  const input: SynapseInput = {
    valence: eventValence,
    intensity: eventIntensity,
    isRift,
    isRepair,
    deltaHours,
  };

  const output = updateSynapse(synapseState, input);

  return {
    updatedMetrics: {
      ...output.state.metrics,
      sharedEvents: current.relationMetrics.sharedEvents,
    },
    stageChanged: output.stageChanged,
    stageDirection: output.stageDirection,
  };
}

/**
 * 欲望栈更新入口 — 调用 desire-stack
 */
export function updateDesires(
  intent: string,
  relationStage: string,
  hoursSinceLastChat: number,
  avgIntervalHours: number,
): string[] {
  const stack = defaultDesireStack();
  const result = updateDesireStack(
    stack,
    intent,
    relationStage as any,
    hoursSinceLastChat,
    avgIntervalHours,
  );
  return result.hints;
}

/**
 * 氛围值计算 — 基于近几轮情感动量
 *
 * 从 affection 和 warmth 两个维度的滑动窗口推断当前氛围。
 * Week 2 改为严格的 5 轮动量滑动窗口。
 */
export function computeAtmosphere(state: HeartGlobalState): 'warm' | 'neutral' | 'cool' {
  const { affection, warmth, arousal, dominance } = state.emotionVector;

  // 正向得分: affection + warmth
  const positive = (affection + warmth) / 2;
  // 紧张得分: arousal + dominance (高 arousal + 高 dominance = 冲突感)
  const tense = (arousal + Math.abs(dominance)) / 2;

  if (positive > 35 && tense < 20) return 'warm';
  if (positive < 15 || tense > 40) return 'cool';
  return 'neutral';
}
