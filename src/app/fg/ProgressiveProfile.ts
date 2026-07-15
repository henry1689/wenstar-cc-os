/**
 * ProgressiveProfile.ts — 渐进画像引擎
 * =======================================
 * 追踪人物认知从模糊到清晰的完整演进历程。
 * 每次更新不是覆盖，是追加——留存完整的认知轨迹。
 * 置信度 < 0.6 的信息不直接作为事实输出。
 *
 * 使用:
 *   const pp = new ProgressiveProfile(sqlite);
 *   await pp.addSnapshot(personId, '张忠谋', '他是台积电创始人');
 *   const history = pp.getSnapshots(personId);
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { CONFIDENCE } from './RelationshipTypes.js';

export interface ProfileSnapshot {
  id: string;
  personId: string;
  identity: string;         // 当时的认知（"小张爸爸"→"张忠谋"）
  confidence: number;
  attributes: Record<string, any>;
  source: string;
  createdAt: string;
}

export class ProgressiveProfile {
  private sqlite: SQLiteAdapter;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  /**
   * 新增一条认知快照
   * 置信度渐进提升：同一个人物每次提及 +0.05，上限 +0.3
   */
  async addSnapshot(personId: string, identity: string, sourceText: string): Promise<ProfileSnapshot> {
    try {
      const existing = this.sqlite.queryAll(
        'SELECT id, snapshot, confidence FROM hwg_profile_snapshots WHERE person_id = ? ORDER BY created_at DESC LIMIT 1',
        [personId]
      );

      const now = new Date().toISOString();
      let confidence = CONFIDENCE.BASE_FROM_CONVERSATION;
      let prevAttr: Record<string, any> = {};

      if (existing.length > 0) {
        const last = existing[0] as any;
        confidence = Math.min(
          (last.confidence as number) + CONFIDENCE.MENTION_BOOST,
          CONFIDENCE.BASE_FROM_CONVERSATION + CONFIDENCE.MAX_MENTION_BOOST
        );
        try { prevAttr = JSON.parse(last.snapshot as string); } catch { prevAttr = {}; }
      }

      // 从文本提取属性
      const attrs = this._extractAttributes(sourceText);
      const merged = { ...prevAttr, ...attrs };

      const id = `hws_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      this.sqlite.writeRaw(
        'INSERT INTO hwg_profile_snapshots (id, person_id, snapshot, confidence, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, personId, JSON.stringify(merged), confidence, now]
      );

      // 更新人物表的认知字段
      this.sqlite.writeRaw(
        'UPDATE hwg_persons SET extra_data = ? WHERE id = ?',
        [JSON.stringify({ knownAs: identity, confidence, lastSnapshot: now }), personId]
      );

      return { id, personId, identity, confidence, attributes: merged, source: sourceText.substring(0, 100), createdAt: now };
    } catch {
      return { id: '', personId, identity, confidence: 0, attributes: {}, source: '', createdAt: '' };
    }
  }

  /**
   * 获取某人的认知演进轨迹
   */
  getSnapshots(personId: string): Array<{ snapshot: string; confidence: number; time: string }> {
    try {
      const rows = this.sqlite.queryAll(
        'SELECT snapshot, confidence, created_at FROM hwg_profile_snapshots WHERE person_id = ? ORDER BY created_at ASC',
        [personId]
      );
      return rows.map((r: any) => ({
        snapshot: JSON.stringify(r.snapshot as string),
        confidence: r.confidence as number,
        time: r.created_at as string,
      }));
    } catch { return []; }
  }

  /**
   * 获取最新认知摘要
   */
  getLatestIdentity(personId: string): string {
    try {
      const rows = this.sqlite.queryAll(
        'SELECT extra_data FROM hwg_persons WHERE id = ?', [personId]
      );
      if (rows.length > 0) {
        const d = JSON.parse((rows[0] as any).extra_data as string || '{}');
        return (d as any).knownAs || '';
      }
    } catch { /* */ }
    return '';
  }

  /**
   * 从文本提取属性（规则提取，无 LLM）
   */
  private _extractAttributes(text: string): Record<string, any> {
    const attrs: Record<string, any> = {};
    const t = text.toLowerCase();

    // 职业/身份
    const occupationPatterns = [
      { regex: /(?:是|当|做)(.*?(?:师|员|工|者|人|总|经理|主任|院长|校长|局长|社长|创始人|董事长|CEO|CTO|COO))/, key: 'occupation' },
      { regex: /(?:在|就职于|任职|工作于)([^，。！？\s]{2,10})(?:工作|上班|任职)/, key: 'workplace' },
    ];
    for (const p of occupationPatterns) {
      const m = t.match(p.regex);
      if (m) attrs[p.key] = m[1].trim();
    }

    // 年龄
    const ageMatch = t.match(/(\d+)(?:岁|周岁|岁数)/);
    if (ageMatch) attrs.age = parseInt(ageMatch[1], 10);

    // 地点
    const placeMatch = t.match(/(?:住在|来自|在|位于)([^，。！？\s]{2,6})(?:生活|居住|长大|出生)/);
    if (placeMatch) attrs.place = placeMatch[1].trim();

    // 已故
    if (/去世|逝世|过世|走了|不在/.test(t)) attrs.deceased = true;

    // 关系
    const relMatch = t.match(/(?:我的|他|她)(妈妈|爸爸|老公|老婆|儿子|女儿|朋友|同事|同学|老师)/);
    if (relMatch) attrs.relationHint = relMatch[1];

    return attrs;
  }
}
