/**
 * server-fg-routes.ts — 人类世界关系网络 HTTP API
 * =================================================
 * 提供 FG 世界关系网络的查询接口。
 *
 * GET  /api/fg/persons      → 所有人
 * GET  /api/fg/network?name= → 某人的关系网络
 * GET  /api/fg/timeline?name= → 某人时间线
 * GET  /api/fg/progression?name= → 某人认知演进
 * GET  /api/fg/events       → 所有事件
 * GET  /api/fg/knowledge?name= → 某人的关联知识
 * GET  /api/fg/stats        → 统计
 */
import http from 'node:http';

type FGRouteDeps = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  storage?: any;
  readBody(req: http.IncomingMessage): Promise<string>;
};

export async function handleFGRoutes(deps: FGRouteDeps): Promise<boolean> {
  const { req, res, url, storage } = deps;

  // 需要 storage 的路由
  if (!storage) return false;

  try {
    const sqlite = storage.getSQLite();
    if (!sqlite) return false;
    const { HumanWorldGraph } = await import('../app/fg/HumanWorldGraph.js');
    // 获取 fg 实例 — 需要在 server.ts 中挂载
    const fg = (globalThis as any).__familyGraph;
    if (!fg) return false;

    const hwg = new HumanWorldGraph(fg, sqlite);

    // ── 所有人 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/persons') {
      const persons = hwg.getAllPersons();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: persons.length, persons }));
      return true;
    }

    // ── 关系网络 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/network') {
      const name = url.searchParams.get('name') || '';
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'name required' }));
        return true;
      }
      const network = hwg.getNetwork(name);
      const knowledge = new (await import('../app/fg/KnowledgeBridge.js')).KnowledgeBridge(sqlite, fg);
      const linked = knowledge.getLinkedKnowledge(name);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ person: name, network, linkedKnowledge: linked }));
      return true;
    }

    // ── 时间线 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/timeline') {
      const name = url.searchParams.get('name') || '';
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'name required' }));
        return true;
      }
      const timeline = hwg.getTimeline(name);
      const progression = hwg.getProgression(name);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ person: name, timeline, progression }));
      return true;
    }

    // ── 认知演进 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/progression') {
      const name = url.searchParams.get('name') || '';
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'name required' }));
        return true;
      }
      const progression = hwg.getProgression(name);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ person: name, progression }));
      return true;
    }

    // ── 所有事件 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/events') {
      const { PersonTimeline } = await import('../app/fg/PersonTimeline.js');
      const tl = new PersonTimeline(sqlite);
      const events = tl.getAllEvents();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: events.length, events }));
      return true;
    }

    // ── 关联知识 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/knowledge') {
      const name = url.searchParams.get('name') || '';
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'name required' }));
        return true;
      }
      const { KnowledgeBridge } = await import('../app/fg/KnowledgeBridge.js');
      const kb = new KnowledgeBridge(sqlite, fg);
      const linked = kb.getLinkedKnowledge(name);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ person: name, knowledge: linked }));
      return true;
    }

    // ── 统计 ──
    if (req.method === 'GET' && url.pathname === '/api/fg/stats') {
      const stats = hwg.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(stats));
      return true;
    }

  } catch { /* 模块未就绪 */ }

  return false;
}
