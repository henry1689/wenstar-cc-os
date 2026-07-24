/**
 * V10.0 P1-3: 记忆检索冒烟测试（纯函数，不依赖服务器）
 * 验证 MemoryInjector 的基本行为
 */
import { describe, it, expect } from 'vitest';
import { injectMemories, type InjectOptions } from '../m4/MemoryInjector.js';

describe('记忆检索 — 基础功能', () => {
  const baseOpts: InjectOptions = {
    memoryFragments: [],
    m4Timeline: [],
    knowledgeBaseText: '',
    vaultHits: [],
    maxChars: 8000,
  };

  it('日常闲聊消息（无实体）应有记忆注入', () => {
    const result = injectMemories({
      ...baseOpts,
      memoryFragments: ['用户曾提到：今天天气不错适合出门散步'],
      m4Timeline: [{ summary: '上周讨论过深圳天气', calcium_level: 2 }],
    });
    expect(result).toContain('【相关记忆】');
    expect(result.length).toBeGreaterThan(50);
  });

  it('多来源混合注入（砂金 + 黑钻 + timeline）', () => {
    const result = injectMemories({
      ...baseOpts,
      memoryFragments: [
        '砂金：用户说今天很累',
        '珍藏记忆：上个月和用户一起看了一场电影，他说很喜欢',
      ],
      m4Timeline: [
        { summary: '用户提到徐诗雨生日', calcium_level: 3 },
        { summary: '用户上周加班', calcium_level: 1 },
      ],
      vaultHits: [], // vault_log 已禁用
      maxChars: 8000,
    });
    // 记忆部分应该有内容
    expect(result).toContain('【相关记忆】');
    // 黑钻和 timeline 都在
    expect(result).toContain('珍藏记忆');
    expect(result).toContain('徐诗雨');
  });

  it('超大内容截断保护', () => {
    const hugeText = 'X'.repeat(20000);
    const result = injectMemories({
      ...baseOpts,
      memoryFragments: [],
      m4Timeline: [],
      knowledgeBaseText: hugeText,
      vaultHits: [],
      maxChars: 1000,
    });
    // 应该被截断，不应超过 maxChars
    expect(result.length).toBeLessThan(1500);
  });
});
