/**
 * cleanup-tmp.mjs — 临时文件自动清理
 * ====================================================
 * 职责：
 *   T1  删除 .tmp/ 下超过 N 天的所有文件/目录（默认 3 天）
 *   T2  删除 src/__tests__/.e2e-tmp-* 临时数据库（存在即清理，均为测试残留）
 *   T3  删除根目录 0 字节空 .log 文件
 *
 * 幂等安全：可重复运行，结果一致。
 */
import { rmSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── 参数解析 ──────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--days' && process.argv[i + 1]) {
    args.days = parseInt(process.argv[++i], 10);
  } else if (a === '--dry-run') {
    args.dryRun = true;
  } else if (a === '--help') {
    console.log(`Usage: node scripts/cleanup-tmp.mjs [--dry-run] [--days N]
  --days N    删除超过 N 天的临时文件（默认 3）
  --dry-run   只打印将删除的内容，不实际删除
  --help      显示此帮助`);
    process.exit(0);
  }
}

const MAX_AGE_DAYS = args.days ?? 3;
const CUTOFF_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const NOW = Date.now();
const dryRun = args.dryRun;

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

let totalFreed = 0;
let deletedCount = 0;

function removeDirSafe(dir) {
  if (!dryRun) rmSync(dir, { recursive: true, force: true });
  let size = 0;
  function calcSize(p) {
    const entries = readdirSync(p, { withFileTypes: true });
    for (const e of entries) {
      const full = join(p, e.name);
      if (e.isDirectory()) {
        calcSize(full);
        try { size += statSync(full).size; } catch {}
      } else {
        try { size += statSync(full).size; } catch {}
      }
    }
  }
  if (!dryRun) {
    try { calcSize(dir); } catch {}
  }
  return size;
}

function removeFilesOlderThan(dir, maxAgeMs) {
  let count = 0;
  let size = 0;
  if (!dryRun && !dirExists(dir)) return { count, size };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        const sub = removeFilesOlderThan(full, maxAgeMs);
        count += sub.count;
        size += sub.size;
        // 删除空目录
        if (!dryRun && dirExists(full) && readdirSync(full).length === 0) {
          rmSync(full, { recursive: true, force: true });
        }
      } else if (NOW - st.mtimeMs > maxAgeMs) {
        size += st.size;
        count++;
        if (!dryRun) unlinkSync(full);
      }
    } catch {
      // 文件可能已被并发删除，跳过
    }
  }
  return { count, size };
}

function dirExists(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

// ── T1: .tmp/ 清理超过 N 天的文件 ────────────────────
const tmpDir = join(ROOT, '.tmp');
console.log(`[T1] .tmp/ 清理（> ${MAX_AGE_DAYS} 天）`);
if (dirExists(tmpDir)) {
  const result = removeFilesOlderThan(tmpDir, CUTOFF_MS);
  totalFreed += result.size;
  deletedCount += result.count;
  if (result.count > 0) {
    console.log(`  删除 ${result.count} 个文件，释放 ${fmtSize(result.size)}`);
  } else {
    console.log(`  无需清理`);
  }
} else {
  console.log(`  .tmp/ 不存在`);
}

// ── T2: e2e-tmp 残留数据库 ───────────────────────────
const testsDir = join(ROOT, 'src', '__tests__');
console.log(`\n[T2] e2e-tmp 残留清理`);
if (dirExists(testsDir)) {
  let count = 0;
  for (const entry of readdirSync(testsDir)) {
    if (entry.startsWith('.e2e-tmp-')) {
      const dir = join(testsDir, entry);
      if (dirExists(dir)) {
        const size = removeDirSafe(dir);
        totalFreed += size;
        deletedCount++;
        count++;
        console.log(`  删除 ${entry}/ (${fmtSize(size)})`);
      }
    }
  }
  if (count === 0) console.log(`  无残留`);
}

// ── T3: 根目录 0 字节 .log ──────────────────────────
console.log(`\n[T3] 根目录空 .log 文件清理`);
let emptyLogsRemoved = 0;
try {
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.log')) {
      try {
        const st = statSync(join(ROOT, entry.name));
        if (st.size === 0) {
          if (!dryRun) unlinkSync(join(ROOT, entry.name));
          emptyLogsRemoved++;
          console.log(`  删除空文件 ${entry.name}`);
        }
      } catch {}
    }
  }
} catch {}
if (emptyLogsRemoved === 0) console.log(`  无需清理`);

// ── 汇总 ──────────────────────────────────────────────
console.log(`\n════════════════════════════════`);
console.log(`完成：删除 ${deletedCount} 个目录 + ${emptyLogsRemoved} 个空文件`);
console.log(`释放空间：${fmtSize(totalFreed)}`);
if (dryRun) console.log(`[DRY-RUN] 未实际删除任何文件`);
console.log(`════════════════════════════════`);
