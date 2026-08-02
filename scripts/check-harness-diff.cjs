#!/usr/bin/env node
// ============================================================
// META-GOV-A — Harness Self-Modification Guard
// ============================================================
//
// 检查 git diff 是否有禁止/受保护文件变更。
//
// 用法:
//   node scripts/check-harness-diff.cjs          宽松模式
//   node scripts/check-harness-diff.cjs --strict 严格模式
//
// 环境变量:
//   META_GOV_CHANGED_FILES=newline-separated  跳过 git，使用指定文件列表（测试用）
//   META_GOV_ALLOW_PROTECTED=1                严格模式下允许受保护文件变更
//
// 退出码:
//   0 = PASS 或 PASS_WITH_PROTECTED_REVIEW
//   1 = FAIL_FORBIDDEN_CHANGE
//   2 = FAIL_GIT_UNAVAILABLE_OR_INTERNAL_ERROR
// ============================================================

var child_process = require('child_process');
var path = require('path');
var fs = require('fs');

// ═══════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════

var FORBIDDEN_PATTERNS = [
  'src/**',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '**/*.db',
  '**/*.sqlite',
  '**/*.sqlite3',
  '**/migrations/**',
  '**/schema/**',
  '**/production/**',
  '**/prod/**',
  '**/*audit*.jsonl',
  '.env',
  '.env.*',
];

var PROTECTED_SCRIPTS = [
  'scripts/_governance-gate.cjs',
  'scripts/_governance-audit.cjs',
  'scripts/_test-db-isolation.cjs',
];

// 受保护模式 — 匹配即受保护 (非禁止)
var PROTECTED_PATTERNS = [
  'scripts/*.cjs',       // 所有受治理 CJS 脚本
  'scripts/*.mjs',       // 所有受治理 ESM 脚本
];

var PROTECTED_SMOKE_TESTS = [
  'scripts/__tests__/script-gov-a2c-smoke.test.ts',
  'scripts/__tests__/script-gov-a2d-batch-1-smoke.test.ts',
  'scripts/__tests__/script-gov-a2d-batch-2-smoke.test.ts',
  'scripts/__tests__/script-gov-b-audit-smoke.test.ts',
  'scripts/__tests__/script-gov-c-db-isolation-smoke.test.ts',
];

var PROTECTED_DOCS = [
  'docs/governance/GOVERNANCE-LEDGER.md',
  'docs/governance/SCRIPT-GOV-C.md',
];

// META-GOV-A 本身允许的文件
var META_GOV_A_ALLOWED = [
  'scripts/check-harness-diff.cjs',
  'scripts/__tests__/meta-gov-a-harness-diff-smoke.test.ts',
  'docs/governance/META-GOV-A.md',
  'docs/governance/GOVERNANCE-LEDGER.md',
];

// ═══════════════════════════════════════════
// 通配符匹配 (minimatch-lite: **, * only)
// ═══════════════════════════════════════════

function _globToRegex(pattern) {
  var p = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  p = p.replace(/\*\*/g, '<<<GLOBSTAR>>>');
  p = p.replace(/\*/g, '[^/]*');
  p = p.replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp('^' + p + '$');
}

function _matchesAny(file, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    var re = _globToRegex(patterns[i]);
    if (re.test(file)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════
// 分类
// ═══════════════════════════════════════════

function categorize(files) {
  var forbidden = [];
  var protected = [];
  var allowed = [];

  var protectedExact = PROTECTED_SCRIPTS.concat(PROTECTED_SMOKE_TESTS).concat(PROTECTED_DOCS);

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f) continue;

    if (_matchesAny(f, FORBIDDEN_PATTERNS)) {
      forbidden.push(f);
    } else if (_matchesAny(f, PROTECTED_PATTERNS) || protectedExact.indexOf(f) !== -1) {
      protected.push(f);
    } else {
      allowed.push(f);
    }
  }

  return { forbidden: forbidden, protected: protected, allowed: allowed };
}

// ═══════════════════════════════════════════
// git diff 获取已变更文件
// ═══════════════════════════════════════════

function getChangedFiles() {
  if (process.env.META_GOV_CHANGED_FILES !== undefined) {
    return process.env.META_GOV_CHANGED_FILES.split('\n').filter(Boolean).map(function(f) { return f.trim(); });
  }

  try {
    var result = child_process.execSync('git diff --name-only', { encoding: 'utf8', cwd: process.cwd() });
    return result.trim().split('\n').filter(Boolean);
  } catch (e) {
    console.error('[META-GOV-A] git diff --name-only failed: ' + (e.message || e));
    return null;
  }
}

function getChangedFilesWithStatus() {
  if (process.env.META_GOV_CHANGED_FILES !== undefined) {
    // 在测试模式下不知道状态，返回 null (跳过删除检测)
    return null;
  }
  try {
    var result = child_process.execSync('git diff --name-status', { encoding: 'utf8', cwd: process.cwd() });
    return result.trim().split('\n').filter(Boolean);
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════
// 主逻辑
// ═══════════════════════════════════════════

function checkDiff(opts) {
  var strict = !!(opts && opts.strict);
  var allowProtected = process.env.META_GOV_ALLOW_PROTECTED === '1';

  var files = getChangedFiles();
  if (files === null) {
    return { exitCode: 2, decision: 'FAIL_GIT_UNAVAILABLE' };
  }

  if (files.length === 0) {
    return { exitCode: 0, decision: 'PASS_NO_CHANGES', files: [], categorized: null };
  }

  var cat = categorize(files);

  // 检查文件删除 (仅在非测试模式下)
  var deletions = [];
  if (!process.env.META_GOV_CHANGED_FILES) {
    var statusLines = getChangedFilesWithStatus();
    if (statusLines) {
      for (var i = 0; i < statusLines.length; i++) {
        var parts = statusLines[i].split(/\s+/);
        if (parts[0] === 'D') {
          var deletedFile = parts[1];
          // 如果删除的文件是受保护的治理测试文件
          if (PROTECTED_SMOKE_TESTS.indexOf(deletedFile) !== -1) {
            deletions.push(deletedFile);
          }
        }
      }
    }
  }

  var exitCode = 0;
  var decision;

  if (cat.forbidden.length > 0) {
    exitCode = 1;
    decision = 'FAIL_FORBIDDEN_CHANGE';
  } else if (cat.protected.length > 0) {
    if (strict && !allowProtected) {
      exitCode = 1;
      decision = 'FAIL_PROTECTED_CHANGE_STRICT';
    } else {
      decision = 'PASS_WITH_PROTECTED_REVIEW';
    }
  } else {
    decision = 'PASS_SAFE_DIFF';
  }

  if (deletions.length > 0 && exitCode !== 1) {
    // 治理烟雾测试被删除 → fail
    exitCode = 1;
    decision = 'FAIL_GOVERNANCE_TEST_DELETION';
  }

  return {
    exitCode: exitCode,
    decision: decision,
    files: files,
    categorized: cat,
    deletions: deletions,
    strict: strict,
  };
}

// ═══════════════════════════════════════════
// 报告渲染
// ═══════════════════════════════════════════

function renderReport(result) {
  var lines = [];
  lines.push('═══════════════════════════════════════════');
  lines.push('  META-GOV-A Harness Diff Guard');
  lines.push('═══════════════════════════════════════════');

  if (result.exitCode === 2) {
    lines.push('\n  Error: git diff unavailable or internal error.');
    lines.push('  Cannot verify harness safety.\n');
    return lines.join('\n');
  }

  if (!result.files || result.files.length === 0) {
    lines.push('\n  No changed files detected.');
    lines.push('\n  Decision: PASS_NO_CHANGES\n');
    return lines.join('\n');
  }

  lines.push('\nChanged files (' + result.files.length + '):');
  for (var i = 0; i < result.files.length; i++) {
    lines.push('  - ' + result.files[i]);
  }

  var cat = result.categorized;

  lines.push('\nForbidden changes:');
  if (cat.forbidden.length > 0) {
    for (var fi = 0; fi < cat.forbidden.length; fi++) {
      lines.push('  🔴 ' + cat.forbidden[fi]);
    }
  } else {
    lines.push('  ✅ none');
  }

  lines.push('\nProtected changes:');
  if (cat.protected.length > 0) {
    for (var pi = 0; pi < cat.protected.length; pi++) {
      lines.push('  ⚠️  ' + cat.protected[pi]);
    }
    if (result.strict && !process.env.META_GOV_ALLOW_PROTECTED) {
      lines.push('  (strict mode: use META_GOV_ALLOW_PROTECTED=1 to allow)');
    }
  } else {
    lines.push('  ✅ none');
  }

  lines.push('\nGovernance test deletions:');
  if (result.deletions && result.deletions.length > 0) {
    for (var di = 0; di < result.deletions.length; di++) {
      lines.push('  🚫 ' + result.deletions[di] + ' DELETED');
    }
  } else {
    lines.push('  ✅ none');
  }

  lines.push('\nAllowed changes:');
  if (cat.allowed.length > 0) {
    for (var ai = 0; ai < cat.allowed.length; ai++) {
      lines.push('  ✅ ' + cat.allowed[ai]);
    }
  } else {
    lines.push('  (none)');
  }

  lines.push('\nDecision:');
  var sym = result.exitCode === 0 ? '✅' : '🛑';
  lines.push('  ' + sym + ' ' + result.decision);
  if (result.strict) lines.push('  (strict mode)');
  lines.push('');

  return lines.join('\n');
}

// ═══════════════════════════════════════════
// CLI 入口
// ═══════════════════════════════════════════

function main() {
  var strict = process.argv.indexOf('--strict') !== -1 || process.argv.indexOf('-s') !== -1;

  if (process.argv.indexOf('--help') !== -1 || process.argv.indexOf('-h') !== -1) {
    console.log([
      '',
      'META-GOV-A Harness Diff Guard',
      '',
      'Usage:',
      '  node scripts/check-harness-diff.cjs            Loose mode (protected changes are warnings)',
      '  node scripts/check-harness-diff.cjs --strict   Strict mode (protected changes cause failure)',
      '',
      'Environment variables:',
      '  META_GOV_CHANGED_FILES=<newline-separated>     Override changed files (skip git diff)',
      '  META_GOV_ALLOW_PROTECTED=1                     Allow protected changes in strict mode',
      '',
      'Exit codes:',
      '  0  PASS (safe diff or no changes)',
      '  1  FAIL (forbidden change, protected change in strict, or test deletion)',
      '  2  FAIL (git diff unavailable)',
      '',
      'META-GOV-A1 protocol reference: see docs/governance/META-GOV-A1.md',
      '',
    ].join('\n'));
    process.exit(0);
  }

  var result = checkDiff({ strict: strict });
  console.log(renderReport(result));
  process.exit(result.exitCode);
}

// ═══════════════════════════════════════════
// 导出 (测试用)
// ═══════════════════════════════════════════

module.exports = {
  checkDiff: checkDiff,
  categorize: categorize,
  renderReport: renderReport,
  FORBIDDEN_PATTERNS: FORBIDDEN_PATTERNS,
  PROTECTED_PATTERNS: PROTECTED_PATTERNS,
  PROTECTED_SCRIPTS: PROTECTED_SCRIPTS,
  PROTECTED_SMOKE_TESTS: PROTECTED_SMOKE_TESTS,
  PROTECTED_DOCS: PROTECTED_DOCS,
  META_GOV_A_ALLOWED: META_GOV_A_ALLOWED,
};

// 直接运行时
if (require.main === module) {
  main();
}
