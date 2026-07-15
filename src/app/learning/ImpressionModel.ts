/**
 * ImpressionModel.ts — 印象值逻辑回归模型
 * ===========================================
 * 取代旧 `+= 0.05` 线性更新，用 4 维特征 + 逻辑回归
 * 预测知识被用户引用的概率作为印象值。
 *
 * 特征:
 *   x1: recall_count_7d       7天内召回次数 (归一化)
 *   x2: days_since_last_recall 距上次召回天数 (倒数)
 *   x3: scene_match_rate      场景标签匹配率
 *   x4: is_new                是否 <72h 新知识
 *
 * 因为无标注数据，使用启发式标签: 被 recall 过的知识 = 正样本
 *
 * 使用:
 *   const model = new ImpressionModel();
 *   const score = model.predict(features);
 *   const updated = model.onRecalled(currentScore, recallCount);
 */
export interface ImpressionFeatures {
  recallCount7d: number;
  daysSinceLastRecall: number;
  sceneMatchRate: number;
  isNew: boolean;
}

// 逻辑回归权重 (通过启发式+观察校准, 无训练数据时手工调参)
// 特征顺序: [bias, recallCount7d, daysSinceLastRecall, sceneMatchRate, isNew]
const DEFAULT_WEIGHTS: [number, number, number, number, number] = [
  -1.0,   // bias
   2.5,   // recallCount7d: 被召回越多 → 印象值越高
  -1.8,   // daysSinceLastRecall: 越久未召回 → 印象值越低
   1.2,   // sceneMatchRate: 场景匹配 → 印象值略高
   1.5,   // isNew: 新知识冷启动助推
];

export class ImpressionModel {
  private weights: [number, number, number, number, number];

  constructor(weights?: [number, number, number, number, number]) {
    this.weights = weights || DEFAULT_WEIGHTS;
  }

  /**
   * 预测印象值 [0, 1]
   */
  predict(features: ImpressionFeatures): number {
    const x = this._featuresToVector(features);
    // 逻辑回归: P(y=1) = 1 / (1 + exp(-(w·x)))
    let z = this.weights[0]; // bias
    for (let i = 0; i < x.length; i++) {
      z += this.weights[i + 1] * x[i];
    }
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * 知识被召回时更新（简化版：直接加小增量）
   * 保持向后兼容旧线性逻辑
   */
  onRecalled(currentScore: number, recallCount: number): number {
    // 召回越多，增量越小 (收敛)
    const increment = Math.max(0.01, 0.05 / Math.sqrt(recallCount + 1));
    return Math.min(1.0, currentScore + increment);
  }

  /**
   * 知识长期未被召回时衰减
   */
  onDecay(currentScore: number, daysSinceLastRecall: number): number {
    if (daysSinceLastRecall < 30) return currentScore;
    const decay = Math.min(0.2, daysSinceLastRecall / 365 * 0.1);
    return Math.max(0.01, currentScore - decay);
  }

  /**
   * 将特征映射为数值向量
   */
  private _featuresToVector(f: ImpressionFeatures): number[] {
    return [
      Math.min(1, f.recallCount7d / 10),          // recallCount7d: 0-10 → [0,1]
      1 / Math.max(1, f.daysSinceLastRecall),       // daysSinceLastRecall: 倒数
      f.sceneMatchRate,                              // sceneMatchRate: [0,1]
      f.isNew ? 1 : 0,                              // isNew: {0,1}
    ];
  }

  /**
   * 查看当前模型权重（调试用）
   */
  getWeights(): typeof DEFAULT_WEIGHTS {
    return [...this.weights];
  }

  /**
   * 更新权重（未来有标注数据后可通过梯度下降微调）
   */
  updateWeights(delta: number[]): void {
    for (let i = 0; i < Math.min(delta.length, this.weights.length); i++) {
      this.weights[i] += delta[i];
    }
  }
}
