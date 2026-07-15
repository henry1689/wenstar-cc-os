/**
 * MetacognitionReview.ts — 前额叶元认知复盘 (V1.0 / BIONIC-002 Phase 1)
 * ======================================================================
 * 交互后复盘：预测 vs 实际 → 差距分析 → 推送梦境引擎。
 *
 * 从 chat.ts 迁移目标:
 *   - 对话组开闭管理 (L2224-2268) → manageDialogGroup()
 *   - 对齐审计 (L2727-2742) → review()
 *
 * 使用:
 *   const mc = new MetacognitionReview();
 *   const { group, shouldClose } = mc.manageDialogGroup(current, dna, decision, msg, reply, seqPos);
 *   const summary = mc.review(directive, outcome);
 */
import type { M3Decision } from '../../../m3/types/perception.js';
import type {
  PrefrontalDirective, ActualOutcome, MetacognitionSummary,
  DialogGroupState,
} from './types.js';

export class MetacognitionReview {
  constructor() {}

  /**
   * 对话组开闭管理 (从 chat.ts L2224-2268 迁移)
   *
   * 判定规则:
   *   - locus 跨段变化 → 关闭旧组
   *   - 主题切换 (isTopicShift) → 关闭
   *   - 组内轮次 >= 10 → 关闭
   *   - 组持续时间 > 30 分钟 → 关闭
   */
  manageDialogGroup(
    currentGroup: DialogGroupState | null,
    locusPath: string,
    entities: string[],
    decision: M3Decision,
    message: string,
    reply: string,
    seqPos: number,
    options?: { isTopicShift?: boolean; dnaRootId?: string },
  ): { group: DialogGroupState; shouldClose: boolean } {
    const isTopicShift = options?.isTopicShift ?? false;

    // 检查是否需要关闭当前组
    let shouldClose = false;
    if (currentGroup) {
      const locusChanged =
        locusPath !== currentGroup.locusPath &&
        locusPath.split('.')[1] !== currentGroup.locusPath?.split('.')[1];
      shouldClose =
        locusChanged ||
        isTopicShift ||
        currentGroup.rounds.length >= 10 ||
        (Date.now() - currentGroup.startTime) > 30 * 60 * 1000;
    }

    if (shouldClose && currentGroup) {
      return { group: currentGroup, shouldClose: true };
    }

    // 初始化新组
    if (!currentGroup) {
      const dnaRootId = options?.dnaRootId || 'unknown';
      currentGroup = {
        id: dnaRootId + '_DG_' + String(seqPos).padStart(3, '0'),
        topic: locusPath,
        locusPath,
        rounds: [],
        perceptions: [],
        maxCalcium: 0,
        maxCalciumRound: 0,
        entities: [],
        startTime: Date.now(),
      };
    }

    // 追加本轮
    currentGroup.rounds.push({ q: message, a: reply, seqPos, time: Date.now() });
    const calciumScore = decision.enhanced.calcium_score || 0;
    if (calciumScore > currentGroup.maxCalcium) {
      currentGroup.maxCalcium = calciumScore;
      currentGroup.maxCalciumRound = currentGroup.rounds.length - 1;
    }
    const p = decision.enhanced.perception;
    currentGroup.perceptions.push({ ...p } as any);
    for (const name of entities) {
      if (name && name !== '我' && !currentGroup.entities.includes(name)) {
        currentGroup.entities.push(name);
      }
    }

    return { group: currentGroup, shouldClose: false };
  }

  /**
   * 交互后复盘：预测 vs 实际 → 差距分析
   */
  review(
    directive: PrefrontalDirective,
    outcome: ActualOutcome,
  ): MetacognitionSummary {
    const gap = this._analyzeGap(directive, outcome);
    return {
      summaryId: `META_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      directiveId: directive.directiveId,
      predictedOutcome: JSON.stringify(directive.payload),
      actualOutcome: JSON.stringify(outcome),
      gapAnalysis: gap,
      improvementHint: this._suggestImprovement(gap),
      worthSubmitting:
        outcome.taskCompleted === false ||
        outcome.followUpSentiment === 'negative',
    };
  }

  /**
   * 推送复盘摘要到梦境引擎（通过 bus 事件异步发送）
   */
  async submitToDreamEngine(
    summary: MetacognitionSummary,
    bus?: { emit: (event: any) => Promise<void> },
  ): Promise<void> {
    if (!summary.worthSubmitting) return;

    try {
      await bus?.emit?.({
        type: 'metacognition:feedback',
        traceId: `meta_${summary.summaryId}`,
        timestamp: Date.now(),
        sessionId: '',
        payload: {
          summaryId: summary.summaryId,
          directiveId: summary.directiveId,
          gapAnalysis: summary.gapAnalysis,
          worthSubmitting: true,
        },
      });
    } catch {
      // 梦境引擎不可用不阻塞
    }
  }

  // ═══════════════════════════════════════════════════════
  //  内部
  // ═══════════════════════════════════════════════════════

  private _analyzeGap(directive: PrefrontalDirective, outcome: ActualOutcome): string {
    const gaps: string[] = [];
    if (!outcome.userAccepted) gaps.push('用户未接受');
    if (!outcome.taskCompleted) gaps.push('任务未完成');
    if (outcome.followUpSentiment === 'negative') gaps.push('后续情绪为负面');
    return gaps.length > 0 ? gaps.join('; ') : '无显著差距';
  }

  private _suggestImprovement(gap: string): string {
    if (gap.includes('用户未接受')) return '尝试更温和的表达方式或先确认用户意图';
    if (gap.includes('任务未完成')) return '拆分子步骤，逐步确认用户需求';
    if (gap.includes('负面')) return '优先进行情绪安抚再处理具体问题';
    return '继续当前策略';
  }
}
