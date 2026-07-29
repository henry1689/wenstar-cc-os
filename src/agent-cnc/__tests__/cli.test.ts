// ============================================================
// Agent CNC Harness — cli.ts 参数解析 单元测试
// 覆盖: parseArgs (所有 flag + 子命令), hasLine
// 安全策略: 纯函数测试，不执行命令、不写文件、不调用 process.exit
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseArgs, hasLine } from '../cli.js';

// ============================================================
// parseArgs — 子命令
// ============================================================

describe('parseArgs — 子命令', () => {
  it('场景 1: 空参数 → command="doctor", 所有 flag 为默认值', () => {
    const args = parseArgs([]);

    expect(args.command).toBe('doctor');
    expect(args.noTest).toBe(false);
    expect(args.test).toBe(false);
    expect(args.strict).toBe(false);
    expect(args.offline).toBe(false);
    expect(args.planPath).toBeNull();
    expect(args.baseRef).toBeNull();
    expect(args.files).toBeNull();
  });

  it('场景 2a: 子命令 scan → command="scan"', () => {
    const args = parseArgs(['scan']);
    expect(args.command).toBe('scan');
  });

  it('场景 2b: 子命令 validate → command="validate"', () => {
    const args = parseArgs(['validate']);
    expect(args.command).toBe('validate');
  });

  it('场景 2c: 子命令 guard → command="guard"', () => {
    const args = parseArgs(['guard']);
    expect(args.command).toBe('guard');
  });

  it('场景 2d: 子命令 report → command="report"', () => {
    const args = parseArgs(['report']);
    expect(args.command).toBe('report');
  });

  it('场景 2e: 多个非 flag 参数 → 最后一个作为 command', () => {
    const args = parseArgs(['scan', 'validate']);
    expect(args.command).toBe('validate');
  });
});

// ============================================================
// parseArgs — 布尔 Flag
// ============================================================

describe('parseArgs — 布尔 Flag', () => {
  it('场景 3: --no-test → noTest=true (command 为 raw[0])', () => {
    const args = parseArgs(['scan', '--no-test']);
    expect(args.noTest).toBe(true);
    expect(args.test).toBe(false);
    expect(args.command).toBe('scan');
  });

  it('场景 4: --test → test=true', () => {
    const args = parseArgs(['scan', '--test']);
    expect(args.test).toBe(true);
    expect(args.noTest).toBe(false);
  });

  it('场景 5: --strict → strict=true', () => {
    const args = parseArgs(['scan', '--strict']);
    expect(args.strict).toBe(true);
  });

  it('场景 6: --offline → offline=true', () => {
    const args = parseArgs(['scan', '--offline']);
    expect(args.offline).toBe(true);
  });

  it('布尔 flag 组合: --strict --offline --no-test', () => {
    const args = parseArgs(['guard', '--strict', '--offline', '--no-test']);

    expect(args.command).toBe('guard');
    expect(args.strict).toBe(true);
    expect(args.offline).toBe(true);
    expect(args.noTest).toBe(true);
    expect(args.test).toBe(false);
  });
});

// ============================================================
// parseArgs — 值 Flag
// ============================================================

describe('parseArgs — 值 Flag', () => {
  it('场景 7: --plan <path> → planPath 存储路径', () => {
    const args = parseArgs(['guard', '--plan', 'my-plan.md']);
    expect(args.planPath).toBe('my-plan.md');
  });

  it('场景 7b: --plan 无后续参数 → planPath 保持 null', () => {
    const args = parseArgs(['guard', '--plan']);
    expect(args.planPath).toBeNull();
  });

  it('场景 8: --base <ref> → baseRef 存储 ref', () => {
    const args = parseArgs(['guard', '--base', 'HEAD~5']);
    expect(args.baseRef).toBe('HEAD~5');
  });

  it('场景 8b: --base 无后续参数 → baseRef 保持 null', () => {
    const args = parseArgs(['guard', '--base']);
    expect(args.baseRef).toBeNull();
  });

  it('场景 9: --files <a,b,c> → 拆分为数组且 trim', () => {
    const args = parseArgs(['scan', '--files', 'a.ts, b.ts , c.ts']);
    expect(args.files).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('场景 9b: --files 单个文件 → 单元素数组', () => {
    const args = parseArgs(['scan', '--files', 'src/webui/chat.ts']);
    expect(args.files).toEqual(['src/webui/chat.ts']);
  });

  it('场景 9c: --files 无后续参数 → files 保持 null', () => {
    const args = parseArgs(['scan', '--files']);
    expect(args.files).toBeNull();
  });
});

// ============================================================
// parseArgs — 全组合
// ============================================================

describe('parseArgs — 全组合场景', () => {
  it('场景 10a: guard --strict --test --plan x.md → 全部正确', () => {
    const args = parseArgs(['guard', '--strict', '--test', '--plan', 'change-plan.md']);

    expect(args.command).toBe('guard');
    expect(args.strict).toBe(true);
    expect(args.test).toBe(true);
    expect(args.planPath).toBe('change-plan.md');
    expect(args.noTest).toBe(false);
    expect(args.offline).toBe(false);
  });

  it('场景 10b: scan --files a,b --offline → 全部正确', () => {
    const args = parseArgs(['scan', '--files', 'a.ts,b.ts', '--offline']);

    expect(args.command).toBe('scan');
    expect(args.files).toEqual(['a.ts', 'b.ts']);
    expect(args.offline).toBe(true);
  });

  it('场景 10c: guard --no-test --base HEAD~1 --files x.ts → 全部正确', () => {
    const args = parseArgs(['guard', '--no-test', '--base', 'HEAD~1', '--files', 'x.ts']);

    expect(args.command).toBe('guard');
    expect(args.noTest).toBe(true);
    expect(args.baseRef).toBe('HEAD~1');
    expect(args.files).toEqual(['x.ts']);
  });

  it('场景 10d: 未知 flag → 静默跳过，不影响已知 flag', () => {
    const args = parseArgs(['--unknown-flag', 'scan', '--test']);

    expect(args.command).toBe('scan');
    expect(args.test).toBe(true);
    // 不崩溃、不报错
  });
});

// ============================================================
// hasLine — 纯函数
// ============================================================

describe('hasLine', () => {
  it('场景 11: 内容包含搜索字符串 → true', () => {
    const content = 'line one\nline two\nline three';
    expect(hasLine(content, 'two')).toBe(true);
  });

  it('场景 11b: 内容包含搜索字符串（首行） → true', () => {
    expect(hasLine('first line\nsecond', 'first')).toBe(true);
  });

  it('场景 11c: 内容包含搜索字符串（末行） → true', () => {
    expect(hasLine('first\nlast line here', 'here')).toBe(true);
  });

  it('场景 12: 内容不包含搜索字符串 → false', () => {
    const content = 'line one\nline two\nline three';
    expect(hasLine(content, 'four')).toBe(false);
  });

  it('场景 12b: 空内容 → false', () => {
    expect(hasLine('', 'anything')).toBe(false);
  });

  it('场景 12c: 空搜索字符串 → true（空字符串在任何行都有）', () => {
    expect(hasLine('hello\nworld', '')).toBe(true);
  });
});
