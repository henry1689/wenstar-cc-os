/**
 * ForesightValidityFilter — Foresight 时效过滤器 (V13.0)
 * ======================================================
 * 检索层过滤已过期的前瞻性记忆，避免召回不再成立的计划/承诺。
 *
 * 默认行为:
 *   - includeExpired = false (过期未确认不召回)
 *   - includeFuture = true  (未来计划可召回，标注 future)
 *   - includeCompleted = true (已完成的计划可召回)
 *   - 非 Foresight 记忆不受影响
 */

export interface ForesightFilterOptions {
  nowMs: number;
  includeExpired?: boolean;
  includeFuture?: boolean;
  includeCompleted?: boolean;
}

const DEFAULTS: Required<ForesightFilterOptions> = {
  nowMs: Date.now(),
  includeExpired: false,
  includeFuture: true,
  includeCompleted: true,
};

export interface ForesightAwareItem {
  isForesight?: boolean;
  validStartMs?: number | null;
  validUntilMs?: number | null;
  foresightStatus?: string | null;
}

/**
 * 过滤已过期的前瞻记忆
 * @returns 过滤后的数组
 */
export function filterExpiredForesight<T extends ForesightAwareItem>(
  items: T[],
  options?: Partial<ForesightFilterOptions>,
): T[] {
  const opts = { ...DEFAULTS, ...options, nowMs: options?.nowMs ?? Date.now() };

  return items.filter(item => {
    // 非 Foresight 记忆直接放行
    if (!item.isForesight) return true;

    const status = item.foresightStatus ?? 'none';

    // 已完成
    if (status === 'completed' || status === 'cancelled') {
      return opts.includeCompleted;
    }

    // 已过期 (有有效期且已过)
    if (item.validUntilMs && item.validUntilMs < opts.nowMs) {
      return opts.includeExpired;
    }

    // 未来 (有效期未开始)
    if (item.validStartMs && item.validStartMs > opts.nowMs) {
      return opts.includeFuture;
    }

    // active → 放行
    return true;
  });
}

/** 批量标注 warning 供日志使用 */
export function annotateForesightWarnings<T extends ForesightAwareItem>(items: T[], nowMs?: number): string[] {
  const warnings: string[] = [];
  const now = nowMs ?? Date.now();

  for (const item of items) {
    if (!item.isForesight) continue;
    if (item.validUntilMs && item.validUntilMs < now) {
      warnings.push(`expired_foresight: status=${item.foresightStatus} valid_until=${item.validUntilMs}`);
    }
  }

  return warnings;
}
