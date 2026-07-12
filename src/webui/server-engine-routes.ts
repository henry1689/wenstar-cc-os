/**
 * server-engine-routes.ts — 引擎诊断 API 端点 (从 server.ts 拆出)
 * /api/engine/heart | prompt | /api/vad/reset | /api/voice/test
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Orchestrator } from '../engine/orchestrator.js';

export interface EngineRouteDeps {
  orchestrator: Orchestrator | null;
}

export async function handleEngineRoutes(deps: EngineRouteDeps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { orchestrator } = deps;

  // ── 引擎 Heart 状态（S2 仿生核心实时快照） ──
  if (req.method === 'GET' && url.pathname === '/api/engine/heart') {
    try {
      const heartStore = orchestrator?.getHeartStore();
      if (!heartStore) { res.writeHead(404); res.end(JSON.stringify({ error: 'Heart 未初始化' })); return true; }
      const state = heartStore.getState();
      const auditLog = heartStore.getAuditLog();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        state: {
          emotionVector: state.emotionVector, relationState: state.relationState, atmosphere: state.atmosphere,
          memoryPermission: state.memoryPermission, relationMetrics: state.relationMetrics,
          emotionLabel: heartStore.getEmotionLabel(), updatedAt: state.updatedAt,
        },
        desireHints: heartStore.getDesireHints(), emergenceHint: heartStore.getEmergenceHint(),
        auditLog: auditLog.slice(-10), mode: orchestrator?.getMode() ?? 'legacy',
      }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: (err as Error).message })); }
    return true;
  }

  // ── 引擎组装提示词 ──
  if (req.method === 'GET' && url.pathname === '/api/engine/prompt') {
    try {
      if (!orchestrator) { res.writeHead(404); res.end(JSON.stringify({ error: '引擎未初始化' })); return true; }
      const prompt = orchestrator.composePrompt();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(prompt);
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: (err as Error).message })); }
    return true;
  }

  // ── VAD 重置 ──
  if (req.method === 'POST' && url.pathname === '/api/vad/reset') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', message: 'VAD 状态已重置' }));
    return true;
  }

  return false;
}
