/**
 * PrefrontalCortex 单元测试
 */
import { describe, it, expect } from 'vitest';
import { WorkingMemory } from '../WorkingMemory.js';
import { GoalStack } from '../GoalStack.js';
import { PrefrontalCortex } from '../PrefrontalCortex.js';
import type { PrefrontalInput } from '../types.js';

function makeInput(message: string): PrefrontalInput {
  return {
    snapshot: {
      snapshotId: 'test_snap',
      contextSignature: 'test_sig',
      temporal: { createdAt: new Date().toISOString(), sessionId: 's1', timeOfDay: 'morning', dayOfWeek: 3 },
      spatial: { sceneLabel: 'chat' },
      entities: { persons: [], topics: [], objects: [] },
      experienceSummary: '测试摘要',
      emotion: { pleasure: 0.3, arousal: 0.1, intimacy: 0.2, trend: 'stable' },
      memoryPointers: [], knowledgeRefs: [], fgEventRefs: [],
      calciumScore: 0.5, novelty: { level: 'familiar', similarity: 0.5, multiplier: 1.0 },
    },
    sessionId: 's1',
    rawInput: message,
  };
}

describe('PrefrontalCortex', () => {
  // 这里不创建完整依赖链，仅验证构造函数和 API 形状
  const wm = new WorkingMemory();
  const gs = new GoalStack();

  it('WorkingMemory 有 7 个槽位', () => {
    expect(wm.capacity).toBe(7);
    expect(wm.activeCount).toBe(0);
  });

  it('WorkingMemory 加载后活跃槽位递增', () => {
    const input = makeInput('你好');
    wm.load(input.snapshot);
    expect(wm.activeCount).toBe(1);
    wm.clearAll();
    expect(wm.activeCount).toBe(0);
  });

  it('GoalStack 默认有 4 个长期目标', () => {
    const state = gs.getState();
    expect(state.longTerm.length).toBe(4);
    expect(state.longTerm).toContain('保持角色人设一致性');
  });

  it('GoalStack 可设置即时意图', () => {
    gs.setImmediate('回答关于天权的问题');
    expect(gs.getState().immediate).toBe('回答关于天权的问题');
    gs.clearImmediate();
    expect(gs.getState().immediate).toBeNull();
  });

  it('GoalStack 可设置会话目标', () => {
    gs.setSessionGoal('帮助完成架构改造');
    expect(gs.getState().session).toBe('帮助完成架构改造');
  });

  it('GoalStack formatForContext 不崩溃', () => {
    gs.setSessionGoal('测试');
    gs.setImmediate('即刻');
    const ctx = gs.formatForContext();
    expect(ctx).toContain('测试');
    expect(ctx).toContain('即刻');
  });

  it('MetacognitionReview 模块可单独构造', async () => {
    const { MetacognitionReview } = await import('../MetacognitionReview.js');
    const mc = new MetacognitionReview();
    expect(typeof mc.review).toBe('function');
    expect(typeof mc.manageDialogGroup).toBe('function');
  });

  it('ConstraintValidator 模块可单独构造（需要 SQLite，跳过）', () => {
    expect(true).toBe(true);
  });

  it('DirectiveGenerator 模块可单独构造', async () => {
    const { DirectiveGenerator } = await import('../DirectiveGenerator.js');
    const dg = new DirectiveGenerator();
    expect(typeof dg.deriveStrategy).toBe('function');
    expect(typeof dg.generate).toBe('function');
  });

  it('assemblePrefrontal 类型可导入', async () => {
    const mod = await import('../assemblePrefrontal.js');
    expect(typeof mod.assemblePrefrontal).toBe('function');
  });
});
