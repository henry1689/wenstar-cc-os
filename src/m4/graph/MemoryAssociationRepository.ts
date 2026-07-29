/**
 * MemoryAssociationRepository — DAG 边表读写封装 (V13.0)
 * ======================================================
 * 封装 memory_associations 的所有读写操作，禁止业务层直接写 SQL。
 *
 * 行为规则:
 *   - createOrUpdateEdge: 边不存在→INSERT, 边已存在→UPDATE max(old,new)
 *   - 不简单覆盖, 避免离线低置信任务冲掉在线高置信边
 *   - 所有查询强制带 namespace + belong_entity_uuid
 */

import type {
  MemoryAssociation,
  CreateAssociationInput,
  AssociationQuery,
  MemoryEdgeType,
  EdgeStateFlag,
} from './MemoryAssociationTypes.js';

export class MemoryAssociationRepository {
  private sqlite: any;  // SQLiteAdapter instance (any due to circular dependency avoidance)

  constructor(sqlite: any) {
    this.sqlite = sqlite;
  }

  // ═══════════════════════════════════════
  // 写入
  // ═══════════════════════════════════════

  /**
   * 创建或更新一条边。
   * - 边不存在 → INSERT
   * - 边已存在 → confidence = max(old, new), weight = max(old, new), updated_at_ms = now
   */
  createOrUpdateEdge(input: CreateAssociationInput): number | null {
    const now = Date.now();
    const ns = input.namespace;
    const euuid = input.belongEntityUuid;
    const edgeType = input.edgeType;
    const confidence = input.confidence ?? 0.7;
    const weight = input.weight ?? 1.0;
    const createdBy = input.createdBy ?? 'system';

    // 时间正向校验（代码层断言）
    if (input.sourceTimestampMs >= input.targetTimestampMs) {
      console.warn(`[DAG] 拒绝逆时边: source=${input.sourceTimestampMs} target=${input.targetTimestampMs}`);
      return null;
    }

    // 自环校验
    if (input.sourceGlobalUid === input.targetGlobalUid) {
      console.warn(`[DAG] 拒绝自环: uid=${input.sourceGlobalUid}`);
      return null;
    }

    try {
      // 先用 INSERT OR IGNORE 尝试插入（幂等）
      this.sqlite.runSql(
        `INSERT OR IGNORE INTO memory_associations
         (namespace, belong_entity_uuid, source_global_uid, target_global_uid,
          edge_type, edge_reason, confidence, weight,
          source_timestamp_ms, target_timestamp_ms, created_by, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ns, euuid, input.sourceGlobalUid, input.targetGlobalUid,
         edgeType, input.edgeReason ?? null, confidence, weight,
         input.sourceTimestampMs, input.targetTimestampMs, createdBy, now, now],
      );

      // 如果已存在，更新为 max(old, new)
      this.sqlite.runSql(
        `UPDATE memory_associations
         SET confidence = MAX(confidence, ?), weight = MAX(weight, ?),
             updated_at_ms = ?, edge_reason = COALESCE(edge_reason || '; ', '') || ?
         WHERE namespace=? AND belong_entity_uuid=? AND source_global_uid=? AND target_global_uid=? AND edge_type=?`,
        [confidence, weight, now, input.edgeReason ?? '',
         ns, euuid, input.sourceGlobalUid, input.targetGlobalUid, edgeType],
      );

      // 返回插入/更新的 id
      const rows = this.sqlite.queryAll
        ? this.sqlite.queryAll(
            `SELECT id FROM memory_associations
             WHERE namespace=? AND belong_entity_uuid=? AND source_global_uid=? AND target_global_uid=? AND edge_type=?`,
            [ns, euuid, input.sourceGlobalUid, input.targetGlobalUid, edgeType],
          )
        : [];
      return rows.length > 0 ? (rows[0] as any).id : null;
    } catch (err) {
      // CHECK constraint violation (逆时边) 不抛异常, 只记录
      console.warn(`[DAG] 边写入失败:`, (err as Error)?.message);
      return null;
    }
  }

  // ═══════════════════════════════════════
  // 查询
  // ═══════════════════════════════════════

  /**
   * 按条件查询边（统一入口）
   */
  getEdges(query: AssociationQuery): MemoryAssociation[] {
    const { namespace: ns, belongEntityUuid: euuid, globalUid: uid } = query;
    const minConf = query.minConfidence ?? 0;
    const edgeTypes = query.edgeTypes;
    const direction = query.direction ?? 'both';
    const limit = query.limit ?? 30;

    try {
      let whereClause = '';
      const params: any[] = [];

      if (direction === 'out') {
        whereClause = `source_global_uid = ?`;
        params.push(uid);
      } else if (direction === 'in') {
        whereClause = `target_global_uid = ?`;
        params.push(uid);
      } else {
        whereClause = `(source_global_uid = ? OR target_global_uid = ?)`;
        params.push(uid, uid);
      }

      whereClause += ` AND namespace = ? AND belong_entity_uuid = ?`;
      params.push(ns, euuid);

      whereClause += ` AND confidence >= ? AND state_flag = 'active'`;
      params.push(minConf);

      if (edgeTypes && edgeTypes.length > 0) {
        whereClause += ` AND edge_type IN (${edgeTypes.map(() => '?').join(',')})`;
        params.push(...edgeTypes);
      }

      const rows = this.sqlite.queryAll
        ? this.sqlite.queryAll(
            `SELECT * FROM memory_associations
             WHERE ${whereClause}
             ORDER BY edge_type='causal' DESC, confidence DESC
             LIMIT ?`,
            [...params, limit],
          )
        : [];
      return rows.map(this._rowToAssociation);
    } catch { return []; }
  }

  /** 查指定节点的出边 */
  getOutgoingEdges(query: AssociationQuery): MemoryAssociation[] {
    return this.getEdges({ ...query, direction: 'out' });
  }

  /** 查指定节点的入边 */
  getIncomingEdges(query: AssociationQuery): MemoryAssociation[] {
    return this.getEdges({ ...query, direction: 'in' });
  }

  // ═══════════════════════════════════════
  // 维护
  // ═══════════════════════════════════════

  /** 压制一条边（不删除，标记为 suppressed） */
  suppressEdge(id: number, reason: string): void {
    try {
      this.sqlite.runSql(
        `UPDATE memory_associations
         SET state_flag = 'suppressed', edge_reason = edge_reason || '; suppressed: ' || ?,
             updated_at_ms = ?
         WHERE id = ?`,
        [reason, Date.now(), id],
      );
    } catch { /* suppress 失败不阻塞 */ }
  }

  /** 更新一条边的置信度 */
  updateConfidence(id: number, confidence: number, reason?: string): void {
    try {
      this.sqlite.runSql(
        `UPDATE memory_associations
         SET confidence = MAX(0.0, MIN(1.0, ?)),
             edge_reason = COALESCE(edge_reason || '', '') || CASE WHEN ? IS NOT NULL THEN '; updated: ' || ? ELSE '' END,
             updated_at_ms = ?
         WHERE id = ?`,
        [confidence, reason ?? null, reason ?? null, Date.now(), id],
      );
    } catch { /* 更新失败不阻塞 */ }
  }

  /** 硬删除一条边（慎用，一般用 suppressEdge） */
  deleteEdge(id: number): void {
    try {
      this.sqlite.runSql(`DELETE FROM memory_associations WHERE id = ?`, [id]);
    } catch { /* 删除失败不阻塞 */ }
  }

  // ═══════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════

  private _rowToAssociation(row: any): MemoryAssociation {
    return {
      id: row.id as number,
      namespace: row.namespace as string,
      belongEntityUuid: row.belong_entity_uuid as string,
      sourceGlobalUid: row.source_global_uid as string,
      targetGlobalUid: row.target_global_uid as string,
      edgeType: row.edge_type as MemoryEdgeType,
      edgeReason: row.edge_reason as string | undefined,
      confidence: row.confidence as number,
      weight: row.weight as number,
      sourceTimestampMs: row.source_timestamp_ms as number,
      targetTimestampMs: row.target_timestamp_ms as number,
      createdBy: row.created_by as string,
      createdAtMs: row.created_at_ms as number,
      updatedAtMs: row.updated_at_ms as number,
      stateFlag: row.state_flag as EdgeStateFlag,
    };
  }
}
