/**
 * EventBus — 事件总线
 *
 * S1 核心基建，负责全链路事件流转。
 *
 * 特性：
 * - 优先级排序：按 priority 值从小到大串行执行
 * - 短路机制：handler.skipRemaining = true 终止后续执行
 * - 错误隔离：单个 handler 异常不影响其他 handler
 * - traceId 幂等：5 分钟内重复 traceId 丢弃
 * - Trace 录制：集成 EventRecorder
 */
import type { EventHandler } from '../types.js';
import type { IEventRecorder } from '../types.js';
import { EventRecorder } from './EventRecorder.js';

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 分钟幂等窗口

interface HandlerEntry<T extends { type: string; traceId: string }> {
  handler: EventHandler<T>;
  priority: number;
}

export class EventBus {
  /** 事件类型 → HandlerEntry[]（按 priority 有序） */
  private handlers = new Map<string, HandlerEntry<any>[]>();
  /** traceId 去重缓存 */
  private dedupCache = new Map<string, number>();
  /** Trace 录制器 */
  private recorder: IEventRecorder | null = null;

  constructor(opts?: { disableTrace?: boolean }) {
    if (!opts?.disableTrace) {
      this.recorder = new EventRecorder();
    }
  }

  /**
   * 订阅事件
   * @param type 事件类型
   * @param handler 处理函数
   * @param priority 优先级（值越小越优先，默认 500）
   */
  on<T extends { type: string; traceId: string }>(
    type: string,
    handler: EventHandler<T>,
    priority: number = 500,
  ): void {
    let entries = this.handlers.get(type);
    if (!entries) {
      entries = [];
      this.handlers.set(type, entries);
    }
    entries.push({ handler, priority });
    // 按 priority 排序，保证 emit 时顺序执行
    entries.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 发布事件
   * 按优先级串行执行，支持短路
   */
  async emit<T extends { type: string; traceId: string; timestamp: number }>(event: T): Promise<void> {
    // 幂等校验：5 分钟内重复 traceId 丢弃
    if (event.type === 'user:input') {
      const now = Date.now();
      const lastSeen = this.dedupCache.get(event.traceId);
      if (lastSeen && (now - lastSeen) < DEDUP_WINDOW_MS) {
        console.log(`[EventBus] 幂等丢弃: traceId=${event.traceId}`);
        return;
      }
      this.dedupCache.set(event.traceId, now);
      // 清理过期缓存
      if (this.dedupCache.size > 1000) {
        const cutoff = now - DEDUP_WINDOW_MS;
        this.dedupCache.forEach((ts, tid) => {
          if (ts < cutoff) this.dedupCache.delete(tid);
        });
      }
    }

    const entries = this.handlers.get(event.type);
    if (!entries || entries.length === 0) {
      console.log(`[EventBus] 未找到处理器: type=${event.type}, traceId=${event.traceId}`);
      return;
    }

    for (const entry of entries) {
      const start = Date.now();
      try {
        await entry.handler(event);
        const elapsed = Date.now() - start;
        console.log(`[T:${event.traceId}] ${event.type} → priority=${entry.priority} (${elapsed}ms)`);
        this.recorder?.record(event, `pri=${entry.priority}`, elapsed);

        // 短路检查
        if (entry.handler.skipRemaining) {
          console.log(`[T:${event.traceId}] 短路: type=${event.type}, priority=${entry.priority}`);
          break;
        }
      } catch (err) {
        const elapsed = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[T:${event.traceId}] 错误: type=${event.type}, priority=${entry.priority}: ${msg}`);
        this.recorder?.record(event, `pri=${entry.priority}`, elapsed, msg);
        // 错误隔离：不阻塞其他 handler
      }
    }
  }

  /**
   * 取消订阅
   */
  off<T extends { type: string; traceId: string }>(type: string, handler: EventHandler<T>): void {
    const entries = this.handlers.get(type);
    if (!entries) return;
    const idx = entries.findIndex(e => e.handler === handler);
    if (idx >= 0) entries.splice(idx, 1);
    if (entries.length === 0) this.handlers.delete(type);
  }

  /** 获取 Trace 录制器实例 */
  getRecorder(): IEventRecorder | null {
    return this.recorder;
  }

  /** 获取当前处理器数量（用于调试） */
  handlerCount(): number {
    let count = 0;
    this.handlers.forEach(entries => { count += entries.length; });
    return count;
  }
}
