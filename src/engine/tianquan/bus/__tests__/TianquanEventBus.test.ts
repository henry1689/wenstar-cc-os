/**
 * TianquanEventBus 单元测试
 *
 * 覆盖: 路由守卫 / emit/traceId 注入 / 开关控制
 */
import { describe, it, expect } from 'vitest';
import { EventBus } from '../../../bus/EventBus.js';
import { TianquanEventBus } from '../TianquanEventBus.js';

function makePerceptionEvent(targetModule: string): any {
  return {
    type: 'perception:raw' as const,
    traceId: `test_${Date.now()}`,
    timestamp: Date.now(),
    sessionId: 'test',
    sourceModule: 'yao_ling',
    targetModule,
    payload: { channel: 'text', content: {} },
  };
}

describe('TianquanEventBus', () => {
  it('应该注入 traceId 和 timestamp', async () => {
    const raw = new EventBus({ disableTrace: true });
    const bus = new TianquanEventBus(raw);
    const calls: any[] = [];
    raw.on('perception:raw', (e: any) => { calls.push(e); });
    const evt: any = { type: 'perception:raw', sessionId: 'test', sourceModule: 'yao_ling', targetModule: 'temporal', payload: {} };
    await bus.emit(evt);
    expect(calls.length).toBe(1);
    expect(calls[0].traceId).toBeDefined();
    expect(calls[0].timestamp).toBeDefined();
  });

  it('感知数据直连前额域应重路由至 temporal', async () => {
    const raw = new EventBus({ disableTrace: true });
    const bus = new TianquanEventBus(raw);
    const evt: any = {
      type: 'perception:raw', sessionId: 'test',
      sourceModule: 'yao_ling', targetModule: 'prefrontal',
      payload: {}, traceId: 't1', timestamp: Date.now(),
    };
    await bus.emit(evt);
    expect(evt.targetModule).toBe('temporal');
  });

  it('disabled 时不发布事件', async () => {
    const raw = new EventBus({ disableTrace: true });
    const bus = new TianquanEventBus(raw, { enabled: false });
    const calls: any[] = [];
    raw.on('perception:raw', (e: any) => { calls.push(e); });
    await bus.emit(makePerceptionEvent('temporal'));
    expect(calls.length).toBe(0);
  });

  it('应该支持订阅和取消订阅', async () => {
    const raw = new EventBus({ disableTrace: true });
    const bus = new TianquanEventBus(raw);
    const calls: any[] = [];
    const handler = (e: any) => { calls.push(e); };
    bus.on('perception:raw', handler);
    await bus.emit(makePerceptionEvent('temporal'));
    expect(calls.length).toBe(1);

    bus.off('perception:raw', handler);
    await bus.emit(makePerceptionEvent('temporal'));
    expect(calls.length).toBe(1); // 已取消，不新增
  });

  it('应该获取 handler 数量', () => {
    const raw = new EventBus({ disableTrace: true });
    const bus = new TianquanEventBus(raw);
    expect(bus.handlerCount()).toBe(0);
    bus.on('scene:snapshot_ready', () => {});
    expect(bus.handlerCount()).toBe(1);
  });
});
