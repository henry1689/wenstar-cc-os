/**
 * EmotionMatcher.ts — 32D 全维情感感知检索引擎（自适应权重版）
 * ===============================================================
 * 将知识的情感向量从 3D 升级到 32D，按扇区加权余弦匹配。
 * 权重可从 engine_store 持久化加载，根据用户反馈微调。
 *
 * 6 大扇区默认权重:
 *   感知情绪  ×0.25  — 用户此刻情绪与知识情感基调的匹配度
 *   肉身实体  ×0.10  — 身体状况关联
 *   精神内核  ×0.15  — 精神需求匹配
 *   圈层人际  ×0.20  — 社交场景匹配
 *   时空环境  ×0.15  — 场景匹配
 *   动态生长  ×0.15  — 成长需求匹配
 *
 * 使用:
 *   const matcher = new EmotionMatcher();
 *   await matcher.loadWeights(sqlite);  // 加载持久化权重
 *   const score = matcher.match(vec, perception);
 *   matcher.adjustWeights({ sector: 'social', positive: true });  // 微调
 *   await matcher.saveWeights(sqlite);  // 持久化
 */

const WEIGHTS_KEY = 'emotion_sector_weights';

export interface SectorWeights {
  emotion: number;      // D0-D5   感知用户情绪
  physical: number;     // D6-D10  肉身实体
  spiritual: number;    // D11-D16 精神内核
  social: number;       // D17-D22 圈层人际
  spatiotemporal: number; // D23-D28 时空环境
  growth: number;       // D29-D31 动态生长
}

// 32D 扇区映射（维度索引 → 扇区名）
const SECTOR_MAP: Array<{ name: keyof SectorWeights; start: number; end: number }> = [
  { name: 'emotion',       start: 0,  end: 5 },
  { name: 'physical',      start: 6,  end: 10 },
  { name: 'spiritual',     start: 11, end: 16 },
  { name: 'social',        start: 17, end: 22 },
  { name: 'spatiotemporal', start: 23, end: 28 },
  { name: 'growth',        start: 29, end: 31 },
];

const DEFAULT_WEIGHTS: SectorWeights = {
  emotion: 0.25,
  physical: 0.10,
  spiritual: 0.15,
  social: 0.20,
  spatiotemporal: 0.15,
  growth: 0.15,
};

export class EmotionMatcher {
  private weights: SectorWeights;

  constructor(weights?: Partial<SectorWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * 🔥 从 engine_store 加载持久化权重
   * 首次启动无持久化数据时使用默认值
   */
  async loadWeights(sqlite: { queryAll: (sql: string, params?: any[]) => any[] }): Promise<void> {
    try {
      const rows = sqlite.queryAll('SELECT value FROM engine_store WHERE key = ? LIMIT 1', [WEIGHTS_KEY]);
      if (rows.length > 0) {
        const saved: SectorWeights = JSON.parse(rows[0].value as string);
        // 只合并有效扇区，防止旧格式污染
        for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof SectorWeights)[]) {
          if (typeof saved[key] === 'number' && saved[key] >= 0.05 && saved[key] <= 0.50) {
            this.weights[key] = saved[key];
          }
        }
        console.log('[EmotionMatcher] 加载持久化权重:', this.weights);
      }
    } catch { /* 首次启动无数据正常 */ }
  }

  /**
   * 🔥 将当前权重持久化到 engine_store
   */
  async saveWeights(sqlite: { writeRaw: (sql: string, ...params: any[]) => void }): Promise<void> {
    try {
      sqlite.writeRaw(
        'INSERT OR REPLACE INTO engine_store (key, value, updated_at) VALUES (?, ?, ?)',
        [WEIGHTS_KEY, JSON.stringify(this.weights), new Date().toISOString()]
      );
    } catch { /* 持久化失败不阻塞 */ }
  }

  /**
   * 🔥 根据用户反馈微调扇区权重
   * - 用户认可 → 该扇区权重 +0.01
   * - 用户反驳 → 该扇区权重 -0.005
   * - 单次调整 ≤ 0.02，总区间 [0.05, 0.50]
   * - 自动归一化所有权重总和为 1.0
   */
  adjustWeights(feedback: { sector: keyof SectorWeights; positive: boolean }): void {
    const delta = feedback.positive ? 0.01 : -0.005;
    const old = this.weights[feedback.sector];
    this.weights[feedback.sector] = Math.max(0.05, Math.min(0.50, old + delta));
    // 归一化所有权重总和 = 1.0
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(this.weights) as (keyof SectorWeights)[]) {
      this.weights[key] /= sum;
    }
    console.log('[EmotionMatcher] 微调:', feedback.sector, (feedback.positive ? '+0.01' : '-0.005'),
      '前:', old.toFixed(4), '后:', this.weights[feedback.sector].toFixed(4));
  }

  /** 获取当前权重（供外部读取） */
  getWeights(): SectorWeights {
    return { ...this.weights };
  }

  /** 计算知识与当前感知的 32D 扇区加权匹配度 */
  match(
    knowledgeVec: number[],
    currentPerception: { pleasure: number; arousal: number; intimacy: number; [key: string]: number },
  ): number {
    if (!knowledgeVec.length) return 0.5;
    const percVec = this._perceptionToVector(currentPerception, knowledgeVec.length);
    let totalScore = 0;
    for (const sector of SECTOR_MAP) {
      const kSlice = knowledgeVec.slice(sector.start, sector.end + 1);
      const pSlice = percVec.slice(sector.start, sector.end + 1);
      if (kSlice.length === 0) continue;
      totalScore += this._cosineSimilarity(kSlice, pSlice) * this.weights[sector.name];
    }
    return Math.max(0, Math.min(1, totalScore));
  }

  /** 批量匹配：对一组知识按情感相关度重排序 */
  rerank<T extends { emotion_vector?: string }>(
    items: T[],
    currentPerception: { pleasure: number; arousal: number; intimacy: number; [key: string]: number },
  ): Array<T & { emotionScore: number }> {
    return items
      .map(item => {
        let emotionScore = 0.5;
        if (item.emotion_vector) {
          try {
            const ev = JSON.parse(item.emotion_vector);
            if (Array.isArray(ev) && ev.length >= 6) {
              emotionScore = this.match(ev, currentPerception);
            }
          } catch { /* 解析失败 */ }
        }
        return { ...item, emotionScore } as T & { emotionScore: number };
      })
      .sort((a, b) => b.emotionScore - a.emotionScore);
  }

  private _perceptionToVector(
    p: { pleasure: number; arousal: number; intimacy: number; [key: string]: number },
    targetDim: number,
  ): number[] {
    const vec = new Array(targetDim).fill(0.5);
    vec[0] = (p.pleasure ?? 0.5);
    vec[1] = (p.arousal ?? 0.5);
    vec[4] = (p.intimacy ?? 0.5);
    if (targetDim > 13) vec[13] = (p.intimacy ?? 0.5);
    if (targetDim > 19) vec[19] = (p.sexual_attraction ?? 0.5);
    if (targetDim > 20) vec[20] = (p.sensory_craving ?? 0.5);
    if (targetDim > 31) vec[31] = (p.safety ?? 0.5);
    return vec;
  }

  private _cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0.5;
    return (dot / denom + 1) / 2;
  }
}
