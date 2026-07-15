/**
 * EmotionBaseline — 情感基准在线校准
 * ========================================
 * 维护全局情感基准 (avg_pleasure, avg_arousal, avg_intimacy)
 * 每轮对话后以学习率偏移基准。
 * 跨会话持久化到 engine_store 表 (KV 存储)。
 *
 * 使用:
 *   const bl = new EmotionBaseline(storage);
 *   await bl.update(perception);  // 每轮调用
 *   const baseline = await bl.get();  // 读取当前
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import { LEARNING_CONFIG } from '../../config/learning-config.js';

export interface EmotionBaselineState {
  pleasure: number;
  arousal: number;
  intimacy: number;
  /** 累计更新次数 (用于计算学习率衰减) */
  updateCount: number;
  /** 最后更新时间 */
  lastUpdated: string;
}

const STORAGE_KEY = 'emotion_baseline';

export class EmotionBaseline {
  private storage: FusionStorageAdapter;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
  }

  /**
   * 用本轮感知更新情感基准
   * baseline += learningRate x (perception - baseline)
   */
  async update(perception: { pleasure: number; arousal: number; intimacy: number }): Promise<EmotionBaselineState> {
    try {
      const current = await this._load();
      const rate = this._computeLearningRate(current.updateCount);

      current.pleasure += rate * (perception.pleasure - current.pleasure);
      current.arousal += rate * (perception.arousal - current.arousal);
      current.intimacy += rate * (perception.intimacy - current.intimacy);
      current.updateCount++;
      current.lastUpdated = new Date().toISOString();

      await this._save(current);
      return current;
    } catch {
      return { pleasure: 0, arousal: 0, intimacy: 0, updateCount: 0, lastUpdated: '' };
    }
  }

  /**
   * 获取当前情感基准
   */
  async get(): Promise<EmotionBaselineState | null> {
    try {
      return await this._load();
    } catch {
      return null;
    }
  }

  /**
   * 重置基准到默认值
   */
  async reset(): Promise<void> {
    const sqlite = this.storage.getSQLite();
    sqlite.writeRaw(
      `DELETE FROM engine_store WHERE key = ?`,
      [STORAGE_KEY],
    );
  }

  /**
   * 学习率: 随更新次数递减
   * 前 10 次: 0.05, 10-100 次: 0.02, 100+ 次: 0.01
   */
  private _computeLearningRate(updateCount: number): number {
    if (updateCount < 10) return LEARNING_CONFIG.EMOTION_LEARNING_RATE_INIT;
    if (updateCount < 100) return LEARNING_CONFIG.EMOTION_LEARNING_RATE_MID;
    return LEARNING_CONFIG.EMOTION_LEARNING_RATE_LATE;
  }

  private async _load(): Promise<EmotionBaselineState> {
    const sqlite = this.storage.getSQLite();
    const rows = sqlite.queryAll(
      `SELECT value FROM engine_store WHERE key = ? LIMIT 1`,
      [STORAGE_KEY],
    );
    if (rows.length > 0) {
      try {
        return JSON.parse(rows[0].value as string);
      } catch { /* 解析失败走默认 */ }
    }
    return { pleasure: 0, arousal: 0, intimacy: 0, updateCount: 0, lastUpdated: '' };
  }

  private async _save(state: EmotionBaselineState): Promise<void> {
    const sqlite = this.storage.getSQLite();
    sqlite.writeRaw(
      `INSERT OR REPLACE INTO engine_store (key, value, updated_at)
       VALUES (?, ?, ?)`,
      [STORAGE_KEY, JSON.stringify(state), new Date().toISOString()],
    );
  }
}
