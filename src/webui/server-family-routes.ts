/**
 * server-family-routes.ts — 家族图谱 API 端点 (从 server.ts 拆出)
 * /api/family/self-check | backup | restore | sync-knowledge | verify-sync | migrate-dossier | full-profile | person
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { M4Orchestrator } from '../m4/M4Orchestrator.js';
import type { KnowledgeBase } from '../m2/KnowledgeBase.js';
import { syncFamilyGraphToKnowledgeBase, verifyFamilyGraphSync } from '../app/knowledge/FamilyGraphSync.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

export interface FamilyRouteDeps {
  m4: M4Orchestrator;
  knowledgeBase: KnowledgeBase;
  backupStats: { lastBackupTime: string | null; backupCount: number; successCount: number; totalAttempts: number };
  projectRoot: string;
}

export async function handleFamilyRoutes(deps: FamilyRouteDeps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { m4, knowledgeBase, backupStats, projectRoot } = deps;

  // ── 家族图谱自检 ──
  if (req.method === 'GET' && url.pathname === '/api/family/self-check') {
    try {
      const fg = m4?.getFamilyGraph();
      const stats = fg?.getStats();
      const backupDirPath = path.join(projectRoot, "data", "backups");
      let backupFiles: string[] = [];
      try { backupFiles = fs.readdirSync(backupDirPath).filter(f => f.startsWith('family_graph')); } catch { /* backup dir may not exist */ }
      const successRate = backupStats.totalAttempts > 0
        ? (backupStats.successCount / backupStats.totalAttempts * 100).toFixed(1) + '%'
        : 'N/A';
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'ok',
        fg: stats || { personCount: 0, edgeCount: 0 },
        backup: { lastBackupTime: backupStats.lastBackupTime, backupSuccessRate: successRate, backupCount: backupFiles.length },
      }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── 家族图谱手动备份 ──
  if (req.method === 'POST' && url.pathname === '/api/family/backup') {
    try {
      const result = execSync('node scripts/family-graph-backup.cjs 2>&1', { encoding: 'utf8', timeout: 10000 });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', report: result }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: (err instanceof Error ? err.message : String(err)) })); }
    return true;
  }

  // ── FG 从备份恢复 ──
  if (req.method === 'POST' && url.pathname === '/api/family/restore') {
    try {
      const body = await readBody(req);
      const { backupPath } = JSON.parse(body || '{}');
      if (!backupPath) { res.writeHead(400); res.end(JSON.stringify({ status: 'error', message: 'backupPath 必填' })); return true; }
      const fg = m4?.getFamilyGraph();
      if (!fg || typeof fg.restoreFromBackup !== 'function') { res.writeHead(503); res.end(JSON.stringify({ status: 'error', message: 'FG 未就绪' })); return true; }
      const result = await fg.restoreFromBackup(backupPath);
      res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: result.success ? 'ok' : 'error', ...result }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── FG→知识库 人物档案同步 ──
  if (req.method === 'POST' && url.pathname === '/api/family/sync-knowledge') {
    try {
      const fg = m4?.getFamilyGraph(); const kb = knowledgeBase;
      if (!fg || !kb) { res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: 'FG/KB 未就绪' })); return true; }
      const result = await syncFamilyGraphToKnowledgeBase(fg, kb);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', ...result }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── FG↔知识库 同步校验 ──
  if (req.method === 'GET' && url.pathname === '/api/family/verify-sync') {
    try {
      const fg = m4?.getFamilyGraph(); const kb = knowledgeBase;
      if (!fg || !kb) { res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: 'FG/KB 未就绪' })); return true; }
      const result = await verifyFamilyGraphSync(fg, kb);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', ...result }));
    } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── FG dossier 存量迁移 ──
  if (req.method === 'POST' && url.pathname === '/api/family/migrate-dossier') {
    try {
      const fg = m4?.getFamilyGraph();
      if (!fg) { res.writeHead(503); res.end(JSON.stringify({ status: 'error', message: 'FG 未就绪' })); return true; }
      const result = await fg.migrateProfilesToDossier();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', ...result }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── FG 完整档案 ──
  if (req.method === 'GET' && url.pathname.startsWith('/api/family/full-profile/')) {
    try {
      const personName = decodeURIComponent(url.pathname.substring('/api/family/full-profile/'.length));
      const fg = m4?.getFamilyGraph();
      if (!fg) { res.writeHead(503); res.end(JSON.stringify({ status: 'error', message: 'FG 未就绪' })); return true; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', name: personName, dossier: fg.getFullProfile(personName), profile: fg.getPersonProfile(personName) }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── FG 人物查询 ──
  if (req.method === 'GET' && url.pathname.startsWith('/api/family/person/')) {
    try {
      const name = decodeURIComponent(url.pathname.substring('/api/family/person/'.length));
      const fg = m4?.getFamilyGraph();
      if (!fg) { res.writeHead(503); res.end(JSON.stringify({ status: 'error' })); return true; }
      const profile = fg.getPersonProfile(name);
      const summary = fg.getPersonSummary(name);
      const related = fg.getRelatedPersons(name);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ name, profile, summary, related }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  // ── FG 人物圈层 ──
  if (req.method === 'GET' && url.pathname.startsWith('/api/family/circle/')) {
    try {
      const name = decodeURIComponent(url.pathname.substring('/api/family/circle/'.length));
      const fg = m4?.getFamilyGraph();
      if (!fg) { res.writeHead(503); res.end(JSON.stringify({ status: 'error' })); return true; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ name, circle: fg.getCircleLevel(name), persons: fg.getPersonsByCircle(fg.getCircleLevel(name)) }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ status: 'error', message: (err as Error).message })); }
    return true;
  }

  return false;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
