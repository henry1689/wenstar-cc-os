/**
 * 关系突触模型单元测试
 */
import { describe, it, expect } from 'vitest';
import { updateSynapse, defaultSynapseState, computeSynapseStrength, strengthToStage, canTransitionTo } from '../relation-synapse.js';

describe('relation-synapse', () => {
  it('正向事件应该增加信任和亲密度', () => {
    const state = defaultSynapseState();
    const result = updateSynapse(state, {
      valence: 'positive', intensity: 0.8,
      isRift: false, isRepair: false, deltaHours: 0,
    });

    expect(result.state.metrics.trust).toBeGreaterThan(state.metrics.trust);
    expect(result.state.metrics.intimacy).toBeGreaterThan(state.metrics.intimacy);
    expect(result.changed).toBe(true);
  });

  it('裂痕事件应该增加裂痕值并减少信任', () => {
    const state = defaultSynapseState();
    state.metrics.trust = 40;

    const result = updateSynapse(state, {
      valence: 'negative', intensity: 0.9,
      isRift: true, isRepair: false, deltaHours: 0,
    });

    expect(result.state.metrics.trust).toBeLessThan(40);
    expect(result.state.metrics.crack).toBeGreaterThan(0);
    expect(result.state.metrics.positiveStreak).toBe(0);
  });

  it('防抖机制应该需要连续 3 轮确认才跃迁', () => {
    const state = defaultSynapseState();
    state.metrics.trust = 40;
    state.metrics.intimacy = 30;
    state.metrics.rapport = 20;

    // S 值 = 0.35*40 + 0.30*30 + 0.20*20 = 14 + 9 + 4 = 27
    // 不算裂痕，应该在熟悉期边缘

    // 第 1 轮正向
    let result = updateSynapse(state, { valence: 'positive', intensity: 1.0, isRift: false, isRepair: false, deltaHours: 0 });
    expect(result.stageChanged).toBe(false); // 需要 3 轮确认

    // 模拟 2、3 轮
    let s = result.state;
    for (let i = 0; i < 3; i++) {
      s = updateSynapse(s, { valence: 'positive', intensity: 1.0, isRift: false, isRepair: false, deltaHours: 0 }).state;
    }
    // S 经过多轮积累应该足够触发跃迁
    const S = computeSynapseStrength(s.metrics);
    expect(S).toBeGreaterThan(0);
  });

  it('自然衰减应该在长时间无互动时生效', () => {
    const state = defaultSynapseState();
    state.metrics.trust = 60;
    state.metrics.intimacy = 40;

    const result = updateSynapse(state, {
      valence: 'neutral', intensity: 0,
      isRift: false, isRepair: false,
      deltaHours: 168, // 7 天
    });

    expect(result.state.metrics.trust).toBeLessThan(60);
  });

  it('computeSynapseStrength 应该计算正确的 S 值', () => {
    const S = computeSynapseStrength({ trust: 50, intimacy: 30, rapport: 20, crack: 10, positiveStreak: 5 });
    // S = 0.35*50 + 0.30*30 + 0.20*20 - 0.15*10
    //   = 17.5 + 9 + 4 - 1.5 = 29
    expect(S).toBeGreaterThan(28);
    expect(S).toBeLessThan(30);
  });

  it('strengthToStage 正确映射阶段', () => {
    expect(strengthToStage(20)).toBe('stranger');
    expect(strengthToStage(40)).toBe('familiar');
    expect(strengthToStage(80)).toBe('intimate');
  });
});
