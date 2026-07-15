/**
 * UserCognitiveProfile.ts — 用户认知画像合成引擎
 * ===============================================
 * 从 master_profile + knowledge_base + emotion_baseline 碎片化数据中，
 * 定期合成结构化用户认知画像，供玉瑶在对话中自然引用。
 *
 * 画像维度:
 *   - thinkingStyle: 思维风格 (感性/理性/平衡)
 *   - knowledgeDomains: 核心知识领域
 *   - expressionPreference: 表达偏好 (简洁/详细/适中)
 *   - topConcerns: 近期核心关注
 *   - emotionalBaseline: 情绪基准
 *
 * 使用:
 *   const profile = new UserCognitiveProfile(sqlite, knowledgeBase);
 *   const result = await profile.synthesize();
 *   const digest = await profile.generateDigest();
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import type { KnowledgeBase } from '../../m2/KnowledgeBase.js';

export interface CognitiveProfile {
  thinkingStyle: '感性' | '理性' | '平衡';
  knowledgeDomains: Array<{ domain: string; count: number; ratio: number }>;
  expressionPreference: '简洁' | '详细' | '适中';
  topConcerns: Array<{ topic: string; impression: number; lastRecalled: string }>;
  emotionalBaseline: { pleasure: number; arousal: number; intimacy: number };
  totalEntries: number;
  lastUpdated: string;
}

export class UserCognitiveProfile {
  private sqlite: SQLiteAdapter;
  private knowledgeBase: KnowledgeBase;

  constructor(sqlite: SQLiteAdapter, knowledgeBase: KnowledgeBase) {
    this.sqlite = sqlite;
    this.knowledgeBase = knowledgeBase;
  }

  /**
   * 合成用户认知画像
   * 从多个来源汇聚碎片数据 → 结构化画像
   */
  async synthesize(): Promise<CognitiveProfile> {
    const total = this.knowledgeBase.count();
    const profile: CognitiveProfile = {
      thinkingStyle: '平衡',
      knowledgeDomains: [],
      expressionPreference: '适中',
      topConcerns: [],
      emotionalBaseline: { pleasure: 0, arousal: 0, intimacy: 0 },
      totalEntries: total,
      lastUpdated: new Date().toISOString(),
    };

    try {
      // ① 思维风格: 从 emotion_vector 的 factual 维度推断
      profile.thinkingStyle = this._inferThinkingStyle();

      // ② 知识领域分布: 从 classification 统计
      const domains = this.sqlite.queryAll(
        `SELECT classification, COUNT(*) as cnt FROM knowledge_base
         WHERE classification IS NOT NULL AND classification != ''
         GROUP BY classification ORDER BY cnt DESC LIMIT 8`
      );
      profile.knowledgeDomains = (domains || []).map((r: any) => ({
        domain: r.classification as string,
        count: r.cnt as number,
        ratio: total > 0 ? (r.cnt as number) / total : 0,
      }));

      // ③ 表达偏好: 从对话平均长度推断（取最近 50 条用户消息）
      const avgLen = this.sqlite.queryAll(
        `SELECT AVG(LENGTH(raw_input)) as avg_len FROM memories
         WHERE raw_input IS NOT NULL AND LENGTH(raw_input) > 10
         LIMIT 50`
      );
      if (avgLen && avgLen.length > 0) {
        const avg = (avgLen[0] as any).avg_len as number || 50;
        profile.expressionPreference = avg < 30 ? '简洁' : avg > 100 ? '详细' : '适中';
      }

      // ④ 核心关注: 印象值最高的知识主题
      const top = this.sqlite.queryAll(
        `SELECT title, impression_score, last_recalled_at FROM knowledge_base
         ORDER BY COALESCE(impression_score, 0.5) DESC LIMIT 5`
      );
      profile.topConcerns = (top || []).map((r: any) => ({
        topic: r.title as string,
        impression: r.impression_score as number,
        lastRecalled: r.last_recalled_at as string || '',
      }));

      // ⑤ 情绪基准: 从 engine_store 读取
      try {
        const baseline = this.sqlite.queryAll(
          `SELECT value FROM engine_store WHERE key = 'emotion_baseline' LIMIT 1`
        );
        if (baseline && baseline.length > 0) {
          const data = JSON.parse(baseline[0].value as string);
          profile.emotionalBaseline = {
            pleasure: data.pleasure ?? 0,
            arousal: data.arousal ?? 0,
            intimacy: data.intimacy ?? 0,
          };
        }
      } catch { /* 首次无数据正常 */ }

    } catch { /* 单次合成失败不阻塞 */ }

    return profile;
  }

  /**
   * 生成可读的画像摘要（供玉瑶注入对话）
   */
  async generateDigest(): Promise<string> {
    const profile = await this.synthesize();
    const domains = profile.knowledgeDomains.slice(0, 4).map(d => d.domain).join('、');
    const concerns = profile.topConcerns.slice(0, 3).map(c => c.topic.replace(/^(偏好|习惯|信息):\s*/, '')).join('、');

    const lines: string[] = ['【玉瑶对你的了解】'];
    lines.push('我一直在默默留意你的喜好和习惯。');
    if (domains) lines.push(`你常常聊的话题有：${domains}。`);
    if (concerns) lines.push(`你最近在意的：${concerns}。`);
    if (profile.thinkingStyle === '感性') lines.push('你是个感性的人，我会多关注你的感受。');
    else if (profile.thinkingStyle === '理性') lines.push('你习惯理性思考，我会尽量把信息讲清楚。');
    lines.push('（以上是我从平时聊天中记住的，如果不对你可以告诉我）');

    return lines.join('\n');
  }

  /**
   * 推断思维风格
   */
  private _inferThinkingStyle(): '感性' | '理性' | '平衡' {
    try {
      // 从最近 20 条知识的 emotion_vector 统计 factual 维度均值
      const rows = this.sqlite.queryAll(
        `SELECT emotion_vector FROM knowledge_base
         WHERE emotion_vector IS NOT NULL
         ORDER BY updated_at DESC LIMIT 20`
      );
      if (!rows || rows.length < 3) return '平衡';

      let factualSum = 0, count = 0;
      for (const row of rows) {
        try {
          const vec = JSON.parse(row.emotion_vector as string);
          if (Array.isArray(vec) && vec.length > 6) {
            factualSum += Math.abs(vec[6]); // factual 在第 7 位 (索引 6)
            count++;
          }
        } catch { /* 跳过解析失败 */ }
      }
      const avgFactual = count > 0 ? factualSum / count : 0.5;
      if (avgFactual > 0.6) return '理性';
      if (avgFactual < 0.3) return '感性';
      return '平衡';
    } catch { return '平衡'; }
  }
}
