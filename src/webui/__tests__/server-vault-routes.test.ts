import { describe, expect, it } from 'vitest';
import { handleVaultRoutes } from '../server-vault-routes.js';

function createReq(method: string, path: string) {
  return {
    method,
    url: path,
    headers: { host: 'localhost' },
  } as any;
}

function createRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) this.headers = headers;
    },
    end(payload?: string) {
      this.body = payload || '';
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  } as any;
}

describe('handleVaultRoutes', () => {
  it('serves gold, diamond, and vault log routes', async () => {
    const reqGold = createReq('GET', '/api/vault/gold');
    const resGold = createRes();
    const reqDiamond = createReq('GET', '/api/vault/diamond?search=%E5%BF%AB%E4%B9%90');
    const resDiamond = createRes();
    const reqLog = createReq('GET', '/api/vault/log?limit=5');
    const resLog = createRes();
    const sqlite = {
      queryAll: (sql: string) => {
        if (sql.includes('AVG(effective_strength)')) return [{ total: 3, avgStr: 0.6, highCal: 2 }];
        if (sql.includes('SELECT id, raw_input')) return [{ id: 'mem_1', raw_input: '最近记忆', calcium_level: 2, effective_strength: 0.8, recall_count: 3, created_at: '2026-07-07T00:00:00.000Z', scar_type: null }];
        if (sql.includes('SELECT * FROM black_diamond WHERE emotion_tag = ?')) return [{ id: 'bd_1', summary: '快乐片段', emotion_tag: '快乐', source_id: 'mem_1', calcium_level: 4, recall_count: 0, tags: '[]', notes: '', created_at: '2026-07-07T00:00:00.000Z', updated_at: '2026-07-07T00:00:00.000Z' }];
        if (sql.includes('SELECT * FROM vault_log')) return [{ operation: 'promote', detail: '提炼至黑钻', created_at: '2026-07-07T00:10:00.000Z' }];
        return [];
      },
    };
    const deps = {
      storage: { getSQLite: () => sqlite } as any,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    };

    await handleVaultRoutes({ req: reqGold, res: resGold, url: new URL('http://localhost/api/vault/gold'), ...deps });
    await handleVaultRoutes({ req: reqDiamond, res: resDiamond, url: new URL('http://localhost/api/vault/diamond?search=%E5%BF%AB%E4%B9%90'), ...deps });
    await handleVaultRoutes({ req: reqLog, res: resLog, url: new URL('http://localhost/api/vault/log?limit=5'), ...deps });

    expect(JSON.parse(resGold.body).total).toBe(3);
    expect(JSON.parse(resDiamond.body).items[0].id).toBe('bd_1');
    expect(JSON.parse(resLog.body).log[0].operation).toBe('promote');
  });

  it('runs auto-promote through the vault route', async () => {
    const sqlite = {
      queryAll: (sql: string, params?: any[]) => {
        if (sql.includes('SELECT source_id FROM black_diamond')) return [];
        if (sql.includes('SELECT id, raw_input, calcium_score')) {
          if (params?.[0] === 'mem_1') {
            return [{
              id: 'mem_1',
              raw_input: '需要晋升的高钙记忆',
              calcium_score: 4.9,
              calcium_level: 4,
              recall_count: 5,
              is_landmark: 0,
              scar_type: null,
              narrative_tag: '重要',
              perception_json: null,
              lifecycle_state: 'active',
              promoted_to_diamond: 0,
            }];
          }
        }
        if (sql.includes('FROM memories') && sql.includes('COALESCE(promoted_to_diamond, 0) = 0')) {
          return [{ id: 'mem_1', raw_input: '需要晋升的高钙记忆', calcium_score: 4.9, calcium_level: 4, recall_count: 5, is_landmark: 0, scar_type: null, lifecycle_state: 'active', promoted_to_diamond: 0 }];
        }
        if (sql.includes('SELECT COUNT(*) as cnt FROM black_diamond')) return [{ cnt: 0 }];
        if (sql.includes('SELECT * FROM black_diamond WHERE id = ? LIMIT 1')) return [{ id: 'bd_1', summary: '需要晋升的高钙记忆', emotion_tag: '重要', source_id: 'mem_1', calcium_level: 4, recall_count: 0, tags: '[]', notes: '', created_at: '2026-07-07T00:00:00.000Z', updated_at: '2026-07-07T00:00:00.000Z' }];
        return [];
      },
      writeRaw: () => {},
    };
    const req = createReq('POST', '/api/vault/auto-promote');
    const res = createRes();

    await handleVaultRoutes({
      req,
      res,
      url: new URL('http://localhost/api/vault/auto-promote'),
      storage: { getSQLite: () => sqlite } as any,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('promotes a memory through the vault route', async () => {
    const calls: any[] = [];
    const req = createReq('POST', '/api/vault/memory/promote?memoryId=mem_1&narrativeTag=operator_promoted');
    const res = createRes();
    const handled = await handleVaultRoutes({
      req,
      res,
      url: new URL('http://localhost/api/vault/memory/promote?memoryId=mem_1&narrativeTag=operator_promoted'),
      storage: {
        promoteToLandmark: (memoryId: string, narrativeTag?: string) => {
          calls.push({ memoryId, narrativeTag });
          return true;
        },
      } as any,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    });

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(calls[0]).toEqual({ memoryId: 'mem_1', narrativeTag: 'operator_promoted' });
    expect(JSON.parse(res.body).action).toBe('promote');
  });

  it('suppresses and heals through dedicated routes', async () => {
    const reqSuppress = createReq('POST', '/api/vault/memory/suppress?memoryId=mem_2&scarType=manual_review');
    const resSuppress = createRes();
    const reqHeal = createReq('POST', '/api/vault/memory/heal?memoryId=mem_2&healedBy=operator');
    const resHeal = createRes();
    const calls: any[] = [];
    const storage = {
      markScar: (memoryId: string, scarType: string) => {
        calls.push({ type: 'suppress', memoryId, scarType });
        return true;
      },
      healScar: (memoryId: string, healedBy: string) => {
        calls.push({ type: 'heal', memoryId, healedBy });
        return true;
      },
    } as any;

    await handleVaultRoutes({
      req: reqSuppress,
      res: resSuppress,
      url: new URL('http://localhost/api/vault/memory/suppress?memoryId=mem_2&scarType=manual_review'),
      storage,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    });
    await handleVaultRoutes({
      req: reqHeal,
      res: resHeal,
      url: new URL('http://localhost/api/vault/memory/heal?memoryId=mem_2&healedBy=operator'),
      storage,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    });

    expect(resSuppress.statusCode).toBe(200);
    expect(resHeal.statusCode).toBe(200);
    expect(calls).toEqual([
      { type: 'suppress', memoryId: 'mem_2', scarType: 'manual_review' },
      { type: 'heal', memoryId: 'mem_2', healedBy: 'operator' },
    ]);
  });

  it('archives a memory and persists lifecycle changes', async () => {
    const record: any = { id: 'mem_3', lifecycle_state: 'active', archived_at: null, last_verified_at: null };
    let written: any = null;
    const req = createReq('POST', '/api/vault/memory/archive?memoryId=mem_3');
    const res = createRes();

    const handled = await handleVaultRoutes({
      req,
      res,
      url: new URL('http://localhost/api/vault/memory/archive?memoryId=mem_3'),
      storage: {
        getSQLite: () => ({
          findById: (id: string) => (id === 'mem_3' ? record : null),
          write: (next: any) => { written = { ...next }; },
        }),
      } as any,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    });

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(written.lifecycle_state).toBe('archived');
    expect(typeof written.archived_at).toBe('string');
    expect(JSON.parse(res.body).action).toBe('archive');
  });

  it('returns 400 when memoryId is missing', async () => {
    const req = createReq('POST', '/api/vault/memory/promote');
    const res = createRes();

    const handled = await handleVaultRoutes({
      req,
      res,
      url: new URL('http://localhost/api/vault/memory/promote'),
      storage: {} as any,
      conversationHistory: [],
      maintenance: { getHealth: () => ({ lastMaintenance: { compaction: null } }) } as any,
    });

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('memoryId is required');
  });
});
