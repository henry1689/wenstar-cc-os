// ============================================================
// Agent CNC Harness — SQLite 持久化 Meter
// 检查 save() / scheduleFlush / export()
// ============================================================

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { HarnessContext, MeterResult } from '../types.js';
import { fileExists } from '../utils.js';
import { createResult, countOccurrences } from './base.js';

export async function runSqlitePersistMeter(
  context: HarnessContext,
): Promise<MeterResult> {
  const result = createResult('persist-meter', 'SQLite 持久化检查', 'S');

  const sqlitePath = path.join(context.rootDir, 'src', 'm2', 'SQLiteAdapter.ts');
  const fusionPath = path.join(
    context.rootDir,
    'src',
    'm2',
    'FusionStorageAdapter.ts',
  );
  const persistPath = path.join(
    context.rootDir,
    'src',
    'webui',
    'chat',
    'persistence-stage.ts',
  );

  if (!fileExists(sqlitePath)) {
    result.status = 'skipped';
    result.score = 0;
    result.warnings.push('SQLiteAdapter.ts 不存在');
    return result;
  }

  // 检查关键方法
  const criticalMethods = ['save()', 'save', 'scheduleFlush', 'export()', 'export'];
  const fileList = [sqlitePath, fusionPath, persistPath];

  let totalFound = 0;
  for (const file of fileList) {
    if (!fileExists(file)) continue;
    for (const method of criticalMethods) {
      const count = countOccurrences(file, method);
      if (count > 0) {
        totalFound += count;
        const fileName = path.basename(file);
        result.evidence.push(`${fileName}: "${method}" 出现 ${count} 次`);
      }
    }
  }

  // 验证关键方法存在
  if (!criticalMethods.some((m) => countOccurrences(sqlitePath, m) > 0)) {
    result.failures.push('SQLiteAdapter.ts 中未找到 save/scheduleFlush/export 方法');
    result.status = 'fail';
    result.score = 0;
  } else {
    result.evidence.push(`关键持久化方法共出现 ${totalFound} 次`);
    result.score = 100;
  }

  // 检查数据库文件
  const dbPath = context.dbPath;
  if (fileExists(dbPath)) {
    try {
      const stat = fs.statSync(dbPath);
      result.evidence.push(
        `fusion_memory.db: ${(stat.size / 1024).toFixed(1)} KB`,
      );
      if (stat.size === 0) {
        result.failures.push('fusion_memory.db 文件大小为 0');
        result.status = 'fail';
        result.score = 0;
      }
    } catch {
      result.warnings.push('无法读取 fusion_memory.db 文件信息');
    }
  }

  // 如果 SQLite 相关文件被修改
  const sqliteChanged = context.changedFiles.some(
    (f) =>
      f.includes('SQLiteAdapter') ||
      f.includes('FusionStorageAdapter') ||
      f.includes('persistence-stage') ||
      f.startsWith('scripts/'),
  );
  if (sqliteChanged) {
    result.warnings.push(
      '⚠️ SQLite 持久化相关文件已修改，必须执行 停服→重启→查库 验证',
    );
    result.evidence.push(
      '持久化规则见: .agent-cnc/redlines/sqlite-persistence-rules.yaml',
    );
  }

  return result;
}
