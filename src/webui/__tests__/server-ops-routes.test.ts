import { describe, expect, it } from 'vitest';
import { handleOpsRoutes } from '../server-ops-routes.js';

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
  } as any;
}

describe('handleOpsRoutes', () => {
  it('returns knowledge health with backup metadata', async () => {
    const req = createReq('GET', '/api/knowledge/health');
    const res = createRes();

    const handled = await handleOpsRoutes({
      req,
      res,
      url: new URL('http://localhost/api/knowledge/health'),
      storage: { getSQLite: () => ({}) } as any,
      knowledgeBase: { engine: { vectorStore: { ready: true } } },
      backupStats: { lastBackupTime: '2026-07-07T00:00:00.000Z', successCount: 2, totalAttempts: 4 },
      projectRoot: '/tmp/non-existent-project-root',
      conversationHistory: [],
      m7: null,
      createKnowledgeMonitor: () => ({
        selfCheck: () => ({ status: 'ok', coverage: 0.8 }),
      }),
    });

    const payload = JSON.parse(res.body);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.backup.backupSuccessRate).toBe('50.0%');
  });

  it('returns aqc report, aqc run, aqc records, and dream analyze', async () => {
    const storage = {
      getSQLite: () => ({
        queryAll: (sql: string) => sql.includes('aqc_records') ? [{ id: 'aqc_1' }] : [],
      }),
    } as any;

    const reqReport = createReq('GET', '/api/aqc/report');
    const resReport = createRes();
    const reqRun = createReq('POST', '/api/aqc/run');
    const resRun = createRes();
    const reqRecords = createReq('GET', '/api/aqc/records');
    const resRecords = createRes();
    const reqDream = createReq('POST', '/api/dream/analyze');
    const resDream = createRes();

    const m7 = {
      processDreamAnalysis: async () => undefined,
    };

    await handleOpsRoutes({
      req: reqReport,
      res: resReport,
      url: new URL('http://localhost/api/aqc/report'),
      storage,
      knowledgeBase: {},
      backupStats: { lastBackupTime: null, successCount: 0, totalAttempts: 0 },
      projectRoot: '/tmp/noop',
      conversationHistory: [{ role: 'user', content: 'hello' }],
      m7,
      getAQCReportFn: () => ({ total: 3 }),
    });
    await handleOpsRoutes({
      req: reqRun,
      res: resRun,
      url: new URL('http://localhost/api/aqc/run'),
      storage,
      knowledgeBase: {},
      backupStats: { lastBackupTime: null, successCount: 0, totalAttempts: 0 },
      projectRoot: '/tmp/noop',
      conversationHistory: [{ role: 'user', content: 'hello' }],
      m7,
      runSandQCFn: () => ({ scanned: 4, approved: 2 }),
      runGoldQCFn: () => ({ scanned: 5, approved: 3 }),
    });
    await handleOpsRoutes({
      req: reqRecords,
      res: resRecords,
      url: new URL('http://localhost/api/aqc/records'),
      storage,
      knowledgeBase: {},
      backupStats: { lastBackupTime: null, successCount: 0, totalAttempts: 0 },
      projectRoot: '/tmp/noop',
      conversationHistory: [],
      m7,
    });
    await handleOpsRoutes({
      req: reqDream,
      res: resDream,
      url: new URL('http://localhost/api/dream/analyze'),
      storage,
      knowledgeBase: {},
      backupStats: { lastBackupTime: null, successCount: 0, totalAttempts: 0 },
      projectRoot: '/tmp/noop',
      conversationHistory: [],
      m7,
    });

    expect(JSON.parse(resReport.body).total).toBe(3);
    expect(JSON.parse(resRun.body).sand.scanned).toBe(4);
    expect(JSON.parse(resRecords.body).records[0].id).toBe('aqc_1');
    expect(JSON.parse(resDream.body).status).toBe('ok');
  });

  it('returns dream skip when m7 is unavailable', async () => {
    const req = createReq('POST', '/api/dream/analyze');
    const res = createRes();

    await handleOpsRoutes({
      req,
      res,
      url: new URL('http://localhost/api/dream/analyze'),
      storage: { getSQLite: () => ({}) } as any,
      knowledgeBase: {},
      backupStats: { lastBackupTime: null, successCount: 0, totalAttempts: 0 },
      projectRoot: '/tmp/noop',
      conversationHistory: [],
      m7: null,
    });

    expect(JSON.parse(res.body).status).toBe('skip');
  });
});
