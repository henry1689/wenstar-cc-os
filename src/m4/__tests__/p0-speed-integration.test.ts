import { describe, it, expect } from 'vitest';
import { injectMemories } from '../MemoryInjector.js';

describe('P0 提速综合实测（真实场景数据）', () => {
  it('闲聊消息：大量无关碎片被精筛 + 普通记忆 ≤10 条', () => {
    // 模拟闲聊"在干嘛"时检索捞出一堆历史记忆
    const frags = [
      '💎 珍藏记忆：那天夜里天幕裂开金缝，我们并肩站着看流星',
      '【金库记忆】鸿艺答应过月底带我去看海',
      '【用户曾提到】上次说周末想去做陶艺',
      '【回忆】上个月我们一起去爬山',
      '闲聊碎片' + i_repeat(15, '的内容细节'),
    ];
    const result = injectMemories({
      memoryFragments: frags,
      m4Timeline: [], knowledgeBaseText: '', vaultHits: [],
      maxChars: 8000,
      query: '在干嘛',
    });
    // 黑钻/金库/当前上下文豁免保留
    expect(result).toContain('💎');
    expect(result).toContain('📌');
    expect(result).toContain('陶艺');
    // 普通砂金 ≤10
    expect((result.match(/💭/g) || []).length).toBeLessThanOrEqual(10);
  });

  it('会晤模式：不传 query → 精筛自动关闭，实体记忆全保留', () => {
    const frags = ['【徐诗雨的记忆】我们上周聊过她养的小猫', '【对话·徐诗雨】她说喜欢下雨天'];
    const result = injectMemories({
      memoryFragments: frags,
      m4Timeline: [], knowledgeBaseText: '', vaultHits: [],
      maxChars: 8000,
      preserveLabels: true,
      // 会晤模式 chat.ts 传 undefined query
    });
    expect(result).toContain('徐诗雨');
    expect(result).toContain('小猫');
  });
});

function i_repeat(n: number, s: string): string {
  let out = '';
  for (let i = 0; i < n; i++) out += s;
  return out;
}
