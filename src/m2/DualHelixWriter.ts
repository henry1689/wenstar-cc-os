/**
 * DualHelixWriter.ts — 双螺旋三底座同步写入
 * ============================================
 * 任何记忆写入操作时, 同时向三个底座写数据 (蓝皮书 §3.1-3.3)。
 *
 * 底座1 state_spines:         32D 拆为 32 条独立行, HNSW 网状索引
 * 底座2 atom_address_timeline: 寻址元数据, B+Tree 线性时序索引
 * 底座3 atom_repair_index:     断链修复索引
 *
 * 铁律:
 *   - 三底座仅通过 GlobalUID 关联
 *   - state_spines: 仅 HNSW, 禁止时序排序
 *   - atom_address_timeline: 仅 B+Tree+倒排, 禁止存语义向量
 *   - 原始数据层 (memories): 仅文本, 禁止直接做语义检索
 *
 * 使用:
 *   import { writeToDualHelix } from '../m2/DualHelixWriter.js';
 *   await writeToDualHelix(db, { globalUid, perceptionJson, seqPos, ... });
 */

import type { DNA } from '../m1/types/dna.js';
import { createHash } from 'node:crypto';

export interface HelixWriteParams {
  /** 23字符 GlobalUID (DNAEncoder.generateGlobalUID) */
  globalUid: string;
  /** 24D 感知向量 JSON (P3 升级为 32D) */
  perceptionJson: string;
  /** 全局序列号 */
  seqPos: number;
  /** ISO8601 创建时间 */
  createdAt: string;
  /** 区位指纹 (瑶光空白期为32位全0) */
  locationFingerprint?: string;
  /** locus_path */
  locusPath?: string;
  /** DNA root_id */
  dnaRootId?: string;
  /** 实体列表 */
  entityNames?: string[];
  /** 钙化分数 */
  calciumScore?: number;
}

/**
 * 向双螺旋三底座写入一条海胆记录。
 * 在 persistConversation() 的每个 writeMemory() 后调用。
 *
 * 幂等: INSERT OR REPLACE 防止重复。
 */
export function writeToDualHelix(db: any, params: HelixWriteParams): void {
  if (!params.globalUid) {
    console.warn('[DualHelix] 跳过: 缺少 global_uid');
    return;
  }

  try {
    const perception = JSON.parse(params.perceptionJson || '{}');
    const ts = new Date(params.createdAt).getTime();
    const locFp = params.locationFingerprint || '0'.repeat(32);
    const checksum = createHash('sha256')
      .update(`${params.globalUid}:${params.seqPos}:${ts}`)
      .digest('hex').substring(0, 16);

    // ═══════ 底座1: state_spines (24D 拆为 24 行, P3→32D) ═══════
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

    for (const [key, dimId] of dims) {
      const value = typeof perception[key] === 'number' ? perception[key] : 0;
      db.run(
        `INSERT OR REPLACE INTO state_spines (global_uid, dimension_id, value, consistency_mark, location_fingerprint, timestamp_ms, checksum)
         VALUES (?, ?, ?, 'consistent', ?, ?, ?)`,
        [params.globalUid, dimId, value, locFp, ts, checksum],
      );
    }

    // ═══════ 底座2: atom_address_timeline ═══════
    const timeSliceTag = new Date(ts).toISOString().substring(0, 7); // YYYY-MM
    const entityBelong = params.entityNames?.[0] || '';
    db.run(
      `INSERT OR REPLACE INTO atom_address_timeline
       (global_uid, global_time_seq, absolute_timestamp, time_slice_tag, entity_belong_id,
        hot_cold_level, crc_checksum, state_flag, created_at, route_stamp_list)
       VALUES (?, ?, ?, ?, ?, 'W', ?, 'N', ?, ?)`,
      [
        params.globalUid, params.seqPos, ts, timeSliceTag,
        entityBelong || null, checksum, ts,
        JSON.stringify([{ workshop: 'M1', phase_id: 'encode', node_id: 'DNAEncoder', timestamp: ts / 1000, detail: 'initial_encode' }]),
      ],
    );

    // ═══════ 底座3: atom_repair_index ═══════
    db.run(
      `INSERT OR REPLACE INTO atom_repair_index (global_uid, spine_storage_position, flesh_storage_position, last_verified_at)
       VALUES (?, ?, ?, unixepoch())`,
      [
        params.globalUid,
        `state_spines::${params.globalUid}::1-24`,
        `memories::${params.dnaRootId || params.globalUid}`,
      ],
    );

  } catch (e) {
    console.warn('[DualHelix] 写入失败:', (e as Error).message);
  }
}
