/**
 * DirectiveGenerator 单元测试
 */
import { describe, it, expect } from 'vitest';
import { DirectiveGenerator } from '../DirectiveGenerator.js';

function makeDecision(actions: string[], calciumLevel: number): any {
  return {
    enhanced: {
      branch_id: 'test', locus_path: 'root.test', raw_input: '',
      entity_genes: [],
      perception: { pleasure: 0.3, arousal: 0.1, intimacy: 0.1, dominance: 0, sexual_attraction: 0, sensory_craving: 0 },
      calcium_score: calciumLevel * 2,
      calcium_level: calciumLevel as any,
    },
    actions,
    reason: 'test',
    timestamp: new Date().toISOString(),
  };
}

describe('DirectiveGenerator', () => {
  const dg = new DirectiveGenerator();

  it('应该导出 deriveStrategy 方法', () => {
    expect(typeof dg.deriveStrategy).toBe('function');
  });

  it('应该导出 generate 方法', () => {
    expect(typeof dg.generate).toBe('function');
  });

  it('casual 场景返回 neutral tone', () => {
    const s = dg.deriveStrategy(makeDecision([], 1));
    expect(s.tone).toBe('neutral');
  });

  it('comfort 场景返回 warm tone', () => {
    const s = dg.deriveStrategy(makeDecision(['comfort'], 2));
    expect(s.tone).toBe('warm');
  });

  it('act 场景返回 serious tone', () => {
    const s = dg.deriveStrategy(makeDecision(['act'], 3));
    expect(s.tone).toBe('serious');
  });

  it('高钙化返回 high 优先级', () => {
    const goalState = { longTerm: [], session: null, immediate: null };
    const constraints = { personaCheck: true, emotionCheck: true, safetyCheck: true, logicCheck: true, realityCheck: true, knowledgeConsistencyCheck: true, passed: true, violations: [] };
    const d = dg.generate(makeDecision(['act'], 3), constraints, goalState);
    expect(d.priority).toBe('high');
  });

  it('约束违规返回 violation 指令', () => {
    const goalState = { longTerm: [], session: null, immediate: null };
    const constraints = { personaCheck: false, emotionCheck: true, safetyCheck: true, logicCheck: true, realityCheck: true, knowledgeConsistencyCheck: true, passed: false, violations: ['人设异常'] };
    const d = dg.generate(makeDecision([], 1), constraints, goalState);
    expect(d.type).toBe('constraint_violation');
  });

  it('encodeRouting 路由 generate_speech → yao_ling', () => {
    const directive: any = {
      directiveId: 'test', createdAt: '', type: 'generate_speech',
      priority: 'medium', targetModule: 'yao_ling', payload: {},
      constraints: { personaCheck: true, emotionCheck: true, safetyCheck: true, logicCheck: true, realityCheck: true, knowledgeConsistencyCheck: true, passed: true, violations: [] },
      expectedCompletionMs: 3000,
    };
    const result = dg.encodeRouting(makeDecision([], 1), directive);
    expect(result).toBe('yao_ling');
  });
});
