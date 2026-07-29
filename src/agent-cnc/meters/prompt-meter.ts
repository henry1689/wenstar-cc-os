// ============================================================
// Agent CNC Harness — Prompt 注入完整性 Meter
// 检查 chat.ts 中 finalKnowledgeText 22 注入点
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists, grepInFile } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runPromptMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('prompt-meter', 'Prompt 注入完整性检查', 'S');

  const chatTsPath = path.join(context.rootDir, 'src', 'webui', 'chat.ts');
  const chatChanged = context.changedFiles.some(
    (f) => f === 'src/webui/chat.ts' || f.endsWith('/chat.ts'),
  );

  if (!fileExists(chatTsPath)) {
    result.status = 'skipped';
    result.score = 0;
    result.warnings.push('src/webui/chat.ts 不存在');
    return result;
  }

  // 检查 finalKnowledgeText 是否存在
  const finalTextMatches = grepInFile(chatTsPath, 'finalKnowledgeText');
  if (finalTextMatches.length > 0) {
    result.evidence.push(
      `找到 finalKnowledgeText，共 ${finalTextMatches.length} 处引用`,
    );
  } else {
    result.failures.push('未找到 finalKnowledgeText');
    result.status = 'fail';
    result.score = 0;
  }

  // 检查关键注入点关键词
  const injectionKeywords = [
    'PFC',
    'roleHint',
    'memoryText',
    'familyConstraint',
    'M6',
    'EngineContext',
    '_meetingEntityName',
    '_currentRoleplay',
    'systemPrompt',
  ];

  let foundCount = 0;
  for (const kw of injectionKeywords) {
    const count = countOccurrences(chatTsPath, kw);
    if (count > 0) {
      result.evidence.push(`注入点 "${kw}" 出现 ${count} 次`);
      foundCount++;
    }
  }

  const coverage = foundCount / injectionKeywords.length;
  if (coverage < 0.5) {
    result.failures.push(
      `注入点覆盖不足: ${foundCount}/${injectionKeywords.length} 个关键词`,
    );
    result.status = 'fail';
    result.score = Math.round(coverage * 100);
  } else if (coverage < 0.8) {
    result.warnings.push(
      `部分注入点缺失: 仅找到 ${foundCount}/${injectionKeywords.length} 个`,
    );
    result.status = 'warn';
    result.score = Math.round(coverage * 100);
  } else {
    result.evidence.push(
      `注入点覆盖: ${foundCount}/${injectionKeywords.length} 个关键词`,
    );
    result.score = 100;
  }

  // 如果 chat.ts 被修改，强制提醒 22 注入点人工复核
  if (chatChanged) {
    result.warnings.push(
      '⚠️ chat.ts 已被修改，必须人工复核 22 个 finalKnowledgeText 注入点',
    );
    result.evidence.push(
      '22 注入点定义见: .agent-cnc/redlines/chat-injection-points.yaml',
    );
  }

  return result;
}
