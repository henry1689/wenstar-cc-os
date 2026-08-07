/**
 * WorkDetector — 创作意图检测器（纯规则，无 LLM）
 * ============================================================
 * 检测用户消息是否为"作品"（小说/故事/文章/设定），并提取元数据。
 * 为"长文召回"提供元数据桥——让"那篇小说"这类指称词可被解析。
 *
 * 评审修订（V2）：
 *   - 叙事标记清单明确
 *   - 黑名单排除（纯指令/清单/日志）
 *   - 结构约束（连续文本块，非多轮交替）
 *   - 置信度分级（低置信度不自动建 work，仅标记候选）
 */
import type { DNA } from '../../m1/types/dna.js';

/** 叙事标记（明确的作品特征） */
const NARRATIVE_MARKERS = [
  '小说', '故事', '第一章', '第二章', '第三章', '正文', '尾声', '番外',
  '续写', '连载', '人物设定', '角色设定', '世界观', '台词', '章节',
  '楔子', '开篇', '结局', '人物小传',
];

/** 黑名单（纯指令/清单/日志类，不识别为作品） */
const BLACKLIST_PATTERNS = [
  /^(?:帮我|请你|麻烦|求求你|帮我写|帮我改|帮我检查|帮我看看)/,  // 纯指令开头
  /^(?:删除|修改|更新|查询|列出|总结|翻译|解释|分析)/,           // 操作型指令
  /^(?:步骤|清单|列表|日程|备忘|TODO|待办)/,                     // 清单/日程
  /^(?:错误|日志|报错|异常|stack|trace)/,                          // 日志
];

/** 书名号模式：《…》 */
const BOOK_TITLE_RE = /《([^》]{2,20})》/;

/** 检测结果 */
export interface WorkDetection {
  isWork: boolean;
  workType: 'novel' | 'story' | 'article' | 'rp_setting' | null;
  title: string;
  summary: string;
  firstSentence: string;
  confidence: 'high' | 'medium' | 'low';
  /** 是否为续写（同一会话内已有作品） */
  isContinuation: boolean;
}

/**
 * 检测消息是否为作品。
 * @param text 用户消息全文
 * @param dna DNA（含 dialog_group_id 用于续写判断）
 * @param existingWorkId 当前会话已关联的作品 id（续写判断）
 */
export function detectWork(
  text: string,
  dna?: DNA,
  existingWorkId?: string | null,
): WorkDetection {
  const trimmed = (text || '').trim();

  // 空/过短不识别
  if (trimmed.length < 200) {
    return { isWork: false, workType: null, title: '', summary: '', firstSentence: '', confidence: 'low', isContinuation: false };
  }

  // 黑名单排除
  if (BLACKLIST_PATTERNS.some(p => p.test(trimmed))) {
    return { isWork: false, workType: null, title: '', summary: '', firstSentence: '', confidence: 'low', isContinuation: false };
  }

  // 提取首句（≤24字）
  const firstSentence = _extractFirstSentence(trimmed);

  // 书名号 → 高置信度
  const bookMatch = trimmed.match(BOOK_TITLE_RE);
  if (bookMatch) {
    return _buildWork('novel', bookMatch[1], trimmed, firstSentence, 'high', !!existingWorkId);
  }

  // 叙事标记命中 → 高/中置信度（按长度）
  const hasMarker = NARRATIVE_MARKERS.some(m => trimmed.includes(m));
  const lengthScore = trimmed.length;

  if (hasMarker && lengthScore >= 300) {
    // 高置信度：长文本 + 叙事标记
    return _buildWork('story', firstSentence, trimmed, firstSentence, 'high', !!existingWorkId);
  }
  if (hasMarker) {
    // 中置信度：有标记但较短
    return _buildWork('story', firstSentence, trimmed, firstSentence, 'medium', !!existingWorkId);
  }

  // 超长（≥800）无标记 → 中置信度
  if (lengthScore >= 800) {
    return _buildWork('article', firstSentence, trimmed, firstSentence, 'medium', !!existingWorkId);
  }

  // 低置信度候选（不自动建，仅标记）
  if (lengthScore >= 500) {
    return { isWork: true, workType: 'story', title: firstSentence, summary: '', firstSentence, confidence: 'low', isContinuation: !!existingWorkId };
  }

  return { isWork: false, workType: null, title: '', summary: '', firstSentence: '', confidence: 'low', isContinuation: false };
}

function _buildWork(
  type: 'novel' | 'story' | 'article',
  title: string,
  fullText: string,
  firstSentence: string,
  confidence: WorkDetection['confidence'],
  isContinuation: boolean,
): WorkDetection {
  return {
    isWork: true,
    workType: type,
    title: title || `作品_${_todayStr()}`,
    summary: _extractSummary(fullText),
    firstSentence,
    confidence,
    isContinuation,
  };
}

/** 提取首句（≤24字） */
function _extractFirstSentence(text: string): string {
  const m = text.match(/^(.{1,24}[。！？!?]?)/);
  if (m) return m[1].trim();
  return text.substring(0, 24);
}

/** 提取式摘要（首2句 + 中段含引号对话句，≤600字） */
function _extractSummary(text: string): string {
  const parts: string[] = [];
  // 首 2 句
  const firstTwo = text.match(/^(.{1,60}[。！？!?]){1,2}/);
  if (firstTwo) parts.push(firstTwo[0]);
  // 中段含引号的对话句
  const quoteMatch = text.substring(text.length / 3, (text.length / 3) * 2).match(/“[^”]{5,50}”/g);
  if (quoteMatch) parts.push(quoteMatch.slice(0, 2).join(' '));
  return parts.join(' ').substring(0, 600);
}

/** 今日日期（作品_MMdd 兜底标题） */
function _todayStr(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
