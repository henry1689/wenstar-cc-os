/**
 * 档案自动采集引擎 — 配置常量
 * Profile Acquisition Engine (PAE) Guard Configuration
 *
 * 定位：FG 档案数据的最高安全等级采集配置
 * 与 ingestion-guard.ts 同级，受 fg-kinship-redlines.md 约束
 */

export const PAE_CONFIG = {
  // ── 置信度闸门 ──
  /** 置信度 ≥ 此值，直接写入 dossier（绕过 pendingItems） */
  directWriteThreshold: 0.7,

  /** 置信度 ≥ 此值且 < directWriteThreshold，进入 pendingItems */
  pendingThreshold: 0.4,

  /** 置信度 < 此值，丢弃 */
  // （即 pendingThreshold 同时也是 discard 的分界线）

  // ── Token 预算 ──
  /** 传给 LLM 的最大对话文本长度（字符数） */
  maxInputLength: 500,

  /** 已知档案摘要最大长度（字符数），超出截断 */
  maxProfileSummaryLength: 300,

  /** 单次 LLM 调用最多提取的人数 */
  maxPersonsPerCall: 5,

  // ── LLM 参数 ──
  /** 提取用 LLM 温度（低=确定性高） */
  extractionTemperature: 0.1,

  /** LLM 最大输出 token */
  extractionMaxTokens: 1024,

  // ── 限流（成本控制） ──
  /** 每小时最多 LLM 提取调用次数 */
  maxCallsPerHour: 20,

  /** 每日最多 LLM 提取调用次数 */
  maxCallsPerDay: 100,

  // ── 缓存 ──
  /** 提取结果缓存 TTL（毫秒），相同对话文本在此期间复用结果 */
  cacheTTL: 60_000,

  // ── Hook C（AI 回复提取）安全参数 ──
  /** AI 回复提取的置信度阈值更高（AI 可能幻觉） */
  assistantResponseThreshold: 0.8,

  /** AI 回复提取只写 pendingItems（不直接写 dossier） */
  assistantResponseDirectWrite: false,

  // ── 降级 ──
  /** LLM 提取超时（毫秒），超时后降级到正则管道 */
  llmTimeout: 5000,
} as const;

/** PAE 启动完整性检查项标签 */
export const PAE_INTEGRITY_CHECKS = [
  '无空值污染',
  'pendingItems 质量',
  '无重复 pendingItems',
  'changeHistory 不超限',
  'completeness 合法',
  '无孤儿 dossier',
] as const;
