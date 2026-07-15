/**
 * KnowledgeGrowthLogger — 六阶生长链日志记录器
 * ===============================================
 * 记录知识库的六阶生长事件到 knowledge_growth_log 表。
 *
 * 生长阶段:
 *   sprout        萌芽    海胆碎片→知识原始碎片
 *   branch        分枝    警幻提炼专题
 *   lignify       木质化  M7梦境整合
 *   ring          年轮    M8永久铭刻
 *   prune         修剪    自然衰减/矛盾标记/碎片合并
 *   feedback_human 用户反哺 手动编辑/关联
 *   feedback_distill AI蒸馏反哺 反哺自我模型
 */
import type { FusionStorageAdapter } from '../../m2/FusionStorageAdapter.js';
import type { GrowthLogEntry } from './types.js';

const GROWTH_LOG_DDL = `
CREATE TABLE IF NOT EXISTS knowledge_growth_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    kn_id TEXT NOT NULL,
    from_memory_ids TEXT,
    detail TEXT,
    delta_calcium REAL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_growth_log_type ON knowledge_growth_log(event_type);
CREATE INDEX IF NOT EXISTS idx_growth_log_kn ON knowledge_growth_log(kn_id);
`;

export class KnowledgeGrowthLogger {
  private storage: FusionStorageAdapter;
  private _initialized = false;

  constructor(storage: FusionStorageAdapter) {
    this.storage = storage;
  }

  private ensureTable(): void {
    if (this._initialized) return;
    try {
      const sqlite = this.storage.getSQLite();
      sqlite.writeRaw(GROWTH_LOG_DDL);
      this._initialized = true;
    } catch { /* 表已存在 */ }
  }

  /**
   * 记录一条生长日志
   */
  async log(entry: GrowthLogEntry & { knId: string }): Promise<string> {
    this.ensureTable();
    try {
      const sqlite = this.storage.getSQLite();
      const id = `gl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();

      sqlite.writeRaw(
        `INSERT INTO knowledge_growth_log (id, event_type, kn_id, from_memory_ids, detail, delta_calcium, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.eventType,
          entry.knId,
          entry.sourceMemoryIds ? JSON.stringify(entry.sourceMemoryIds) : null,
          entry.detail,
          entry.deltaCalcium || 0,
          now,
        ],
      );
      return id;
    } catch { return ''; }
  }

  /**
   * 查询生长日志
   */
  async query(params: {
    eventType?: string;
    knId?: string;
    limit?: number;
    offset?: number;
    since?: string;
  } = {}): Promise<Array<{
    id: string;
    event_type: string;
    kn_id: string;
    from_memory_ids: string[];
    detail: string;
    delta_calcium: number;
    created_at: string;
  }>> {
    this.ensureTable();
    try {
      const sqlite = this.storage.getSQLite();
      const conditions: string[] = [];
      const bind: any[] = [];

      if (params.eventType) { conditions.push('event_type = ?'); bind.push(params.eventType); }
      if (params.knId) { conditions.push('kn_id = ?'); bind.push(params.knId); }
      if (params.since) { conditions.push('created_at >= ?'); bind.push(params.since); }

      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const sql = `SELECT * FROM knowledge_growth_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      bind.push(params.limit || 50, params.offset || 0);

      const rows = sqlite.queryAll(sql, bind);
      return rows.map((r: any) => ({
        id: r.id as string,
        event_type: r.event_type as string,
        kn_id: r.kn_id as string,
        from_memory_ids: r.from_memory_ids ? JSON.parse(r.from_memory_ids as string) : [],
        detail: r.detail as string,
        delta_calcium: r.delta_calcium as number,
        created_at: r.created_at as string,
      }));
    } catch { return []; }
  }

  /**
   * 获取生长体征指标
   */
  async getHealthMetrics(): Promise<{
    totalEntries: number;
    growthRate: number;
    branchDiversity: string;
    decayRate: number;
    distillYield: number;
  }> {
    this.ensureTable();
    try {
      const sqlite = this.storage.getSQLite();

      // 总条目
      const total = (sqlite.queryAll('SELECT COUNT(*) as cnt FROM knowledge_base')[0]?.cnt as number) || 0;

      // 7天新生占比
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const newThisWeek = (sqlite.queryAll(
        'SELECT COUNT(*) as cnt FROM knowledge_base WHERE created_at >= ?', [weekAgo],
      )[0]?.cnt as number) || 0;
      const growthRate = total > 0 ? newThisWeek / total : 0;

      // 分类分布
      const classDist = sqlite.queryAll(
        'SELECT classification, COUNT(*) as cnt FROM knowledge_base WHERE classification IS NOT NULL GROUP BY classification ORDER BY cnt DESC',
      );
      const maxClass = classDist.length > 0 ? (classDist[0].cnt as number) : 0;
      const diversity = total > 0 && maxClass / total > 0.8 ? '过度集中' : '均衡';

      // 衰减率 (impression_score < 0.3)
      const decayed = (sqlite.queryAll(
        "SELECT COUNT(*) as cnt FROM knowledge_base WHERE COALESCE(impression_score, 0.5) < 0.3",
      )[0]?.cnt as number) || 0;
      const decayRate = total > 0 ? decayed / total : 0;

      // 蒸馏产量
      const distillCount = (sqlite.queryAll(
        "SELECT COUNT(*) as cnt FROM knowledge_base WHERE classification = '梦境洞察'",
      )[0]?.cnt as number) || 0;

      return { totalEntries: total, growthRate, branchDiversity: diversity, decayRate, distillYield: distillCount };
    } catch {
      return { totalEntries: 0, growthRate: 0, branchDiversity: '未知', decayRate: 0, distillYield: 0 };
    }
  }
}
