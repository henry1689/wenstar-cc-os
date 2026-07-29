/**
 * MMRDiversifier.test.ts — MMR 多样性去重模块单元测试
 */

import { describe, it, expect } from 'vitest';
import { mmrDiversify, jaccardSimilarity, getMMRConfig, DEFAULT_MMR_CONFIG } from '../MMRDiversifier.js';
import type { RankedItem, MMRSelectedItem } from '../types/retrieval.js';

function makeItem(id: string, text: string, source: RankedItem['source'] = 'keyword'): RankedItem {
  return { id, text, score: 1.0, source, entityUuid: null, calciumScore: 1, createdAt: '2026-01-01' };
}

describe('jaccardSimilarity', () => {
  it('完全相同的文本返回近 1', () => {
    const sim = jaccardSimilarity('今天天气很好', '今天天气很好');
    expect(sim).toBeCloseTo(1.0, 1);
  });

  it('完全不同的文本返回接近 0', () => {
    const sim = jaccardSimilarity('今天天气很好', '昨天买了西瓜');
    expect(sim).toBeLessThan(0.3);
  });

  it('空字符串返回 0', () => {
    expect(jaccardSimilarity('', 'hello')).toBe(0);
    expect(jaccardSimilarity('hello', '')).toBe(0);
  });

  it('单个字符文本正常处理', () => {
    // 单字符无法形成 2-gram
    expect(jaccardSimilarity('我', '你')).toBe(0);
  });
});

describe('mmrDiversify', () => {
  it('空候选列表返回空', () => {
    expect(mmrDiversify([], new Map())).toEqual([]);
  });

  it('单条候选返回单条', () => {
    const item = makeItem('A', '今天天气很好');
    const result = mmrDiversify([item], new Map([['A', 0.9]]));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
  });

  it('λ=1.0 退化回纯相关性排序', () => {
    const items = [
      makeItem('A', '文本A内容'),
      makeItem('B', '文本A内容'),  // 与 A 高度重复
      makeItem('C', '完全不同的话题'),
    ];
    const scores = new Map([['A', 0.9], ['B', 0.5], ['C', 0.3]]);
    const result = mmrDiversify(items, scores, { lambda: 1.0, topK: 2 });
    // λ=1.0 时不考虑多样性 → 按相关性排序
    expect(result[0].id).toBe('A');
    expect(result[1].id).toBe('B');
  });

  it('λ=0.7 时去冗：重复文本不同时出现', () => {
    const items = [
      makeItem('A', '妈妈身体不好我很担心她'),
      makeItem('B', '妈妈身体不好我特别担心'),
      makeItem('C', '今天天气真好'),
    ];
    const scores = new Map([['A', 0.9], ['B', 0.88], ['C', 0.7]]);
    const result = mmrDiversify(items, scores, { lambda: 0.7, topK: 2 });
    // A 和 B 高度重复，B 不应该和 A 同时出现
    expect(result[0].id).toBe('A');
    expect(result[1].id).toBe('C'); // C 被 MMR 选中而非 B
  });

  it('topK 截断生效', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`M${i}`, `文本${i}`));
    const scores = new Map(items.map(it => [it.id, 1.0 - Number(it.id.slice(1)) * 0.1]));
    const result = mmrDiversify(items, scores, { lambda: 0.7, topK: 3 });
    expect(result).toHaveLength(3);
  });

  it('全部相同文本时只返回 topK 条而非爆炸', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeItem(`M${i}`, '今天天气很好'));
    const scores = new Map(items.map((it, i) => [it.id, 1.0 - i * 0.1]));
    const result = mmrDiversify(items, scores, { lambda: 0.7, topK: 3 });
    expect(result).toHaveLength(3);
  });

  it('每个结果都有 mmrScore', () => {
    const items = [makeItem('A', 'text A'), makeItem('B', 'text B')];
    const result = mmrDiversify(items, new Map([['A', 1.0], ['B', 0.5]]));
    for (const r of result) {
      expect(typeof r.mmrScore).toBe('number');
    }
  });
});

describe('getMMRConfig', () => {
  it('introvert 模式相关性权重更高', () => {
    const cfg = getMMRConfig('introvert');
    expect(cfg.lambda).toBe(0.8);
    expect(cfg.topK).toBe(5);
  });

  it('full 模式多样性权重更高', () => {
    const cfg = getMMRConfig('full');
    expect(cfg.lambda).toBe(0.5);
    expect(cfg.topK).toBe(15);
  });

  it('balanced 模式为默认值', () => {
    const cfg = getMMRConfig('balanced');
    expect(cfg.lambda).toBe(DEFAULT_MMR_CONFIG.lambda);
    expect(cfg.topK).toBe(DEFAULT_MMR_CONFIG.topK);
  });
});
