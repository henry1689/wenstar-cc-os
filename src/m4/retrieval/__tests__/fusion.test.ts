/**
 * fusion.test.ts — 多路检索统一融合阶段单元测试（Foundation V1.0）
 * ==============================================================
 * 覆盖：
 *   - 空输入 / 单路排序
 *   - 跨域去重（同 dedupeKey 折叠）
 *   - 多路命中 bonus（≥2 路命中 ×1.2）
 *   - 时间近因因子（注入固定 nowMs 验证 7 天线性衰减）
 *   - MMR 用真实 RRF+近因分（修复 V13 合成分数 `1.0-i*0.02` 的回归守卫）
 *   - topK 截断
 *   - 新增域权重参与融合
 */

import { describe, it, expect } from 'vitest';
import { fuseHits, recencyRatio, FOUNDATION_DEFAULT_WEIGHTS } from '../fusion.js';
import type { SearchHit, RouteHitList } from '../types.js';

const NOW = Date.UTC(2026, 7, 7); // 2026-08-07 固定 now

function makeHit(id: string, over: Partial<SearchHit> = {}): SearchHit {
  return {
    id,
    domain: 'memory',
    text: `text-${id}`,
    score: 1.0,
    route: 'keyword',
    entityUuid: null,
    calciumScore: 1,
    createdAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function makeRoute(route: RouteHitList['route'], hits: SearchHit[]): RouteHitList {
  return { route, hits };
}

describe('recencyRatio', () => {

  it('今天返回 1.0', () => {
    const hit = makeHit('A', { timeMs: NOW });
    expect(recencyRatio(hit, NOW)).toBe(1.0);
  });

  it('3.5 天前返回约 0.5（7 天线性衰减）', () => {
    const hit = makeHit('A', { timeMs: NOW - 3.5 * 86400000 });
    const r = recencyRatio(hit, NOW);
    expect(r).toBeCloseTo(0.5, 5);
  });

  it('7 天前返回 0', () => {
    const hit = makeHit('A', { timeMs: NOW - 7 * 86400000 });
    expect(recencyRatio(hit, NOW)).toBe(0);
  });

  it('8 天前（超窗）返回 0', () => {
    const hit = makeHit('A', { timeMs: NOW - 8 * 86400000 });
    expect(recencyRatio(hit, NOW)).toBe(0);
  });

  it('未来时间戳返回 1.0（微弱加分上限，对齐 P3-B2 语义）', () => {
    const hit = makeHit('A', { timeMs: NOW + 86400000 });
    expect(recencyRatio(hit, NOW)).toBe(1.0);
  });

  it('无时间戳返回 0', () => {
    const hit = makeHit('A', { createdAt: '' });
    expect(recencyRatio(hit, NOW)).toBe(0);
  });
});

describe('fuseHits', () => {

  it('空输入返回空结果', () => {
    const r = fuseHits([], { nowMs: NOW });
    expect(r.hits).toEqual([]);
    expect(r.scoreMap.size).toBe(0);
  });

  it('空路（无命中）被跳过', () => {
    const r = fuseHits([makeRoute('keyword', [])], { nowMs: NOW });
    expect(r.hits).toEqual([]);
  });

  it('单路多条：排名越靠前融合分越高', () => {
    const hits = [makeHit('A', { score: 1.0 }), makeHit('B', { score: 0.9 }), makeHit('C', { score: 0.8 })];
    const r = fuseHits([makeRoute('keyword', hits)], { nowMs: NOW });
    expect(r.hits).toHaveLength(3);
    expect(r.hits[0].id).toBe('A');
    expect(r.hits[1].id).toBe('B');
    expect(r.hits[2].id).toBe('C');
    const sA = r.scoreMap.get('memory:A')!;
    const sB = r.scoreMap.get('memory:B')!;
    const sC = r.scoreMap.get('memory:C')!;
    expect(sA).toBeGreaterThan(sB);
    expect(sB).toBeGreaterThan(sC);
  });

  it('跨域去重：同 dedupeKey 折叠为一条', () => {
    // 黑钻 source_id=123 与金库 id=123 同记录 → 显式 dedupeKey 折叠
    const bd = makeHit('123', { domain: 'black_diamond', route: 'diamond', dedupeKey: 'merge:123' });
    const mem = makeHit('123', { domain: 'memory', route: 'keyword', dedupeKey: 'merge:123' });
    const r = fuseHits([
      makeRoute('diamond', [bd]),
      makeRoute('keyword', [mem]),
    ], { nowMs: NOW });
    // 折叠成 1 条，且 sourceCount=2（两路命中）
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].id).toBe('123');
  });

  it('多路命中 bonus：两路同时命中排在单路命中前（相近 RRF 时）', () => {
    // 构造：X 被两路命中（keyword + locus），Y 只被 keyword 命中
    // 由于多路命中 ×1.2，X 的融合分应显著高于同位置的 Y
    const hitX1 = makeHit('X', { route: 'keyword' });
    const hitX2 = makeHit('X', { route: 'locus', score: 0.5 }); // 同一记录在第二路的条目
    const hitY = makeHit('Y', { route: 'keyword', score: 0.9 });
    const r = fuseHits([
      makeRoute('keyword', [hitX1, hitY]),
      makeRoute('locus', [hitX2]),
    ], { nowMs: NOW });
    const scoreX = r.scoreMap.get('memory:X')!;
    const scoreY = r.scoreMap.get('memory:Y')!;
    expect(scoreX).toBeGreaterThan(scoreY);
  });

  it('近因因子叠加：同排名时近期命中融合分更高', () => {
    const recent = makeHit('R', { timeMs: NOW - 1 * 86400000 });   // 1 天前
    const old = makeHit('O', { timeMs: NOW - 30 * 86400000 });     // 30 天前
    // 都放 keyword 路，recent 第一、old 第二；近因因子给 recent 加分，更拉大差距
    const r = fuseHits([makeRoute('keyword', [recent, old])], { nowMs: NOW });
    const sR = r.scoreMap.get('memory:R')!;
    const sO = r.scoreMap.get('memory:O')!;
    expect(sR).toBeGreaterThan(sO);
  });

  it('近因因子用真实分：两路分差大时高分不被低分挤掉（MMR 真实分守卫）', () => {
    // 构造：A 双路命中（分高），B 单路命中排第一
    // 用真实 RRF 分做 MMR 相关性项 → A 应保留且排序靠前
    const hitA1 = makeHit('A', { route: 'keyword' });
    const hitA2 = makeHit('A', { route: 'entity', score: 0.5 });
    const hitB = makeHit('B', { route: 'keyword' });
    const r = fuseHits([
      makeRoute('keyword', [hitA1, hitB]),
      makeRoute('entity', [hitA2]),
    ], { nowMs: NOW, topK: 2 });
    const scoreA = r.scoreMap.get('memory:A')!;
    const scoreB = r.scoreMap.get('memory:B')!;
    expect(scoreA).toBeGreaterThan(scoreB);
    expect(r.hits[0].id).toBe('A');
  });

  it('topK 截断', () => {
    const hits = [
      makeHit('A'), makeHit('B'), makeHit('C'), makeHit('D'), makeHit('E'),
    ];
    const r = fuseHits([makeRoute('keyword', hits)], { nowMs: NOW, topK: 3 });
    expect(r.hits).toHaveLength(3);
  });

  it('新增域权重参与融合', () => {
    // knowledge 域权重 0.15 > conversation 域权重 0.05 → 同排名时 knowledge 融合分更高
    const kb = makeHit('K1', { domain: 'knowledge', route: 'knowledge', score: 1.0 });
    const conv = makeHit('C1', { domain: 'conversation', route: 'conversation', score: 1.0 });
    const r = fuseHits([
      makeRoute('knowledge', [kb]),
      makeRoute('conversation', [conv]),
    ], { nowMs: NOW });
    const sKb = r.scoreMap.get('knowledge:K1')!;
    const sConv = r.scoreMap.get('conversation:C1')!;
    expect(sKb).toBeGreaterThan(sConv);
    expect(FOUNDATION_DEFAULT_WEIGHTS.knowledge).toBeGreaterThan(FOUNDATION_DEFAULT_WEIGHTS.conversation);
  });

  it('自定义权重覆盖默认权重', () => {
    const hits = [makeHit('A', { route: 'keyword' })];
    const rDefault = fuseHits([makeRoute('keyword', hits)], { nowMs: NOW });
    const rCustom = fuseHits([makeRoute('keyword', hits)], { nowMs: NOW, weights: { keyword: 0.99 } });
    const sDefault = rDefault.scoreMap.get('memory:A')!;
    const sCustom = rCustom.scoreMap.get('memory:A')!;
    expect(sCustom).toBeGreaterThan(sDefault);
  });
});
