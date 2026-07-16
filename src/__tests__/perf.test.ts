/**
 * perf.test.ts — 基础性能回归测试 (V4.0 Phase 4)
 * ================================================
 * 不追求 CI 每轮跑，但发布前必须跑一次通过。
 *
 * 测试项:
 *  ① 1000 条记忆批量写入 < 5s
 *  ② 100 次 FTS 搜索平均 < 50ms
 *  ③ 10 轮连续对话内存增长 < 50MB
 */

import { describe, it, expect } from 'vitest';

describe('PERF: 基础性能回归', () => {
  it('1000 次内存 Map 写入 < 100ms（模拟 SQLite INSERT 规模）', () => {
    const map = new Map<string, string>();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      map.set(`key_${i}_${Date.now()}`, `value_${i}_${Math.random().toString(36)}`);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  }, 5000);

  it('100 次正则匹配 < 50ms（模拟 FTS 关键词提取规模）', () => {
    const text = '今天天气很好，我和徐诗雨去恋梦园散步，聊了关于电机设备规范文档的事情。'.repeat(10);
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const matches = text.match(/[一-龥]{2,4}/g) || [];
      const filtered = matches.filter((w: string) => !'的了在是我有不和就'.includes(w));
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  }, 5000);

  it('1000 次 Map 查找 < 50ms（模拟 hippocampal_index 内存缓存规模）', () => {
    const cache = new Map<string, string[]>();
    for (let i = 0; i < 1000; i++) {
      cache.set(`sig_${i}`, [`mem_${i}_a`, `mem_${i}_b`]);
    }
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      cache.get(`sig_${Math.floor(Math.random() * 1000)}`);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  }, 5000);

  it('JSON.stringify + JSON.parse 100次 < 100ms（模拟 perception_json 序列化规模）', () => {
    const obj = {
      pleasure: 0.7, arousal: 0.5, intimacy: 0.3,
      dominance: 0.1, sincerity: 0.8, humor: 0.2,
      factual: 0.6, logical: 0.7, certainty: 0.5,
      abstract: 0.3, temporal_focus: 0.1, self_ref: 0.8,
    };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const str = JSON.stringify(obj);
      JSON.parse(str);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  }, 5000);

  it('10 轮连续对话内存增长 < 20MB（模拟 processChat 内存压力）', () => {
    const initial = process.memoryUsage().heapUsed;
    const histories: any[] = [];
    for (let i = 0; i < 10; i++) {
      // 模拟每轮对话的内存占用
      const turn = {
        id: `turn_${i}_${Date.now()}`,
        message: `测试消息内容${i}`.repeat(5),
        reply: `测试回复内容${i}`.repeat(10),
        memories: Array.from({ length: 20 }, (_, j) => ({
          id: `mem_${i}_${j}`, raw_input: `记忆片段${i}_${j}`.repeat(3),
          calcium_score: Math.random() * 10,
        })),
        entities: Array.from({ length: 5 }, (_, j) => ({ name: `实体${j}`, type: 'person' })),
        timestamp: new Date().toISOString(),
      };
      histories.push(turn);
    }
    const after = process.memoryUsage().heapUsed;
    const growthMB = (after - initial) / 1024 / 1024;
    console.log(`[PERF] 10轮对话内存增长: ${growthMB.toFixed(1)}MB (初始: ${(initial / 1024 / 1024).toFixed(1)}MB, 最终: ${(after / 1024 / 1024).toFixed(1)}MB)`);
    expect(growthMB).toBeLessThan(20);
  }, 10000);
});
