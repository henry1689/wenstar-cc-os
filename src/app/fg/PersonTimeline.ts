/**
 * PersonTimeline.ts — 人物时间线与事件管理
 * ==========================================
 * 管理人物的全生命周期：出生、成长、衰老、人生事件。
 * 事件驱动画像迭代——退休、结婚、创业等自动更新人物阶段。
 *
 * 使用:
 *   const tl = new PersonTimeline(sqlite);
 *   await tl.addEvent(personId, { type: 'career_change', title: '退休' });
 *   const events = tl.getTimeline('张忠谋');
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';
import { EVENT_TYPE, LIFE_STAGE } from './RelationshipTypes.js';

export interface LifeEvent {
  id: string;
  personId: string;
  type: EVENT_TYPE;
  title: string;
  description?: string;
  timestamp?: string;
  relatedPersons: string[];
  source: string;
  createdAt: string;
}

export class PersonTimeline {
  private sqlite: SQLiteAdapter;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  /**
   * 添加人生事件
   * 特定事件会自动更新人物生命阶段
   */
  async addEvent(params: {
    personName: string;
    type: EVENT_TYPE;
    title: string;
    description?: string;
    timestamp?: string;
    relatedPersons?: string[];
    source?: string;
  }): Promise<void> {
    try {
      const person = this.sqlite.queryAll('SELECT id FROM hwg_persons WHERE name = ?', [params.personName]);
      if (!person.length) return;
      const personId = (person[0] as any).id as string;

      const now = new Date().toISOString();
      const id = `hwe_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

      this.sqlite.writeRaw(
        'INSERT INTO hwg_events (id, person_id, event_type, title, description, timestamp, related_persons, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, personId, params.type, params.title, params.description || '', params.timestamp || now,
         JSON.stringify(params.relatedPersons || []), params.source || 'conversation', now]
      );

      // 特定事件自动更新生命阶段
      await this._autoUpdateStage(personId, params.type, params.title);

    } catch { /* 不阻塞 */ }
  }

  /**
   * 获取人物时间线
   */
  getTimeline(personName: string): Array<{ type: string; title: string; time?: string }> {
    try {
      const person = this.sqlite.queryAll('SELECT id FROM hwg_persons WHERE name = ?', [personName]);
      if (!person.length) return [];

      const rows = this.sqlite.queryAll(
        'SELECT event_type, title, timestamp FROM hwg_events WHERE person_id = ? ORDER BY timestamp ASC',
        [(person[0] as any).id as string]
      );
      return rows.map((r: any) => ({
        type: r.event_type as string,
        title: r.title as string,
        time: r.timestamp as string || undefined,
      }));
    } catch { return []; }
  }

  /**
   * 获取所有事件
   */
  getAllEvents(limit = 50): Array<{ personName: string; type: string; title: string; time?: string }> {
    try {
      const rows = this.sqlite.queryAll(
        `SELECT p.name, e.event_type, e.title, e.timestamp
         FROM hwg_events e JOIN hwg_persons p ON e.person_id = p.id
         ORDER BY e.timestamp DESC LIMIT ?`,
        [limit]
      );
      return rows.map((r: any) => ({
        personName: r.name as string,
        type: r.event_type as string,
        title: r.title as string,
        time: r.timestamp as string || undefined,
      }));
    } catch { return []; }
  }

  /**
   * 事件驱动生命阶段自动更新
   */
  private async _autoUpdateStage(personId: string, eventType: EVENT_TYPE, title: string): Promise<void> {
    try {
      let stage: LIFE_STAGE | null = null;

      if (eventType === EVENT_TYPE.BIRTH || /出生|诞|新生儿/.test(title)) {
        stage = LIFE_STAGE.INFANT;
      } else if (/退休/.test(title)) {
        stage = LIFE_STAGE.ELDERLY;
      } else if (eventType === EVENT_TYPE.PASSING || /去世|逝世|过世|走了/.test(title)) {
        stage = LIFE_STAGE.DECEASED;
      } else if (eventType === EVENT_TYPE.CAREER_CHANGE && /工作|入职|创业|毕业/.test(title)) {
        stage = LIFE_STAGE.ADULT;
      }

      if (stage) {
        this.sqlite.writeRaw('UPDATE hwg_persons SET stage = ? WHERE id = ?', [stage, personId]);
      }
    } catch { /* */ }
  }
}
