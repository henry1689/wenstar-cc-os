/**
 * EntityContextCompressor — 上下文智能压缩器
 * ==========================================
 * 三层压缩：锚点层（完整原文）+ 摘要层（规则摘要）+ 归档层（DB归档）。
 *
 * 设计原则：
 *   - 压缩异步执行——本次回复用当前上下文，压缩结果在下次回复生效。零延迟。
 *   - 规则摘要（非 LLM）——避免额外 API 调用，零成本、确定性。
 *   - 对话组内不截断——同一 UUID 的连续轮次保持完整。
 */

import type { ConversationTurn } from '../../m5/types/index.js';

export interface CompressedContext {
  /** 锚点层：最近 N 条完整原文 */
  anchor: ConversationTurn[];
  /** 摘要层：超出锚点层的历史压缩文本 */
  summary: string | null;
  /** 总轮次数 */
  totalTurns: number;
  /** 压缩时间 */
  compressedAt: string;
}

/**
 * 压缩上下文——三层策略。
 *
 * @param allTurns 该实体的全部对话轮次（按时间升序）
 * @param anchorCount 锚点层保留条数（默认 10）
 * @param summaryCount 摘要层覆盖条数（从锚点之上回溯，默认 30）
 */
export function compressContext(
  allTurns: ConversationTurn[],
  anchorCount: number = 10,
  summaryCount: number = 30,
): CompressedContext {
  if (allTurns.length <= anchorCount) {
    return {
      anchor: allTurns,
      summary: null,
      totalTurns: allTurns.length,
      compressedAt: new Date().toISOString(),
    };
  }

  // 锚点层：最近 anchorCount 条
  const anchor = allTurns.slice(-anchorCount);

  // 摘要层：从 anchor 之上回溯 summaryCount 条
  const summaryStart = Math.max(0, allTurns.length - anchorCount - summaryCount);
  const summaryTurns = allTurns.slice(summaryStart, allTurns.length - anchorCount);

  // 规则摘要——提取高频词和关键事件
  const userMsgs = summaryTurns.filter(t => t.role === 'user').map(t => t.content);
  const assistantMsgs = summaryTurns.filter(t => t.role === 'assistant').map(t => t.content);

  // 提取用户高频提及词（> 3 字的词）
  const wordFreq = new Map<string, number>();
  for (const msg of userMsgs) {
    const words = extractKeyPhrases(msg);
    for (const w of words) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
  }
  const topWords = [...wordFreq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  // 提取助理回复中的关键陈述（含表情感的片段）
  const emotiveLines = assistantMsgs
    .filter(m => /觉得|感觉|开心|难过|喜欢|想|记得|知道|应该/.test(m))
    .slice(-3)
    .map(m => m.substring(0, 80));

  let summary: string | null = null;
  const parts: string[] = [];
  if (topWords.length > 0) parts.push(`话题: ${topWords.join('、')}`);
  if (emotiveLines.length > 0) parts.push(`最近的感受: ${emotiveLines.join('；')}`);
  if (parts.length > 0) summary = `【历史摘要】${parts.join('。')}（共${summaryTurns.length}轮对话）`;

  // 归档层：summaryStart 之前的归入 DB（调用方标记 is_compacted=1）

  return {
    anchor,
    summary,
    totalTurns: allTurns.length,
    compressedAt: new Date().toISOString(),
  };
}

/** 构建注入 LLM 的最终上下文文本 */
export function buildCompressedText(ctx: CompressedContext): string {
  const parts: string[] = [];
  if (ctx.summary) parts.push(ctx.summary);
  if (ctx.anchor.length > 0) {
    const anchorText = ctx.anchor
      .map(t => `${t.role === 'user' ? '鸿艺' : '你'}: ${t.content?.substring(0, 300) || ''}`)
      .join('\n');
    parts.push(`【最近对话】\n${anchorText}`);
  }
  return parts.join('\n\n');
}

/** 提取中文关键短语（逐字2-gram窗口切分，适应无空格的中文分词） */
function extractKeyPhrases(text: string): string[] {
  const cleaned = text.replace(/[，。！？、；：""''（）\s\d]/g, '');
  const bigrams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.push(cleaned.substring(i, i + 2));
  }
  const stopWords = new Set(['这个','那个','什么','怎么','这样','那样','可以','没有','知道','觉得',
    '因为','所以','但是','如果','虽然','而且','然后','最后','开始','已经','不会','还是','就是',
    '只是','可是','不是','是的','时候','东西','真的','一直','到底','有什么用','是不是',
    '我在','你也','我们','他们','自己','这里','那里','一个','一种','一次','一下','一点',
    '一些','什么','怎么','为什么','怎么样','这么','那么','这是','那是']);
  return [...new Set(bigrams.filter(w => w.length === 2 && !stopWords.has(w)))];
}
