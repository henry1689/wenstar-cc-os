/**
 * OnlineEntityEdgeBuilder — 在线实体边构建器 (V13.0)
 * =================================================
 * 闭组时按对话组粒度建实体边，每个对话组对上一个同实体对话组建一条边。
 * 不做记忆粒度的冗余建边——那是离线语义边的职责。
 *
 * 接入点: dialog-group-stage.ts flushDialogGroup() 末尾
 */

import type { MemoryAssociationRepository } from './MemoryAssociationRepository.js';

export interface DialogGroupContext {
  namespace: string;
  belongEntityUuid: string;
  groupId: string;                // dialog group ID (e.g. "{dna_root_id}_DG_{seqPos}")
  groupGlobalUid: string;         // 该组锚点记忆的 global_uid
  closedAtMs: number;
  locusPath?: string;
  entityNames?: string[];
}

export class OnlineEntityEdgeBuilder {
  private repo: MemoryAssociationRepository;

  constructor(repo: MemoryAssociationRepository) {
    this.repo = repo;
  }

  /**
   * 闭组时调用：在同实体之间串一条对话组链
   * @returns 创建的边数（0 或 1）
   */
  buildForDialogGroup(groupCtx: DialogGroupContext): number {
    const prev = this._findPrevDialogGroup(groupCtx);
    if (!prev) return 0;

    const conf = this._computeConfidence(groupCtx, prev);
    if (conf < 0.5) return 0;

    const result = this.repo.createOrUpdateEdge({
      namespace: groupCtx.namespace,
      belongEntityUuid: groupCtx.belongEntityUuid,
      sourceGlobalUid: prev.groupGlobalUid,
      targetGlobalUid: groupCtx.groupGlobalUid,
      edgeType: 'entity',
      edgeReason: `dialog_group_chain: ${prev.groupId} → ${groupCtx.groupId}`,
      confidence: conf,
      weight: conf,
      sourceTimestampMs: prev.closedAtMs,
      targetTimestampMs: groupCtx.closedAtMs,
      createdBy: 'online_entity_builder',
    });
    return result !== null ? 1 : 0;
  }

  /** 查上一个同实体、同 namespace 的对话组 */
  private _findPrevDialogGroup(ctx: DialogGroupContext): DialogGroupContext | null {
    try {
      // 沿着 entity 出边找最新一条（已建边即代表有上一个对话组）
      const edges = this.repo.getEdges({
        namespace: ctx.namespace,
        belongEntityUuid: ctx.belongEntityUuid,
        globalUid: '',  // 不按单个 uid 查，而是查这个 entity 的所有 entity 边
        edgeTypes: ['entity'],
        direction: 'out',
        limit: 1,
        minConfidence: 0.5,
      });

      // 实际上应该查同 entity 最近一条 entity 边，然后读它的 target
      if (edges.length === 0) return null;
      // edges 的 target 是上一个对话组的 global_uid
      return null; // TODO: 需要 storage 接口查记忆元数据。当前版本通过 caller 传入 prev
    } catch { return null; }
  }

  private _computeConfidence(current: DialogGroupContext, prev: DialogGroupContext): number {
    let score = 0.5;

    // 同 locus 前缀 → 话题连续性强
    if (current.locusPath && prev.locusPath && current.locusPath === prev.locusPath) {
      score += 0.25;
    }

    // 实体名重叠
    const currNames = new Set(current.entityNames ?? []);
    const prevNames = new Set(prev.entityNames ?? []);
    const overlap = [...currNames].filter(n => prevNames.has(n)).length;
    if (overlap > 0) score += 0.10;

    // 时间接近（< 2h）
    const timeGapMinutes = (current.closedAtMs - prev.closedAtMs) / 60000;
    if (timeGapMinutes < 120) score += 0.10;

    return Math.min(1.0, score);
  }
}
