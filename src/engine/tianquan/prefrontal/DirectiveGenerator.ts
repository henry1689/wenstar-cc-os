/**
 * DirectiveGenerator.ts — 前额指令编码器 (V1.0 / BIONIC-002 Phase 1)
 * ====================================================================
 * 将决策结果编码为标准 PrefrontalDirective，路由到目标执行模块。
 *
 * 从 chat.ts 迁移目标:
 *   - deriveM5Strategy() (L2805-2833) → deriveStrategy()
 *   - classifyRole (L511-523) → encodeRouting()
 *
 * 使用:
 *   const dg = new DirectiveGenerator();
 *   const strategy = dg.deriveStrategy(decision);
 *   const directive = dg.generate(decision, constraints, goalState);
 */
import type { M3Decision } from '../../../m3/types/perception.js';
import type { ConstraintResult, GoalStackState, PrefrontalDirective } from './types.js';

export interface M5Strategy {
  strategy_id: string;
  tone: string;
  depth: string;
  max_length: number;
  description: string;
}

export class DirectiveGenerator {
  constructor() {}

  /**
   * 从 M3Decision 衍生 M5 回应策略
   * (从 chat.ts L2805-2833 deriveM5Strategy 迁移)
   *
   * @param decision M3 决策结果（含 perception + actions + calcium_level）
   * @returns 策略描述
   */
  deriveStrategy(decision: M3Decision): M5Strategy {
    const p = decision.enhanced.perception;
    const actions = decision.actions || [];
    // 检测亲密意图
    // 注意：sexual_attraction / sensory_craving 在 P3 32D 升级中引入，
    // 当前 24D Perception 中不存在，显式 fallback 至 0（不触发亲密模式）。
    // P3 后移除 as any 强转并使用新字段。
    const hasIntimate =
      ((p as any).sexual_attraction ?? 0) > 0.2 ||
      ((p as any).sensory_craving ?? 0) > 0.3 ||
      (p.intimacy ?? 0) > 0.4;

    const tone = hasIntimate
      ? 'intimate'
      : actions.includes('comfort') ? 'warm'
      : actions.includes('act') ? 'serious'
      : 'neutral';

    const depth =
      decision.enhanced.calcium_level >= 3 ? 'deep'
      : decision.enhanced.calcium_level >= 2 ? 'medium'
      : 'shallow';

    let strategy_id = 'mem-general';
    let desc = '日常回应';
    let max_len = 80;

    if (actions.includes('act')) {
      strategy_id = 'act-core'; desc = '核心响应'; max_len = 150;
    } else if (actions.includes('comfort')) {
      strategy_id = 'com-warm'; desc = '温暖共情'; max_len = 100;
    } else if (actions.includes('ask') && actions.includes('memorize')) {
      strategy_id = 'mem-ask'; desc = '确认追问'; max_len = 100;
    } else if (actions.includes('ask')) {
      strategy_id = 'ask-curious'; desc = '好奇追问'; max_len = 120;
    }

    return { strategy_id, tone, depth, max_length: max_len, description: desc };
  }

  /**
   * 主入口 — 生成标准化 PrefrontalDirective
   *
   * @param decision  M3 决策
   * @param constraints 五维约束校验结果
   * @param goalState 当前目标栈状态
   * @returns 标准化的执行指令
   */
  generate(
    decision: M3Decision,
    constraints: ConstraintResult,
    goalState: GoalStackState,
  ): PrefrontalDirective {
    // 约束违规 → 特殊指令
    if (!constraints.passed) {
      return this._buildViolationDirective(constraints);
    }

    const strategy = this.deriveStrategy(decision);
    const directiveType: PrefrontalDirective['type'] = 'generate_speech';

    return {
      directiveId: `DIR_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      type: directiveType,
      priority: decision.enhanced.calcium_level >= 3 ? 'high'
        : decision.enhanced.calcium_level >= 2 ? 'medium'
        : 'low',
      targetModule: 'yao_ling',
      payload: {
        tone: strategy.tone,
        maxLength: strategy.max_length,
        strategyId: strategy.strategy_id,
        depth: strategy.depth,
      },
      constraints,
      expectedCompletionMs: 3000,
    };
  }

  /**
   * 路由到目标执行模块
   * (从 chat.ts L511-523 classifyRole + evaluateTransition 的角色路由逻辑迁移)
   */
  encodeRouting(
    decision: M3Decision,
    directive: PrefrontalDirective,
  ): PrefrontalDirective['targetModule'] {
    // 根据指令类型路由
    switch (directive.type) {
      case 'generate_speech':   return 'yao_ling';
      case 'update_emotion':    return 'heart';
      case 'update_world_model': return 'yao_guang';
      case 'query_memory':      return 'temporal';
      case 'store_knowledge':   return 'knowledge';
      case 'alert_user':        return 'yao_ling';
      case 'plan_goal':         return 'temporal';   // 长期规划涉及记忆
      case 'constraint_violation': return 'heart';    // 违规时先调节情绪
      case 'route_to_gold_vault': return 'temporal';  // V4.0: 第二大脑→金库走海马域
      case 'sync_knowledge_bridge': return 'knowledge'; // V4.0: 知识库桥接同步
      default:                  return 'yao_ling';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  内部
  // ═══════════════════════════════════════════════════════

  private _buildViolationDirective(constraints: ConstraintResult): PrefrontalDirective {
    return {
      directiveId: `DIR_VIO_${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: 'constraint_violation',
      priority: 'critical',
      targetModule: 'heart',
      payload: {
        violations: constraints.violations,
        fallbackReply: constraints.violations[0] || '抱歉，我暂时无法回答这个问题。',
      },
      constraints,
      expectedCompletionMs: 500,
    };
  }
}
