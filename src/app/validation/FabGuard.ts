/**
 * FabGuard — L5 事后编造检测器
 * ==============================
 * 在 LLM 回复生成后执行，检查回复中的回忆性断言
 * 是否能在本轮的 memoryFragments 中找到支撑。
 *
 * 零 LLM 调用，纯正则 + 子串匹配。
 * 不拦截回复，只打日志供 MemorySelfReview 自省模块分析。
 *
 * Ref: CLAUDE.md 反编造五层防御体系 §L5
 */

export interface FabGuardResult {
  hasViolation: boolean;
  suspiciousAssertions: string[];
  severity: 'none' | 'low' | 'medium' | 'high';
}

/** 回忆性断言正则 */
const RECALL_PATTERNS: RegExp[] = [
  /上次我们(.{2,30})[了过]/g,
  /上次你(.{2,30})[了过]/g,
  /之前你(.{2,30})[了过]/g,
  /之前我们(.{2,30})[了过]/g,
  /以前你(.{2,30})[了过]/g,
  /我记得你(.{2,30})[了过]/g,
  /我知道你(.{2,15})/g,
  /我们曾经(.{2,30})[了过]/g,
  /你过去(.{2,30})[了过]/g,
  /那次.{0,4}我们(.{2,30})[了过]/g,
];

export function guardReply(reply: string, memoryFragments: string[]): FabGuardResult {
  if (!reply || memoryFragments.length === 0) {
    return { hasViolation: false, suspiciousAssertions: [], severity: 'none' };
  }

  const memoryText = memoryFragments.join(' ');
  const suspicious: string[] = [];

  for (const pattern of RECALL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(reply)) !== null) {
      const assertion = match[0];
      const core = match[1].trim();
      if (core.length < 3) continue;
      if (!memoryFragments.some(frag => frag.includes(core))) {
        suspicious.push(assertion);
      }
    }
  }

  const unique = [...new Set(suspicious)];
  if (unique.length === 0) return { hasViolation: false, suspiciousAssertions: [], severity: 'none' };

  const severity: FabGuardResult['severity'] =
    unique.length >= 4 ? 'high' : unique.length >= 2 ? 'medium' : 'low';

  return { hasViolation: true, suspiciousAssertions: unique, severity };
}

export function writeFabGuardLog(
  _sqlite: any, reply: string, result: FabGuardResult, fragmentCount: number,
): void {
  if (!result.hasViolation) return;
  try {
    console.log(
      `[FabGuard] ⚠️ 疑似编造 x${result.suspiciousAssertions.length} ` +
      `(严重度:${result.severity}) | 记忆碎片:${fragmentCount}条 | ` +
      `断言: ${result.suspiciousAssertions.slice(0, 3).join(' | ')}` +
      ` | 回复预览: ${reply.substring(0, 150)}`
    );
  } catch { /* 日志失败不阻塞 */ }
}
