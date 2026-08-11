import { describe, it, expect } from 'vitest';
import { computePromptDepth } from '../../chat.js';

describe('computePromptDepth — P0-2 会话模式分级', () => {
  const base = {
    isMeeting: false,
    isTopicShift: false,
    isCasualChat: false,
    isFactualRecallQuery: false,
    currentRole: 'secretary',
    depthEnabled: true,
  };

  it('会晤 → deep', () => {
    expect(computePromptDepth({ ...base, isMeeting: true })).toBe('deep');
  });
  it('新话题切换 → deep', () => {
    expect(computePromptDepth({ ...base, isTopicShift: true })).toBe('deep');
  });
  it('闲聊 → casual', () => {
    expect(computePromptDepth({ ...base, isCasualChat: true })).toBe('casual');
  });
  it('事实查询 + isTopicShift → deep（S4-M1: 事实准确优先走深度）', () => {
    // 事实查询消息通常非 casual/非跟进 → isTopicShift true → deep
    expect(computePromptDepth({ ...base, isFactualRecallQuery: true, isTopicShift: true, currentRole: 'secretary' })).toBe('deep');
  });
  it('默认 → standard', () => {
    expect(computePromptDepth(base)).toBe('standard');
  });
  it('总开关 false → 强制 standard（一键回退）', () => {
    expect(computePromptDepth({ ...base, isMeeting: true, depthEnabled: false })).toBe('standard');
    expect(computePromptDepth({ ...base, isCasualChat: true, depthEnabled: false })).toBe('standard');
  });
  it('优先级: 会晤 > 闲聊', () => {
    expect(computePromptDepth({ ...base, isMeeting: true, isCasualChat: true })).toBe('deep');
  });
});
