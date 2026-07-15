/**
 * learning-config.ts — 自学习引擎配置常量
 * ============================================
 * 所有阈值/学习率/衰减因子集中管理，不可运行时修改。
 * 适配: 知识库自学习改善方案 Phase 1
 */
export const LEARNING_CONFIG = {
  // ── 实体关联强度 ──
  /** 同轮共现基础强度增量 */
  ENTITY_CO_OCCUR_STRENGTH: 0.3,
  /** 同对话组非共现强度增量 */
  ENTITY_DISCUSSED_STRENGTH: 0.15,
  /** 7天衰减因子 (×0.9) */
  ENTITY_DECAY_FACTOR: 0.9,
  /** 低频清理阈值 */
  ENTITY_STALE_THRESHOLD: 0.1,

  // ── 情感基准 ──
  /** 初始学习率 (前10次) */
  EMOTION_LEARNING_RATE_INIT: 0.05,
  /** 中期学习率 (10-100次) */
  EMOTION_LEARNING_RATE_MID: 0.02,
  /** 稳定期学习率 (100+次) */
  EMOTION_LEARNING_RATE_LATE: 0.01,

  // ── 新知识冷启动 ──
  /** 冷启动时长 (72小时) */
  NOVELTY_BOOST_HOURS: 72,
  /** 冷启动权重倍数 */
  NOVELTY_BOOST_FACTOR: 1.3,

  // ── 知识衰减 ──
  /** 90天未召回开始衰减 */
  DECAY_DAYS_WARM: 90,
  /** 180天未召回标记休眠 */
  DECAY_DAYS_DORMANT: 180,
  /** 365天未召回可归档 */
  DECAY_DAYS_ARCHIVE: 365,
  /** 衰减幅度 */
  DECAY_IMPRESSION_FACTOR: 0.9,
};
