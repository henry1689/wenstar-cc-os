/**
 * server-jinghuan-routes.ts — 警幻仙姑 8 批量 API 端点
 * /api/jinghuan/summary | link | scene | canvas | comment | table | migrate | archive | all
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { KnowledgeBase } from '../m2/KnowledgeBase.js';
import { JinghuanBatchAPI } from '../app/knowledge/JinghuanBatchAPI.js';

export interface JinghuanRouteDeps {
  knowledgeBase: KnowledgeBase;
}

export async function handleJinghuanRoutes(deps: JinghuanRouteDeps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith('/api/jinghuan/')) return false;

  const api = new JinghuanBatchAPI(deps.knowledgeBase);

  // ── 分发 ──
  try {
    let result;

    if (url.pathname === '/api/jinghuan/summary') {
      result = await api.batchGenerateSummary();
    } else if (url.pathname === '/api/jinghuan/link') {
      result = await api.batchAutoLink();
    } else if (url.pathname === '/api/jinghuan/scene') {
      result = await api.batchTagScene();
    } else if (url.pathname === '/api/jinghuan/canvas') {
      result = await api.canvasAutoBuild();
    } else if (url.pathname === '/api/jinghuan/comment') {
      result = await api.batchCodeComment();
    } else if (url.pathname === '/api/jinghuan/table') {
      const mode = ((url.searchParams.get('mode') || 'md2csv') as 'md2csv' | 'csv2md');
      result = await api.tableConvert(mode);
    } else if (url.pathname === '/api/jinghuan/migrate') {
      result = await api.vaultMigrate();
    } else if (url.pathname === '/api/jinghuan/archive') {
      result = await api.vaultArchive();
    } else if (url.pathname === '/api/jinghuan/all') {
      result = await api.runAll();
    } else {
      return false;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return true;

  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: (e as Error).message }));
    return true;
  }
}
