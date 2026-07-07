import http from 'node:http';
import type { FusionStorageAdapter } from '../m2/FusionStorageAdapter.js';
import {
  autoPromoteCandidatesV2,
  compactAlluvial,
  exportDiamonds,
  generateVaultReport,
  getGoldSummary,
  getVaultLog,
  listBlackDiamonds,
  listGoldRecent,
  searchBlackDiamonds,
} from '../app/vault/VaultManager.js';

type VaultRouteDeps = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
  storage: FusionStorageAdapter;
  conversationHistory: Array<{ content?: string; role?: string; timestamp?: string }>;
  maintenance: { getHealth: () => { lastMaintenance: { compaction: string | null } } };
};

export async function handleVaultRoutes(deps: VaultRouteDeps): Promise<boolean> {
  const { req, res, url, storage, conversationHistory, maintenance } = deps;

  if (req.method === 'GET' && url.pathname === '/api/vault/report') {
    const report = generateVaultReport(
      storage.getSQLite(),
      conversationHistory as any,
      200,
      maintenance.getHealth().lastMaintenance.compaction,
    );
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(report));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/vault/alluvial') {
    const turns = conversationHistory.slice(-100).map((t) => ({
      content: (t.content || '').substring(0, 100),
      role: t.role,
      timestamp: t.timestamp,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total: conversationHistory.length, turns }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/vault/gold') {
    const sqlite = storage.getSQLite();
    const summary = getGoldSummary(sqlite);
    const items = listGoldRecent(sqlite, 20);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...summary, items }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/vault/diamond') {
    const sqlite = storage.getSQLite();
    const search = url.searchParams.get('search') || '';
    const items = search
      ? searchBlackDiamonds(sqlite, search, 20)
      : listBlackDiamonds(sqlite, 20, 0);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ total: items.length, items }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/vault/diamond/export') {
    const format = url.searchParams.get('format') || 'json';
    const data = exportDiamonds(storage.getSQLite(), format as 'json' | 'csv');
    res.writeHead(200, {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
    });
    res.end(data);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/vault/alluvial/compact') {
    try {
      const days = parseInt(url.searchParams.get('days') || '30', 10);
      const count = compactAlluvial(storage.getSQLite(), days);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ compacted: count }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/vault/log') {
    const log = getVaultLog(storage.getSQLite(), parseInt(url.searchParams.get('limit') || '20', 10));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ count: log.length, log }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/vault/auto-promote') {
    const entries = autoPromoteCandidatesV2(storage.getSQLite(), 5);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', count: entries.length, entries }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/vault/memory/promote') {
    const memoryId = url.searchParams.get('memoryId') || '';
    const narrativeTag = url.searchParams.get('narrativeTag') || undefined;
    const sensoryAnchor = url.searchParams.get('sensoryAnchor') || undefined;
    if (!memoryId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'memoryId is required' }));
      return true;
    }
    const ok = storage.promoteToLandmark(memoryId, narrativeTag, sensoryAnchor);
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: ok ? 'ok' : 'error', action: 'promote', memoryId, narrativeTag }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/vault/memory/suppress') {
    const memoryId = url.searchParams.get('memoryId') || '';
    const scarType = url.searchParams.get('scarType') || 'manual_suppression';
    if (!memoryId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'memoryId is required' }));
      return true;
    }
    const ok = storage.markScar(memoryId, scarType);
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: ok ? 'ok' : 'error', action: 'suppress', memoryId, scarType }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/vault/memory/heal') {
    const memoryId = url.searchParams.get('memoryId') || '';
    const healedBy = url.searchParams.get('healedBy') || 'operator';
    if (!memoryId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'memoryId is required' }));
      return true;
    }
    const ok = storage.healScar(memoryId, healedBy);
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: ok ? 'ok' : 'error', action: 'heal', memoryId, healedBy }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/vault/memory/archive') {
    const memoryId = url.searchParams.get('memoryId') || '';
    if (!memoryId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'memoryId is required' }));
      return true;
    }
    const sqlite = storage.getSQLite();
    const record = sqlite.findById(memoryId);
    if (!record) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', message: 'memory not found', memoryId }));
      return true;
    }
    const now = new Date().toISOString();
    record.lifecycle_state = 'archived';
    record.archived_at = now;
    record.last_verified_at = now;
    sqlite.write(record);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', action: 'archive', memoryId, archivedAt: now }));
    return true;
  }

  return false;
}
