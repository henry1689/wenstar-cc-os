// ============================================================
// Agent CNC Harness — 工具函数
// glob 匹配、路径标准化、文件操作
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 将 Windows 反斜杠统一替换为 POSIX 正斜杠
 * 确保所有路径匹配都在 POSIX 风格下进行
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * 简单 glob 匹配 —— 不引入 minimatch
 * 支持:
 *   - ** /__tests__/ ** → 路径包含 /__tests__/
 *   - src/config/** → 路径以 src/config/ 开头
 *   - src/types/** 或 src/** /types/** → 同上
 *   - 精确匹配（不含 *）→ 完全相等或 endsWith
 */
export function simpleGlob(pattern: string, filePath: string): boolean {
  const normalized = normalizePath(filePath);

  // 没有通配符 → 精确匹配或结尾匹配
  if (!pattern.includes('*')) {
    return normalized === pattern || normalized.endsWith('/' + pattern);
  }

  // ** /foo/** → 路径包含 /foo/
  // 或 ** /foo/bar/** → 路径包含 /foo/bar/
  const doubleStarMatch = pattern.match(/^\*\*\/(.+?)\/\*\*$/);
  if (doubleStarMatch) {
    const segment = doubleStarMatch[1];
    return normalized.includes('/' + segment + '/');
  }

  // prefix/**/suffix → 以 prefix/ 开头 且 以 /suffix 结尾（或 = prefix/suffix）
  // 例: src/**/RoleplayPromptBuilder.ts → src/m5/RoleplayPromptBuilder.ts
  const midStarMatch = pattern.match(/^([^*]+)\/\*\*\/(.+)$/);
  if (midStarMatch) {
    const pfx = midStarMatch[1];
    const sfx = midStarMatch[2];
    return (
      normalized.startsWith(pfx + '/') || normalized === pfx
    ) && (
      normalized.endsWith('/' + sfx) || normalized === pfx + '/' + sfx
    );
  }

  // prefix/** → 路径以 prefix/ 开头
  const prefixMatch = pattern.match(/^(.+)\/\*\*$/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    return normalized.startsWith(prefix + '/') || normalized === prefix;
  }

  // ** /suffix → 路径以 suffix 结尾
  const suffixMatch = pattern.match(/^\*\*\/(.+?)$/);
  if (suffixMatch) {
    const suffix = suffixMatch[1];
    return normalized.endsWith('/' + suffix) || normalized === suffix;
  }

  return false;
}

/**
 * 检查文件是否存在
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * 检查目录是否存在
 */
export function dirExists(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 读取文本文件内容
 */
export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 在文件中搜索关键词，返回每条匹配行的内容
 */
export function grepInFile(
  filePath: string,
  keyword: string,
): string[] {
  const content = readTextFile(filePath);
  if (!content) return [];
  const lines = content.split('\n');
  const results: string[] = [];
  for (const line of lines) {
    if (line.includes(keyword)) {
      results.push(line.trim());
    }
  }
  return results;
}

/**
 * 在多个文件中搜索关键词，返回匹配次数
 */
export function countInFiles(
  rootDir: string,
  filePatterns: string[],
  keyword: string,
): number {
  let count = 0;
  for (const pattern of filePatterns) {
    const fullPath = path.join(rootDir, pattern);
    if (fileExists(fullPath)) {
      const matches = grepInFile(fullPath, keyword);
      count += matches.length;
    }
  }
  return count;
}

/**
 * 截断字符串到指定长度，超出部分加 "..."
 */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

/**
 * 安全地获取错误消息
 */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 获取当前时间戳字符串 YYYYMMDD-HHmmss
 */
export function timestamp(): string {
  const now = new Date();
  const YYYY = now.getFullYear().toString();
  const MM = (now.getMonth() + 1).toString().padStart(2, '0');
  const DD = now.getDate().toString().padStart(2, '0');
  const hh = now.getHours().toString().padStart(2, '0');
  const mm = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  return `${YYYY}${MM}${DD}-${hh}${mm}${ss}`;
}

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!dirExists(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取 Node.js 版本字符串
 */
export function getNodeVersion(): string {
  return process.version;
}
