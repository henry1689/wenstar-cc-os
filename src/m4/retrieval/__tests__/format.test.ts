/**
 * format.test.ts — 检索命中格式化单元测试（Foundation V1.0）
 * ==========================================================
 * 覆盖：
 *   - formatHit 各域前缀复刻（📖/💎/【金库记忆】/【作品】/💭/👤）
 *   - hitToMemoryItem 到 MemoryInjector.source 映射
 */

import { describe, it, expect } from 'vitest';
import { formatHit, hitToMemorySource } from '../format.js';
import type { SearchHit } from '../types.js';

function makeHit(domain: SearchHit['domain'], over: Partial<SearchHit> = {}): SearchHit {
  return {
    id: '1', domain, text: '内容', score: 1, route: 'default',
    entityUuid: null, createdAt: '2026-08-01', ...over,
  };
}

describe('formatHit — 前缀复刻', () => {
  it('knowledge → 📖 text（text 已含 "title: content"，对齐 KnowledgeAdapter 输出）', () => {
    const hit = makeHit('knowledge', { text: '设定集: 内容' });
    expect(formatHit(hit)).toBe('📖 设定集: 内容');
  });

  it('black_diamond → 💎 content（MemoryInjector isDiamond 触发）', () => {
    const hit = makeHit('black_diamond');
    expect(formatHit(hit)).toBe('💎 内容');
  });

  it('vault → 【金库记忆】content', () => {
    expect(formatHit(makeHit('vault'))).toBe('【金库记忆】内容');
  });

  it('work → 【作品】《title》(type)\n full_text', () => {
    const hit = makeHit('work', { payload: { title: '星落之城', work_type: 'novel', full_text: '第一篇章全文' } });
    const out = formatHit(hit);
    expect(out).toContain('【作品】《星落之城》(novel)');
    expect(out).toContain('第一篇章全文');
  });

  it('work 无 full_text → 回落 text', () => {
    const hit = makeHit('work', { text: '《星落之城》 摘要' });
    expect(formatHit(hit)).toContain('《星落之城》 摘要');
  });

  it('memory 钙化≥3 → 【💎重要记忆】', () => {
    expect(formatHit(makeHit('memory', { calciumLevel: 3 }))).toBe('【💎重要记忆】内容');
  });

  it('memory 钙化≥2 → 【📌重要记忆】', () => {
    expect(formatHit(makeHit('memory', { calciumLevel: 2 }))).toBe('【📌重要记忆】内容');
  });

  it('memory 普通 → 💭 content', () => {
    expect(formatHit(makeHit('memory'))).toBe('💭 内容');
  });

  it('conversation → 💭 content', () => {
    expect(formatHit(makeHit('conversation'))).toBe('💭 内容');
  });

  it('note → 💭 content', () => {
    expect(formatHit(makeHit('note'))).toBe('💭 内容');
  });

  it('family_graph → 👤 content', () => {
    expect(formatHit(makeHit('family_graph'))).toBe('👤 内容');
  });
});

describe('hitToMemorySource — MemoryInjector.source 映射', () => {
  it('black_diamond → diamond', () => {
    expect(hitToMemorySource(makeHit('black_diamond'))).toBe('diamond');
  });
  it('vault → vault', () => {
    expect(hitToMemorySource(makeHit('vault'))).toBe('vault');
  });
  it('knowledge → knowledge', () => {
    expect(hitToMemorySource(makeHit('knowledge'))).toBe('knowledge');
  });
  it('work → work', () => {
    expect(hitToMemorySource(makeHit('work'))).toBe('work');
  });
  it('memory/conversation/note/family_graph → sand', () => {
    expect(hitToMemorySource(makeHit('memory'))).toBe('sand');
    expect(hitToMemorySource(makeHit('conversation'))).toBe('sand');
    expect(hitToMemorySource(makeHit('note'))).toBe('sand');
    expect(hitToMemorySource(makeHit('family_graph'))).toBe('sand');
  });
});
