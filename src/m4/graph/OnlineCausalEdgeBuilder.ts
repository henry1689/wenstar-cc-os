/**
 * OnlineCausalEdgeBuilder — 在线因果边构建器 (V13.0)
 * =================================================
 * 闭组时在同实体 + 同话题的连续对话组之间建因果边。
 * 不做逐轮记忆粒度——对话组是因果的最小语义单元。
 *
 * 建边规则:
 *   1. 同 namespace + 同 belong_entity_uuid
 *   2. 同 locus_path（话题连续）
 *   3. 时间差 ≤ 30 分钟
 *   4. 文本中存在因果/承接/决定类线索
 *
 * 接入点: dialog-group-stage.ts flushDialogGroup() 末尾
 */

import type { MemoryAssociationRepository } from './MemoryAssociationRepository.js';
import type { DialogGroupContext } from './OnlineEntityEdgeBuilder.js';

/** 因果线索词表 */
const CAUSAL_HINTS = [
  '因为', '所以', '于是', '然后', '后来', '导致', '结果',
  '决定', '打算', '准备', '因此', '既然', '那我', '我会', '我想',
  '我准备', '我决定', '答应', '保证', '承诺', '记住',
];

export class OnlineCausalEdgeBuilder {
  private repo: MemoryAssociationRepository;

  constructor(repo: MemoryAssociationRepository) {
    this.repo = repo;
  }

  /**
   * 闭组时调用：在当前组和上一个同话题组之间建因果边
   * @returns 创建的边数（0 或 1）
   */
  buildForDialogGroup(
    current: DialogGroupContext,
    prev: DialogGroupContext,
    combinedText: string,
  ): number {
    // 时间窗口检查：30 分钟内
    const gapMinutes = (current.closedAtMs - prev.closedAtMs) / 60000;
    if (gapMinutes > 30) return 0;

    // 话题连续性检查
    if (!current.locusPath || !prev.locusPath) return 0;
    const curTopic = current.locusPath.split('.').slice(0, 2).join('.');
    const prevTopic = prev.locusPath.split('.').slice(0, 2).join('.');
    if (curTopic !== prevTopic) return 0;

    // 因果线索检查
    const conf = this._computeCausalConfidence(combinedText);
    if (conf < 0.6) return 0;

    const result = this.repo.createOrUpdateEdge({
      namespace: current.namespace,
      belongEntityUuid: current.belongEntityUuid,
      sourceGlobalUid: prev.groupGlobalUid,
      targetGlobalUid: current.groupGlobalUid,
      edgeType: 'causal',
      edgeReason: `short_window_causal: ${prev.groupId} → ${current.groupId}`,
      confidence: conf,
      weight: conf,
      sourceTimestampMs: prev.closedAtMs,
      targetTimestampMs: current.closedAtMs,
      createdBy: 'online_causal_builder',
    });
    return result !== null ? 1 : 0;
  }

  private _computeCausalConfidence(combinedText: string): number {
    let score = 0.45;
    let hintsHit = 0;
    for (const hint of CAUSAL_HINTS) {
      if (combinedText.includes(hint)) hintsHit++;
    }
    if (hintsHit >= 2) score += 0.25;
    else if (hintsHit === 1) score += 0.15;
    return Math.min(1.0, score);
  }
}
