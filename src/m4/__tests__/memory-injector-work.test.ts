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

  it('V23 长文【对话原文】独立注入（不参与 250 截断）', () => {
    const longFrag = '【对话原文】第一章 星陨\n' + '那天夜里天幕裂开金缝。'.repeat(120);  // >1000字
    const result = injectMemories({ memoryFragments: [longFrag], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    expect(result).toContain('【对话原文】');
    expect(result).toContain('天幕裂开金缝');
    // 长文完整保留（远大于 250 字普通截断）
    const idx = result.indexOf('【对话原文】');
    expect(result.length - idx).toBeGreaterThan(500);
  });

  it('V23 长文超预算 → 截断到长文预算（max(4000, 60%maxChars)）', () => {
    const huge = '【对话原文】' + '超长正文'.repeat(1500);  // >8000
    const result = injectMemories({ memoryFragments: [huge], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 4000 });
    const idx = result.indexOf('【对话原文】');
    const body = result.substring(idx);
    // longBudget = max(4000, 60%*4000=2400) = 4000 + 截断标记
    expect(body.length).toBeLessThanOrEqual(4000 + 40);
  });

  it('V23 长文 detail（~4300字）→ 不丢结尾（预算足够覆盖全文）', () => {
    const novel = '【对话原文】第二章 进入实验\n' + '完整记录内容详细描述'.repeat(300);  // 10字×300=3000
    const result = injectMemories({ memoryFragments: [novel], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    // longBudget = max(4000, 60%*8000=4800) = 4800，3000字全文应完整保留
    const idx = result.indexOf('【对话原文】');
    const body = result.substring(idx);
    expect(body.length).toBeGreaterThan(3000);  // 完整保留（未截断）
  });

  it('V23 长文与普通记忆共存 → 两者都注入', () => {
    const longFrag = '【对话原文】' + '长文内容'.repeat(150);  // >1000
    const normal = '普通记忆'.repeat(20);  // 100字
    const result = injectMemories({ memoryFragments: [normal, longFrag], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    expect(result).toContain('【对话原文】');
    expect(result).toContain('💭');
  });
});

describe('MemoryInjector — P0-3 普通碎片上限 (≤10)', () => {
  it('>10 条普通砂金 → 只注入 ≤10 条', () => {
    const frags: string[] = [];
    for (let i = 0; i < 15; i++) frags.push('普通砂金记忆' + i + '的详细内容描述' + '话'.repeat(10));
    const result = injectMemories({ memoryFragments: frags, m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    // 💭 前缀的记忆条数 ≤10（普通砂金才有 💭）
    const count = (result.match(/💭/g) || []).length;
    expect(count).toBeLessThanOrEqual(10);
  });

  it('黑钻/金库/作品/长文 不计入普通上限（豁免全保留）', () => {
    const frags: string[] = [];
    for (let i = 0; i < 12; i++) frags.push('普通砂金' + i);
    frags.push('💎 珍藏记忆：那晚我们看星星的场景');
    frags.push('【金库记忆】鸿艺答应过带我去看海');
    frags.push('【作品】《星》' + '正文'.repeat(30));
    const result = injectMemories({ memoryFragments: frags, m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000 });
    // 黑钻💎、金库📌、作品【作品】都应保留
    expect(result).toContain('💎');
    expect(result).toContain('📌');
    expect(result).toContain('【作品】');
    // 普通砂金 ≤10
    expect((result.match(/💭/g) || []).length).toBeLessThanOrEqual(10);
  });
});

describe('MemoryInjector — P0-1 二次精筛 (query)', () => {
  it('query 相关记忆保留、无关剔除', () => {
    const related = '【记忆】周末我们去公园散步，你穿了件蓝色外套';
    const unrelated = '【记忆】上次修电脑花了三百块钱';
    const result = injectMemories({
      memoryFragments: [related, unrelated],
      m4Timeline: [], knowledgeBaseText: '', vaultHits: [],
      maxChars: 8000,
      query: '我们周末去公园散步',
    });
    // 相关记忆应保留，无关记忆应被剔除
    expect(result).toContain('公园散步');
    expect(result).not.toContain('修电脑');
  });

  it('query 为空/短句 → 跳过精筛（不误杀）', () => {
    const frag = '【记忆】某条普通记忆内容';
    const result = injectMemories({ memoryFragments: [frag], m4Timeline: [], knowledgeBaseText: '', vaultHits: [], maxChars: 8000, query: '嗯' });
    expect(result).toContain('普通记忆');
  });

  it('黑钻/当前上下文/KB 即使低相关也不删（豁免）', () => {
    const diamond = '💎 珍藏记忆：我们第一次见面';
    const context = '【回忆】上周的电影特别好看';
    const result = injectMemories({
      memoryFragments: [diamond, context],
      m4Timeline: [], knowledgeBaseText: '', vaultHits: [],
      maxChars: 8000,
      query: '关于量子物理的完全无关话题',
    });
    expect(result).toContain('珍藏记忆');
    expect(result).toContain('上周的电影');
  });

  it('长文【对话原文】不被精筛触碰（独立预算）', () => {
    const longFrag = '【对话原文】' + '我们去年冬天去哈尔滨看冰雕，'.repeat(50);
    const result = injectMemories({
      memoryFragments: [longFrag],
      m4Timeline: [], knowledgeBaseText: '', vaultHits: [],
      maxChars: 8000,
      query: '今天天气怎么样',
    });
    expect(result).toContain('【对话原文】');
  });

  it('vaultBoost 命中时金库豁免精筛（事实查询场景）', () => {
    const vault = '【金库记忆】鸿艺说今年会带我去看海';
    const result = injectMemories({
      memoryFragments: [vault],
      m4Timeline: [], knowledgeBaseText: '', vaultHits: [],
      maxChars: 8000,
      query: '关于物理的完全无关话题',
      vaultBoost: true,
    });
    // vaultBoost 命中 → 金库豁免精筛，正常注入（normal 模式标签剥离为 📌 前缀）
    expect(result).toContain('📌');
    expect(result).toContain('带我去看海');
  });
});

describe('MemoryInjector — S4-B1 会晤模式不丢 memoryText/KB', () => {
  it('会晤模式（不传 query）→ 精筛关闭，KB 完整保留', () => {
    const kb = '【关于你的知识库档案】玉瑶是太虚境的核心意识体，负责记忆与情感管理。'.repeat(3);
    const result = injectMemories({
      memoryFragments: ['【徐诗雨的记忆】我们上周聊过她养的小猫'],
      m4Timeline: [], knowledgeBaseText: kb, vaultHits: [],
      maxChars: 8000,
      preserveLabels: true,  // 会晤模式保留标签
      // 会晤模式 chat.ts 传 query=undefined → 精筛跳过
    });
    expect(result).toContain('徐诗雨');
    expect(result).toContain('太虚境的核心意识体');
  });
});
