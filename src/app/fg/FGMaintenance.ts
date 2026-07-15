/**
 * FGMaintenance.ts — 自生长维护引擎
 * ======================================
 * 三项维护任务：
 *   ① 时序衰减与休眠 — 长期未提及的人物降权/归档
 *   ② 传递性推理 — A→B→C 时建议补充 B→C
 *   ③ 跨路径冲突检测 — 同一人物通过不同路径产生矛盾关系
 *
 * 接入 DailyMaintenanceScheduler 每日运行。
 *
 * 使用:
 *   const maint = new FGMaintenance(sqlite);
 *   await maint.runDaily();
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { PERSON_STATUS, CONFIDENCE } from './RelationshipTypes.js';

export interface MaintenanceReport {
  dormantMarked: number;
  archivedMarked: number;
  inferences: number;
  conflictsFound: number;
}

export class FGMaintenance {
  private sqlite: SQLiteAdapter;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  /**
   * 执行每日维护
   */
  async runDaily(): Promise<MaintenanceReport> {
    const report: MaintenanceReport = { dormantMarked: 0, archivedMarked: 0, inferences: 0, conflictsFound: 0 };

    try {
      report.dormantMarked = await this._markDormant();
      report.archivedMarked = await this._markArchived();
      report.inferences = await this._transitiveInference();
      report.conflictsFound = await this._detectConflicts();

      console.log('[FGMaintenance] 完成:', JSON.stringify(report));
    } catch (err) {
      console.warn('[FGMaintenance] 失败:', err);
    }

    return report;
  }

  /**
   * ① 90 天未提及 → dormant
   */
  private async _markDormant(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
      this.sqlite.writeRaw(
        "UPDATE hwg_persons SET status = 'dormant' WHERE status = 'active' AND last_seen < ?",
        [cutoff]
      );
      // sql.js doesn't return affected rows count directly
      return 1;
    } catch { return 0; }
  }

  /**
   * ② 180 天未提及 → archived
   */
  private async _markArchived(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
      this.sqlite.writeRaw(
        "UPDATE hwg_persons SET status = 'archived' WHERE status = 'dormant' AND last_seen < ?",
        [cutoff]
      );
      return 1;
    } catch { return 0; }
  }

  /**
   * ③ 传递性推理：A↔B, B↔C → 建议补充关联 B↔C
   * 只创建低置信度 (0.3) 的推理边，不直接作为事实
   */
  private async _transitiveInference(): Promise<number> {
    try {
      // 找三角关系：A认识B，B认识C，但A不认识C
      const rows = this.sqlite.queryAll(
        `SELECT DISTINCT r1.person_a as a, r1.person_b as b, r2.person_b as c
         FROM hwg_relations r1
         JOIN hwg_relations r2 ON r1.person_b = r2.person_a
         WHERE r1.person_a != r2.person_b
           AND r1.confidence >= 0.5 AND r2.confidence >= 0.5
           AND NOT EXISTS (
             SELECT 1 FROM hwg_relations r3
             WHERE ((r3.person_a = r1.person_a AND r3.person_b = r2.person_b)
                OR (r3.person_a = r2.person_b AND r3.person_b = r1.person_a))
           )
         LIMIT 20`
      );

      let count = 0;
      const now = new Date().toISOString();
      for (const row of rows) {
        const r = row as any;
        const a = r.a as string;
        const b = r.b as string;
        const c = r.c as string;

        // 跳过"我"节点参与的关系（用户的关系链应由对话自然建立）
        if (a === '我' || b === '我' || c === '我') continue;

        const id = `hwi_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        const idA = a < c ? a : c;
        const idB = a < c ? c : a;
        this.sqlite.writeRaw(
          'INSERT OR IGNORE INTO hwg_relations (id, person_a, person_b, relation, category, confidence, source, time_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, idA, idB, 'acquaintance_of', 'social', CONFIDENCE.FROM_INFERENCE, 'inference', now, now, now]
        );
        count++;
      }
      return count;
    } catch { return 0; }
  }

  /**
   * ④ 冲突检测：同一对人通过不同路径建立矛盾关系
   */
  private async _detectConflicts(): Promise<number> {
    try {
      // 找矛盾关系对：A--mother_of-->B 且 A--father_of-->B
      const conflictMap: Record<string, string[][]> = {};
      const rows = this.sqlite.queryAll(
        'SELECT person_a, person_b, relation FROM hwg_relations ORDER BY person_a, person_b'
      );

      for (const row of rows) {
        const r = row as any;
        const key = `${r.person_a}__${r.person_b}`;
        if (!conflictMap[key]) conflictMap[key] = [];
        conflictMap[key].push([r.relation as string, r.person_a as string, r.person_b as string]);
      }

      // 简单的冲突检测：parent vs child, mother vs father 同时存在
      let conflicts = 0;
      for (const [key, rels] of Object.entries(conflictMap)) {
        const types = rels.map(r => r[0]);
        if (types.includes('mother_of') && types.includes('father_of')) {
          console.log(`[FGMaintenance] 冲突: ${key} 同时有 mother_of 和 father_of`);
          conflicts++;
        }
        if (types.includes('parent_of') && types.includes('child_of')) {
          console.log(`[FGMaintenance] 冲突: ${key} 同时有 parent_of 和 child_of`);
          conflicts++;
        }
      }

      return conflicts;
    } catch { return 0; }
  }
}
