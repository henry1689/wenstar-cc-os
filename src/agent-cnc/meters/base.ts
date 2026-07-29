// ============================================================
// Agent CNC Harness — Meter 基础工具
// MeterResult 构建辅助
// ============================================================

import type { MeterResult } from '../types.js';
import { fileExists, grepInFile, readTextFile } from '../utils.js';

/**
 * 创建基础 MeterResult
 */
export function createResult(
  id: string,
  title: string,
  severity: 'S' | 'A' | 'B' | 'C' = 'B',
): MeterResult {
  return {
    id,
    title,
    severity,
    status: 'pass',
    score: 100,
    evidence: [],
    warnings: [],
    failures: [],
  };
}

/**
 * 在文件中搜索关键词，生成 evidence
 */
export function searchEvidence(
  filePath: string,
  keywords: string[],
  label: string,
): string[] {
  const evidence: string[] = [];
  if (!fileExists(filePath)) {
    return evidence;
  }
  const content = readTextFile(filePath);
  if (!content) return evidence;

  for (const kw of keywords) {
    if (content.includes(kw)) {
      evidence.push(`${label}: 找到 "${kw}"`);
    } else {
      evidence.push(`${label}: 未找到 "${kw}"（可能缺失）`);
    }
  }
  return evidence;
}

/**
 * 在文件中计数关键词出现次数
 */
export function countOccurrences(
  filePath: string,
  keyword: string,
): number {
  if (!fileExists(filePath)) return 0;
  const content = readTextFile(filePath);
  if (!content) return 0;

  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(keyword, idx)) !== -1) {
    count++;
    idx += keyword.length;
  }
  return count;
}

/**
 * 检查 golden 文件是否存在
 */
export function checkGoldenFiles(
  rootDir: string,
  goldenPaths: string[],
): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];
  for (const gp of goldenPaths) {
    const fullPath = `${rootDir}/.agent-cnc/${gp}`;
    if (fileExists(fullPath)) {
      found.push(gp);
    } else {
      missing.push(gp);
    }
  }
  return { found, missing };
}
