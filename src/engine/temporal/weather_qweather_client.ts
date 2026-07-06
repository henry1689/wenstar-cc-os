/**
 * weather_qweather_client — 和风天气API专用客户端
 *
 * 使用 JWT Ed25519 身份认证（2027年起API KEY将受限）。
 * 配置在 .env 中：
 *   QWEATHER_KID=你的凭据ID（控制台->项目管理->凭据）
 *   QWEATHER_SUB=你的项目ID（控制台->项目管理查看）
 *   QWEATHER_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   QWEATHER_API_HOST=https://k23fc3cb4e.re.qweatherapi.com
 *
 * 默认定位：深圳龙岗
 */
import { sign, createPrivateKey } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QWEATHER_CONFIG } from './TemporalConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// ── 读取环境配置 ──
function getKid(): string { return process.env['QWEATHER_KID'] || ''; }
function getSub(): string { return process.env['QWEATHER_SUB'] || ''; }
function getApiHost(): string { return process.env['QWEATHER_API_HOST'] || 'https://k23fc3cb4e.re.qweatherapi.com'; }

/** 从文件读取私钥PEM */
function getPrivateKeyPem(): string {
  const keyPath = process.env['QWEATHER_PRIVATE_KEY_PATH'] || '';
  if (!keyPath) return '';
  const fullPath = join(PROJECT_ROOT, keyPath);
  if (!existsSync(fullPath)) {
    console.warn('[QWeather] 私钥文件不存在: ' + fullPath);
    return '';
  }
  return readFileSync(fullPath, 'utf-8');
}

export interface QWeatherNowResponse {
  temp: number;
  feelsLike: number;
  humidity: number;
  weatherType: string;
  windDir: string;
  windScale: number;
  text: string;
}

export interface QWeatherForecastDay {
  tempMin: number;
  tempMax: number;
  weatherType: string;
  text: string;
}

export interface QWeatherForecastResponse {
  forecast: QWeatherForecastDay[];
}

/** 生成 JWT Token（Ed25519 签名） */
function generateJWT(): string | null {
  const kid = getKid();
  const sub = getSub();
  const privPem = getPrivateKeyPem();
  if (!kid || !sub || !privPem) return null;

  const header = { alg: 'EdDSA', kid };
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 900; // 15分钟有效期
  const payload = { sub, iat, exp };

  try {
    // base64url 编码 header + payload
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = headerB64 + '.' + payloadB64;

    // Ed25519 签名（使用函数式API，兼容 Node.js v22）
    const privateKey = createPrivateKey(privPem);
    const signatureB64 = sign(null, Buffer.from(data), privateKey).toString('base64url');

    return data + '.' + signatureB64;
  } catch (err) {
    console.warn('[QWeather] JWT 生成失败:', err);
    return null;
  }
}

/** 通用 API 请求 */
async function apiGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const jwt = generateJWT();
  if (!jwt) return null;

  const host = getApiHost();
  const qs = new URLSearchParams(params).toString();
  const url = `${host}${path}?${qs}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${jwt}` },
      signal: AbortSignal.timeout(QWEATHER_CONFIG.apiTimeoutMs),
    });
    if (!res.ok) {
      console.warn(`[QWeather] API ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = await res.json() as any;
    if (data.code !== '200') {
      console.warn(`[QWeather] API code=${data.code}: ${data.code === '401' ? '认证失败，检查JWT配置' : data.code === '429' ? '请求频率超限' : '未知错误'}`);
      return null;
    }
    return data as T;
  } catch (err) {
    console.warn('[QWeather] 请求失败:', err);
    return null;
  }
}

// ── 公开接口 ──

/** 实时天气 /v7/weather/now */
export async function fetchWeatherNow(): Promise<QWeatherNowResponse | null> {
  const locId = QWEATHER_CONFIG.defaultLocationId;
  const data = await apiGet<any>('/v7/weather/now', { location: locId });
  if (!data?.now) return null;
  return {
    temp: data.now.temp, feelsLike: data.now.feelsLike,
    humidity: data.now.humidity, weatherType: data.now.text,
    windDir: data.now.windDir, windScale: data.now.windScale,
    text: `${data.now.text}，${data.now.temp}°C，${data.now.windDir}${data.now.windScale}级`,
  };
}

/** 3天预报 /v7/weather/3d */
export async function fetchForecast3d(): Promise<QWeatherForecastResponse | null> {
  const data = await apiGet<any>('/v7/weather/3d', { location: QWEATHER_CONFIG.defaultLocationId });
  if (!data?.daily) return null;
  return {
    forecast: data.daily.map((d: any) => ({
      tempMin: d.tempMin, tempMax: d.tempMax,
      weatherType: d.textDay || d.textNight,
      text: `${d.textDay}，${d.tempMin}~${d.tempMax}°C`,
    })),
  };
}

/** 气象灾害预警 /v7/warning/now */
export async function fetchWarnings(): Promise<Array<{ title: string; severity: string; text: string }>> {
  const data = await apiGet<any>('/v7/warning/now', { location: QWEATHER_CONFIG.defaultLocationId });
  if (!data?.warning) return [];
  return data.warning.map((w: any) => ({
    title: w.title || '', severity: w.severity || '', text: w.text || '',
  }));
}

/** 城市检索 /v2/city/lookup */
export async function cityLookup(cityName: string): Promise<{ id: string; name: string; lat: number; lon: number } | null> {
  const data = await apiGet<any>('/v2/city/lookup', { location: cityName });
  if (!data?.location?.[0]) return null;
  const loc = data.location[0];
  return { id: loc.id, name: loc.name, lat: parseFloat(loc.lat), lon: parseFloat(loc.lon) };
}

/** 检查 JWT 配置是否可用 */
export function isApiAvailable(): boolean {
  return !!(getKid() && getSub() && getPrivateKeyPem());
}
