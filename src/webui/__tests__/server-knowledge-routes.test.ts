import { describe, expect, it } from 'vitest';
import { handleKnowledgeRoutes } from '../server-knowledge-routes.js';

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

describe('handleKnowledgeRoutes', () => {
  it('serves vector search and list/search routes', async () => {
    const reqVector = createReq('GET', '/api/knowledge/vector-search?q=test');
    const resVector = createRes();
    const reqList = createReq('GET', '/api/knowledge?search=memory&limit=10');
    const resList = createRes();

    const knowledgeBase = {
      engine: {
        embedProvider: {
          isAvailable: () => true,
          embed: async () => [0.1, 0.2, 0.3],
        },
        vectorSearchDebug: () => [{ id: 'kn_1', score: 0.9 }],
      },
      search: async () => [{ id: 'kn_1', title: 'Memory note' }],
      searchByInteraction: () => [],
      list: () => [],
    };

    await handleKnowledgeRoutes({
      req: reqVector,
      res: resVector,
      url: new URL('http://localhost/api/knowledge/vector-search?q=test'),
      knowledgeBase,
      readBody: async () => '',
    });
    await handleKnowledgeRoutes({
      req: reqList,
      res: resList,
      url: new URL('http://localhost/api/knowledge?search=memory&limit=10'),
      knowledgeBase,
      readBody: async () => '',
    });

    expect(JSON.parse(resVector.body).hits[0].id).toBe('kn_1');
    expect(JSON.parse(resList.body).items[0].id).toBe('kn_1');
  });

  it('creates, deletes, reads, and updates knowledge entries', async () => {
    const reqPost = createReq('POST', '/api/knowledge');
    const resPost = createRes();
    const reqDelete = createReq('DELETE', '/api/knowledge');
    const resDelete = createRes();
    const reqGet = createReq('GET', '/api/knowledge/kn_abc');
    const resGet = createRes();
    const reqPut = createReq('PUT', '/api/knowledge/kn_abc');
    const resPut = createRes();

    const knowledgeBase = {
      add: async (input: any) => ({ id: 'kn_abc', ...input }),
      delete: (id: string) => id === 'kn_abc',
      getById: (id: string) => (id === 'kn_abc' ? { id, title: 'Old', content: 'Old body' } : null),
      update: async (id: string) => id === 'kn_abc',
    };

    await handleKnowledgeRoutes({
      req: reqPost,
      res: resPost,
      url: new URL('http://localhost/api/knowledge'),
      knowledgeBase,
      readBody: async () => JSON.stringify({ title: 'New', content: 'Body', tags: ['tag'] }),
    });
    await handleKnowledgeRoutes({
      req: reqDelete,
      res: resDelete,
      url: new URL('http://localhost/api/knowledge'),
      knowledgeBase,
      readBody: async () => JSON.stringify({ id: 'kn_abc' }),
    });
    await handleKnowledgeRoutes({
      req: reqGet,
      res: resGet,
      url: new URL('http://localhost/api/knowledge/kn_abc'),
      knowledgeBase,
      readBody: async () => '',
    });
    await handleKnowledgeRoutes({
      req: reqPut,
      res: resPut,
      url: new URL('http://localhost/api/knowledge/kn_abc'),
      knowledgeBase,
      readBody: async () => JSON.stringify({ title: 'Updated', content: 'Updated body' }),
    });

    expect(JSON.parse(resPost.body).id).toBe('kn_abc');
    expect(JSON.parse(resDelete.body).status).toBe('deleted');
    expect(JSON.parse(resGet.body).id).toBe('kn_abc');
    expect(JSON.parse(resPut.body).status).toBe('updated');
  });

  it('validates required parameters for vector search and knowledge creation', async () => {
    const reqVector = createReq('GET', '/api/knowledge/vector-search');
    const resVector = createRes();
    const reqPost = createReq('POST', '/api/knowledge');
    const resPost = createRes();

    await handleKnowledgeRoutes({
      req: reqVector,
      res: resVector,
      url: new URL('http://localhost/api/knowledge/vector-search'),
      knowledgeBase: {},
      readBody: async () => '',
    });
    await handleKnowledgeRoutes({
      req: reqPost,
      res: resPost,
      url: new URL('http://localhost/api/knowledge'),
      knowledgeBase: {},
      readBody: async () => JSON.stringify({ title: 'Missing content' }),
    });

    expect(resVector.statusCode).toBe(400);
    expect(JSON.parse(resVector.body).error).toBe('q required');
    expect(resPost.statusCode).toBe(400);
    expect(JSON.parse(resPost.body).error).toBe('title and content required');
  });
});
