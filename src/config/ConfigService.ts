/**
 * ConfigService — 懒加载配置服务（改造④）
 *
 * 🔴 铁律：所有模块内禁止在模块级（顶层）访问 process.env。
 *   ESM import hoisting 导致模块级代码在 .env 加载之前执行，
 *   必须使用 ConfigService 在运行时懒加载，确保 .env 已就绪。
 *
 * 统一 API：
 *   ConfigService.get('KEY')          → string | ''
 *   ConfigService.getInt('KEY', 42)   → number
 *   ConfigService.getBool('KEY')      → boolean
 */
export class ConfigService {
  static get(key: string, defaultVal?: string): string {
    return process.env[key] ?? defaultVal ?? '';
  }

  static getInt(key: string, defaultVal?: number): number {
    const v = process.env[key];
    if (v === undefined || v === null) return defaultVal ?? 0;
    const n = parseInt(v, 10);
    return isNaN(n) ? (defaultVal ?? 0) : n;
  }

  static getBool(key: string, defaultVal?: boolean): boolean {
    const v = process.env[key];
    if (v === undefined || v === null) return defaultVal ?? false;
    return v === 'true' || v === '1';
  }
}
