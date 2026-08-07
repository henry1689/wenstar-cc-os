/**
 * adapter.test.ts — 多路检索适配器层单元测试（Foundation V1.0）
 * ==============================================================
 * 覆盖：
 *   - 注册表 register/get/all
 *   - runAdapter：对"忘过滤"假适配器输出仍被 policeFilterHits 拦截（deny-by-default）
 *   - buildPolicePolicy 三态（会晤 deny / 户主有白名单 / 户主无白名单→enforce:false）
 *   - runAllAdapters 并发与按 route 分组
 *   - runAdapter 异常适配器不阻塞（返回空）
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AdapterRegistry, runAdapter, runAllAdapters, policeFilterHits, buildPolicePolicy,
  type RetrievalAdapter,
} from '../adapter.js';
import type { SearchHit, RetrievalContext } from '../types.js';

function makeHit(id: string, entityUuid: string | null = null, over: Partial<SearchHit> = {}): SearchHit {
  return {
    id, domain: 'memory', text: `text-${id}`, score: 1.0, route: 'keyword',
    entityUuid, calciumScore: 1, createdAt: '2026-08-01T00:00:00Z', ...over,
  };
}

function makeCtx(over: Partial<RetrievalContext> = {}): RetrievalContext {
  return {
    query: '测试',
    policy: { visibleUuids: new Set(), allowUnowned: true },
    entityUuids: [],
    mode: 'balanced',
    ...over,
  };
}

/** 假适配器：故意不做过滤（输出带他人 UUID），验证 runAdapter 兜底拦截 */
function makeLeakyAdapter(domain: 'memory' | 'knowledge' = 'memory', route: 'keyword' | 'knowledge' = 'keyword'): RetrievalAdapter {
  return {
    domain,
    routes: [route],
    async search() {
      return [
        makeHit('own', 'uuid-own'),
        makeHit('other', 'uuid-other'),   // 不在白名单 → 应被兜底拦截
        makeHit('unowned', null),          // 无归属 → 依 policy 决定
      ];
    },
  };
}

describe('AdapterRegistry', () => {
  it('register/get/all 正常工作', () => {
    const reg = new AdapterRegistry();
    const ad = makeLeakyAdapter();
    reg.register(ad);
    expect(reg.get('memory')).toBe(ad);
    expect(reg.all()).toHaveLength(1);
    expect(reg.get('knowledge')).toBeUndefined();
  });
});

describe('policeFilterHits', () => {
  it('deny-by-default：不在白名单拒绝', () => {
    const hits = [makeHit('a', 'uuid-a'), makeHit('b', 'uuid-b')];
    const filtered = policeFilterHits(hits, { visibleUuids: new Set(['uuid-a']), allowUnowned: false });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('a');
  });

  it('无归属记录：仅 allowUnowned=true 可见', () => {
    const hits = [makeHit('a', null)];
    expect(policeFilterHits(hits, { visibleUuids: new Set(), allowUnowned: false })).toHaveLength(0);
    expect(policeFilterHits(hits, { visibleUuids: new Set(), allowUnowned: true })).toHaveLength(1);
  });

  it('enforce:false 返回全部（离线探针）', () => {
    const hits = [makeHit('a', 'uuid-a'), makeHit('b', 'uuid-b')];
    expect(policeFilterHits(hits, { visibleUuids: new Set(), allowUnowned: false, enforce: false })).toHaveLength(2);
  });
});

describe('runAdapter', () => {
  it('漏过滤的适配器输出仍被兜底拦截（deny-by-default 守卫）', async () => {
    const ad = makeLeakyAdapter();
    const ctx = makeCtx({
      policy: { visibleUuids: new Set(['uuid-own']), allowUnowned: false },
    });
    const hits = await runAdapter(ad, ctx);
    // own 保留；other 拦截；unowned 因 allowUnowned:false 拦截
    expect(hits.map(h => h.id)).toEqual(['own']);
  });

  it('无归属记录在 allowUnowned=true 时保留', async () => {
    const ad = makeLeakyAdapter();
    const ctx = makeCtx({
      policy: { visibleUuids: new Set(['uuid-own']), allowUnowned: true },
    });
    const hits = await runAdapter(ad, ctx);
    expect(hits.map(h => h.id).sort()).toEqual(['own', 'unowned']);
  });

  it('timeMs 由 createdAt 补全', async () => {
    const ad = makeLeakyAdapter();
    const ctx = makeCtx({ policy: { visibleUuids: new Set(['uuid-own']), allowUnowned: true } });
    const hits = await runAdapter(ad, ctx);
    for (const h of hits) {
      expect(typeof h.timeMs).toBe('number');
      expect(h.timeMs).toBeGreaterThan(0);
    }
  });

  it('异常适配器返回空数组不抛出', async () => {
    const bad = {
      domain: 'knowledge' as const,
      routes: ['knowledge' as const],
      async search() { throw new Error('boom'); },
    };
    const hits = await runAdapter(bad, makeCtx());
    expect(hits).toEqual([]);
  });
});

describe('runAllAdapters', () => {
  it('并行执行 + 按 route 分组', async () => {
    const reg = new AdapterRegistry();
    const callOrder: string[] = [];
    reg.register({
      domain: 'memory',
      routes: ['keyword'],
      async search(ctx) {
        callOrder.push('memory-start');
        await new Promise(r => setTimeout(r, 20));
        callOrder.push('memory-end');
        return [makeHit('m1', 'uuid-a')];
      },
    });
    reg.register({
      domain: 'knowledge',
      routes: ['knowledge'],
      async search(ctx) {
        callOrder.push('kb-start');
        await new Promise(r => setTimeout(r, 5));
        callOrder.push('kb-end');
        return [makeHit('k1', null, { domain: 'knowledge', route: 'knowledge' })];
      },
    });
    const ctx = makeCtx({ policy: { visibleUuids: new Set(['uuid-a']), allowUnowned: true } });
    const lists = await runAllAdapters(reg, ctx);

    // 分组：keyword 组含 m1，knowledge 组含 k1
    const kw = lists.find(l => l.route === 'keyword')!;
    const kb = lists.find(l => l.route === 'knowledge')!;
    expect(kw.hits.map(h => h.id)).toContain('m1');
    expect(kb.hits.map(h => h.id)).toContain('k1');

    // 并行性：kb-end 先于 memory-end（kb 只等 5ms），但 memory 先启动
    // 证明并发执行而非串行
    const kbEndIdx = callOrder.indexOf('kb-end');
    const memEndIdx = callOrder.indexOf('memory-end');
    expect(kbEndIdx).toBeLessThan(memEndIdx);
  });

  it('空注册表返回空', async () => {
    const lists = await runAllAdapters(new AdapterRegistry(), makeCtx());
    expect(lists).toEqual([]);
  });
});

describe('buildPolicePolicy', () => {
  it('会晤模式：deny-by-default（allowUnowned=false）', () => {
    const p = buildPolicePolicy({
      gatekeeper: { getEffectiveWhitelist: () => new Set(['uuid-a']) },
      activeEntityUuids: ['uuid-b'],
      meetingMode: true,
    });
    expect(p.allowUnowned).toBe(false);
    expect(p.visibleUuids.has('uuid-a')).toBe(true);
    expect(p.visibleUuids.has('uuid-b')).toBe(true);
  });

  it('户主钥匙 + 有白名单：allowUnowned=true', () => {
    const p = buildPolicePolicy({
      gatekeeper: { getEffectiveWhitelist: () => new Set(['uuid-a']) },
      meetingMode: false,
    });
    expect(p.allowUnowned).toBe(true);
    expect(p.enforce).not.toBe(false);
  });

  it('户主钥匙 + 无白名单：enforce:false（最高权限）', () => {
    const p = buildPolicePolicy({ meetingMode: false });
    expect(p.enforce).toBe(false);
    expect(p.allowUnowned).toBe(true);
  });
});
