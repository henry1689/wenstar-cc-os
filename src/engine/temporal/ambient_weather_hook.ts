/**
 * ambient_weather_hook — 第16号气象环境监控Hook探针
 *
 * 三色状态：绿=API正常 黄=API异常/自定义即将到期 红=密钥失效/数据冲突
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { insertEvent } from '../../hooks/backend.js';
import type { AmbientWeatherContext } from './AmbientWeatherContext.js';

/** 写入气象状态快照到Hook */
export function snapshotWeatherStatus(sqlite: SQLiteAdapter, weather: AmbientWeatherContext): void {
  const status = weather.getStatus();
  const tags: string[] = [`source:${status.dataSource}`, `api:${status.apiAvailable ? 'ok' : 'unavailable'}`];
  if (status.hasAlert) tags.push('has_alert');

  insertEvent(sqlite, {
    operation_type: 'ambient_weather_snapshot',
    duration_ms: 0,
    status: status.apiAvailable ? 'success' : 'fail',
    dna_code: undefined,
    input_tags: tags,
    source_tier: 'weather',
    error_info: status.hasAlert ? '存在气象预警' : undefined,
    timestamp: new Date().toISOString(),
  });
}

/** 气象API异常记录 */
export function recordWeatherApiError(sqlite: SQLiteAdapter, errorMsg: string): void {
  insertEvent(sqlite, {
    operation_type: 'ambient_weather_api_error',
    duration_ms: 0,
    status: 'error',
    error_info: errorMsg,
    input_tags: ['api_error'],
    timestamp: new Date().toISOString(),
  });
}
