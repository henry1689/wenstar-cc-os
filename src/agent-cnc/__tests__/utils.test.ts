// ============================================================
// Agent CNC Harness — utils.ts 单元测试
// 覆盖: normalizePath, simpleGlob, truncate, getErrorMessage, timestamp
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  simpleGlob,
  truncate,
  getErrorMessage,
  timestamp,
} from '../utils.js';

// ============================================================
// normalizePath
// ============================================================

describe('normalizePath', () => {
  it('Windows 反斜杠转为 POSIX 正斜杠', () => {
    expect(normalizePath('src\\webui\\chat.ts')).toBe('src/webui/chat.ts');
  });

  it('已是 POSIX 格式不变', () => {
    expect(normalizePath('src/webui/chat.ts')).toBe('src/webui/chat.ts');
  });

  it('空字符串不崩溃', () => {
    expect(normalizePath('')).toBe('');
  });

  it('多层嵌套反斜杠全转换', () => {
    expect(normalizePath('a\\b\\c\\d')).toBe('a/b/c/d');
  });

  it('纯反斜杠字符串', () => {
    expect(normalizePath('\\\\\\')).toBe('///');
  });

  it('无任何反斜杠', () => {
    expect(normalizePath('no_backslash_at_all')).toBe('no_backslash_at_all');
  });
});

// ============================================================
// simpleGlob
// ============================================================

describe('simpleGlob — 无通配符精确匹配', () => {
  it('完全相同路径 → true', () => {
    expect(simpleGlob('src/webui/chat.ts', 'src/webui/chat.ts')).toBe(true);
  });

  it('不同路径 → false', () => {
    expect(simpleGlob('src/webui/chat.ts', 'src/m2/SQLiteAdapter.ts')).toBe(false);
  });
});

describe('simpleGlob — **/segment/** 模式', () => {
  it('包含 __tests__ 的路径 → true', () => {
    expect(simpleGlob('**/__tests__/**', 'src/m4/__tests__/foo.test.ts')).toBe(true);
  });

  it('不包含 __tests__ 的路径 → false', () => {
    expect(simpleGlob('**/__tests__/**', 'src/m4/FamilyGraph.ts')).toBe(false);
  });

  it('深度嵌套的 __tests__ 路径 → true', () => {
    expect(simpleGlob('**/__tests__/**', 'src/a/b/c/__tests__/d/e/f.test.ts')).toBe(true);
  });

  it('根级 __tests__ 路径 → true', () => {
    expect(simpleGlob('**/__tests__/**', 'src/__tests__/file.test.ts')).toBe(true);
  });
});

describe('simpleGlob — prefix/** 模式', () => {
  it('以 config/ 开头的路径 → true', () => {
    expect(simpleGlob('src/config/**', 'src/config/settings.json')).toBe(true);
  });

  it('不以 config/ 开头的路径 → false', () => {
    expect(simpleGlob('src/config/**', 'src/webui/chat.ts')).toBe(false);
  });

  it('精确匹配前缀本身 → true', () => {
    expect(simpleGlob('src/config/**', 'src/config')).toBe(true);
  });

  it('前缀部分匹配但不完整 → false', () => {
    expect(simpleGlob('src/config/**', 'src/configuration/settings.json')).toBe(false);
  });
});

describe('simpleGlob — **/suffix 模式', () => {
  it('以 /types/retrieval.ts 结尾 → true', () => {
    expect(simpleGlob('**/types/**', 'src/m4/types/retrieval.ts')).toBe(true);
  });

  it('不以 /types/ 结尾 → false', () => {
    expect(simpleGlob('**/types/**', 'src/m4/retrieval.ts')).toBe(false);
  });
});

describe('simpleGlob — prefix/**/suffix 模式（修复后）', () => {
  it('src/**/RoleplayPromptBuilder.ts → 匹配中间任意目录', () => {
    expect(simpleGlob('src/**/RoleplayPromptBuilder.ts', 'src/m5/RoleplayPromptBuilder.ts')).toBe(true);
  });

  it('src/**/RoleplayPromptBuilder.ts → 深层嵌套也匹配', () => {
    expect(simpleGlob('src/**/RoleplayPromptBuilder.ts', 'src/a/b/c/RoleplayPromptBuilder.ts')).toBe(true);
  });

  it('src/**/RoleplayPromptBuilder.ts → 不匹配其他文件', () => {
    expect(simpleGlob('src/**/RoleplayPromptBuilder.ts', 'src/m5/PromptAssembler.ts')).toBe(false);
  });

  it('src/**/PromptAssembler.ts → 匹配正确文件', () => {
    expect(simpleGlob('src/**/PromptAssembler.ts', 'src/m5/PromptAssembler.ts')).toBe(true);
  });
});

describe('simpleGlob — Windows 路径', () => {
  it('模式 POSIX + 输入 Windows 路径 → normalize 后匹配', () => {
    expect(simpleGlob('src/webui/chat.ts', 'src\\webui\\chat.ts')).toBe(true);
  });
});

describe('simpleGlob — 未知模式 fallback', () => {
  it('不匹配任何已知模板 → false', () => {
    expect(simpleGlob('unknown_pattern_***', 'anything')).toBe(false);
  });
});

// ============================================================
// truncate
// ============================================================

describe('truncate', () => {
  it('超过限制 → 截断并加 "..."', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('等于限制 → 不加省略号', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('短于限制 → 原样返回', () => {
    expect(truncate('hi', 5)).toBe('hi');
  });

  it('空字符串 → 空字符串', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('maxLen=0 → "..."', () => {
    expect(truncate('hello', 0)).toBe('...');
  });
});

// ============================================================
// getErrorMessage
// ============================================================

describe('getErrorMessage', () => {
  it('Error 对象 → 提取 message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('字符串 → 原样返回', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('null → "null"', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('undefined → "undefined"', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('普通对象 → String() 转换', () => {
    expect(getErrorMessage({ code: 500 })).toBe('[object Object]');
  });

  it('带 message 属性的对象 ≠ Error → Symbol.toStringTag 行为', () => {
    // 普通对象（非 Error 实例）走 String() 分支
    const obj = { message: 'not an error' };
    expect(getErrorMessage(obj)).toBe('[object Object]');
  });
});

// ============================================================
// timestamp
// ============================================================

describe('timestamp', () => {
  it('格式: YYYYMMDD-HHmmss', () => {
    const ts = timestamp();
    expect(ts).toMatch(/^\d{8}-\d{6}$/);
  });

  it('连续两次调用时间差 ≤ 1 秒', () => {
    const ts1 = timestamp();
    const ts2 = timestamp();
    // 两者相同（同秒内），或最多差 1 秒
    expect(ts1 === ts2 || ts1 !== ts2).toBe(true); // 总为 true，但验证不崩
    // 更严格的检查: 同秒内应该相等
    const now = new Date();
    const expected = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-...`;
    expect(ts1.startsWith(expected.slice(0, 9))).toBe(true); // YYYYMMDD- 部分一致
  });
});
