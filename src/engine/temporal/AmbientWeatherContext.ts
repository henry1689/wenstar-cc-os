/**
 * AmbientWeatherContext — 环境气象上下文管理器
 *
 * 核心职责：
 * 1. 双数据源调度（和风API + 用户自定义）
 * 2. 气象上下文注入 EngineContext
 * 3. 季节物候联动校验
 * 4. 被动触发逻辑
 */
import type { TimeKeeper } from './base/TimeKeeper.js';
import type { NaturalCycle } from './celestial/NaturalCycle.js';
import { fetchWeatherNow, fetchForecast3d, fetchWarnings, cityLookup, isApiAvailable } from './weather_qweather_client.js';
import { QWEATHER_CONFIG, SEASON_WEATHER_RULES } from './TemporalConfig.js';
import { EngineContext } from '../EngineContext.js';

export interface WeatherData {
  area: string;
  weatherType: string;
  temperatureLow: number;
  temperatureHigh: number;
  description: string;
  alertInfo: string | null;
  source: 'qweather_api' | 'chat_llm';
  lastUpdate: number;
}

export class AmbientWeatherContext {
  private timeKeeper: TimeKeeper;
  private naturalCycle: NaturalCycle;
  private currentWeather: WeatherData | null = null;
  private lastApiFetchTs = 0;
  private customOverride: WeatherData | null = null;
  private _lastLocationId: string = QWEATHER_CONFIG.defaultLocationId;

  constructor(timeKeeper: TimeKeeper, naturalCycle: NaturalCycle) {
    this.timeKeeper = timeKeeper;
    this.naturalCycle = naturalCycle;
  }

  async init(): Promise<void> {
    await this.fetchAndUpdate();
    console.log('[AmbientWeather] 初始化完成');
  }

  reset(): void { this.currentWeather = null; }
  destroy(): void {}

  /** 定时刷新（外部定时器调用） */
  async pollRefresh(): Promise<void> {
    if (this.customOverride) return; // 自定义覆盖期间不刷新
    await this.fetchAndUpdate();
  }

  /** 拉取和风API并更新 */
  async fetchAndUpdate(): Promise<void> {
    if (!isApiAvailable()) return;
    const now = Date.now();
    if (now - this.lastApiFetchTs < QWEATHER_CONFIG.rateLimitMs) return;
    this.lastApiFetchTs = now;

    try {
      const weatherData = await fetchWeatherNow();
      const forecastData = await fetchForecast3d();
      const warningData = await fetchWarnings();

      if (weatherData) {
        this.currentWeather = {
          area: '深圳龙岗',
          weatherType: weatherData.weatherType,
          temperatureLow: forecastData?.forecast[0]?.tempMin ?? weatherData.temp,
          temperatureHigh: forecastData?.forecast[0]?.tempMax ?? weatherData.temp,
          description: weatherData.text,
          alertInfo: warningData?.[0]?.text ?? null,
          source: 'qweather_api',
          lastUpdate: Date.now(),
        };
        console.log(`[AmbientWeather] API更新: ${weatherData.text}`);
      }
    } catch (err) {
      console.warn('[AmbientWeather] API拉取失败，保留缓存:', err);
    }
  }

  /** 设置用户自定义气象覆盖 */
  setCustomWeather(weatherType: string, low: number, high: number, desc: string, area: string, durationMs: number): void {
    this.customOverride = {
      area,
      weatherType,
      temperatureLow: low,
      temperatureHigh: high,
      description: desc,
      alertInfo: null,
      source: 'chat_llm',
      lastUpdate: Date.now(),
    };
    console.log(`[AmbientWeather] 用户自定义: ${weatherType}, ${low}~${high}°C, 持续${durationMs/3600000}小时`);
  }

  /** 清除自定义覆盖，恢复和风API数据 */
  clearCustomOverride(): void {
    this.customOverride = null;
    console.log('[AmbientWeather] 自定义气象已清除，恢复API数据');
  }

  /** 获取当前生效气象数据 */
  getCurrentWeather(): WeatherData {
    if (this.customOverride) return this.customOverride;
    return this.currentWeather ?? {
      area: '深圳龙岗', weatherType: '晴',
      temperatureLow: 22, temperatureHigh: 30,
      description: '晴，26°C',
      alertInfo: null, source: 'qweather_api', lastUpdate: 0,
    };
  }

  /** 季节-天气类型合规校验 */
  checkWeatherCompliance(weatherType: string): { valid: boolean; reason?: string } {
    const season = this.naturalCycle.getSeason();
    const allowed = SEASON_WEATHER_RULES[season];
    if (!allowed) return { valid: true };
    if (!allowed.some(w => weatherType.includes(w) || w.includes(weatherType))) {
      return { valid: false, reason: `${season}季节不应出现"${weatherType}"天气，违反自然规律` };
    }
    return { valid: true };
  }

  /** 注入气象上下文到 EngineContext（带出行标记控制） */
  injectWeatherContext(hasOutdoorActivity: boolean): void {
    const weather = this.getCurrentWeather();
    if (!hasOutdoorActivity) {
      EngineContext.setExtra('weather_permission', 'forbidden');
      return;
    }
    EngineContext.setExtra('weather_permission', 'allowed');
    EngineContext.setExtra('weather_current', weather.description);
    if (weather.alertInfo) {
      EngineContext.setExtra('weather_alert', weather.alertInfo);
    }
  }

  /** 切换地理位置 */
  async switchLocation(cityName: string): Promise<boolean> {
    const loc = await cityLookup(cityName);
    if (!loc) return false;
    this._lastLocationId = loc.id;
    await this.fetchAndUpdate();
    return true;
  }

  /** 获取API可用性 */
  isApiReady(): boolean { return isApiAvailable(); }

  /** 获取状态摘要 */
  getStatus(): { dataSource: string; weather: string; hasAlert: boolean; apiAvailable: boolean } {
    const w = this.getCurrentWeather();
    return {
      dataSource: w.source,
      weather: w.description,
      hasAlert: !!w.alertInfo,
      apiAvailable: isApiAvailable(),
    };
  }
}
