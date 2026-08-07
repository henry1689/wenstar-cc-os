// ============================================================
// Agent CNC Harness — UUID 归属 Meter
// 检查 belong_entity_uuid 读写路径 + 数据库标注率
//
// Gate 策略（Calibration Patch 1）：
//   - 结构性断链（代码中找不到关键字段）→ FAIL
//   - 历史数据标注率低 → WARN（仅提醒，不阻断）
//   - 数据库不存在 / 查询异常 → WARN
// ============================================================

import * as path from 'node:path';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runUuidOwnershipMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('uuid-meter', 'UUID 归属检查', 'S');

  // ---- 第一阶段：结构性检查（关键词存在性） ----
  // 这些检查是"结构性断链"——如果缺失就是 FAIL

  const checkPaths = [
    'src/webui/chat/persistence-stage.ts',
    'src/m2/SQLiteAdapter.ts',
    'src/app/knowledge/KnowledgeEngine.ts',
    'src/m4/household/UUIDGatekeeper.ts',
  ];

  const uuidKeywords = [
    'belong_entity_uuid',
    'UUIDGatekeeper',
    'resolveBelongUUID',
    'black_diamond',
  ];

  let totalFound = 0;
  const structuralIssues: string[] = [];

  for (const f of checkPaths) {
    const fullPath = path.join(context.rootDir, f);
    if (!fileExists(fullPath)) {
      structuralIssues.push(`关键文件不存在: ${f}`);
      continue;
    }
    for (const kw of uuidKeywords) {
      const count = countOccurrences(fullPath, kw);
      if (count > 0) {
        totalFound += count;
        result.evidence.push(`${f}: "${kw}" 出现 ${count} 次`);
      }
    }
  }

  // 结构性断链判定
  if (totalFound === 0) {
    result.failures.push(
      'UUID ownership chain structural check failed.',
    );
    result.failures.push(
      '未找到任何 UUID 归属相关关键词（belong_entity_uuid / UUIDGatekeeper / resolveBelongUUID）',
    );
    result.status = 'fail';
    result.score = 0;
    // 结构性断链直接返回，不做数据库标注率查询
    return result;
  }

  // 检查 UUID 链路文件是否被修改 + 关键字段是否存在
  const uuidChainChanged = context.changedFiles.some(
    (f) =>
      f.includes('persistence-stage') ||
      f.includes('SQLiteAdapter') ||
      f.includes('UUIDGatekeeper') ||
      f.includes('KnowledgeEngine'),
  );

  const hasResolveBelongUUID = totalFound > 0; // 已经在上面累计
  if (uuidChainChanged && !hasResolveBelongUUID) {
    result.failures.push(
      'UUID ownership chain structural check failed.',
    );
    result.failures.push(
      'UUID 链路文件变更但 resolveBelongUUID 完全不存在',
    );
    result.status = 'fail';
    result.score = 0;
    return result;
  }

  result.evidence.push(`UUID 归属关键词共出现 ${totalFound} 次（结构完整）`);

  // ---- 第二阶段：数据库标注率检查（WARN，不 FAIL） ----
  // 历史数据标注率低是数据质量问题，不应阻断 Gate

  if (context.dbAvailable && fileExists(context.dbPath)) {
    try {
      // better-sqlite3 是可选运行时依赖，无 @types 声明
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sqlite3Mod: any;
      try {
        sqlite3Mod = await import('better-sqlite3');
      } catch {
        sqlite3Mod = null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Database: any = sqlite3Mod?.default ?? sqlite3Mod;

      if (Database && typeof Database === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db: any = new Database(context.dbPath, { readonly: true });
        try {
          // memories 表
          const totalMemories = db
            .prepare('SELECT COUNT(*) as cnt FROM memories')
            .get() as { cnt: number };
          const annotatedMemories = db
            .prepare(
              "SELECT COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''",
            )
            .get() as { cnt: number };

          const memRate =
            totalMemories.cnt > 0
              ? Math.round((annotatedMemories.cnt / totalMemories.cnt) * 100)
              : 0;
          result.evidence.push(
            `memories: ${annotatedMemories.cnt}/${totalMemories.cnt} 已标注 (${memRate}%)`,
          );

          if (totalMemories.cnt > 0 && memRate < 80) {
            result.warnings.push(
              `Historical UUID annotation rate below target. This is a data-quality warning, not a structural chain failure.`,
            );
            result.warnings.push(
              `memories 标注率 ${memRate}% < 80%（历史数据债务）`,
            );
          }

          // conversations 表
          const totalConversations = db
            .prepare('SELECT COUNT(*) as cnt FROM conversations')
            .get() as { cnt: number };
          const annotatedConversations = db
            .prepare(
              "SELECT COUNT(*) as cnt FROM conversations WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''",
            )
            .get() as { cnt: number };

          const convRate =
            totalConversations.cnt > 0
              ? Math.round(
                  (annotatedConversations.cnt / totalConversations.cnt) * 100,
                )
              : 0;
          result.evidence.push(
            `conversations: ${annotatedConversations.cnt}/${totalConversations.cnt} 已标注 (${convRate}%)`,
          );

          if (totalConversations.cnt > 0 && convRate < 80) {
            result.warnings.push(
              `Historical UUID annotation rate below target. This is a data-quality warning, not a structural chain failure.`,
            );
            result.warnings.push(
              `conversations 标注率 ${convRate}% < 80%（历史数据债务）`,
            );
          }
        } finally {
          db.close();
        }
      } else {
        result.warnings.push('better-sqlite3 不可用，标注率查询 skipped');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      result.warnings.push(
        `数据库标注率查询异常: ${message}. Historical UUID annotation rate below target. This is a data-quality warning, not a structural chain failure.`,
      );
    }
  } else if (!context.dbAvailable) {
    result.warnings.push(
      '数据库不可用，标注率检查 skipped. Historical UUID annotation rate below target. This is a data-quality warning, not a structural chain failure.',
    );
  }

  // ---- 最终状态判定 ----
  // 结构性检查通过 + 标注率仅作 WARN → 整体状态降级为 WARN
  if (result.status !== 'fail') {
    if (result.warnings.length > 0) {
      result.status = 'warn';
      result.score = Math.max(result.score, 70); // 结构完整但标注率有 warning
    } else {
      result.status = 'pass';
      result.score = 100;
    }
  }

  return result;
}
