/**
 * YuyaoMemoryService — 玉瑶记事记忆系统
 *
 * R3: 全部 SQL 从模板字串改为参数化查询（? 占位符），移除 esc()/escN() 辅助函数。
 *     参数化后不再有 SQL 注入风险，且代码更简洁——不再需要手动转义每一个值。
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';

export interface NoteMemory {
  id: string; memory_type: 'note'; sub_type: 'object_location' | 'fact' | 'reminder' | 'person_tag';
  note_key: string; raw_input: string; is_valid: number;
  remind_at: string | null; reminded: number; repeat_rule: string | null;
  dialog_group_id: string | null; dna_root_id: string | null; created_at: string;
}

function noteId(): string {
  return `note_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

export class YuyaoMemoryService {
  private sqlite: SQLiteAdapter;
  constructor(sqlite: SQLiteAdapter) { this.sqlite = sqlite; }

  storeObjectLocation(key: string, location: string, dgId?: string, dnaId?: string): void {
    this.sqlite.writeRaw("UPDATE memories SET is_valid=0 WHERE note_key=? AND sub_type='object_location' AND is_valid=1", key);
    const id = noteId();
    const now = new Date().toISOString();
    this.sqlite.writeRaw(
      `INSERT INTO memories(id,memory_type,sub_type,note_key,raw_input,is_valid,dialog_group_id,dna_root_id,created_at,seq_pos,perception_json,calcium_score,calcium_level,locus_path,leaf_zone,strength_updated_at)
       VALUES(?,'note','object_location',?,?,1,?,?,?,?,'{}',0,0,'note.memory','note_zone',?)`,
      id, key, location, dgId ?? null, dnaId ?? null, now, Date.now(), now,
    );
  }

  getObjectLocation(key: string): NoteMemory | null {
    const rows = this.sqlite.queryAll<NoteMemory>(
      "SELECT id,memory_type,sub_type,note_key,raw_input,is_valid,remind_at,reminded,repeat_rule,dialog_group_id,dna_root_id,created_at FROM memories WHERE note_key=? AND sub_type='object_location' AND is_valid=1 ORDER BY created_at DESC LIMIT 1",
      [key],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  storeFact(key: string, fact: string, dgId?: string, dnaId?: string): void {
    this.sqlite.writeRaw("UPDATE memories SET is_valid=0 WHERE note_key=? AND sub_type='fact' AND is_valid=1", key);
    const id = noteId();
    const now = new Date().toISOString();
    this.sqlite.writeRaw(
      `INSERT INTO memories(id,memory_type,sub_type,note_key,raw_input,is_valid,dialog_group_id,dna_root_id,created_at,seq_pos,perception_json,calcium_score,calcium_level,locus_path,leaf_zone,strength_updated_at)
       VALUES(?,'note','fact',?,?,1,?,?,?,?,'{}',0,0,'note.memory','note_zone',?)`,
      id, key, fact, dgId ?? null, dnaId ?? null, now, Date.now(), now,
    );
  }

  getFact(key: string): NoteMemory | null {
    const rows = this.sqlite.queryAll<NoteMemory>(
      "SELECT id,memory_type,sub_type,note_key,raw_input,is_valid,remind_at,reminded,repeat_rule,dialog_group_id,dna_root_id,created_at FROM memories WHERE note_key=? AND sub_type='fact' AND is_valid=1 ORDER BY created_at DESC LIMIT 1",
      [key],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  setReminder(text: string, remindAt: string, repeatRule?: string, dgId?: string, dnaId?: string): NoteMemory {
    const id = noteId();
    const now = new Date().toISOString();
    this.sqlite.writeRaw(
      `INSERT INTO memories(id,memory_type,sub_type,note_key,raw_input,is_valid,remind_at,reminded,repeat_rule,dialog_group_id,dna_root_id,created_at,seq_pos,perception_json,calcium_score,calcium_level,locus_path,leaf_zone,strength_updated_at)
       VALUES(?,'note','reminder',?,?,1,?,0,?,?,?,?,?,'{}',0,0,'note.memory','note_zone',?)`,
      id, text, text, remindAt, repeatRule ?? null, dgId ?? null, dnaId ?? null, now, Date.now(), now,
    );
    return { id, memory_type: 'note', sub_type: 'reminder', note_key: text, raw_input: text,
      is_valid: 1, remind_at: remindAt, reminded: 0, repeat_rule: repeatRule ?? null,
      dialog_group_id: dgId ?? null, dna_root_id: dnaId ?? null, created_at: now };
  }

  getPendingReminders(): NoteMemory[] {
    return this.sqlite.queryAll<NoteMemory>(
      "SELECT id,memory_type,sub_type,note_key,raw_input,is_valid,remind_at,reminded,repeat_rule,dialog_group_id,dna_root_id,created_at FROM memories WHERE memory_type='note' AND sub_type='reminder' AND reminded=0 AND is_valid=1 AND remind_at IS NOT NULL AND remind_at<=? ORDER BY remind_at ASC",
      [new Date().toISOString()],
    );
  }

  markReminded(id: string): void { this.sqlite.writeRaw("UPDATE memories SET reminded=1 WHERE id=?", id); }
  markInvalid(id: string): void { this.sqlite.writeRaw("UPDATE memories SET is_valid=0 WHERE id=?", id); }

  search(query: string, limit = 3): NoteMemory[] {
    if (!query.trim()) return [];
    const q = query.trim();
    const rows = this.sqlite.queryAll<NoteMemory>(
      "SELECT id,memory_type,sub_type,note_key,raw_input,is_valid,remind_at,reminded,repeat_rule,dialog_group_id,dna_root_id,created_at FROM memories WHERE memory_type='note' AND is_valid=1 AND (note_key LIKE '%' || ? || '%' OR raw_input LIKE '%' || ? || '%') ORDER BY created_at DESC LIMIT ?",
      [q, q, limit],
    );
    return rows;
  }

  checkMissedOnStartup(): string[] {
    const logs: string[] = [];
    const now = Date.now();
    const pending = this.sqlite.queryAll<any>("SELECT id, raw_input, remind_at FROM memories WHERE memory_type='note' AND sub_type='reminder' AND reminded=0 AND is_valid=1 AND remind_at IS NOT NULL");
    for (const r of pending) {
      const delay = now - new Date(r.remind_at).getTime();
      if (delay < 0) continue;
      if (delay < 5 * 60 * 1000) logs.push(`⏰ 补发提醒: ${r.raw_input} (延误 ${Math.round(delay / 1000)}s)`);
      else if (delay < 30 * 24 * 60 * 60 * 1000) { this.sqlite.writeRaw("UPDATE memories SET reminded=1 WHERE id=?", r.id); logs.push(`⏰ 跳过过期提醒: ${r.raw_input}`); }
      else { this.sqlite.writeRaw("UPDATE memories SET is_valid=0 WHERE id=?", r.id); logs.push(`🗑 清理超期提醒: ${r.raw_input}`); }
    }
    return logs;
  }

  cleanExpired(days = 365): number {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    this.sqlite.writeRaw("DELETE FROM memories WHERE memory_type='note' AND is_valid=0 AND created_at<?", cutoff);
    return this.sqlite.queryAll<any>("SELECT changes() as c")[0]?.c || 0;
  }
}
