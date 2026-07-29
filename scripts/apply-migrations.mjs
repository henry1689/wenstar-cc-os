// S1-S3: 将 MigrationManager v8/v9/v10 应用到真实 DB
// 不改任何 .ts 代码，只执行已有 migration 函数

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DB = resolve('data/webui/fusion_memory.db');

// 复制 DB 做安全备份
const BACKUP = DB + '.bak.' + Date.now();
readFileSync(DB); // 验证可读
writeFileSync(BACKUP, readFileSync(DB));
console.log('备份: '+BACKUP);

// 手动执行 v8/v9/v10 的 SQL（与 MigrationManager.ts 中完全一致，跳过版本检查）
async function main() {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(DB));

  // 确保 schema_version 表存在
  try { db.run("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, description TEXT NOT NULL, migrated_at TEXT NOT NULL, checksum TEXT)"); } catch {}

  const ts = new Date().toISOString();

  // v8: DAG 记忆关联表
  try { db.exec("SELECT 1 FROM memory_associations LIMIT 0"); console.log('v8 已存在, 跳过'); }
  catch {
    // drop-and-recreate to ensure correct schema
    try { db.run("DROP TABLE IF EXISTS memory_associations"); } catch {}
    db.run(`CREATE TABLE memory_associations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL DEFAULT 'default',
      belong_entity_uuid TEXT NOT NULL,
      source_global_uid TEXT NOT NULL, target_global_uid TEXT NOT NULL,
      edge_type TEXT NOT NULL, edge_reason TEXT,
      confidence REAL NOT NULL DEFAULT 0.7, weight REAL NOT NULL DEFAULT 1.0,
      source_timestamp_ms INTEGER NOT NULL, target_timestamp_ms INTEGER NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
      state_flag TEXT NOT NULL DEFAULT 'active',
      CHECK (confidence >= 0.0 AND confidence <= 1.0),
      CHECK (weight >= 0.0),
      CHECK (source_timestamp_ms < target_timestamp_ms))`);
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_assoc_unique ON memory_associations(namespace,belong_entity_uuid,source_global_uid,target_global_uid,edge_type)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_memory_assoc_source ON memory_associations(namespace,belong_entity_uuid,source_global_uid,edge_type,confidence)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_memory_assoc_target ON memory_associations(namespace,belong_entity_uuid,target_global_uid,edge_type,confidence)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_memory_assoc_time ON memory_associations(namespace,belong_entity_uuid,source_timestamp_ms,target_timestamp_ms)"); } catch {}
    db.run("CREATE TABLE IF NOT EXISTS dag_retrieval_log (id INTEGER PRIMARY KEY AUTOINCREMENT, query_hash TEXT NOT NULL, seed_uids TEXT NOT NULL, expanded_uids TEXT NOT NULL, hop_count INTEGER NOT NULL, latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
    try { db.run("INSERT OR IGNORE INTO schema_version VALUES(?,?,?,?)",[8,'V13.0 DAG','',ts,'']); } catch {}
    console.log('v8 ✅ DAG memory_associations');
  }

  // v9: Foresight 字段
  const foresightCols = ['is_foresight','valid_start_ms','valid_until_ms','foresight_status','foresight_reason'];
  let v9Needed = false;
  try { db.exec("SELECT is_foresight FROM memories LIMIT 0"); } catch { v9Needed = true; }
  if (v9Needed) {
    try { db.run("ALTER TABLE memories ADD COLUMN is_foresight INTEGER NOT NULL DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN valid_start_ms INTEGER"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN valid_until_ms INTEGER"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN foresight_status TEXT NOT NULL DEFAULT 'none'"); } catch {}
    try { db.run("ALTER TABLE memories ADD COLUMN foresight_reason TEXT"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_memories_foresight_time ON memories(is_foresight,valid_start_ms,valid_until_ms)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_memories_foresight_status ON memories(foresight_status)"); } catch {}
    try { db.run("INSERT OR IGNORE INTO schema_version VALUES(?,?,?,?)",[9,'V13.0 Foresight',ts,'']); } catch {}
    console.log('v9 ✅ Foresight 字段');
  } else { console.log('v9 已存在, 跳过'); }

  // v10: search_index + 存量回填
  try { db.exec("SELECT 1 FROM search_index LIMIT 0"); console.log('v10 search_index 已存在, 跳过建表'); }
  catch {
    db.run(`CREATE TABLE search_index (term TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, belong_entity_uuid TEXT, position INTEGER DEFAULT 0, PRIMARY KEY (term, source_type, source_id))`);
    try { db.run("CREATE INDEX IF NOT EXISTS idx_si_term ON search_index(term)"); } catch {}
    try { db.run("CREATE INDEX IF NOT EXISTS idx_si_source ON search_index(source_type,source_id)"); } catch {}
    console.log('v10 search_index 表创建完成');
  }

  // 回填 search_index（如果为空）
  const siCount = db.exec("SELECT count(*) FROM search_index")[0].values[0][0];
  if (siCount === 0) {
    console.log('v10 存量 n-gram 回填开始...');
    const cleanPunct = t => String(t||'').replace(/[，。！？、；：""''（）《》【】\s\d\-\/]/g,'').trim();
    let total = 0;
    for (const [tbl, col, stype] of [['memories','raw_input','memory'],['conversations','content','conversation'],['knowledge_base','content','knowledge_base']]) {
      const rows = db.exec("SELECT id,"+col+" FROM "+tbl+" WHERE "+col+" IS NOT NULL");
      if (rows.length && rows[0].values) {
        for (const r of rows[0].values) {
          const cl = cleanPunct(String(r[1]||'')); if (cl.length < 2) continue;
          const ng = new Set();
          for (let i=0;i<cl.length-1;i++) ng.add(cl.substring(i,i+2));
          for (let i=0;i<cl.length-2;i++) ng.add(cl.substring(i,i+3));
          for (const g of ng) { try { db.run("INSERT OR IGNORE INTO search_index(term,source_type,source_id) VALUES(?,?,?)",[g,stype,String(r[0])]); total++; } catch {} }
        }
      }
    }
    console.log('v10 回填完成: '+total+' 条 n-gram');
  } else {
    console.log('v10 search_index 已有 '+siCount+' 条, 跳过回填');
  }
  try { db.run("INSERT OR IGNORE INTO schema_version VALUES(?,?,?,?)",[10,'search_index backfill',ts,'']); } catch {}

  // 回填 global_uid (如果全空)
  const uidNulls = db.exec("SELECT count(*) FROM memories WHERE global_uid IS NULL")[0].values[0][0];
  if (uidNulls > 0) {
    console.log('回填 global_uid: '+uidNulls+' 条...');
    const { createHash } = await import('crypto');
    const ids = db.exec("SELECT id FROM memories WHERE global_uid IS NULL");
    if (ids.length && ids[0].values) for (const r of ids[0].values) {
      const h = createHash('sha256').update(String(r[0])).digest('hex').substring(0,8).toUpperCase();
      db.run("UPDATE memories SET global_uid=? WHERE id=?",['MM'+h,String(r[0])]);
    }
    console.log('回填 global_uid 完成');
  }

  // 回填 belong_entity_uuid
  const euuidNulls = db.exec("SELECT count(*) FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid=''")[0].values[0][0];
  if (euuidNulls > 300) {
    console.log('回填 belong_entity_uuid...');
    const people = [['熊梓铭','uuid-ziming'],['梓铭','uuid-ziming'],['诗韵','uuid-shirley'],['玉瑶','uuid-yaoyao'],['瑶瑶','uuid-yaoyao'],['鸿艺','uuid-hongyi'],['梓玥','uuid-ziyue'],['王全芬','uuid-wangqf'],['徐诗雨','uuid-shiyu'],['诗雨','uuid-shiyu']];
    for (const [n,u] of people) db.run("UPDATE memories SET belong_entity_uuid=? WHERE raw_input LIKE ? AND (belong_entity_uuid IS NULL OR belong_entity_uuid='')",[u,'%'+n+'%']);
    console.log('回填 belong_entity_uuid 完成');
  }

  // 保存
  writeFileSync(DB, Buffer.from(db.export()));
  db.close();

  // 验证
  const verifyDb = new SQL.Database(readFileSync(DB));
  console.log('\n验证:');
  console.log('  search_index: '+verifyDb.exec("SELECT count(*) FROM search_index")[0].values[0][0]+' 条');
  console.log('  memory_associations: '+verifyDb.exec("SELECT count(*) FROM memory_associations")[0].values[0][0]+' 条');
  console.log('  global_uid 填充: '+verifyDb.exec("SELECT count(*) FROM memories WHERE global_uid IS NOT NULL")[0].values[0][0]+'/'+verifyDb.exec("SELECT count(*) FROM memories")[0].values[0][0]);
  console.log('  belong_entity_uuid 填充: '+verifyDb.exec("SELECT count(*) FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid!=''")[0].values[0][0]);
  verifyDb.close();
  console.log('\n✅ Migration 完成');
}
main().catch(console.error);
