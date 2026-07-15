/**
 * RetrieverCircuitBreaker.ts — 检索熔断器
 * ==========================================
 * 为检索操作提供超时 + 熔断降级。
 * 连续失败 N 次后暂停该检索源，自动切换到降级路径。
 *
 * 使用:
 *   const breaker = new RetrieverCircuitBreaker('zvec', { threshold: 3 });
 *   const result = await breaker.call(
 *     () => zvec.search(query, 10),  // 主路径
 *     () => [{ id: 'fallback' }]     // 降级路径
 *   );
 */
export interface BreakerOptions {
  /** 熔断阈值: 连续失败 N 次后熔断 (默认 5) */
  threshold: number;
  /** 冷却时间: 熔断后等待毫秒数 (默认 30s) */
  cooldownMs: number;
  /** 超时: 单次调用超时毫秒数 (默认 5s) */
  timeoutMs: number;
}

const DEFAULTS: BreakerOptions = {
  threshold: 5,
  cooldownMs: 30_000,
  timeoutMs: 5_000,
};

interface BreakerState {
  failures: number;
  lastFailure: number;
  totalCalls: number;
  totalTimeouts: number;
  lastError: string;
}

export class RetrieverCircuitBreaker {
  private name: string;
  private opts: BreakerOptions;
  private state: BreakerState = {
    failures: 0, lastFailure: 0, totalCalls: 0, totalTimeouts: 0, lastError: '',
  };

  constructor(name: string, opts?: Partial<BreakerOptions>) {
    this.name = name;
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * 执行检索，带超时 + 熔断保护
   * @param fn 主检索函数
   * @param fallback 降级函数（熔断或超时时调用）
   */
  async call<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    this.state.totalCalls++;

    // 熔断检查
    if (this.state.failures >= this.opts.threshold) {
      const elapsed = Date.now() - this.state.lastFailure;
      if (elapsed < this.opts.cooldownMs) {
        console.warn(`[Breaker] ${this.name} 熔断中 (${this.state.failures}次失败, ${Math.round((this.opts.cooldownMs - elapsed) / 1000)}s后恢复)`);
        return fallback();
      }
      // 半开: 冷却到期，允许一次试探
      console.log(`[Breaker] ${this.name} 冷却到期，半开试探`);
      this.state.failures = 0;
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), this.opts.timeoutMs)
        ),
      ]);
      // 成功: 重置失败计数
      this.state.failures = 0;
      return result;
    } catch (err) {
      this.state.failures++;
      this.state.lastFailure = Date.now();
      this.state.lastError = (err as Error).message || 'unknown';

      if ((err as Error).message === 'timeout') {
        this.state.totalTimeouts++;
        console.warn(`[Breaker] ${this.name} 超时 (${this.state.failures}/${this.opts.threshold})`);
      } else {
        console.warn(`[Breaker] ${this.name} 失败: ${(err as Error).message} (${this.state.failures}/${this.opts.threshold})`);
      }

      return fallback();
    }
  }

  /** 获取熔断器状态 */
  getStatus() {
    return {
      name: this.name,
      opened: this.state.failures >= this.opts.threshold,
      failures: this.state.failures,
      threshold: this.opts.threshold,
      totalCalls: this.state.totalCalls,
      totalTimeouts: this.state.totalTimeouts,
      lastError: this.state.lastError,
      cooldownRemainingMs: this.state.failures >= this.opts.threshold
        ? Math.max(0, this.opts.cooldownMs - (Date.now() - this.state.lastFailure))
        : 0,
    };
  }

  /** 手动重置熔断器 */
  reset(): void {
    this.state = { failures: 0, lastFailure: 0, totalCalls: 0, totalTimeouts: 0, lastError: '' };
  }
}
