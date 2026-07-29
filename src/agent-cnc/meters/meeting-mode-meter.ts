// ============================================================
// Agent CNC Harness — 会晤模式隔离 Meter
// 检查 _meetingEntityName 12 个传播点
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runMeetingModeMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('meeting-mode-meter', '会晤模式隔离检查', 'S');

  const chatTsPath = path.join(context.rootDir, 'src', 'webui', 'chat.ts');
  const meetingTsPath = path.join(
    context.rootDir,
    'src',
    'm4',
    'household',
    'EntityMeeting.ts',
  );
  const pipelineTsPath = path.join(
    context.rootDir,
    'src',
    'webui',
    'chat',
    'MeetingContextPipeline.ts',
  );

  let totalOccurrences = 0;

  // 检查 _meetingEntityName 在 chat.ts 中的出现次数
  if (fileExists(chatTsPath)) {
    const count = countOccurrences(chatTsPath, '_meetingEntityName');
    totalOccurrences += count;
    result.evidence.push(`chat.ts: _meetingEntityName 出现 ${count} 次`);
  }

  // 在 EntityMeeting.ts 中
  if (fileExists(meetingTsPath)) {
    const count = countOccurrences(meetingTsPath, '_meetingEntityName');
    totalOccurrences += count;
    result.evidence.push(`EntityMeeting.ts: _meetingEntityName 出现 ${count} 次`);
  }

  // 在 MeetingContextPipeline.ts 中
  if (fileExists(pipelineTsPath)) {
    const count = countOccurrences(pipelineTsPath, '_meetingEntityName');
    totalOccurrences += count;
    result.evidence.push(`MeetingContextPipeline.ts: _meetingEntityName 出现 ${count} 次`);
  }

  // 检查 isEntityMeeting 关键词
  if (fileExists(chatTsPath)) {
    const isMeetingCount = countOccurrences(chatTsPath, 'isEntityMeeting');
    result.evidence.push(`isEntityMeeting 出现 ${isMeetingCount} 次`);
  }

  // 检查 MeetingContextPipeline
  if (fileExists(chatTsPath)) {
    const pipelineCount = countOccurrences(chatTsPath, 'MeetingContextPipeline');
    result.evidence.push(`MeetingContextPipeline 引用 ${pipelineCount} 次`);
  }

  // 判断：chat.ts 修改 + _meetingEntityName 出现次数低于 12 → FAIL/WARN
  const chatChanged = context.changedFiles.some(
    (f) => f === 'src/webui/chat.ts' || f.includes('EntityMeeting') || f.includes('MeetingContextPipeline'),
  );

  if (totalOccurrences < 12) {
    result.failures.push(
      `_meetingEntityName 总出现次数 ${totalOccurrences} < 12，可能丢失传播点`,
    );
    result.status = 'fail';
    result.score = Math.round((totalOccurrences / 12) * 100);
  } else {
    result.evidence.push(
      `_meetingEntityName 总出现次数 ${totalOccurrences} >= 12，传播点完整`,
    );
    result.score = 100;
  }

  if (chatChanged) {
    result.warnings.push(
      '⚠️ 会晤模式相关文件已修改，必须人工复核 12 个 _meetingEntityName 传播点',
    );
    result.evidence.push(
      '12 传播点定义见: .agent-cnc/redlines/meeting-propagation-chain.yaml',
    );
  }

  return result;
}
