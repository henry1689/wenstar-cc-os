/**
 * rebuild-search-index — search_index 全量重建 (V13)
 * ============================================================
 * 主表（conversations/memories/black_diamond/knowledge_base）回填 UUID 后，
 * search_index（倒排索引镜像）需要重建同步 belong_entity_uuid。
 *
 * 🔴 必须全量重建（S4 评审 H1）：persistence-stage 增量写入曾用 seqPos 作
 *    search_index.source_id（与 conversations.id 编号空间不同），增量 UPDATE/
 *    孤儿删除会误删/错标近期索引。全量重建以主表 rowid 为可靠键，彻底消除该问题。
 *
 * 步骤：
 *   1. 备份
 *   2. DELETE FROM search_index（清空旧索引，含脏 seqPos 键）
 *   3. rebuildAllIndexes 全量重建（rowid 键 + belong_entity_uuid 同步）
 *   4. 落盘 + 验证
 *
 * 用法: npx tsx scripts/rebuild-search-index.ts
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebuildAllIndexes } from '../src/m4/SearchIndexBuilder.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'webui', 'fusion_memory.db');

const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(DB_PATH));

// 1. 备份
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${DB_PATH}.idx-backup-${stamp}`;
copyFileSync(DB_PATH, backupPath);
console.log(`✅ 已备份: ${backupPath}`);

// 2. 清空旧索引（含脏 seqPos 键 + 孤儿）
db.run('DELETE FROM search_index');
const cleared = db.getRowsModified();
console.log(`[SearchIndex] 清空旧索引: ${cleared} 行`);

// 3. 全量重建（主表 rowid 键 + belong_entity_uuid）
const result = rebuildAllIndexes(db);
console.log(`[SearchIndex] 全量重建:`, result);

// 4. 落盘
writeFileSync(DB_PATH, Buffer.from(db.export()));
console.log('✅ search_index 已重建落盘');

// 5. 验证
const res = db.exec(
  `SELECT source_type, COUNT(*) total, SUM(CASE WHEN belong_entity_uuid IS NULL OR belong_entity_uuid = '' THEN 1 ELSE 0 END) noUuid
   FROM search_index GROUP BY source_type ORDER BY total DESC`
)[0];
for (const v of res.values) {
  console.log(`  ${v[0]}: ${v[1]}条 | 无UUID=${v[2]} (${Math.round(Number(v[2]) / Number(v[1]) * 100)}%)`);
}

db.close();
