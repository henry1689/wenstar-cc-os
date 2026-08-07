import { describe, it, expect } from 'vitest';
import { injectMemories } from '../MemoryInjector.js';

describe('MemoryInjector — 作品独立注入 (V22)', () => {
  it('【作品】fragment 完整注入（不参与 250 截断）', () => {
    // 构造 3000 字作品 fragment
    const novelBody = '第一章 星落之城\n' + '城外的风卷着黄沙，将落日揉碎。\n'.repeat(120);  // >250字
    const workFrag = '【作品】《星落之城》(novel)\n' + novelBody;
    const result = injectMemories({
      memoryFragments: [workFrag],
      m4Timeline: [],
      knowledgeBaseText: '',
      vaultHits: [],
      maxChars: 8000,
    });
    // 作品全文应完整出现（远超过 250 字）
    expect(result).toContain('【作品】');
    expect(result).toContain('第一章 星落之城');
    expect(result).toContain('城外的风卷着黄沙');
    // 作品长度 > 250（未被截断）
    const workIdx = result.indexOf('【作品】');
    const workBlock = result.substring(workIdx);
    expect(workBlock.length).toBeGreaterThan(500);
  });

  it('多篇作品 → 只保留 1 篇完整', () => {
    const w1 = '【作品】《甲》\n' + '甲正文'.repeat(80);
    const w2 = '【作品】《乙》\n' + '乙正文'.repeat(80);
    const result = injectMemories({ memoryFragments: [w1, w2], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    const count = (result.match(/【作品】/g) || []).length;
    expect(count).toBe(1);
  });

  it('超过 4000 字符作品 → 截断到作品预算（S5: min(4000, 8000*0.4)=3200 @maxChars=8000）', () => {
    const huge = '【作品】《长》\n' + '超长正文内容'.repeat(1000);  // >4000字
    const result = injectMemories({ memoryFragments: [huge], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    const workIdx = result.indexOf('【作品】');
    const workBlock = result.substring(workIdx);
    expect(workBlock.length).toBeLessThanOrEqual(3200 + 20);  // workBudget = min(4000, 3200) = 3200
  });

  it('总输出硬约束：记忆+KB+作品合计超 maxChars → 截断（S5）', () => {
    const novel = '【作品】《长》\n' + '正文'.repeat(500);  // 1000字作品
    const kb = 'K'.repeat(3000);  // 知识库 3000
    const mem = '普通记忆'.repeat(100);  // 400字记忆
    const result = injectMemories({ memoryFragments: [mem, novel], m4Timeline: [], knowledgeBaseText: kb, vaultHits: [], maxChars: 1500 });
    expect(result.length).toBeLessThanOrEqual(1500 + 40);  // maxChars + 截断标记
  });

  it('普通记忆片段不受影响（仍 250 截断）', () => {
    const normal = '普通记忆' + '的内容'.repeat(60);  // 305字，>250
    const result = injectMemories({ memoryFragments: [normal], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    // 普通记忆仍按 250 截断（去重复尾），且不含作品块
    expect(result).toContain('💭');
    expect(result).not.toContain('【作品】');
    // 记忆内容本体（💭 到 共情指南 之间）被截断到 250
    const memIdx = result.indexOf('💭');
    const guideIdx = result.indexOf('共情指南');
    const memBody = (memIdx >= 0 && guideIdx > memIdx) ? result.substring(memIdx + 1, guideIdx) : result.substring(memIdx + 1);
    expect(memBody.length).toBeLessThan(260);
  });
});
