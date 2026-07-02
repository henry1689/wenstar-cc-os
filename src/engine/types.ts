/**
 * 引擎全局类型 — S1 骨架期
 *
 * 所有通用接口、枚举、类型别名集中管理
 */

// ── 引擎运行模式 ──
export type EngineMode = 'legacy' | 'hybrid';

// ── 引擎配置 ──
export interface EngineConfig {
  mode: EngineMode;
  traceEnabled?: boolean;
  storage?: IStorageProvider;
}

// ── 持久化接口（与具体实现解耦） ──
export interface IStorageProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

// ── 模块生命周期 ──
export interface ILifecycle {
  /** 初始化：分配资源、注册事件监听 */
  init(bus: IEventBus, storage?: IStorageProvider): void | Promise<void>;
  /** 重置：清空会话状态，回到初始值 */
  reset(): void | Promise<void>;
  /** 销毁：取消订阅、释放资源 */
  destroy(): void | Promise<void>;
}

// ── 事件总线接口 ──
export interface IEventBus {
  on<T extends { type: string; traceId: string }>(type: string, handler: EventHandler<T>, priority?: number): void;
  emit<T extends { type: string; traceId: string; timestamp: number }>(event: T): Promise<void>;
  off(type: string, handler: Function): void;
  getRecorder(): IEventRecorder | null;
}

// ── 事件处理器 ──
export type EventHandler<T extends { type: string; traceId: string }> = {
  (event: T): void | Promise<void>;
  /** 短路标记：设为 true 后终止后续优先级 handler 执行 */
  skipRemaining?: boolean;
};

// ── Trace 快照录制器 ──
export interface IEventRecorder {
  record(event: { type: string; traceId: string; timestamp?: number }, module: string, durationMs: number, error?: string): void;
  getSnapshot(traceId: string): TraceSnapshot | null;
  getAllSnapshots(): TraceSnapshot[];
  clear(traceId: string): void;
  complete(traceId: string): void;
}

export interface TraceSnapshot {
  traceId: string;
  events: Array<{
    type: string;
    module: string;
    durationMs: number;
    error?: string;
    timestamp: number;
  }>;
  totalDurationMs: number;
  completed: boolean;
}
