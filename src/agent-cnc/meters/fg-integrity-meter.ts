// ============================================================
// Agent CNC Harness — FamilyGraph 完整性 Meter
// 检查 nodes/edges/properties/dossier/relationToLabel
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runFgIntegrityMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('fg-meter', 'FamilyGraph 完整性检查', 'S');

  const fgPath = path.join(
    context.rootDir,
    'src',
    'm4',
    'household',
    'FamilyGraph.ts',
  );

  if (!fileExists(fgPath)) {
    result.status = 'skipped';
    result.score = 0;
    result.warnings.push('FamilyGraph.ts 不存在');
    return result;
  }

  // 检查核心结构关键词
  const structureKeywords = [
    'nodes',
    'edges',
    'properties',
    'dossier',
    'relationToLabel',
    'uuid',
  ];

  let foundCount = 0;
  for (const kw of structureKeywords) {
    const count = countOccurrences(fgPath, kw);
    if (count > 0) {
      foundCount++;
      result.evidence.push(`FamilyGraph.ts: "${kw}" 出现 ${count} 次`);
    } else {
      result.failures.push(`FamilyGraph.ts 缺失核心结构: ${kw}`);
    }
  }

  // 检查 _realFg / _fgX 分叉
  const forkKeywords = ['_realFg', '_fgX'];
  for (const kw of forkKeywords) {
    const count = countOccurrences(fgPath, kw);
    if (count > 0) {
      result.evidence.push(`FG 分叉: "${kw}" 出现 ${count} 次`);
    }
  }

  // 评分
  const coverage = foundCount / structureKeywords.length;
  if (coverage < 0.5) {
    result.status = 'fail';
    result.score = Math.round(coverage * 100);
  } else if (coverage < 0.8) {
    result.warnings.push(`FG 核心结构覆盖不足: ${foundCount}/${structureKeywords.length}`);
    result.status = 'warn';
    result.score = Math.round(coverage * 100);
  } else {
    result.evidence.push(
      `FG 核心结构完整: ${foundCount}/${structureKeywords.length}`,
    );
    result.score = 100;
  }

  // 如果 FG 文件被修改
  const fgChanged = context.changedFiles.some(
    (f) => f.includes('FamilyGraph'),
  );
  if (fgChanged) {
    result.warnings.push(
      '⚠️ FamilyGraph 已被修改，必须人工复核 dossier 消费方和 11 条红线',
    );
  }

  return result;
}
