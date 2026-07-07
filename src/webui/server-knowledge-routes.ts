import http from 'node:http';

type KnowledgeRouteDeps = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  knowledgeBase: any;
  readBody(req: http.IncomingMessage): Promise<string>;
};

export async function handleKnowledgeRoutes(deps: KnowledgeRouteDeps): Promise<boolean> {
  const { req, res, url, knowledgeBase, readBody } = deps;

  if (req.method === 'GET' && url.pathname === '/api/knowledge/vector-search') {
    const q = url.searchParams.get('q') || '';
    if (!q) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'q required' }));
      return true;
    }
    const engine = knowledgeBase?.engine || knowledgeBase;
    const provider = engine.embedProvider;
    if (!provider?.isAvailable?.()) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ hits: [], note: '嵌入 API 不可用，请设置 DEEPSEEK_API_KEY' }));
      return true;
    }
    const queryVec = await provider.embed(q);
    if (!queryVec.length) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ hits: [], note: '嵌入返回空向量' }));
      return true;
    }
    const hits = engine.vectorSearchDebug(queryVec, 10);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ query: q, hits }));
    return true;
  }

  if (url.pathname === '/api/knowledge') {
    if (req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const keyword = url.searchParams.get('search') || '';
      const interactionType = url.searchParams.get('interaction_type') || '';
      let list;
      if (interactionType) list = knowledgeBase.searchByInteraction(interactionType, limit);
      else if (keyword) list = await knowledgeBase.search(keyword, limit);
      else list = knowledgeBase.list(limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ total: list.length, items: list }));
      return true;
    }

    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.title || !body.content) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'title and content required' }));
        return true;
      }
      const entry = await knowledgeBase.add({
        title: body.title,
        content: body.content,
        source_type: body.source_type ?? 'text',
        source_name: body.source_name ?? null,
        file_size: body.file_size ?? 0,
        tags: body.tags ?? [],
        interaction_type: body.interaction_type,
        scene_tags: body.scene_tags,
        classification: body.classification,
      });
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(entry));
      return true;
    }

    if (req.method === 'DELETE') {
      const body = JSON.parse(await readBody(req));
      if (!body.id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'id required' }));
        return true;
      }
      const ok = knowledgeBase.delete(body.id);
      res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: ok ? 'deleted' : 'not_found' }));
      return true;
    }
  }

  const knMatch = url.pathname.match(/^\/api\/knowledge\/(kn_[a-z0-9_]+)$/);
  if (knMatch && req.method === 'GET') {
    const entry = knowledgeBase.getById(knMatch[1]);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not found' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(entry));
    return true;
  }

  if (knMatch && req.method === 'PUT') {
    const body = JSON.parse(await readBody(req));
    const ok = await knowledgeBase.update(knMatch[1], {
      title: body.title,
      content: body.content,
      tags: body.tags,
      locked: body.locked,
    });
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: ok ? 'updated' : 'not_found_or_locked' }));
    return true;
  }

  return false;
}
