import { describe, it, expect } from 'vitest';
import {
  detectDetailLevel, buildLongTextFragment, buildKnowledgeArchiveFragment, fetchLongText, LONG_TEXT_THRESHOLD,
} from '../long-text-retrieval.js';

describe('detectDetailLevel — 意图检测', () => {
  it('详细意图 → detail', () => {
    expect(detectDetailLevel('那段事详细讲讲')).toBe('detail');
    expect(detectDetailLevel('展开说说第三章')).toBe('detail');
    expect(detectDetailLevel('具体写了什么')).toBe('detail');
    expect(detectDetailLevel('每一段都讲讲')).toBe('detail');
  });

  it('🔴 S2-R5: 一字不漏意图 → full（优先于 detail）', () => {
    expect(detectDetailLevel('从头到尾讲一遍')).toBe('full');
    expect(detectDetailLevel('一字不漏地念一遍')).toBe('full');
    expect(detectDetailLevel('全部内容都讲')).toBe('full');
    expect(detectDetailLevel('完整的档案读一遍')).toBe('full');
    expect(detectDetailLevel('复述一遍原文')).toBe('full');
    expect(detectDetailLevel('把全文念一遍')).toBe('full');  // 原为 detail，新正则归 full
  });

  it('概要意图 → summary', () => {
    expect(detectDetailLevel('简单总结一下')).toBe('summary');
    expect(detectDetailLevel('那章大概讲了什么')).toBe('summary');
    expect(detectDetailLevel('概括一下那段')).toBe('summary');
  });

  it('普通问题 → auto', () => {
    expect(detectDetailLevel('那篇小说')).toBe('auto');
    expect(detectDetailLevel('今天怎么样')).toBe('auto');
  });

  it('空消息 → auto', () => {
    expect(detectDetailLevel('')).toBe('auto');
    expect(detectDetailLevel('  ')).toBe('auto');
  });
});

describe('buildLongTextFragment — 长文片段构造', () => {
  // 3000 字长文
  const long = '第一章 星陨\n' + '那天夜里天幕裂开金缝。'.repeat(350);  // ~3000字

  it('detail → 分段全文（2-3段，覆盖全文）', () => {
    const frag = buildLongTextFragment(long, 'detail');
    expect(frag).toContain('【对话原文·权威记录】');
    expect(frag).toContain('…（接上）');  // 分段标记
    expect(frag).toContain('不得提及或编造');    // 铁律标记
    // 分段后长度应接近全文（>2000）
    expect(frag.length).toBeGreaterThan(2000);
  });

  it('summary → 摘要（开头+中段+结尾）', () => {
    const frag = buildLongTextFragment(long, 'summary');
    expect(frag).toContain('【开头】');
    expect(frag).toContain('【中段】');
    expect(frag).toContain('【结尾】');
    expect(frag).toContain('不得提及或编造');
    // 摘要应远短于全文
    expect(frag.length).toBeLessThan(1200);
  });

  it('auto → 摘要（默认保守）', () => {
    const frag = buildLongTextFragment(long, 'auto');
    expect(frag).toContain('【开头】');
    expect(frag.length).toBeLessThan(1200);
  });

  it('短文本（≤800）→ 原样返回', () => {
    const short = '这是一段普通对话内容。'.repeat(10);  // ~90字
    const frag = buildLongTextFragment(short, 'detail');
    expect(frag).toContain('【对话原文·权威记录】');
    expect(frag).toContain('普通对话内容');
  });

  it('🔴 S2-R5: full → 原文直引（不含分段标记，含铁律）', () => {
    const frag = buildLongTextFragment(long, 'full');
    expect(frag).toContain('【对话原文·权威记录】');
    expect(frag).not.toContain('…（接上）');  // 不分段
    expect(frag).toContain('不得增删改');
    expect(frag.length).toBeGreaterThan(2800);  // 接近全文
  });
});

describe('buildKnowledgeArchiveFragment — 知识库档案片段（S2-R5）', () => {
  const archive = '熊梓铭，6岁学英语，8岁学钢琴，14岁和叔叔有了更深交集，18岁考上海珠大学学心理学。'.repeat(20);  // ~1000字

  it('full → 原文直引 + 权威记录铁律', () => {
    const frag = buildKnowledgeArchiveFragment('梓铭简介', archive, 'full');
    expect(frag).toContain('【知识库档案·权威记录】');
    expect(frag).toContain('《梓铭简介》');
    expect(frag).toContain('唯一事实来源');
    expect(frag).toContain('不得增删改');
    expect(frag).toContain('学心理学');  // 尾部内容也在
    expect(frag).not.toContain('…（接上）');
  });

  it('detail → 分段全文（含接上标记）', () => {
    const longArchive = '熊梓铭的人生档案细节。'.repeat(200);  // ~1800字 > 1500 触发分段
    const frag = buildKnowledgeArchiveFragment('梓铭简介', longArchive, 'detail');
    expect(frag).toContain('【知识库档案】');
    expect(frag).toContain('…（接上）');
    expect(frag).toContain('不得编造');
  });

  it('auto → 摘要（首+中+尾）', () => {
    const frag = buildKnowledgeArchiveFragment('梓铭简介', archive, 'auto');
    expect(frag).toContain('【开头】');
    expect(frag).toContain('【结尾】');
    expect(frag.length).toBeLessThan(800);
  });

  it('空内容 → 不崩溃', () => {
    const frag = buildKnowledgeArchiveFragment('测试', '', 'full');
    expect(frag).toContain('【知识库档案·权威记录】');
  });
});

describe('fetchLongText — 直取全文', () => {
  it('假 sqlite 返回 null（无 queryAll）', () => {
    expect(fetchLongText(null, 1)).toBeNull();
  });

  it('queryAll 返回长文 → 取到全文', () => {
    const longContent = '长文内容'.repeat(300);  // >800字
    const fake = { queryAll: () => [{ content: longContent }] };
    expect(fetchLongText(fake, 123)).toBe(longContent);
  });

  it('queryAll 返回短文（≤800）→ null（不走直取）', () => {
    const fake = { queryAll: () => [{ content: '短内容' }] };
    expect(fetchLongText(fake, 123)).toBeNull();
  });

  it('查询异常 → null（回落截断路径）', () => {
    const fake = { queryAll: () => { throw new Error('db err'); } };
    expect(fetchLongText(fake, 123)).toBeNull();
  });

  it('S4-修复: 带 belong 白名单 → SQL 含过滤 + 命中返回全文', () => {
    const longContent = '长文'.repeat(500);  // >800
    let calledSql = '';
    let calledParams: any[] = [];
    const fake = {
      queryAll: (sql: string, params: any[]) => {
        calledSql = sql; calledParams = params;
        return [{ content: longContent, belong_entity_uuid: 'TXS-1' }];
      },
    };
    expect(fetchLongText(fake, 123, ['TXS-1', 'TXS-2'])).toBe(longContent);
    expect(calledSql).toContain('belong_entity_uuid IN');
    expect(calledParams).toContain('TXS-1');
  });

  it('S4-修复: belong 白名单无匹配 → 返回 null（deny-by-default）', () => {
    const fake = { queryAll: () => [] };  // SQL 带 IN 白名单，无匹配行
    expect(fetchLongText(fake, 123, ['OTHER'])).toBeNull();
  });

  it('S4-修复: 无白名单（户主最高权限）→ 不带 belong 过滤', () => {
    let calledSql = '';
    const fake = { queryAll: (sql: string) => { calledSql = sql; return [{ content: '长文'.repeat(500), belong_entity_uuid: null }]; } };
    expect(fetchLongText(fake, 123)).not.toBeNull();
    expect(calledSql).not.toContain('belong_entity_uuid IN');
  });
});
