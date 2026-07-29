/**
 * RRFusion.test.ts — Weighted RRF 融合模块单元测试
 */

import { describe, it, expect } from 'vitest';
import { weightedRRF, buildIdToItem, DEFAULT_RRF_CONFIG } from '../RRFFusion.js';
import type { RankedList, RankedItem } from '../types/retrieval.js';

function makeItem(id: string, score: number, source: RankedItem['source'] = 'keyword'): RankedItem {
  return { id, text: `text-${id}`, score, source, entityUuid: null, calciumScore: 1, createdAt: '2026-01-01' };
}

function makeList(source: RankedItem['source'], items: RankedItem[]): RankedList {
  return { source, items };
}

describe('weightedRRF', () => {

  it('空列表返回空结果', () => {
    const result = weightedRRF([]);
    expect(result).toEqual([]);
  });

  it('单路单条正确融合', () => {
    const list = makeList('keyword', [makeItem('A', 1.0)]);
    const result = weightedRRF([list]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
    expect(result[0].sourceCount).toBe(1);
  });

  it('单路多条：排名越靠前 RRF 越高', () => {
    const items = [makeItem('A', 1.0), makeItem('B', 0.9), makeItem('C', 0.8)];
    const result = weightedRRF([makeList('keyword', items)]);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('A');
    expect(result[1].id).toBe('B');
    expect(result[2].id).toBe('C');
    // RRF scores 应该递减
    expect(result[0].rrfScore).toBeGreaterThan(result[1].rrfScore);
    expect(result[1].rrfScore).toBeGreaterThan(result[2].rrfScore);
  });

  it('两路融合：去重 + 得分累加', () => {
    const listA = makeList('keyword', [makeItem('X', 1.0, 'keyword'), makeItem('Y', 0.9, 'keyword')]);
    const listB = makeList('spine', [makeItem('X', 0.95, 'spine'), makeItem('Z', 0.85, 'spine')]);
    // X 出现在两路 → sourceCount=2, bonus×1.2
    const result = weightedRRF([listA, listB]);
    expect(result.map(r => r.id)).toContain('X');
    expect(result.map(r => r.id)).toContain('Y');
    expect(result.map(r => r.id)).toContain('Z');
    // X 应该排第一（多路命中 bonus）
    const xResult = result.find(r => r.id === 'X')!;
    expect(xResult.sourceCount).toBe(2);
    expect(result[0].id).toBe('X');
  });

  it('多路命中 bonus：≥2 路命中时 RRF×1.2', () => {
    const itemsA = [makeItem('M', 0.9, 'keyword')];
    const itemsB = [makeItem('M', 0.9, 'spine')];
    const itemsC = [makeItem('M', 0.9, 'entity')];
    const resultWithBonus = weightedRRF([
      makeList('keyword', itemsA), makeList('spine', itemsB), makeList('entity', itemsC),
    ]);
    // 单路（无 bonus 对比）
    const resultSingle = weightedRRF([makeList('keyword', itemsA)]);

    // 三路命中的 RRF 应该 > 单路的 3 倍（因为有 bonus）
    expect(resultWithBonus[0].rrfScore).toBeGreaterThan(resultSingle[0].rrfScore * 3);
  });

  it('权重为零的路不参与融合', () => {
    const listA = makeList('keyword', [makeItem('P', 1.0, 'keyword')]);
    const listB = makeList('spine', [makeItem('Q', 1.0, 'spine')]);
    const config = { ...DEFAULT_RRF_CONFIG, weights: { ...DEFAULT_RRF_CONFIG.weights, spine: 0 } };
    const result = weightedRRF([listA, listB], config);
    // Q 不应该出现（spine 路权重为 0）
    expect(result.find(r => r.id === 'Q')).toBeUndefined();
  });

  it('topK 截断生效', () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem(`M${i}`, 1.0 - i * 0.05));
    const result = weightedRRF([makeList('keyword', items)], DEFAULT_RRF_CONFIG, 5);
    expect(result).toHaveLength(5);
  });

  it('五路全部参与融合', () => {
    const sources: RankedItem['source'][] = ['emotion', 'keyword', 'spine', 'locus', 'entity'];
    const lists = sources.map(s => makeList(s, [makeItem(`A-${s}`, 1.0, s)]));
    const result = weightedRRF(lists);
    expect(result).toHaveLength(5);
  });
});

describe('buildIdToItem', () => {
  it('空列表返回空 Map', () => {
    expect(buildIdToItem([]).size).toBe(0);
  });

  it('正确建立 id → item 映射', () => {
    const items = [makeItem('A', 1.0), makeItem('B', 0.5)];
    const map = buildIdToItem([makeList('keyword', items)]);
    expect(map.size).toBe(2);
    expect(map.get('A')!.text).toBe('text-A');
  });

  it('多路重复 ID 保留第一个', () => {
    const listA = makeList('keyword', [makeItem('DUP', 1.0, 'keyword')]);
    const listB = makeList('spine', [makeItem('DUP', 0.5, 'spine')]);
    const map = buildIdToItem([listA, listB]);
    expect(map.get('DUP')!.source).toBe('keyword'); // 第一个遇到的是 keyword
  });
});
