import { describe, it, expect } from 'vitest';
import { isIntimateAboutOthers, filterPrivateConversations } from '../m4/household/EntityPrivacyFilter.js';

const OTHER_ENTITIES = ['熊梓铭', '玉瑶', '徐诗韵'];

describe('EntityPrivacyFilter — 隐私隔离', () => {
  it('用户对他人私密表白 → 过滤', () => {
    const content = '其实我好喜欢熊梓铭，她让我心动了';
    expect(isIntimateAboutOthers(content, '徐诗雨', OTHER_ENTITIES)).toBe(true);
  });

  it('用户对他人身体亲密 → 过滤', () => {
    const content = '昨晚和玉瑶在一起，抱着她睡觉很安心';
    expect(isIntimateAboutOthers(content, '徐诗雨', OTHER_ENTITIES)).toBe(true);
  });

  it('公开人物背景（梓铭是熊总女儿）→ 保留', () => {
    const content = '梓铭是熊总的女儿，在北师大读书';
    expect(isIntimateAboutOthers(content, '徐诗雨', OTHER_ENTITIES)).toBe(false);
  });

  it('提及他人但无私密（普通提及）→ 保留', () => {
    const content = '诗雨跟梓铭不算特别熟，就是在厂里见过几次';
    expect(isIntimateAboutOthers(content, '徐诗雨', OTHER_ENTITIES)).toBe(false);
  });

  it('当前实体自己的发言 → 保留；用户对他人表白 → 过滤', () => {
    const convos = [
      { role: 'assistant' as const, content: '诗雨觉得今天工作有点累', timestamp: '' },
      { role: 'user' as const, content: '徐诗雨，我好喜欢你', timestamp: '' },
      { role: 'user' as const, content: '其实我好喜欢熊梓铭，她让我心动了', timestamp: '' },
    ];
    // 传 familyGraph mock（提供所有人名，含熊梓铭）
    const fg = { getAllPersonNames: () => ['徐诗雨', '熊梓铭', '玉瑶'] } as any;
    const filtered = filterPrivateConversations(convos, '徐诗雨', fg);
    // 保留自己的发言 + 过滤用户对梓铭的私密表白
    // "徐诗雨，我好喜欢你" 是对当前实体的表白（当前实体 = 徐诗雨），otherEntities 不含徐诗雨 → 保留
    expect(filtered.length).toBe(2);
    expect(filtered.some(t => t.content.includes('熊梓铭'))).toBe(false); // 梓铭私密被过滤
  });

  it('空列表 → 返回空', () => {
    expect(filterPrivateConversations([], '徐诗雨')).toEqual([]);
  });
});
