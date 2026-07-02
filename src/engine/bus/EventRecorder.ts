/**
 * EventRecorder — Trace 快照录制器
 *
 * EventBus 中间件，录制全量事件流。
 * - 每轮对话按序记录所有事件
 * - 记录耗时、模块、错误信息
 * - 支持快照导出和自动清理
 */
import type { IEventRecorder, TraceSnapshot } from '../types.js';

const MAX_SNAPSHOTS = 100;       // 最大快照数
const MAX_EVENTS_PER_TRACE = 50; // 单轮最多事件数

export class EventRecorder implements IEventRecorder {
  private snapshots = new Map<string, TraceSnapshot>();

  record(
    event: { type: string; traceId: string; timestamp?: number },
    module: string,
    durationMs: number,
    error?: string,
  ): void {
    const tid = event.traceId;
    let snap = this.snapshots.get(tid);
    if (!snap) {
      snap = { traceId: tid, events: [], totalDurationMs: 0, completed: false };
      this.snapshots.set(tid, snap);
    }
    if (snap.events.length >= MAX_EVENTS_PER_TRACE) return;

    snap.events.push({
      type: event.type,
      module,
      durationMs,
      error,
      timestamp: event.timestamp ?? Date.now(),
    });
    snap.totalDurationMs += durationMs;
  }

  getSnapshot(traceId: string): TraceSnapshot | null {
    return this.snapshots.get(traceId) ?? null;
  }

  getAllSnapshots(): TraceSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  clear(traceId: string): void {
    this.snapshots.delete(traceId);
  }

  /** 标记 trace 完成 */
  complete(traceId: string): void {
    const snap = this.snapshots.get(traceId);
    if (snap) snap.completed = true;
  }

  /** 清理过期快照（保留最近 100 条） */
  prune(): void {
    if (this.snapshots.size <= MAX_SNAPSHOTS) return;
    const entries = Array.from(this.snapshots.entries())
      .sort((a, b) => {
        const aLast = a[1].events[a[1].events.length - 1]?.timestamp ?? 0;
        const bLast = b[1].events[b[1].events.length - 1]?.timestamp ?? 0;
        return bLast - aLast;
      });
    const toDelete = entries.slice(MAX_SNAPSHOTS);
    for (const [tid] of toDelete) {
      this.snapshots.delete(tid);
    }
  }
}
