// ============================================================
// Agent CNC Harness — 命令执行器
// 执行 shell 命令并回传结果
// ============================================================

import { execSync } from 'node:child_process';
import type { CommandResult } from './types.js';

/**
 * 执行 shell 命令并回传结构化结果
 * 命令失败不会导致 Node 进程崩溃
 */
export function runCommand(command: string, cwd?: string): CommandResult {
  const startMs = Date.now();
  let exitCode: number | null = null;
  let stdout = '';
  let stderr = '';

  try {
    stdout = execSync(command, {
      cwd: cwd || process.cwd(),
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 120_000, // 2 分钟超时
    });
    exitCode = 0;
  } catch (e: unknown) {
    const execError = e as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      status?: number;
      signal?: string;
    };
    stdout = typeof execError.stdout === 'string'
      ? execError.stdout
      : execError.stdout
        ? execError.stdout.toString()
        : '';
    stderr = typeof execError.stderr === 'string'
      ? execError.stderr
      : execError.stderr
        ? execError.stderr.toString()
        : '';
    exitCode = execError.status ?? 1;
  }

  const durationMs = Date.now() - startMs;

  return {
    command,
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    durationMs,
  };
}

/**
 * 执行 tsc --noEmit
 */
export function runTypeCheck(cwd?: string): CommandResult {
  return runCommand('npx tsc --noEmit', cwd);
}

/**
 * 执行 vitest run
 */
export function runVitest(cwd?: string): CommandResult {
  return runCommand('npx vitest run', cwd);
}

/**
 * 获取 stdout/stderr 摘要（前 N 字符）
 */
export function summary(result: CommandResult, maxLen: number = 2000): {
  stdoutSummary: string;
  stderrSummary: string;
} {
  return {
    stdoutSummary: result.stdout.slice(0, maxLen),
    stderrSummary: result.stderr.slice(0, maxLen),
  };
}
