import { describe, expect, it } from 'vitest';
import {
  addBlackDiamond,
  deleteBlackDiamond,
  evaluateDiamondPromotion,
  promoteToBlackDiamond,
} from '../VaultManager.js';

type MemoryRow = {
  id: string;
  raw_input: string;
  calcium_score: number;
  calcium_level: number;
  recall_count: number;
  is_landmark?: number;
  scar_type?: string | null;
  narrative_tag?: string | null;
  perception_json?: string | null;
  lifecycle_state?: string;
  promoted_to_diamond?: number;
  promotion_reason?: string | null;
  last_verified_at?: string | null;
};

type DiamondRow = {
  id: string;
  summary: string;
  emotion_tag: string | null;
  source_id: string | null;
  calcium_level: number;
  recall_count: number;
  tags: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

class MockSQLite {
  memories = new Map<string, MemoryRow>();
  diamonds = new Map<string, DiamondRow>();

  queryAll(sql: string, params?: any[]): any[] {
    if (sql.includes('SELECT COUNT(*) as cnt FROM black_diamond')) {
      return [{ cnt: this.diamonds.size }];
    }
    if (sql.includes('SELECT id, calcium_level FROM black_diamond ORDER BY')) {
      const rows = Array.from(this.diamonds.values())
        .sort((a, b) => a.calcium_level - b.calcium_level || a.created_at.localeCompare(b.created_at));
      return rows.length ? [{ id: rows[0].id, calcium_level: rows[0].calcium_level }] : [];
    }
    if (sql.includes('SELECT * FROM black_diamond WHERE id = ? LIMIT 1')) {
      const row = this.diamonds.get(String(params?.[0]));
      return row ? [row] : [];
    }
    if (sql.includes('SELECT id FROM black_diamond WHERE source_id = ? LIMIT 1')) {
      const sourceId = String(params?.[0]);
      const row = Array.from(this.diamonds.values()).find((entry) => entry.source_id === sourceId);
      return row ? [{ id: row.id }] : [];
    }
    if (sql.includes('SELECT id, raw_input, calcium_score')) {
      const row = this.memories.get(String(params?.[0]));
      return row ? [row] : [];
    }
    return [];
  }

  writeRaw(sql: string, ...params: any[]): void {
    if (sql.includes('UPDATE memories') && sql.includes('WHERE id = (SELECT source_id FROM black_diamond WHERE id = ?)')) {
      const diamond = this.diamonds.get(String(params[0]));
      if (!diamond?.source_id) return;
      const row = this.memories.get(diamond.source_id);
      if (!row) return;
      row.promoted_to_diamond = 0;
      row.lifecycle_state = 'active';
      row.promotion_reason = null;
      return;
    }
    if (sql.includes('UPDATE memories') && sql.includes('SET promoted_to_diamond = 1')) {
      const row = this.memories.get(String(params[2]));
      if (!row) return;
      row.promoted_to_diamond = 1;
      row.lifecycle_state = 'promoted';
      row.promotion_reason = String(params[0]);
      row.last_verified_at = String(params[1]);
      return;
    }
    if (sql.includes('UPDATE memories') && sql.includes('SET promoted_to_diamond = 0')) {
      const row = this.memories.get(String(params[0]));
      if (!row) return;
      row.promoted_to_diamond = 0;
      row.lifecycle_state = 'active';
      row.promotion_reason = null;
      return;
    }
    if (sql.includes('INSERT INTO black_diamond')) {
      this.diamonds.set(String(params[0]), {
        id: String(params[0]),
        summary: String(params[1]),
        emotion_tag: params[2] == null ? null : String(params[2]),
        source_id: params[3] == null ? null : String(params[3]),
        calcium_level: Number(params[4]),
        recall_count: 0,
        tags: String(params[5]),
        notes: String(params[6]),
        created_at: String(params[7]),
        updated_at: String(params[8]),
      });
      return;
    }
    if (sql.includes('DELETE FROM black_diamond WHERE id = ?')) {
      this.diamonds.delete(String(params[0]));
    }
  }
}

describe('VaultManager promotion state machine', () => {
  it('evaluates lifecycle-aware promotion eligibility', () => {
    expect(evaluateDiamondPromotion({
      calcium_score: 4.8,
      lifecycle_state: 'suppressed',
      scar_type: 'rupture',
    })).toEqual({ eligible: false, reason: null, targetState: 'candidate' });

    expect(evaluateDiamondPromotion({
      is_landmark: 1,
      calcium_score: 3.8,
      lifecycle_state: 'active',
    })).toEqual({ eligible: true, reason: 'landmark+high-calcium', targetState: 'promoted' });

    expect(evaluateDiamondPromotion({
      recall_count: 5,
      lifecycle_state: 'candidate',
    })).toEqual({ eligible: true, reason: 'recall>=5', targetState: 'promoted' });
  });

  it('promotes a gold memory and writes back lifecycle metadata', () => {
    const sqlite = new MockSQLite();
    sqlite.memories.set('mem_1', {
      id: 'mem_1',
      raw_input: '这是一次需要被珍藏的重要对话',
      calcium_score: 4.8,
      calcium_level: 4,
      recall_count: 2,
      is_landmark: 0,
      scar_type: null,
      narrative_tag: '重要',
      perception_json: '{"pleasure":0.8}',
      lifecycle_state: 'active',
      promoted_to_diamond: 0,
    });

    const entry = promoteToBlackDiamond(sqlite as any, 'mem_1');

    expect(entry?.source_id).toBe('mem_1');
    expect(sqlite.memories.get('mem_1')?.promoted_to_diamond).toBe(1);
    expect(sqlite.memories.get('mem_1')?.lifecycle_state).toBe('promoted');
    expect(sqlite.memories.get('mem_1')?.promotion_reason).toBe('native-calcium>=4.5');
  });

  it('demotes source memory metadata when a black diamond is deleted', () => {
    const sqlite = new MockSQLite();
    sqlite.memories.set('mem_2', {
      id: 'mem_2',
      raw_input: '一段已经晋升的记忆',
      calcium_score: 4.6,
      calcium_level: 4,
      recall_count: 6,
      lifecycle_state: 'promoted',
      promoted_to_diamond: 1,
      promotion_reason: 'recall>=5',
    });

    const entry = addBlackDiamond(sqlite as any, {
      summary: '一段已经晋升的记忆',
      source_id: 'mem_2',
      calcium_level: 4,
      promotion_reason: 'recall>=5',
    });

    expect(sqlite.memories.get('mem_2')?.lifecycle_state).toBe('promoted');
    expect(deleteBlackDiamond(sqlite as any, entry.id)).toBe(true);
    expect(sqlite.memories.get('mem_2')?.promoted_to_diamond).toBe(0);
    expect(sqlite.memories.get('mem_2')?.lifecycle_state).toBe('active');
    expect(sqlite.memories.get('mem_2')?.promotion_reason).toBeNull();
  });
});
