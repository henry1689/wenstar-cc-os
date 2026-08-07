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
 * 🔴 S4-评审修复: 归属校验下沉到取数层 — SQL 带 belong_entity_uuid 白名单过滤，
 * 与 UUIDPoliceFilter.passes 语义一致（deny-by-default），杜绝 id 碰撞误取他人对话。
 * @param sqlite SQLiteAdapter（有 queryAll）
 * @param id     conversations.id
 * @param allowedUuids 允许的 belong_entity_uuid 白名单（空 = 不限定，户主最高权限）
 * @returns 全文 content（找不到或越权返回 null）
 */
export function fetchLongText(
  sqlite: any,
  id: string | number,
  allowedUuids?: string[],
): string | null {
  try {
    if (!sqlite || typeof sqlite.queryAll !== 'function') return null;
    let sql = 'SELECT content, belong_entity_uuid FROM conversations WHERE id = ?';
    const params: any[] = [String(id)];
    if (allowedUuids && allowedUuids.length > 0) {
      const marks = allowedUuids.map(() => '?').join(',');
      sql += ` AND belong_entity_uuid IN (${marks})`;
      params.push(...allowedUuids);
    }
    sql += ' LIMIT 1';
    const rows = sqlite.queryAll(sql, params) as any[];
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
    return '【对话原文·权威记录】' + text +
      '\n（以上为当时对话原文。过去发生的事不得编造：原文没有的人物/情节不得提及。）';
  }

  let body: string;
  if (level === 'detail') {
    body = _chunkFull(text);
  } else {
    // summary / auto → 分段摘要（首+中+尾）
    body = _summaryOf(text);
  }

  // 铁律标记：过去发生的事绝对不得编造——以原文为唯一事实来源
  // 即使记忆/知识库/之前对话里提过其他人物或情节，只要原文没有，就不得提及（无中生有即违规）。
  return '【对话原文·权威记录】' + body +
    '\n\n🔴 铁律（关于过去的记忆，绝对不得违反）：\n' +
    '1. 以上是检索到的这篇纪实的真实原文记录，是你回答的唯一事实来源。\n' +
    '2. 原文中没有出现的人物、情节、数据、章节，一律不得提及或编造——即使你的记忆、知识库或之前对话里提过，也不得使用（那是当时没有发生的）。\n' +
    '3. 如果用户问到原文中没有的内容，如实回答"当时记录的原文里没有这部分"。\n' +
    '4. 严格按原文顺序和内容复述，不得增删改。';
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