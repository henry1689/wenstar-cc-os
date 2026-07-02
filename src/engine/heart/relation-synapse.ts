/**
 * relation-synapse — 关系突触强化模型
 *
 * 模拟大脑突触连接：互动 = 突触强化，矛盾 = 突触弱化。
 * 关系强度是连续变化的数值，达到阈值后自然进入对应阶段。
 *
 * S = 0.35×信任度 + 0.30×亲密度 + 0.20×默契度 − 0.15×裂痕值
 *
 * 阶段软划分（非硬跳转）：
 *   陌生期 [0, 30): 仅砂金库，礼貌边界，无主动话题
 *   熟悉期 [30, 70): 开放金库，语气放松，有限主动关心
 *   亲密期 [70, 100]: 解锁黑钻库，完整内驱动机
 *
 * 防抖：过渡带 ±2 分缓冲，连续 3 轮确认才跃迁
 */

import type { RelationState } from '../bus/types.js';

// ── 阶段定义 ──
export type SynapseStage = 'stranger' | 'familiar' | 'intimate';

export function getStageRange(stage: SynapseStage): { min: number; max: number } {
  switch (stage) {
    case 'stranger':  return { min: 0, max: 30 };
    case 'familiar':  return { min: 30, max: 70 };
    case 'intimate':  return { min: 70, max: 100 };
  }
}

/** 过渡带宽度 */
const TRANSITION_BAND = 2;

/** 确认所需连续轮次 */
const CONFIRMATION_TURNS = 3;

/** 自然衰减半衰期（小时）各阶段不同 */
const DECAY_HALFLIFE_HOURS: Record<SynapseStage, number> = {
  stranger:  252,  // 陌生期衰减最慢（本来就不熟）
  familiar:  168,  // 7天
  intimate:  168,  // 7天（亲密期衰减系数大，但因为值高所以绝对衰减量大）
};

// ── 关系指标接口 ──
export interface RelationMetrics {
  trust: number;           // 信任度 0-100
  intimacy: number;        // 亲密度 0-100
  rapport: number;         // 默契度 0-100（新增：对话匹配度累积）
  crack: number;           // 裂痕值 0-100
  positiveStreak: number;  // 连续积极轮次
}

export interface SynapseState {
  stage: SynapseStage;
  metrics: RelationMetrics;
  /** 防抖计数器：当前阶段持续轮次 */
  confirmationTurns: number;
  /** 上次跃迁时间戳 */
  lastTransitionAt: string;
}

export interface SynapseInput {
  /** 事件类型对关系的影响方向 */
  valence: 'positive' | 'negative' | 'neutral';
  /** 事件强度 0-1 */
  intensity: number;
  /** 关系裂痕事件（hurtful/cold） */
  isRift: boolean;
  /** 道歉/修复事件 */
  isRepair: boolean;
  /** 距上次更新的时间差（小时），用于自然衰减 */
  deltaHours: number;
}

export interface SynapseOutput {
  state: SynapseState;
  changed: boolean;         // 关系指标是否变化
  stageChanged: boolean;    // 阶段是否跃迁
  stageDirection?: 'upgrade' | 'downgrade';
}

// ── 默认值 ──
export function defaultSynapseState(): SynapseState {
  return {
    stage: 'stranger',
    metrics: {
      trust: 15,
      intimacy: 5,
      rapport: 0,
      crack: 0,
      positiveStreak: 0,
    },
    confirmationTurns: 0,
    lastTransitionAt: new Date().toISOString(),
  };
}

/**
 * 更新关系突触状态
 *
 * S = 0.35×信任度 + 0.30×亲密度 + 0.20×默契度 − 0.15×裂痕值
 */
export function updateSynapse(
  current: SynapseState,
  input: SynapseInput
): SynapseOutput {
  let { trust, intimacy, rapport, crack, positiveStreak } = current.metrics;
  const stage = current.stage;
  let changed = false;

  // ── 1. 自然衰减（长时间无互动） ──
  if (input.deltaHours > 1) {
    const hl = DECAY_HALFLIFE_HOURS[stage];
    const decayFactor = Math.exp(-input.deltaHours / hl);
    const newTrust = trust * decayFactor;
    const newIntimacy = intimacy * decayFactor;
    const newRapport = rapport * Math.exp(-input.deltaHours / (hl * 0.5));
    const newCrack = crack * Math.exp(-input.deltaHours / (hl * 0.3)); // 裂痕衰减更快

    if (Math.abs(newTrust - trust) > 0.1) changed = true;
    trust = clamp(newTrust, 0, 100);
    intimacy = clamp(newIntimacy, 0, 100);
    rapport = clamp(newRapport, 0, 100);
    crack = clamp(newCrack, 0, 100);
  }

  // ── 2. 事件影响 ──
  if (input.valence !== 'neutral') {
    const factor = input.intensity;

    if (input.isRift && input.valence === 'negative') {
      // 裂痕事件：信任↓ 亲密度↓ 裂痕↑
      trust = clamp(trust - 8 * factor, 0, 100);
      intimacy = clamp(intimacy - 5 * factor, 0, 100);
      crack = clamp(crack + 5 * factor, 0, 100);
      positiveStreak = 0;
      changed = true;

      // 裂痕超过 50 时额外惩罚（信任下降更快）
      if (crack > 50) {
        crack = clamp(crack + 2, 0, 100);
      }
    }

    if (input.valence === 'positive') {
      // 正向事件：信任↑ 亲密度↑ 裂痕↓
      trust = clamp(trust + 3 * factor, 0, 100);
      intimacy = clamp(intimacy + 2 * factor, 0, 100);
      rapport = clamp(rapport + 1.5 * factor, 0, 100);
      crack = clamp(crack - 2 * factor, 0, 100);
      positiveStreak += 1;
      changed = true;
    }

    if (input.valence === 'negative' && !input.isRift) {
      // 一般负面事件（非裂痕）
      trust = clamp(trust - 2 * factor, 0, 100);
      intimacy = clamp(intimacy - 1 * factor, 0, 100);
      crack = clamp(crack + 1 * factor, 0, 100);
      positiveStreak = 0;
      changed = true;
    }

    // 道歉修复
    if (input.isRepair) {
      trust = clamp(trust + 5 * factor, 0, 100);
      crack = clamp(crack - 4 * factor, 0, 100);
      positiveStreak += 1;
      changed = true;
    }
  }

  // ── 3. 阶段判定（带防抖） ──
  const S = computeSynapseStrength({ trust, intimacy, rapport, crack, positiveStreak });
  let newStage = stage;
  let stageChanged = false;
  let confirmationTurns = current.confirmationTurns;

  const targetStage = strengthToStage(S);
  if (targetStage !== stage) {
    confirmationTurns += 1;
    if (confirmationTurns >= CONFIRMATION_TURNS) {
      newStage = targetStage;
      stageChanged = true;
      confirmationTurns = 0;
    }
  } else {
    // 回退防抖：如果回到当前阶段，重置计数器
    confirmationTurns = Math.max(0, confirmationTurns - 1);
  }

  return {
    state: {
      stage: newStage,
      metrics: { trust, intimacy, rapport, crack, positiveStreak },
      confirmationTurns,
      lastTransitionAt: stageChanged ? new Date().toISOString() : current.lastTransitionAt,
    },
    changed,
    stageChanged,
    stageDirection: stageChanged
      ? (newStage > stage ? 'upgrade' : 'downgrade')
      : undefined,
  };
}

/**
 * 计算关系联结总强度 S
 */
export function computeSynapseStrength(metrics: RelationMetrics): number {
  const S = 0.35 * metrics.trust
       + 0.30 * metrics.intimacy
       + 0.20 * metrics.rapport
       - 0.15 * metrics.crack;
  return clamp(S, 0, 100);
}

/**
 * 根据 S 值判断阶段（带过渡带）
 */
export function strengthToStage(S: number): SynapseStage {
  if (S >= 70) {
    // 亲密期：需要 [70, 100]
    // 从熟悉期升上来需要 S >= 72（+过渡带）
    return 'intimate';
  }
  if (S >= 30) {
    // 熟悉期：[30, 70)
    // 过渡带：[28, 32)（从陌生期升上来需要 >= 32）
    return 'familiar';
  }
  return 'stranger';
}

/**
 * 检查是否可以进入目标阶段（带过渡带防抖）
 */
export function canTransitionTo(
  currentStage: SynapseStage,
  targetStage: SynapseStage,
  S: number
): boolean {
  const { min, max } = getStageRange(currentStage);
  const tMin = getStageRange(targetStage).min;

  if (targetStage > currentStage) {
    // 升级：S 必须 ≥ 目标阶段下限 + 过渡带
    return S >= tMin + TRANSITION_BAND;
  }
  if (targetStage < currentStage) {
    // 降级：S 必须 < 当前阶段下限 - 过渡带
    return S < min - TRANSITION_BAND;
  }
  return true;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
