/**
 * EventBus 单元测试
 *
 * 覆盖：订阅/优先级/短路/错误隔离/幂等去重
 */
import { describe, it, expect } from 'vitest';
import { EventBus } from '../EventBus.js';

function makeEvent(type: string, traceId: string) {
  return { type, traceId, timestamp: Date.now(), sessionId: 'test' } as any;
}

describe('EventBus', () => {
  it('应该支持订阅和发布', async () => {
    const bus = new EventBus({ disableTrace: true });
    const calls: string[] = [];
    bus.on('test:event', (e: any) => { calls.push(e.traceId); });
    await bus.emit(makeEvent('test:event', 't1'));
    expect(calls).toEqual(['t1']);
  });

  it('应该按优先级从小到大执行', async () => {
    const bus = new EventBus({ disableTrace: true });
    const order: number[] = [];
    bus.on('test:pri', () => { order.push(1); }, 300);
    bus.on('test:pri', () => { order.push(2); }, 100);
    bus.on('test:pri', () => { order.push(3); }, 200);
    await bus.emit(makeEvent('test:pri', 't2'));
    expect(order).toEqual([2, 3, 1]);
  });

  it('应该支持短路标记终止后续执行', async () => {
    const bus = new EventBus({ disableTrace: true });
    const calls: string[] = [];
    const blocker = (e: any) => { calls.push('block'); };
    blocker.skipRemaining = true;
    bus.on('test:skip', blocker, 100);
    bus.on('test:skip', () => { calls.push('after'); }, 200);
    await bus.emit(makeEvent('test:skip', 't3'));
    expect(calls).toEqual(['block']);
  });

  it('应该隔离单个 handler 的异常', async () => {
    const bus = new EventBus({ disableTrace: true });
    const calls: string[] = [];
    bus.on('test:err', () => { throw new Error('boom'); }, 100);
    bus.on('test:err', () => { calls.push('survived'); }, 200);
    await bus.emit(makeEvent('test:err', 't4'));
    expect(calls).toEqual(['survived']);
  });

  it('应该在 5 分钟内丢弃重复 traceId', async () => {
    const bus = new EventBus({ disableTrace: true });
    const calls: string[] = [];
    bus.on('user:input', (e: any) => { calls.push(e.traceId); });
    await bus.emit(makeEvent('user:input', 'dup1'));
    await bus.emit(makeEvent('user:input', 'dup1'));
    expect(calls).toEqual(['dup1']);
  });

  it('应该支持取消订阅', async () => {
    const bus = new EventBus({ disableTrace: true });
    const calls: string[] = [];
    const handler = (e: any) => { calls.push(e.traceId); };
    bus.on('test:off', handler);
    bus.off('test:off', handler);
    await bus.emit(makeEvent('test:off', 't5'));
    expect(calls).toEqual([]);
  });

  it('应该记录 trace 到 EventRecorder', async () => {
    const bus = new EventBus({ disableTrace: false });
    bus.on('test:rec', () => {}, 100);
    await bus.emit(makeEvent('test:rec', 't6'));
    const recorder = bus.getRecorder();
    expect(recorder).not.toBeNull();
    const snap = recorder!.getSnapshot('t6');
    expect(snap).not.toBeNull();
    expect(snap!.events.length).toBeGreaterThanOrEqual(1);
    expect(snap!.events[0].type).toBe('test:rec');
  });
});
