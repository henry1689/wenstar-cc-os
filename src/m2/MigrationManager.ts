/**
 * MigrationManager — 数据库迁移管理器
 *
 * 统一管理 fusion_memory.db 的 Schema 版本迁移。
 * 每次 DDL 变更记录到 schema_version 表，支持增量迁移。
 *
 * 设计原则：
 * - 幂等：重复执行不损坏数据（基于版本号跳过已执行迁移）
 * - 可追溯：每次迁移记录版本号、描述、时间、checksum
 * - 最小侵入：迁移在 SQLiteAdapter.initialize() 中触发，不阻塞启动
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MigrationRecord {
  version: number;
  description: string;
  migrated_at: string;
  checksum: string;
}

// ═══════════════════════════════════════════
// 迁移注册表 — 按版本号递增排列
// ═══════════════════════════════════════════

interface Migration {
  version: number;
  description: string;
  apply: (db: any) => void; // sql.js Database
}

const MIGRATIONS: Migration[] = [
  // v1 → v2: 编码链路 + 基建标准化
  {
    version: 2,
    description: '新增 dna_full_code/l2_norm 字段，统一黑钻晋升路径',
    apply: (db: any) => {
      // memories
      try { db.run("ALTER TABLE memories ADD COLUMN dna_full_code TEXT"); } catch {}
      try { db.run("ALTER TABLE memories ADD COLUMN l2_norm REAL"); } catch {}
      try { db.run("CREATE INDEX IF NOT EXISTS idx_memories_dna_full_code ON memories(dna_full_code)"); } catch {}
      try { db.run("CREATE INDEX IF NOT EXISTS idx_memories_l2_norm ON memories(l2_norm)"); } catch {}

      // black_diamond
      try { db.run("ALTER TABLE black_diamond ADD COLUMN dna_root_id TEXT"); } catch {}
      try { db.run("ALTER TABLE black_diamond ADD COLUMN dna_full_code TEXT"); } catch {}
      try { db.run("CREATE INDEX IF NOT EXISTS idx_black_diamond_dna_root_id ON black_diamond(dna_root_id)"); } catch {}
    },
  },
  // v3: 时空环境规则引擎 — 时序事件 + 气象数据
  {
    version: 3,
    description: '新增 temporal_events / ambient_weather_context 表',
    apply: (db: any) => {
      try {
        db.run(`CREATE TABLE IF NOT EXISTS temporal_events (
          event_id TEXT PRIMARY KEY, belong_entity_id TEXT NOT NULL,
          event_type TEXT NOT NULL, parent_event_id TEXT DEFAULT NULL,
          event_raw_text TEXT NOT NULL, start_ts INTEGER NOT NULL,
          end_ts INTEGER DEFAULT NULL, cycle_ms INTEGER DEFAULT 0,
          max_nest_level TINYINT DEFAULT 3, is_cyclic BOOLEAN DEFAULT 0,
          source_mode TEXT DEFAULT 'chat_llm', source_url TEXT DEFAULT NULL,
          dna_root_id TEXT NOT NULL, status TEXT DEFAULT 'running',
          create_at INTEGER NOT NULL
        )`);
        db.run("CREATE INDEX IF NOT EXISTS idx_temporal_events_entity_status ON temporal_events(belong_entity_id, status)");
        db.run("CREATE INDEX IF NOT EXISTS idx_temporal_events_end_ts ON temporal_events(end_ts)");
      } catch (e) { console.warn('[Migration] temporal_events 表创建失败:', e); }
      try {
        db.run(`CREATE TABLE IF NOT EXISTS ambient_weather_context (
          weather_id TEXT PRIMARY KEY, belong_area TEXT NOT NULL,
          weather_type TEXT NOT NULL, temperature_low INTEGER,
          temperature_high INTEGER, weather_desc TEXT,
          alert_info TEXT DEFAULT NULL, minute_precip TEXT DEFAULT NULL,
          start_ts INTEGER NOT NULL, end_ts INTEGER DEFAULT NULL,
          source_mode TEXT DEFAULT 'qweather_api',
          source_url TEXT DEFAULT NULL, api_last_update_ts INTEGER DEFAULT 0,
          dna_root_id TEXT NOT NULL, status TEXT DEFAULT 'effective',
          create_at INTEGER NOT NULL
        )`);
        db.run("CREATE INDEX IF NOT EXISTS idx_ambient_weather_time ON ambient_weather_context(start_ts, end_ts)");
        db.run("CREATE INDEX IF NOT EXISTS idx_ambient_weather_source ON ambient_weather_context(source_mode)");
      } catch (e) { console.warn('[Migration] ambient_weather_context 表创建失败:', e); }
    },
  },
];

// ═══════════════════════════════════════════
// 迁移执行引擎
// ═══════════════════════════════════════════

/**
 * 执行所有待执行的迁移
 * @param db sql.js Database 实例
 * @returns 本次执行的迁移数
 */
export function migrateSchema(db: any): number {
  // 确保 schema_version 表存在
  try {
    db.run(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      migrated_at TEXT NOT NULL,
      checksum TEXT
    )`);
  } catch (err) {
    console.warn('[Migration] schema_version 表创建失败:', err);
    return 0;
  }

  // 读取当前版本
  const currentVersion = getCurrentVersion(db);
  let executed = 0;

  for (const m of MIGRATIONS) {
    if (m.version > currentVersion) {
      try {
        const checksum = computeChecksum(m.description);
        m.apply(db);
        const now = new Date().toISOString();
        db.run(
          'INSERT INTO schema_version (version, description, migrated_at, checksum) VALUES (?, ?, ?, ?)',
          [m.version, m.description, now, checksum],
        );
        executed++;
        console.log(`[Migration] v${m.version} ✅: ${m.description}`);
      } catch (err) {
        console.error(`[Migration] v${m.version} ❌ 失败:`, err);
        throw err;
      }
    }
  }

  if (executed === 0) {
    console.log(`[Migration] Schema v${currentVersion} 已最新，无需迁移`);
  }
  return executed;
}

function getCurrentVersion(db: any): number {
  try {
    const rows = db.exec('SELECT MAX(version) as v FROM schema_version');
    if (rows.length > 0 && rows[0].values.length > 0) {
      return rows[0].values[0][0] ?? 0;
    }
  } catch { /* 首次迁移，schema_version 为空 */ }
  return 0;
}

function computeChecksum(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8);
}
