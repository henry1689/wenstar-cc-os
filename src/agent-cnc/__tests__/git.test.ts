// ============================================================
// Agent CNC Harness — git.ts 环境检查 单元测试
// 覆盖: isGitRepo(cwd), isGitAvailable(cwd)
// 策略: temp dir + git init/未 init 验证 cwd 参数
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { isGitRepo, isGitAvailable } from '../git.js';

describe('isGitRepo', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-git-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GIT1: 未 git init 的 temp dir → isGitRepo(tmpDir) === false', () => {
    expect(isGitRepo(tmpDir)).toBe(false);
  });

  it('GIT2: git init 后的 temp dir → isGitRepo(tmpDir) === true', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    expect(isGitRepo(tmpDir)).toBe(true);
  });

  it('GIT3: 子目录 → isGitRepo(childDir) === true（继承父级 git）', () => {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    const childDir = path.join(tmpDir, 'nested', 'deep');
    fs.mkdirSync(childDir, { recursive: true });
    // 子目录继承父级的 .git → isGitRepo 应返回 true
    expect(isGitRepo(childDir)).toBe(true);
  });

  it('GIT4: 空字符串 → 行为不抛异常', () => {
    // 空 cwd 在 Windows 上是当前目录，在 Linux 上可能报错
    // 断言不抛异常即可
    expect(() => isGitRepo('')).not.toThrow();
    expect(typeof isGitRepo('')).toBe('boolean');
  });
});

describe('isGitAvailable', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cnc-gitav-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GIT5: git 可用的系统上 → isGitAvailable(tmpDir) === true', () => {
    expect(isGitAvailable(tmpDir)).toBe(true);
  });

  it('GIT6: 返回 boolean，不抛异常', () => {
    expect(typeof isGitAvailable(tmpDir)).toBe('boolean');
    // 无 cwd 参数时使用 process.cwd() 默认值
    expect(typeof isGitAvailable()).toBe('boolean');
  });
});
