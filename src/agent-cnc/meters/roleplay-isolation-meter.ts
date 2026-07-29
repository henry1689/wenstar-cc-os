// ============================================================
// Agent CNC Harness — 角色扮演隔离 Meter
// 检查 _currentRoleplay / RoleClassifier / PersonaRegistry
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runRoleplayIsolationMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult(
    'roleplay-isolation-meter',
    '角色扮演隔离检查',
    'S',
  );

  // 搜索关键词
  const rpKeywords = [
    '_currentRoleplay',
    '_currentRPBranch',
    'RoleClassifier',
    'PersonaRegistry',
    '_realFg',
    '_fgX',
  ];

  // 在整个 src 目录递归搜索？MVP 先检查关键文件
  const keyFiles = [
    'src/webui/chat.ts',
    'src/m4/household/FamilyGraph.ts',
    'src/m4/household/FamilyGraphRoleBranch.ts',
  ];

  let totalFindings = 0;
  for (const file of keyFiles) {
    const fullPath = path.join(context.rootDir, file);
    if (!fileExists(fullPath)) continue;

    for (const kw of rpKeywords) {
      const count = countOccurrences(fullPath, kw);
      if (count > 0) {
        totalFindings += count;
        result.evidence.push(`${file}: "${kw}" 出现 ${count} 次`);
      }
    }
  }

  if (totalFindings > 0) {
    result.evidence.push(`角色扮演相关关键词共出现 ${totalFindings} 次`);
    result.score = 100;
  } else {
    result.warnings.push('未在关键文件中找到角色扮演相关关键词');
    result.status = 'warn';
    result.score = 50;
  }

  // 检查 roleplay 相关文件是否被修改
  const rpChanged = context.changedFiles.some(
    (f) =>
      f.includes('/role/') ||
      f.includes('/persona/') ||
      f.includes('FamilyGraphRoleBranch') ||
      f.includes('RoleplayPromptBuilder') ||
      f.includes('PromptAssembler'),
  );

  if (rpChanged) {
    result.warnings.push(
      '⚠️ 角色扮演相关文件已修改！必须人工复核 11 条 FG 角色扮演红线',
    );
    // 输出 11 条红线作为 evidence
    const redlines = [
      '角色扮演禁止向主 FG 写入',
      '分支数据隔离，不查主 FG',
      'FG 真人绝不可被角色扮演',
      '角色切换必须彻底清理',
      '两套 FG 读写不能搞反',
      'relationToLabel 映射不能改坏',
      '退出时三清：_currentRoleplay、_currentRPBranch、FG override',
      '_realFg vs _fgX 分叉不能混用',
      '新旧角色扮演管线规则必须同步',
      'FamilyGraph 新增方法后 RoleBranch 必须同步',
      'PersonaRegistry 与 RoleClassifier 双体系必须同步',
    ];
    for (const rl of redlines) {
      result.evidence.push(`[红线] ${rl}`);
    }
    result.status = result.status === 'fail' ? 'fail' : 'warn';
  }

  return result;
}
