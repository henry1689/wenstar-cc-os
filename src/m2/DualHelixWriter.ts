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
 * V2.0 可靠性增强：
 *   - 返回值改为 { success, error, details }，调用方可感知写入失败
 *   - 失败队列 + 3 次重试 + 超限告警（console.error 结构化格式）
 *   - retryHelixQueue() 供服务端定时重放
 *
 * 使用:
 *   import { writeToDualHelix, retryHelixQueue } from '../m2/DualHelixWriter.js';
 *   const result = writeToDualHelix(db, { globalUid, perceptionJson, seqPos, ... });
 *   if (!result.success) console.error('[DualHelix] 写入失败:', result.error);
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

export interface HelixWriteResult {
  success: boolean;
  error?: string;
  /** 失败底座列表，成功时为空数组 */
  failedSpines?: string[];
}

interface FailedEntry {
  params: HelixWriteParams;
  retries: number;
  firstError: string;
  firstFailedAt: string;
}

// ── 失败重试队列 ──
const MAX_RETRIES = 3;
const _failedQueue: FailedEntry[] = [];

/**
 * 向双螺旋三底座写入一条海胆记录。
 *
 * 在 persistConversation() 的每个 writeMemory() 后调用。
 * 每个底座独立 try-catch，部分失败不影响其他底座写入。
 *
 * @returns { success, error, failedSpines } — success 为 false 时至少一个底座写入失败
 */
export function writeToDualHelix(db: any, params: HelixWriteParams): HelixWriteResult {
  if (!params.globalUid) {
    return { success: false, error: '缺少 global_uid', failedSpines: [] };
  }

  const failedSpines: string[] = [];
  let perception: Record<string, number> = {};

  try {
    perception = JSON.parse(params.perceptionJson || '{}');
  } catch {
    failedSpines.push('parse_perception');
    return { success: false, error: 'perceptionJson 解析失败', failedSpines };
  }

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

  try {
    for (const [key, dimId] of dims) {
      const value = typeof perception[key] === 'number' ? perception[key] : 0;
      db.run(
        `INSERT OR REPLACE INTO state_spines (global_uid, dimension_id, value, consistency_mark, location_fingerprint, timestamp_ms, checksum)
         VALUES (?, ?, ?, 'consistent', ?, ?, ?)`,
        [params.globalUid, dimId, value, locFp, ts, checksum],
      );
    }
  } catch (e) {
    failedSpines.push('spine1:state_spines');
  }

  // ═══════ 底座2: atom_address_timeline ═══════
  try {
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
  } catch (e) {
    failedSpines.push('spine2:atom_address_timeline');
  }

  // ═══════ 底座3: atom_repair_index ═══════
  try {
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
    failedSpines.push('spine3:atom_repair_index');
  }

  if (failedSpines.length > 0) {
    // 入失败队列，供后续重试
    _failedQueue.push({
      params,
      retries: 0,
      firstError: `底座写入失败: ${failedSpines.join(', ')}`,
      firstFailedAt: new Date().toISOString(),
    });
    return { success: false, error: `底座写入失败: ${failedSpines.join(', ')}`, failedSpines };
  }

  return { success: true, failedSpines: [] };
}

/**
 * 重试失败队列中的所有条目。
 * 每个条目最多重试 MAX_RETRIES 次，超限后输出结构化告警日志。
 *
 * 供 server.ts 定时调用（建议 5 分钟间隔）。
 *
 * @returns 本次重试成功的条目数
 */
export function retryHelixQueue(db: any): number {
  if (_failedQueue.length === 0) return 0;

  let succeeded = 0;
  const stillFailed: FailedEntry[] = [];

  for (const entry of _failedQueue) {
    entry.retries++;
    const result = writeToDualHelix(db, entry.params);

    if (result.success) {
      succeeded++;
      // 不重新入队列
    } else if (entry.retries >= MAX_RETRIES) {
      // 超限告警 — 结构化格式，供 observability 采集
      console.error(JSON.stringify({
        alert: 'DualHelixWriteFailed',
        severity: 'ERROR',
        globalUid: entry.params.globalUid,
        seqPos: entry.params.seqPos,
        retries: entry.retries,
        firstError: entry.firstError,
        lastError: result.error,
        firstFailedAt: entry.firstFailedAt,
        lastFailedAt: new Date().toISOString(),
        message: `[DualHelix] ${entry.params.globalUid} 写入失败，已重试 ${entry.retries} 次仍失败，HNSW 索引可能残缺`,
      }));
      // 不再重试，保留日志即可
    } else {
      stillFailed.push(entry);
    }
  }

  // 清空旧队列，仅保留仍需重试的条目
  _failedQueue.length = 0;
  _failedQueue.push(...stillFailed);

  if (succeeded > 0) {
    console.log(`[DualHelix] 重试成功: ${succeeded} 条`);
  }
  if (stillFailed.length > 0) {
    console.warn(`[DualHelix] 仍有 ${stillFailed.length} 条待重试 (已重试 ${stillFailed[0]?.retries || 0}/${MAX_RETRIES})`);
  }

  return succeeded;
}

/**
 * 获取失败队列状态，供监控端点查询。
 */
export function getHelixQueueStatus(): { size: number; oldestFailedAt: string | null; maxRetries: number } {
  return {
    size: _failedQueue.length,
    oldestFailedAt: _failedQueue.length > 0 ? _failedQueue[0].firstFailedAt : null,
    maxRetries: MAX_RETRIES,
  };
}
