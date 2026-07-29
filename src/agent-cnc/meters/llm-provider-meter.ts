// ============================================================
// Agent CNC Harness — LLM Provider 输出清洁性 Meter
// 检查 reasoning_content 清洗逻辑
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runLlmProviderMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('llm-meter', 'LLM Provider 输出清洁性检查', 'S');

  const providerPath = path.join(
    context.rootDir,
    'src',
    'm5',
    'DeepSeekLLMProvider.ts',
  );

  if (!fileExists(providerPath)) {
    result.status = 'skipped';
    result.score = 0;
    result.warnings.push('DeepSeekLLMProvider.ts 不存在');
    return result;
  }

  // 检查 reasoning_content 清洗
  const reasoningCount = countOccurrences(providerPath, 'reasoning_content');
  result.evidence.push(`"reasoning_content" 出现 ${reasoningCount} 次`);

  if (reasoningCount > 0) {
    result.evidence.push('reasoning_content 关键词存在，清洗逻辑已引用');
  } else {
    // 也检查其他 LLM 相关文件
    const otherFiles = [
      'src/m5/M5Orchestrator.ts',
      'src/m5/CognitionAssembler.ts',
      'src/m5/MockLLMProvider.ts',
    ];
    let totalOther = 0;
    for (const f of otherFiles) {
      const fullPath = path.join(context.rootDir, f);
      if (fileExists(fullPath)) {
        const c = countOccurrences(fullPath, 'reasoning_content');
        totalOther += c;
        if (c > 0) {
          result.evidence.push(`${f}: "reasoning_content" 出现 ${c} 次`);
        }
      }
    }
    if (totalOther > 0) {
      result.evidence.push(`reasoning_content 在其他 LLM 文件中出现 ${totalOther} 次`);
    }
  }

  // 检查 retry 逻辑
  const retryCount = countOccurrences(providerPath, 'retry');
  if (retryCount > 0) {
    result.evidence.push(`"retry" 出现 ${retryCount} 次（重试逻辑存在）`);
  } else {
    // 检查其他重试相关关键词
    const retryKeywords = ['retry', 'maxRetries', 'retryDelay', 'backoff'];
    let retryFound = false;
    for (const kw of retryKeywords) {
      if (countOccurrences(providerPath, kw) > 0) {
        result.evidence.push(`重试相关关键词 "${kw}" 存在`);
        retryFound = true;
        break;
      }
    }
    if (!retryFound) {
      result.warnings.push('未找到 retry 相关关键词，可能缺少重试逻辑');
      result.status = 'warn';
      result.score = 70;
    }
  }

  // 如果 LLM provider 被修改
  const llmChanged = context.changedFiles.some(
    (f) =>
      f.includes('DeepSeekLLMProvider') ||
      f.includes('MockLLMProvider') ||
      f.includes('M5Orchestrator') ||
      f.includes('CognitionAssembler') ||
      f.includes('StrategySelector') ||
      f.includes('/m5/prompts/'),
  );

  if (llmChanged) {
    // 如果 provider 被修改但找不到 reasoning_content 清洗 → FAIL
    if (reasoningCount === 0) {
      // 再检查是否在其他地方
      let totalRC = reasoningCount;
      const otherFiles = [
        'src/m5/M5Orchestrator.ts',
        'src/m5/CognitionAssembler.ts',
      ];
      for (const f of otherFiles) {
        const fullPath = path.join(context.rootDir, f);
        if (fileExists(fullPath)) {
          totalRC += countOccurrences(fullPath, 'reasoning_content');
        }
      }
      if (totalRC === 0) {
        result.failures.push(
          'LLM Provider 被修改但未找到 reasoning_content 清洗逻辑！',
        );
        result.status = 'fail';
        result.score = 0;
      }
    }
    result.warnings.push(
      '⚠️ LLM Provider 相关文件已修改，必须验证 reasoning_content 清洗 + prompt 拼装顺序',
    );
  }

  return result;
}
