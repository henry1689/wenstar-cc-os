/**
 * TimeTagger — 时空标签计算工具（V20）
 * =========================================================
 * 在对话写入时（用户提问触发），用系统时间计算记忆的时空标签。
 * 纯本地计算，零 token 成本，不启动任何定时心跳。
 *
 * 提供：
 *   timePeriod(t) — 时段：dawn/morning/noon/afternoon/evening/night
 *   season(t)     — 季节：spring/summer/autumn/winter
 *   lunarTerm(t)  — 农历/节气：从 LUNAR_2026 映射（如 "清明节"、"正月初一"）
 *   locationFingerprint(ctx) — 场景指纹：对话组/实体哈希（替代默认全0）
 */
import { createHash } from 'node:crypto';

/** 时段映射（按小时） */
export function timePeriod(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 8) return 'dawn';        // 黎明 5-8
  if (h >= 8 && h < 12) return 'morning';    // 上午 8-12
  if (h >= 12 && h < 14) return 'noon';      // 正午 12-14
  if (h >= 14 && h < 18) return 'afternoon'; // 下午 14-18
  if (h >= 18 && h < 23) return 'evening';   // 傍晚 18-23
  return 'night';                            // 深夜 23-5
}

/** 季节映射（按月份） */
export function season(d: Date): string {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** 农历/节气：从 LUNAR_2026 映射（MMDD → 农历/节气名） */
export async function lunarTerm(d: Date): Promise<string> {
  try {
    const { LUNAR_2026 } = await import('../config/app-identity.js');
    const _md = (d.getMonth() + 1) * 100 + d.getDate();
    return LUNAR_2026[_md] || '';
  } catch {
    return '';
  }
}

/**
 * 场景指纹 — 从对话组/实体生成稳定指纹（替代 DNAEncoder 默认全0）。
 * 优先用 dialog_group_id（每个对话组一个稳定场景），其次用实体名。
 * 纯本地哈希，零 token。
 */
export function locationFingerprint(opts: {
  dialogGroupId?: string | null;
  entityNames?: string[];
  message?: string;
}): string {
  const _dg = opts.dialogGroupId || '';
  const _ents = (opts.entityNames || []).filter(n => n && n !== '我').join(',');
  const _raw = `${_dg}|${_ents}|${(opts.message || '').slice(0, 20)}`;
  if (!_dg && !_ents) return '';   // 无场景上下文 → 空（不写占位符）
  return createHash('sha256').update(_raw).digest('hex').substring(0, 32);
}
