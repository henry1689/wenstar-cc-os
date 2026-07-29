// ============================================================
// Agent CNC Harness — 行为回归 Meter
// 检查 Golden Case 文件是否存在（MVP 静态检查）
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { checkGoldenFiles } from './base.js';
import { createResult } from './base.js';

export async function runBehaviorMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('behavior-meter', '行为回归检查', 'A');

  // 需要的 Golden Case 文件
  const requiredGoldens = [
    'golden/roleplay-exit.yaml',
    'golden/roleplay-ab-isolation.yaml',
    'golden/meeting-identity.yaml',
    'golden/reasoning-content-clean.yaml',
  ];

  const { found, missing } = checkGoldenFiles(context.rootDir, requiredGoldens);

  result.evidence.push(`Golden Case 文件: ${found.length}/${requiredGoldens.length} 存在`);

  for (const f of found) {
    result.evidence.push(`✅ ${f}`);
  }
  for (const m of missing) {
    result.warnings.push(`⚠️ Golden Case 缺失: ${m}`);
  }

  // 如果涉及关键文件修改
  const triggerPatterns = [
    'chat.ts',
    '/role/',
    '/persona/',
    'EntityMeeting',
  ];

  const hasTriggerChange = context.changedFiles.some((f) =>
    triggerPatterns.some((p) => f.includes(p)),
  );

  if (hasTriggerChange && missing.length > 0) {
    result.failures.push(
      `关键行为文件已修改但 Golden Case 缺失 ${missing.length} 个`,
    );
    result.status = 'fail';
    result.score = Math.round((found.length / requiredGoldens.length) * 100);
  } else if (missing.length > 0) {
    result.warnings.push(`${missing.length} 个 Golden Case 缺失`);
    result.status = 'warn';
    result.score = Math.round((found.length / requiredGoldens.length) * 100);
  } else {
    result.score = 100;
  }

  return result;
}
