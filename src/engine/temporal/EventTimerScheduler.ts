/**
 * EventTimerScheduler — 全局统一调度器
 *
 * 后台轻量轮询，管理所有时效型任务：
 * - 时序事件到期 → 更新状态 + 续期循环事件
 * - 气象记录过期 → 恢复API数据源
 * - 异常告警
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { TemporalEventArchive } from './TemporalEventArchive.js';
import { AmbientWeatherContext } from './AmbientWeatherContext.js';
import { QWEATHER_CONFIG } from './TemporalConfig.js';

export class EventTimerScheduler {
  private archive: TemporalEventArchive;
  private weather: AmbientWeatherContext;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _lastWeatherPoll = 0;

  constructor(archive: TemporalEventArchive, weather: AmbientWeatherContext) {
    this.archive = archive;
    this.weather = weather;
  }

  /** 启动调度器 */
  start(intervalMs: number = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    console.log('[EventTimerScheduler] 启动 (间隔' + (intervalMs / 1000) + '秒)');
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  destroy(): void { this.stop(); }

  /** 每次轮询 */
  private async tick(): Promise<void> {
    try {
      const now = Date.now();

      // 1. 处理到期事件
      const expired = this.archive.getExpiredEvents(now);
      for (const event of expired) {
        this.archive.updateStatus(event.event_id, 'completed');
        console.log(`[EventTimerScheduler] 事件到期: ${event.event_type} (${event.event_raw_text.substring(0, 30)})`);

        // 循环事件续期
        if (event.is_cyclic) {
          const renewed = this.archive.renewCyclicEvent(event.event_id);
          if (renewed) {
            console.log(`[EventTimerScheduler] 循环续期: ${renewed.event_id}`);
          }
        }
      }

      // 2. 定时刷新气象 API
      if (now - this._lastWeatherPoll >= QWEATHER_CONFIG.pollIntervalMs) {
        this._lastWeatherPoll = now;
        await this.weather.pollRefresh();
      }
    } catch (err) {
      console.warn('[EventTimerScheduler] 轮询异常:', err);
    }
  }

  /** 手动触发一次 */
  async tickOnce(): Promise<void> {
    await this.tick();
  }
}
