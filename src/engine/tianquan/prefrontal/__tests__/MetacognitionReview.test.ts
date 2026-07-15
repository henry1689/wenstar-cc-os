/**
 * MetacognitionReview 单元测试
 */
import { describe, it, expect } from 'vitest';
import { MetacognitionReview } from '../MetacognitionReview.js';

function makeDecision(calciumScore: number): any {
  return {
    enhanced: {
      branch_id: 'test', locus_path: 'root.test', raw_input: '',
      entity_genes: [], calcium_score: calciumScore, calcium_level: 1,
      perception: { joy: 30, sadness: 0, anger: 0, fear: 0, surprise: 0, disgust: 0, calm: 50, anxiety: 0, affection: 20, trust: 30, intimacy: 10, respect: 20, arousal: 10, fatigue: 0, excitement: 0, boredom: 0, dominance: 0, compliance: 10, warmth: 30, coldness: 0, nostalgia: 0, curiosity: 20, shyness: 0, jealousy: 0 },
    } as any,
    actions: [],
    reason: 'test',
    timestamp: Date.now().toString(),
  };
}

describe('MetacognitionReview', () => {
  const mc = new MetacognitionReview();

  it('manageDialogGroup 新建组不关闭', () => {
    const result = mc.manageDialogGroup(
      null, 'root.chat', ['张三'],
      makeDecision(0.5), '你好', '你好！', 1,
    );
    expect(result.group).toBeDefined();
    expect(result.group.topic).toBe('root.chat');
    expect(result.shouldClose).toBe(false);
  });

  it('manageDialogGroup 10 轮后关闭', () => {
    // 创建满 10 轮的组
    const group = {
      id: 'test_DG_001', topic: 'root.test', locusPath: 'root.test',
      rounds: Array.from({ length: 10 }, (_, i) => ({ q: `msg${i}`, a: `reply${i}`, seqPos: i, time: Date.now() })),
      perceptions: [], maxCalcium: 0, maxCalciumRound: 0,
      entities: [], startTime: Date.now() - 5000,
    };
    const result = mc.manageDialogGroup(
      group, 'root.test', ['张三'],
      makeDecision(0.5), '你好', '你好！', 11,
    );
    expect(result.shouldClose).toBe(true);
  });

  it('review 正常完成返回值得提交', () => {
    const directive: any = {
      directiveId: 'test', createdAt: new Date().toISOString(),
      type: 'generate_speech', priority: 'medium', targetModule: 'yao_ling',
      payload: {}, expectedCompletionMs: 3000,
      constraints: { personaCheck: true, emotionCheck: true, safetyCheck: true, logicCheck: true, realityCheck: true, passed: true, violations: [] },
    };
    const outcome = {
      userAccepted: false, emotionDelta: { pleasure: 0, arousal: 0, intimacy: 0 },
      taskCompleted: false, notes: '回复太短',
    };
    const summary = mc.review(directive, outcome);
    expect(summary.summaryId).toBeDefined();
    expect(summary.worthSubmitting).toBe(true);
    expect(summary.gapAnalysis).toContain('用户未接受');
  });

  it('review 正常完成不提交', () => {
    const directive: any = {
      directiveId: 'test', createdAt: '', type: 'generate_speech',
      priority: 'medium', targetModule: 'yao_ling', payload: {}, expectedCompletionMs: 3000,
      constraints: { personaCheck: true, emotionCheck: true, safetyCheck: true, logicCheck: true, realityCheck: true, passed: true, violations: [] },
    };
    const outcome = {
      userAccepted: true, emotionDelta: { pleasure: 0, arousal: 0, intimacy: 0 },
      taskCompleted: true, notes: '',
    };
    expect(mc.review(directive, outcome).worthSubmitting).toBe(false);
  });
});
