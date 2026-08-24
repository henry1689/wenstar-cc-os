/**
 * weather — 和风天气公共客户端（JWT Ed25519 认证）
 * ============================================================
 * 2026-08-24 抽取自 yaoguang-backfill：chat.ts（玉瑶 prompt 注入）与
 * yaoguang-backfill（瑶光 40D environmental_params）共用，避免重复实现。
 *
 * - 30 分钟内存缓存（不每轮调 API，配额友好）
 * - 失败静默返回 null（天气缺失不影响任何主流程）
 * - 断线重试 1 次（QWeather 偶发 404/网络抖动兜底）
 */

let _cache: { at: number; data: WeatherInfo } | null = null;

export interface WeatherInfo {
  temperature: number;
  humidity: number;
  weather_text: string;
  wind_dir: string;
  wind_scale: number;
  /** 英文天气 key（瑶光 D26 台风/雷暴判断用）：typhoon/thunderstorm/其他 */
  weather_raw: string;
  /** 人类可读摘要，如"阴，28°C，西南风3级，湿度87%" */
  summary: string;
}

/** 和风中文天气文本 → 瑶光 D26 英文 key（台风/雷暴特殊处理） */
function toWeatherRaw(text: string): string {
  if (/台[风]/.test(text)) return 'typhoon';
  if (/雷[阵雨暴]|雷雨|雷暴|强对流/.test(text)) return 'thunderstorm';
  return 'other';
}

/** 获取当前天气（30 分钟缓存 + 失败重试 1 次） */
export async function getRealWeather(force = false): Promise<WeatherInfo | null> {
  if (!force && _cache && Date.now() - _cache.at < 30 * 60 * 1000) return _cache.data;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { fetchWeatherNow } = await import('../engine/temporal/weather_qweather_client.js');
      const now = await fetchWeatherNow();
      if (now) {
        const temp = parseFloat(now.temp as unknown as string) || 0;
        const hum = parseFloat(now.humidity as unknown as string) || 0;
        const data: WeatherInfo = {
          temperature: temp,
          humidity: hum,
          weather_text: now.weatherType || '',
          wind_dir: now.windDir || '',
          wind_scale: now.windScale || 0,
          weather_raw: toWeatherRaw(now.weatherType || ''),
          summary: `${now.text || ''}${hum ? '，湿度' + hum + '%' : ''}`,
        };
        _cache = { at: Date.now(), data };
        return data;
      }
    } catch (e) {
      console.warn('[QWeather] 天气获取失败(第' + (attempt + 1) + '次):', (e as Error)?.message);
    }
    await new Promise(r => setTimeout(r, 500)); // 重试前短暂等待
  }
  return null;
}
