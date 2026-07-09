/**
 * AsyncQueue — 轻量异步任务队列
 *
 * 📜 架构优化：M6/M7/M8 全部异步化
 * 高钙化事件/梦境/年轮/自我演化不再阻塞 LLM 回复主线
 * 每轮对话只落库一次，降低磁盘 IO
 */

type TaskFn = () => Promise<void>;

export class AsyncQueue {
  private queue: TaskFn[] = [];
  private running = false;
  private concurrency: number;
  private _errorCount = 0;

  constructor(concurrency = 1) {
    this.concurrency = concurrency;
  }

  /** 推入异步任务，立即返回（不等待执行） */
  push(fn: TaskFn): void {
    this.queue.push(fn);
    this._drain();
  }

  /** 获取队列状态 */
  get stats() {
    return { pending: this.queue.length, running: this.running, errors: this._errorCount };
  }

  private async _drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.concurrency);
      await Promise.all(batch.map(fn => fn().catch(e => {
        this._errorCount++;
        console.warn('[AsyncQueue] 任务失败:', e);
      })));
    }
    this.running = false;
  }
}

/** 全局异步队列实例 */
export const globalAsyncQueue = new AsyncQueue(3);
