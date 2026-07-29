/**
 * EntityContextStrategy — 实体差异化上下文策略
 * =============================================
 * 根据实体的 category + warmth + 互动频次，自动计算最优上下文窗口大小。
 *
 * 原则：
 *   - 亲密关系 → 大窗口（需要情感连续性）
 *   - 业务关系 → 中窗口（需要上下文但不深）
 *   - 低频实体 → 小窗口（节省 token 预算）
 *   - category 是观测标签，warmth 是实时亲密度——两者结合决策
 */

export interface EntityContextStrategy {
  /** 最大上下文轮次 */
  maxTurns: number;
  /** 压缩模式 */
  compressionMode: 'aggressive' | 'balanced' | 'conservative';
  /** 锚点层占比 (0-1)，剩余为摘要层 */
  anchorRatio: number;
  /** 冷对话归档天数（超时未互动自动归档） */
  expiryDays: number;
  /** 是否在重启时自动恢复上下文 */
  autoRebuild: boolean;
}

/** 实体属性输入（从 FG + HeatTracker 获取） */
export interface EntityProfile {
  category: string;       // A/B/C/D/E/F/G/H/X/S
  warmth?: string;        // distant/friendly/trusted/intimate/soulmate
  interactionCount7d: number;
  lastInteraction: string;
}

/** 默认策略 — 普通社交关系 */
const DEFAULT_STRATEGY: EntityContextStrategy = {
  maxTurns: 20,
  compressionMode: 'balanced',
  anchorRatio: 0.25,
  expiryDays: 30,
  autoRebuild: true,
};

/**
 * 根据实体属性自动计算差异化策略。
 * 调用时机：每次会晤进入前 + 每次上下文压缩前。
 */
export function computeStrategy(profile: EntityProfile): EntityContextStrategy {
  const daysSince = profile.lastInteraction
    ? Math.floor((Date.now() - new Date(profile.lastInteraction).getTime()) / 86400000)
    : 999;

  // 冷对话 → 最小窗口
  if (daysSince > 14) {
    return { ...DEFAULT_STRATEGY, maxTurns: 5, compressionMode: 'aggressive', anchorRatio: 0.5, expiryDays: 14 };
  }
  if (daysSince > 7) {
    return { ...DEFAULT_STRATEGY, maxTurns: 10, compressionMode: 'aggressive', anchorRatio: 0.4 };
  }

  // warmth 为 intimate/soulmate → 大窗口 + 保守压缩
  if (profile.warmth === 'soulmate' || profile.warmth === 'intimate') {
    return {
      maxTurns: 60,
      compressionMode: 'conservative',
      anchorRatio: 0.25,
      expiryDays: 90,
      autoRebuild: true,
    };
  }

  // category = X（情人）→ 大窗口
  if (profile.category === 'X') {
    return {
      maxTurns: 60,
      compressionMode: 'conservative',
      anchorRatio: 0.25,
      expiryDays: 90,
      autoRebuild: true,
    };
  }

  // category = A（家人）+ intimate → 中上窗口
  if (profile.category === 'A') {
    return {
      maxTurns: 40,
      compressionMode: 'balanced',
      anchorRatio: 0.3,
      expiryDays: 60,
      autoRebuild: true,
    };
  }

  // 高频互动（7天 > 50次）→ 扩大窗口
  if (profile.interactionCount7d > 50) {
    return {
      maxTurns: 40,
      compressionMode: 'balanced',
      anchorRatio: 0.25,
      expiryDays: 30,
      autoRebuild: true,
    };
  }

  // 低频互动（7天 < 5次）→ 缩小窗口
  if (profile.interactionCount7d < 5) {
    return { ...DEFAULT_STRATEGY, maxTurns: 10, compressionMode: 'aggressive', anchorRatio: 0.5 };
  }

  return DEFAULT_STRATEGY;
}

/**
 * 安全上限：确保单次 LLM 上下文不超过 8000 tokens。
 * 每条对话约 200 tokens → maxTurns × 200 ≤ 8000 → maxTurns ≤ 40。
 * 保守模式的上限更高（60条→上下文全量约12000，由调用方按 token 预算截断）。
 */
export function applyTokenBudget(strategy: EntityContextStrategy, budgetTokens: number = 8000): EntityContextStrategy {
  const maxByBudget = Math.floor(budgetTokens / 200);
  if (strategy.maxTurns > maxByBudget) {
    return { ...strategy, maxTurns: maxByBudget };
  }
  return strategy;
}
