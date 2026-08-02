// ============================================================
// AUDIT-B — AuditSink 审计接收器
// ============================================================
// 审计接收器接口 + 两个实现：
//   - NoopAuditSink：丢弃所有事件。默认，零副作用。
//   - InMemoryAuditSink：内存存储。测试和开发用。
// ============================================================

import type { AuditEvent } from './AuditEvent.js';

// ── 接口 ──

/**
 * AuditSink — 审计事件接收器接口。
 *
 * 所有审计事件都通过 record() 方法写入。
 * 实现可以是 Noop（生产默认）、InMemory（测试/开发）、
 * 或未来基于文件的实现（AUDIT-C）。
 */
export interface AuditSink {
  /** 记录单个审计事件 */
  record(event: AuditEvent): void;

  /** 返回已记录事件数量 */
  readonly count: number;
}

// ── NoopAuditSink ──

/**
 * NoopAuditSink — 无操作审计接收器。
 *
 * 丢弃所有事件。这是生产环境的默认接收器，
 * 在 AUDIT-C（文件/DB 持久化）就绪之前使用。
 *
 * 设计：
 *   - 零副作用
 *   - 零内存分配
 *   - record() 从不 throw
 */
export class NoopAuditSink implements AuditSink {
  get count(): number {
    return 0;
  }

  record(_event: AuditEvent): void {
    // 有意不执行任何操作 —— 在生产持久化就绪之前使用
  }
}

// ── InMemoryAuditSink ──

/**
 * InMemoryAuditSink — 内存审计接收器。
 *
 * 将事件存储在数组中。用于测试和开发。
 * 不适合生产环境（无界内存增长）。
 *
 * 设计：
 *   - record() 存储事件的浅拷贝
 *   - getEvents() 返回所有事件的副本
 *   - clear() 清空存储
 *   - count 返回事件数量
 */
export class InMemoryAuditSink implements AuditSink {
  private _events: AuditEvent[] = [];

  get count(): number {
    return this._events.length;
  }

  record(event: AuditEvent): void {
    // 存储浅拷贝以保留事件数据
    this._events.push({ ...event } as AuditEvent);
  }

  /** 返回所有已记录事件的副本 */
  getEvents(): ReadonlyArray<AuditEvent> {
    return [...this._events];
  }

  /** 清空所有已记录的事件 */
  clear(): void {
    this._events = [];
  }
}

// ── 单例 ──

/** 共享 NoopAuditSink 实例 */
export const NOOP_AUDIT_SINK = new NoopAuditSink();
