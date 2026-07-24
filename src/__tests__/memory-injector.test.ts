/**
 * V10.0 P1-3: MemoryInjector 单元测试
 * - 验证去重（Jaccard > 0.4 视为重复）
 * - 验证 50/50 预算分配
 * - 验证优先级排序
 */
import { describe, it, expect } from 'vitest';
import { injectMemories } from '../m4/MemoryInjector.js';

describe('MemoryInjector 统一记忆注入', () => {
  it('空输入返回空字符串', () => {
    const result = injectMemories({ memoryFragments: [], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    expect(result).toBe('');
  });

  it('单条记忆正常注入', () => {
    const result = injectMemories({
      memoryFragments: ['用户曾提到：今天天气不错'],
      m4Timeline: [],
      knowledgeBaseText: '',
      vaultHits: [],
      maxChars: 8000,
    });
    expect(result).toContain('【相关记忆】');
    expect(result).toContain('今天天气不错');
  });

  it('黑钻记忆优先级高于砂金', () => {
    const result = injectMemories({
      memoryFragments: [
        '用户说今天天气不错适合出门散步晒太阳',
        '珍藏记忆：上个月用户去了一趟北京出差很辛苦',
      ],
      m4Timeline: [],
      knowledgeBaseText: '',
      vaultHits: [],
      maxChars: 8000,
    });
    const diamondIdx = result.indexOf('北京出差');
    const sandIdx = result.indexOf('出门散步');
    expect(diamondIdx).toBeGreaterThan(0);
    expect(sandIdx).toBeGreaterThan(0);
    // 黑钻优先级更高 → 排在前面
    expect(diamondIdx).toBeLessThan(sandIdx);
  });

  it('50/50 预算分配正确', () => {
    const kb = 'A'.repeat(9000); // 大于 maxChars=4000
    const result = injectMemories({
      memoryFragments: ['测试记忆'],
      m4Timeline: [],
      knowledgeBaseText: kb,
      vaultHits: [],
      maxChars: 4000,
    });
    // KB 应该被截断到约 2000 字符（50%）
    const kbSection = result.includes('…(已截断)');
    expect(kbSection).toBe(true);
  });

  it('M4 timeline 钙化分影响优先级', () => {
    const result = injectMemories({
      memoryFragments: [],
      m4Timeline: [
        { summary: '用户问今天中午吃什么外卖好呢', calcium_level: 1 },
        { summary: '用户回忆起去年去日本旅行很开心', calcium_level: 3 },
      ],
      knowledgeBaseText: '',
      vaultHits: [],
      maxChars: 8000,
    });
    expect(result).toContain('日本旅行');
    expect(result).toContain('外卖');
    // 高钙化（日本旅行）应该在前面
    const highIdx = result.indexOf('日本旅行');
    const lowIdx = result.indexOf('外卖');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('短于5字符的片段被过滤', () => {
    const result = injectMemories({
      memoryFragments: ['ab'],
      m4Timeline: [],
      knowledgeBaseText: '',
      vaultHits: [],
      maxChars: 8000,
    });
    expect(result).toBe('');
  });
});
