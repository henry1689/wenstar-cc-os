/**
 * ForesightDetector — M3 前瞻时态识别器 (V13.0)
 * =============================================
 * 在记忆写入前识别：事实记忆 vs 前瞻计划/承诺/预测/临时状态。
 *
 * 规则 V1: 关键词匹配 + 中文相对时间解析。
 * P3 升级: M5 LLM 辅助精确提取时间窗口。
 */

export type ForesightStatus = 'none' | 'future' | 'active' | 'expired' | 'completed' | 'cancelled';

export interface ForesightDetectionResult {
  isForesight: boolean;
  validStartMs?: number;
  validUntilMs?: number;
  status: ForesightStatus;
  reason?: string;
  confidence: number;
}

/** 前瞻触发词 */
const FORESIGHT_HINTS = [
  '明天', '后天', '下周', '下个月', '明年', '以后', '将来',
  '打算', '准备', '计划', '想要', '要去', '会去', '会做',
  '约了', '预约', '决定', '等到', '承诺', '保证', '答应',
  '记住', '一定', '下次', '等我',
];

/** 已完成/取消标记词 */
const COMPLETION_HINTS = [
  '已经', '完成了', '做完了', '去了', '见过了', '结束了', '取消了', '不去了', '已经做了',
];

/** 中文相对时间 → offset 天（从当前时间起算） */
function parseTimeOffset(text: string, nowMs: number): { startMs: number; endMs: number } | null {
  if (/明天/.test(text)) {
    const d = new Date(nowMs + 86400000);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { startMs: start, endMs: start + 86400000 - 1 };
  }
  if (/后天/.test(text)) {
    const d = new Date(nowMs + 2 * 86400000);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { startMs: start, endMs: start + 86400000 - 1 };
  }
  if (/下周/.test(text)) {
    const d = new Date(nowMs);
    const day = d.getDay();
    const daysToMonday = day === 0 ? 1 : 8 - day;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToMonday);
    const sunday = new Date(monday.getTime() + 7 * 86400000 - 1);
    return { startMs: monday.getTime(), endMs: sunday.getTime() };
  }
  if (/下个月/.test(text)) {
    const d = new Date(nowMs);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59, 999);
    return { startMs: next.getTime(), endMs: end.getTime() };
  }
  if (/明年/.test(text)) {
    const next = new Date(new Date(nowMs).getFullYear() + 1, 0, 1);
    const end = new Date(new Date(nowMs).getFullYear() + 1, 11, 31, 23, 59, 59, 999);
    return { startMs: next.getTime(), endMs: end.getTime() };
  }
  if (/以后|将来/.test(text)) {
    return { startMs: nowMs, endMs: nowMs + 90 * 86400000 };
  }
  if (/准备|打算|计划|想要/.test(text)) {
    return { startMs: nowMs, endMs: nowMs + 30 * 86400000 };
  }
  return null;
}

/** 前瞻时态检测 */
export function detectForesight(input: { content: string; timestampMs: number }): ForesightDetectionResult {
  const text = input.content;
  const hasForesight = FORESIGHT_HINTS.some(h => text.includes(h));
  const hasCompletion = COMPLETION_HINTS.some(h => text.includes(h));

  if (!hasForesight) {
    return { isForesight: false, status: 'none', confidence: 1.0 };
  }

  const range = parseTimeOffset(text, input.timestampMs);

  if (hasCompletion) {
    return {
      isForesight: true,
      validStartMs: range?.startMs,
      validUntilMs: range?.endMs,
      status: 'completed',
      reason: 'completion_hint_detected',
      confidence: 0.75,
    };
  }

  const status: ForesightStatus = range && range.startMs > input.timestampMs ? 'future' : 'active';
  return {
    isForesight: true,
    validStartMs: range?.startMs,
    validUntilMs: range?.endMs,
    status,
    reason: `foresight_hint_${status}`,
    confidence: 0.70,
  };
}
