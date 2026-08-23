/**
 * cleanup-backups.mjs — backups/ 目录去重 + 保留策略清理
 * =========================================================
 * 策略：
 *   1. knowledge_*.db：保留最近 7 天每天最新 1 个，其余删除
 *   2. family_graph_*.db：保留最近 30 天每天最新 1 个，删除同分钟内多余副本
 *   3. vault-*.db：保留最近 7 天，其余删除
 *   4. manual/ 目录：保留不动
 *   5. backup-xsy-* 目录：保留不动
 */
import { rmSync, statSync, readdirSync, linkSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '..', 'data', 'backups');

// ── 参数 ──────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--days-knowledge' && process.argv[i + 1]) args.daysKnowledge = parseInt(process.argv[++i], 10);
  else if (a === '--days-family' && process.argv[i + 1]) args.daysFamily = parseInt(process.argv[++i], 10);
  else if (a === '--days-vault' && process.argv[i + 1]) args.daysVault = parseInt(process.argv[++i], 10);
  else if (a === '--dry-run') args.dryRun = true;
  else if (a === '--help') {
    console.log(`Usage: node scripts/cleanup-backups.mjs [--dry-run]
  --days-knowledge N  knowledge backup 保留天数（默认 7）
  --days-family N     family_graph backup 保留天数（默认 30）
  --days-vault N      vault backup 保留天数（默认 7）`);
    process.exit(0);
  }
}

const DAYS_K = args.daysKnowledge ?? 7;
const DAYS_F = args.daysFamily ?? 30;
const DAYS_V = args.daysVault ?? 7;
const MS_K = DAYS_K * 24 * 60 * 60 * 1000;
const MS_F = DAYS_F * 24 * 60 * 60 * 1000;
const MS_V = DAYS_V * 24 * 60 * 60 * 1000;
const NOW = Date.now();
const dryRun = args.dryRun;

function fmtSize(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)}MB`;
  return `${(b / 1024 ** 3).toFixed(2)}GB`;
}

function dirExists(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function fileExists(p) { try { return statSync(p).isFile(); } catch { return false; } }

let stats = { knowledge: { kept: 0, deleted: 0, freed: 0 }, family: { kept: 0, deleted: 0, freed: 0 }, vault: { kept: 0, deleted: 0, freed: 0 } };

function del(p) {
  let size = 0;
  try { size = statSync(p).size; } catch {}
  if (!dryRun) rmSync(p, { recursive: true, force: true });
  return size;
}

// ── 读取所有 backup 文件信息 ──────────────────────────
function scanBackups() {
  const entries = [];
  if (!dirExists(BACKUP_DIR)) return entries;
  for (const entry of readdirSync(BACKUP_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.db')) continue;
    const full = join(BACKUP_DIR, entry.name);
    try {
      const st = statSync(full);
      entries.push({ name: entry.name, path: full, mtime: st.mtimeMs, size: st.size });
    } catch {}
  }
  return entries;
}

const all = scanBackups();
console.log(`扫描到 ${all.length} 个 .db 文件\n`);

// ── 按类型分类 ────────────────────────────────────────
function classify(name) {
  if (name.startsWith('knowledge_')) return 'knowledge';
  if (name.startsWith('family_graph_')) return 'family';
  if (name.startsWith('vault_')) return 'vault';
  return 'other';
}

function minuteKey(mtime) {
  return Math.floor(mtime / 60000);
}

function dateKey(mtime) {
  return new Date(mtime).toISOString().slice(0, 10);
}

const byType = { knowledge: [], family: [], vault: [], other: [] };
for (const e of all) {
  const t = classify(e.name);
  byType[t].push(e);
}

// ── 处理 knowledge：保留最近 N 天每天最新 1 个 ─────────
console.log(`--- knowledge_*.db（保留 ${DAYS_K} 天内每天最新 1 个）---`);
const nowK = NOW - MS_K;
const keptK = new Map(); // dateKey -> kept entry
const toDelK = [];

for (const e of byType.knowledge) {
  if (e.mtime < nowK) { toDelK.push(e); continue; }
  const dk = dateKey(e.mtime);
  if (!keptK.has(dk) || e.mtime > keptK.get(dk).mtime) {
    if (keptK.has(dk)) toDelK.push(keptK.get(dk));
    keptK.set(dk, e);
  } else {
    toDelK.push(e);
  }
}

for (const e of toDelK) {
  const s = del(e.path);
  stats.knowledge.deleted++;
  stats.knowledge.freed += s;
  console.log(`  删除 ${e.name} (${fmtSize(s)})`);
}
console.log(`  保留 ${keptK.size} 个，删除 ${toDelK.length} 个，释放 ${fmtSize(stats.knowledge.freed)}\n`);

// ── 处理 family_graph：同分钟去重 + 保留最近 N 天每天最新 1 个
console.log(`--- family_graph_*.db（同分钟去重 + 保留 ${DAYS_F} 天内每天最新 1 个）---`);
const nowF = NOW - MS_F;

// Step 1: 同分钟去重——每组同分钟只保留最新
const byMinute = new Map();
for (const e of byType.family) {
  const mk = minuteKey(e.mtime);
  if (!byMinute.has(mk) || e.mtime > byMinute.get(mk).mtime) {
    if (byMinute.has(mk)) {
      // 之前的那个是重复，标记为待删
      byMinute.get(mk).dup = true;
    }
    byMinute.set(mk, e);
  } else {
    e.dup = true;
  }
}

// Step 2: 在去重后的文件中，按天保留最新
const keptF = new Map();
const toDelF = [];
for (const e of byType.family) {
  if (e.dup) {
    const s = del(e.path);
    stats.family.deleted++;
    stats.family.freed += s;
    console.log(`  删除重复（同分钟） ${e.name} (${fmtSize(s)})`);
    continue;
  }
  if (e.mtime < nowF) { toDelF.push(e); continue; }
  const dk = dateKey(e.mtime);
  if (!keptF.has(dk) || e.mtime > keptF.get(dk).mtime) {
    if (keptF.has(dk)) toDelF.push(keptF.get(dk));
    keptF.set(dk, e);
  } else {
    toDelF.push(e);
  }
}

for (const e of toDelF) {
  const s = del(e.path);
  stats.family.deleted++;
  stats.family.freed += s;
  console.log(`  删除 ${e.name} (${fmtSize(s)})`);
}
console.log(`  保留 ${keptF.size} 个，删除 ${toDelF.length} 个，释放 ${fmtSize(stats.family.freed)}\n`);

// ── 处理 vault：保留最近 N 天 ─────────────────────────
console.log(`--- vault-*.db（保留 ${DAYS_V} 天内最新）---`);
const nowV = NOW - MS_V;
let vaultDel = 0;
let vaultFreed = 0;
for (const e of byType.vault) {
  if (e.mtime < nowV) {
    const s = del(e.path);
    vaultDel++;
    vaultFreed += s;
    console.log(`  删除 ${e.name} (${fmtSize(s)})`);
  } else {
    stats.vault.kept++;
  }
}
stats.vault.deleted = vaultDel;
stats.vault.freed = vaultFreed;
console.log(`  保留 ${stats.vault.kept} 个，删除 ${vaultDel} 个，释放 ${fmtSize(vaultFreed)}\n`);

// ── 汇总 ──────────────────────────────────────────────
const totalFreed = stats.knowledge.freed + stats.family.freed + stats.vault.freed;
console.log('════════════════════════════════════');
console.log(`knowledge：保留 ${stats.knowledge.kept} 个，删除 ${stats.knowledge.deleted} 个`);
console.log(`family_graph：保留 ${stats.family.kept} 个（${keptF.size} 天），删除 ${stats.family.deleted} 个`);
console.log(`vault：保留 ${stats.vault.kept} 个，删除 ${stats.vault.deleted} 个`);
console.log(`总释放空间：${fmtSize(totalFreed)}`);
if (dryRun) console.log('[DRY-RUN] 未实际删除任何文件');
console.log('════════════════════════════════════');
