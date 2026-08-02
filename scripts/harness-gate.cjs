/**
 * harness-gate.cjs — Git pre-commit 令牌检查闸门
 * =================================================
 * 安装: cp scripts/harness-gate.cjs .git/hooks/pre-commit
 *       或从 pre-commit hook 中调用: node scripts/harness-gate.cjs
 *
 * 逻辑:
 *   1. 提取本次 commit 涉及的 src/*.ts 文件
 *   2. 对每个文件检查 Harness 令牌（读取 D:\AI文件\harness\data\tokens\）
 *   3. 无令牌 → 拒绝提交，显示 MCP 调用指引
 *   4. 有令牌但过期 → 拒绝提交
 *   5. 有有效令牌 → 放行
 *
 * 环境变量:
 *   HARNESS_TOKEN_DIR — 令牌目录（默认 D:\AI文件\harness\data\tokens）
 *   HARNESS_STRICT    — 严格模式: "0"(默认)=仅拒绝高风险, "1"=拒绝所有无令牌
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── 配置 ──

const TOKEN_DIR = process.env.HARNESS_TOKEN_DIR ||
  path.resolve(__dirname, '..', '..', '..', 'AI文件', 'harness', 'data', 'tokens');

const STRICT_MODE = (process.env.HARNESS_STRICT || '0') === '1';

// 高风险文件前缀（与 Sentinel 同步）
const HIGH_RISK_PREFIXES = [
  'src/webui/chat.ts', 'src/m4/', 'src/m5/', 'src/m2/',
  'src/engine/', 'src/app/knowledge/', 'src/app/vault/',
  'src/webui/chat/', 'src/app/fg/', 'src/app/role/',
  'src/app/fusion/', 'src/app/ingestion/',
];

// 不受管制的文件
const EXEMPT_PATTERNS = [
  /\.test\.ts$/, /\.spec\.ts$/, /\.d\.ts$/,
  /\.md$/, /\.sql$/, /\.cjs$/, /\.mjs$/,
  /\.html$/, /\.css$/, /\.json$/,
  /^scripts\//, /^docs\//, /^data\//,
  /^\.claude\//, /^\.vscode\//,
];

// ── 工具函数 ──

function normalize(fp) { return String(fp).replace(/\\/g, '/'); }
function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); }

function isHighRisk(filePath) {
  const n = normalize(filePath);
  for (const pf of HIGH_RISK_PREFIXES) {
    if (n.startsWith(pf) || n.includes('/' + pf.replace(/\/$/, ''))) return true;
  }
  return false;
}

function isExempt(filePath) {
  const n = normalize(filePath);
  for (const re of EXEMPT_PATTERNS) {
    if (re.test(n)) return true;
  }
  return false;
}

function checkToken(filePath) {
  try {
    if (!fs.existsSync(TOKEN_DIR)) return { found: false, reason: '令牌目录不存在' };
    const hash = hashCode(normalize(filePath));
    const tp = path.join(TOKEN_DIR, hash + '.json');
    if (!fs.existsSync(tp)) return { found: false, reason: '无令牌文件' };
    const raw = fs.readFileSync(tp, 'utf-8');
    const token = JSON.parse(raw);
    const now = Date.now();
    if (now > (token.expires_at || 0)) {
      try { fs.unlinkSync(tp); } catch (_) {}
      return { found: false, reason: '令牌已过期' };
    }
    if (token.consumed) return { found: false, reason: '令牌已被消费' };
    return { found: true, token, reason: '令牌有效' };
  } catch (err) {
    return { found: false, reason: `读取异常: ${err.message}` };
  }
}

// ── 主逻辑 ──

function main() {
  // 1. 获取 staged 文件
  let stagedFiles = [];
  try {
    const out = execSync('git diff --cached --name-only', { encoding: 'utf-8', timeout: 5000 }).trim();
    stagedFiles = out.split('\n').filter(Boolean);
  } catch (_) {
    // 不在 git 仓库中，直接放行
    process.exit(0);
  }

  if (stagedFiles.length === 0) {
    // 空提交，放行
    process.exit(0);
  }

  // 2. 筛选需要检查的文件
  const checkFiles = stagedFiles.filter(f => {
    if (isExempt(f)) return false;
    if (!STRICT_MODE && !isHighRisk(f)) return false;
    return true;
  });

  if (checkFiles.length === 0) {
    // 没有需检查的文件
    process.exit(0);
  }

  // 3. 检查每个文件的令牌
  const missingTokens = [];
  const validTokens = [];

  for (const file of checkFiles) {
    const result = checkToken(file);
    if (result.found) {
      validTokens.push({ file, token: result.token });
    } else {
      missingTokens.push({ file, reason: result.reason });
    }
  }

  // 4. 判定
  if (missingTokens.length === 0) {
    console.error(`\n✅ Harness Gate: ${validTokens.length} 个文件令牌有效，放行提交。`);
    process.exit(0);
  }

  // 5. 拒绝提交
  console.error(`\n╔══════════════════════════════════════════════════════╗`);
  console.error(`║  🚫 HARNESS GATE — 提交被拒绝                        ║`);
  console.error(`╠══════════════════════════════════════════════════════╣`);
  console.error(`║  以下 ${missingTokens.length} 个文件缺少有效令牌:                             ║`);
  for (const m of missingTokens) {
    const fn = m.file.padEnd(42);
    console.error(`║  • ${fn} ${m.reason.padEnd(12)} ║`);
  }
  console.error(`╠══════════════════════════════════════════════════════╣`);
  console.error(`║  获取令牌的正确流程:                                   ║`);
  console.error(`║  1. 确认 MCP 在线: http://127.0.0.1:8765             ║`);
  console.error(`║  2. 调用 MCP 工具: harness_run_flow                   ║`);
  console.error(`║     files: [${checkFiles.map(f => `"${f}"`).join(', ')}]  ║`);
  console.error(`║  3. 流水线返回 token_issued: true 后才能提交           ║`);
  console.error(`║                                                      ║`);
  console.error(`║  如果 MCP 不在线: cd D:\\AI文件\\harness && node mcp\\start.cjs  ║`);
  console.error(`║  手动解锁文件: node sentinel/sentinel-service.cjs --unlock <file> ║`);
  console.error(`╚══════════════════════════════════════════════════════╝\n`);

  process.exit(1);
}

main();
