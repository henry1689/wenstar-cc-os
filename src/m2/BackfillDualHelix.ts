/**
 * BackfillDualHelix.ts — 存量记忆 → 双螺旋三底座回填
 * ====================================================
 * 问题: 1736 条 memories 已有 GlobalUID, 但 state_spines / atom_address_timeline / atom_repair_index 为空
 * 原因: DualHelixWriter 在新对话才写入, 存量从未回填
 *
 * 执行:
 *   npx tsx src/m2/BackfillDualHelix.ts
 *
 * 安全性:
 *   - INSERT OR REPLACE, 幂等可重跑
 *   - 不删除任何数据
 *   - 只为有 perception_json 的记忆回填
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const DB_PATH = 'data/webui/fusion_memory.db';
const BACKUP_PATH = 'data/webui/fusion_memory_before_dual_helix_backfill.db';

async function main() {
  console.log('═'.repeat(60));
  console.log('  双螺旋三底座存量回填');
  console.log('═'.repeat(60));

  // 备份
  if (existsSync(DB_PATH)) {
    const buf = readFileSync(DB_PATH);
    writeFileSync(BACKUP_PATH, buf);
    console.log(`已备份到: ${BACKUP_PATH}`);
  }

  const SQL = await initSqlJs();
  const buffer = readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  // 统计需要回填的量
  const toFill = db.exec(
    `SELECT m.id, m.seq_pos, m.created_at, m.global_uid, m.perception_json, m.raw_input, m.locus_path, m.dna_root_id, m.calcium_score
     FROM memories m
     WHERE m.global_uid IS NOT NULL AND m.global_uid != ''
       AND m.perception_json IS NOT NULL AND m.perception_json != ''
       AND NOT EXISTS (SELECT 1 FROM state_spines s WHERE s.global_uid = m.global_uid)`
  );
  
  const rows = toFill[0]?.values || [];
  console.log(`需要回填: ${rows.length} 条记忆`);

  if (rows.length === 0) {
    console.log('无需回填，全部已有 state_spines');
    db.close();
    return;
  }

  // 24D 维度映射
  const dims: [string, number][] = [
    ['pleasure', 1], ['arousal', 2], ['dominance', 3],
    ['aggression', 4], ['sincerity', 5], ['humor', 6],
    ['factual', 7], ['logical', 8], ['certainty', 9],
    ['abstract', 10], ['temporal_focus', 11], ['self_ref', 12],
    ['intimacy', 13], ['power_diff', 14], ['dependency', 15],
    ['moral_judgment', 16], ['etiquette', 17], ['belonging', 18],
    ['sexual_attraction', 19], ['sensory_craving', 20], ['energy_merge', 21],
    ['possessiveness', 22], ['ecstasy', 23], ['safety', 24],
  ];

  let spineCount = 0, addrCount = 0, repairCount = 0;
  const BATCH = 100;
  let lastLog = 0;

  for (let i = 0; i < rows.length; i++) {
    const [id, seqPos, createdAt, globalUid, perceptionJson, rawInput, locusPath, dnaRootId, calciumScore] = rows[i];
    if (!globalUid) continue;

    const ts = createdAt ? new Date(createdAt as string).getTime() : Date.now();
    const locFp = '0'.repeat(32); // 瑶光空白期
    const checksum = createHash('sha256')
      .update(`${globalUid}:${seqPos || 0}:${ts}`)
      .digest('hex').substring(0, 16);

    try {
      const perception = JSON.parse(perceptionJson as string || '{}');

      // ── 底座1: state_spines ──
      for (const [key, dimId] of dims) {
        const value = typeof perception[key] === 'number' ? perception[key] : 0;
        db.run(
          `INSERT OR REPLACE INTO state_spines (global_uid, dimension_id, value, consistency_mark, location_fingerprint, timestamp_ms, checksum)
           VALUES (?, ?, ?, 'consistent', ?, ?, ?)`,
          [globalUid, dimId, value, locFp, ts, checksum],
        );
        spineCount++;
      }

      // ── 底座2: atom_address_timeline ──
      const timeSliceTag = new Date(ts).toISOString().substring(0, 7);
      db.run(
        `INSERT OR REPLACE INTO atom_address_timeline
         (global_uid, global_time_seq, absolute_timestamp, time_slice_tag, entity_belong_id,
          hot_cold_level, crc_checksum, state_flag, created_at, route_stamp_list)
         VALUES (?, ?, ?, ?, ?, 'W', ?, 'N', ?, ?)`,
        [
          globalUid, seqPos || 0, ts, timeSliceTag,
          null, checksum, ts,
          JSON.stringify([{ workshop: 'backfill', phase_id: 'backfill', node_id: 'BackfillDualHelix', timestamp: Math.floor(ts / 1000), detail: 'backfill_from_legacy' }]),
        ],
      );
      addrCount++;

      // ── 底座3: atom_repair_index ──
      db.run(
        `INSERT OR REPLACE INTO atom_repair_index (global_uid, spine_storage_position, flesh_storage_position, last_verified_at)
         VALUES (?, ?, ?, unixepoch())`,
        [
          globalUid,
          `state_spines::${globalUid}::1-24`,
          `memories::${dnaRootId || globalUid}`,
        ],
      );
      repairCount++;

    } catch (e) {
      console.warn(`  [${i}] ${globalUid} 写入失败:`, (e as Error).message);
    }

    if (i - lastLog >= BATCH || i === rows.length - 1) {
      const pct = ((i + 1) / rows.length * 100).toFixed(1);
      console.log(`  进度: ${i + 1}/${rows.length} (${pct}%) | spines: ${spineCount} | addr: ${addrCount} | repair: ${repairCount}`);
      lastLog = i;
    }
  }

  // 保存
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('\n═'.repeat(60));
  console.log('  回填完成!');
  console.log(`  state_spines:         ${spineCount} 行 (${rows.length} 记忆 × 24 维)`);
  console.log(`  atom_address_timeline: ${addrCount} 行`);
  console.log(`  atom_repair_index:     ${repairCount} 行`);
  console.log(`  DB: ${DB_PATH}`);
  console.log('═'.repeat(60));
}

main().catch(console.error);
