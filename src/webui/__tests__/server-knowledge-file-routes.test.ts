import { describe, expect, it } from 'vitest';
import { handleKnowledgeFileRoutes } from '../server-knowledge-file-routes.js';

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

describe('handleKnowledgeFileRoutes', () => {
  it('uploads a knowledge file through injected multipart parser', async () => {
    const req = createReq('POST', '/api/knowledge/upload');
    const res = createRes();

    await handleKnowledgeFileRoutes({
      req,
      res,
      url: new URL('http://localhost/api/knowledge/upload'),
      knowledgeBase: {
        upload: async (_buffer: Buffer, fileName: string, mimeType: string) => ({
          id: 'kn_upload',
          title: fileName,
          source_type: mimeType,
        }),
      },
      readBody: async () => '',
      dataDir: '/tmp/knowledge-data',
      parseMultipartUpload: async () => ({
        buffer: Buffer.from('hello'),
        fileName: 'note.txt',
        mimeType: 'text/plain',
      }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).id).toBe('kn_upload');
  });

  it('queries and edits excel knowledge through injected file ops', async () => {
    const entry = { id: 'kn_excel', title: 'sheet_demo', source_type: 'xlsx', source_name: 'sheet_demo.xlsx' };
    const fileOps = {
      existsSync: () => true,
      readdirSync: () => ['sheet_demo.xlsx'],
      readFileSync: () => Buffer.from('excel'),
      writeFileSync: () => undefined,
    };

    const reqQuery = createReq('POST', '/api/knowledge/excel-query');
    const resQuery = createRes();
    const reqEdit = createReq('POST', '/api/knowledge/excel-query');
    const resEdit = createRes();
    const updates: any[] = [];

    await handleKnowledgeFileRoutes({
      req: reqQuery,
      res: resQuery,
      url: new URL('http://localhost/api/knowledge/excel-query'),
      knowledgeBase: {
        getById: () => entry,
        update: async () => true,
      },
      readBody: async () => JSON.stringify({ knId: 'kn_excel', sheet: 0 }),
      dataDir: '/tmp/knowledge-data',
      fileOps: fileOps as any,
      excelToJsonFn: () => ({ sheets: [{ name: 'Sheet1', data: [['A1']] }] }),
      jsonToExcelFn: () => Buffer.from('new-excel'),
      parseFileFn: async () => ({ content: 'normalized text' } as any),
    });

    await handleKnowledgeFileRoutes({
      req: reqEdit,
      res: resEdit,
      url: new URL('http://localhost/api/knowledge/excel-query'),
      knowledgeBase: {
        getById: () => entry,
        update: async (id: string, payload: any) => {
          updates.push({ id, payload });
          return true;
        },
      },
      readBody: async () => JSON.stringify({ knId: 'kn_excel', sheet: 0, row: 0, col: 0, value: 'B2' }),
      dataDir: '/tmp/knowledge-data',
      fileOps: fileOps as any,
      excelToJsonFn: () => ({ sheets: [{ name: 'Sheet1', data: [['A1']] }] }),
      jsonToExcelFn: () => Buffer.from('new-excel'),
      parseFileFn: async () => ({ content: 'normalized text' } as any),
    });

    expect(JSON.parse(resQuery.body).sheet.name).toBe('Sheet1');
    expect(JSON.parse(resEdit.body).ok).toBe(true);
    expect(updates[0].id).toBe('kn_excel');
    expect(updates[0].payload.content).toBe('normalized text');
  });

  it('rejects missing excel source file', async () => {
    const req = createReq('POST', '/api/knowledge/excel-query');
    const res = createRes();

    await handleKnowledgeFileRoutes({
      req,
      res,
      url: new URL('http://localhost/api/knowledge/excel-query'),
      knowledgeBase: {
        getById: () => ({ id: 'kn_excel', title: 'sheet_demo', source_type: 'xlsx' }),
      },
      readBody: async () => JSON.stringify({ knId: 'kn_excel', sheet: 0 }),
      dataDir: '/tmp/knowledge-data',
      fileOps: {
        existsSync: () => false,
        readdirSync: () => [],
        readFileSync: () => Buffer.from(''),
        writeFileSync: () => undefined,
      } as any,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('原始Excel文件未找到');
  });
});
