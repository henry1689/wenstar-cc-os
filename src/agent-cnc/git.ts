// ============================================================
// Agent CNC Harness — Git 操作
// 获取 staged + unstaged + untracked 变更文件
// ============================================================

import { execSync } from 'node:child_process';
import { normalizePath } from './utils.js';

/**
 * 检查 git 是否可用
 */
export function isGitAvailable(cwd: string = process.cwd()): boolean {
  try {
    execSync('git --version', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查指定目录是否在 git 仓库中
 */
export function isGitRepo(cwd: string = process.cwd()): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 执行 git 命令并返回输出的行数组
 */
function gitLines(args: string, cwd?: string): string[] {
  try {
    const output = execSync(`git ${args}`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      cwd: cwd || process.cwd(),
    });
    return output
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(normalizePath);
  } catch {
    return [];
  }
}

/**
 * 获取所有变更文件：
 *   staged   → git diff --cached --name-only
 *   unstaged → git diff --name-only
 *   untracked → git ls-files --others --exclude-standard
 */
export function getChangedFiles(cwd?: string): string[] {
  const staged = gitLines('diff --cached --name-only', cwd);
  const unstaged = gitLines('diff --name-only', cwd);
  const untracked = gitLines('ls-files --others --exclude-standard', cwd);

  const all = [...staged, ...unstaged, ...untracked];
  // 去重
  return [...new Set(all)];
}

/**
 * 获取相对于 base 的变更文件
 */
export function getChangedFilesSince(base: string, cwd?: string): string[] {
  return gitLines(`diff --name-only ${base}`, cwd);
}

/**
 * git diff 不可用时的 fallback：返回空数组
 */
export function getChangedFilesSafe(cwd?: string): string[] {
  if (isGitAvailable() && isGitRepo()) {
    return getChangedFiles(cwd);
  }
  return [];
}
