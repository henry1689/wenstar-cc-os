/**
 * long-text-retrieval — 长文直取 + 概要/详细展开（V23）
 * ============================================================
 * 用户与角色聊天产生几百到几千字长文（角色写的纪实/小说）。
 * 当前检索注入时每条被两层截断（检索层200/800字 + MemoryInjector 250字），
 * LLM 只能复述开头，复述不了中部/结尾。
 *
 * 本模块：
 *   - detectDetailLevel: 按消息意图判断"概要/详细"
 *   - fetchLongText:     命中长文候选时直接 SQL 拉全文（绕过截断管线，不过滤 is_compacted）
 *   - buildLongTextFragment: 按级别构造注入片段（分段全文 / 摘要）+ 铁律标记
 */

/** 注入级别 */
export type DetailLevel = 'detail' | 'summary' | 'auto';

/** 长文阈值（>800字视为长文，需完整返回） */
export const LONG_TEXT_THRESHOLD = 800;

/** 分段大小（每段 ~1500 字，2-3 段覆盖全文） */
export const LONG_TEXT_CHUNK = 1500;

/** 摘要模式：首段 + 中段 + 尾段各取窗口 */
const SUMMARY_WINDOW = 200;

/**
 * 检测消息的"概要/详细"意图。
 * - detail:  含 详细/展开/具体/全文/细讲/讲清楚/仔细 → 返回详情
 * - summary: 含 概要/总结/简单/概括/简述/大概 → 返回摘要
 * - auto:    普通问题 → 命中长文给分段摘要，命中普通给正常
 */
export function detectDetailLevel(message: string): DetailLevel {
  const msg = (message || '').trim();
  if (msg.length < 2) return 'auto';

  // 详细意图优先（用户明确要细讲）
  if (/详细|展开|具体|全文|细讲|讲清楚|仔细|从头到尾|每一段|所有内容|完整/.test(msg)) return 'detail';
  // 概要意图
  if (/概要|总结|简单|概括|简述|大概|概述|一句话|梗概/.test(msg)) return 'summary';
  return 'auto';
}

/**
 * 直取对话全文（绕过 is_compacted 归档过滤）。
 * @param sqlite SQLiteAdapter（有 queryAll）
 * @param id     conversations.id
 * @returns 全文 content（找不到返回 null）
 */
export function fetchLongText(
  sqlite: any,
  id: string | number,
): string | null {
  try {
    if (!sqlite || typeof sqlite.queryAll !== 'function') return null;
    const rows = sqlite.queryAll(
      'SELECT content FROM conversations WHERE id = ? LIMIT 1',
      [String(id)],
    ) as any[];
    if (rows && rows.length > 0 && rows[0]?.content) {
      const text = String(rows[0].content);
      return text.length > LONG_TEXT_THRESHOLD ? text : null;  // 仅长文走直取
    }
  } catch { /* 直取失败返回 null，回落截断路径 */ }
  return null;
}

/**
 * 构造长文注入片段。
 * @param content 长文全文
 * @param level   注入级别
 * @returns 注入片段（带铁律标记）
 */
export function buildLongTextFragment(content: string, level: DetailLevel): string {
  const text = (content || '').trim();
  if (text.length <= LONG_TEXT_THRESHOLD) {
    return '【对话原文】' + text;
  }

  let body: string;
  if (level === 'detail') {
    body = _chunkFull(text);
  } else {
    // summary / auto → 分段摘要（首+中+尾）
    body = _summaryOf(text);
  }

  // 铁律标记：如实陈述，未检索到的部分不要编造
  return '【对话原文】' + body +
    '\n（以上是检索到的对话原文记录。若用户追问更细节内容而原文未覆盖，请如实说明"这段记录里没有"，不要编造。）';
}

/** 分段全文（每段 ~1500 字，覆盖全文） */
function _chunkFull(text: string): string {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += LONG_TEXT_CHUNK) {
    parts.push(text.substring(i, i + LONG_TEXT_CHUNK));
  }
  return parts.join('\n…（接上）\n');
}

/** 分段摘要（首段 + 中段 + 尾段，覆盖梗概） */
function _summaryOf(text: string): string {
  const total = text.length;
  const head = text.substring(0, SUMMARY_WINDOW);
  const mid = text.substring(Math.floor(total / 2) - SUMMARY_WINDOW / 2, Math.floor(total / 2) + SUMMARY_WINDOW / 2);
  const tail = text.substring(Math.max(0, total - SUMMARY_WINDOW));
  const parts: string[] = [];
  if (head) parts.push('【开头】' + head);
  if (mid && mid !== head) parts.push('【中段】' + mid);
  if (tail && tail !== head && tail !== mid) parts.push('【结尾】' + tail);
  return parts.join('\n');
}