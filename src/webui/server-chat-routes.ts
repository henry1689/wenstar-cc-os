/**
 * server-chat-routes.ts — Chat/重置/状态 API 端点 (从 server.ts 拆出)
 * /api/chat | recall | purge-test | prefer-candidate | stream | clear |
 * /api/reset | status | conversation
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

import type { FusionStorageAdapter } from '../m2/FusionStorageAdapter.js';
import type { FamilyGraph } from '../m4/household/FamilyGraph.js';
import type { EntityMeeting } from '../m4/household/EntityMeeting.js';
import type { ChatResponse, ChatContext } from './chat.js';
import { randomUUID } from 'node:crypto';
// 🔴 P1-5 S4-M3: streaming.enabled/job_ttl_ms 接线（enabled:false 一键回退同步路径）
import { getRetrievalFusionConfig } from '../config/retrieval-fusion-config.js';

/** TTS 异步 job 存储（S4 P1-2 修复：长文音频后台生成，不阻塞 /api/chat 响应） */
const TTS_JOBS = new Map<string, { urls: string[]; done: boolean; createdAt: number }>();
const TTS_JOB_TTL_MS = 120_000; // 2 分钟自动过期（防内存泄漏）
/** 短/中回复（≤2 段）同步生成无感；长文（>2 段）走异步 job */
export const TTS_SYNC_MAX_SEGMENTS = 2;

/** 语音播报单段最大字符数（edge-tts 输入安全上限） */
export const TTS_MAX_TEXT = 400;
/** 语音播报单段目标句数（2~4 句，控制播报节奏：不多不少不碎） */
export const TTS_SEGMENT_TARGET_SENTENCES = 3;
/** 语音播报单段硬上限（句数达标但字数溢出时的强制截断） */
export const TTS_SEGMENT_MAX_CHARS = 250;

/**
 * _truncateForTTS — 语音播报文本断句截断。
 * 长回复（可达数千字）只播报前段：在 max 窗口内找断点。
 * 断点两级优先级（对齐 SSE 路由的 [。！？\n] 句级约定）：
 *   1. 句级（。！？…\n）最右断点 > 40%*max → 采用（完整句优先）
 *   2. 逗号级（；，、;）最右断点 > 40%*max → 采用（短语兜底）
 *   3. 回退最近句级断点（不要求越过 40% 阈值）→ 保句子完整
 *   4. 完全无断点 → 硬截断在 max
 * 纯函数，可单测。
 */
export function _truncateForTTS(text: string, max = TTS_MAX_TEXT): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const cutoff = t.slice(0, max);
  const SENT = new Set(['。', '！', '？', '…', '\n']);
  const PHRASE = new Set(['；', '，', '、', ';']);
  const threshold = Math.floor(max * 0.4);

  // 找最右断点
  let sentIdx = -1;
  let phraseIdx = -1;
  for (let i = cutoff.length - 1; i >= 0; i--) {
    if (sentIdx === -1 && SENT.has(cutoff[i])) sentIdx = i;
    if (phraseIdx === -1 && PHRASE.has(cutoff[i])) phraseIdx = i;
    if (sentIdx !== -1 && phraseIdx !== -1) break;
  }
  // 1. 句级优先（完整句）
  if (sentIdx > threshold) return cutoff.slice(0, sentIdx + 1);
  // 2. 逗号级兜底
  if (phraseIdx > threshold) return cutoff.slice(0, phraseIdx + 1);
  // 3. 回退最近句级断点（保句子完整）
  if (sentIdx >= 0) return cutoff.slice(0, sentIdx + 1);
  // 4. 无断点 → 硬截断
  return cutoff;
}

/**
 * segmentForTTS — 长文分段（滚动播报核心，纯函数可单测）。
 * 按"几句话一个断点"切段，让前端一段段连续播完整个超长文本（数千字）。
 * 规则（双上限保安全 + 节奏）：
 *   1. 以句子结尾（。！？…\n）为断点累计句子
 *   2. 目标句数 TTS_SEGMENT_TARGET_SENTENCES 达到 → 切段
 *   3. 单段字数硬上限 TTS_SEGMENT_MAX_CHARS：句数未达但字数溢出 → 立即切段
 *   4. 无句级断点（超长单句）→ 在 TTS_SEGMENT_MAX_CHARS 处硬切
 *   5. 短文本（≤ TTS_SEGMENT_MAX_CHARS）→ 单段原样返回
 *   6. 空/纯空白 → 返回空数组
 * 与 _truncateForTTS 并存：_truncateForTTS 保留给调用方兼容；多段播报走本函数。
 */
export function segmentForTTS(text: string, targetSentences = TTS_SEGMENT_TARGET_SENTENCES, maxChars = TTS_SEGMENT_MAX_CHARS): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];

  const SENT_END = new Set(['。', '！', '？', '…', '\n']);
  const segments: string[] = [];
  let buf = '';
  let sentCount = 0;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    buf += ch;
    if (SENT_END.has(ch)) sentCount++;
    const segFull = (sentCount >= targetSentences || buf.length >= maxChars);
    if (segFull) {
      segments.push(buf.trim());
      buf = '';
      sentCount = 0;
    }
  }
  if (buf.trim()) segments.push(buf.trim());

  // 异常兜底：因超长单句产生 >maxChars 的段（无任何断点）→ 硬切
  const out: string[] = [];
  for (const s of segments) {
    if (s.length <= maxChars) { out.push(s); continue; }
    for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars));
  }
  return out;
}

/**
 * generateTTSAudio — 分段文本 → mp3 音频 URL 列表（同步/异步共用）。
 * 并发限流 3（edge-tts 负载保护）；某段失败跳过不阻塞整体。
 * S4 P2-6 修复：文件名用 randomUUID 彻底杜绝同毫秒碰撞。
 */
export async function generateTTSAudio(segments: string[], dataDir: string): Promise<string[]> {
  const _env = { ...process.env, NO_PROXY: '*', no_proxy: '*', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' };
  const genOne = async (txt: string): Promise<string | null> => {
    if (!txt.trim()) return null; // 空段不生成（S4 P2-4）
    const _fn = 'tts_' + Date.now().toString(36) + '_' + randomUUID().slice(0, 8) + '.mp3';
    const _fp = path.join(dataDir, 'audio', _fn);
    try {
      await execFileAsync('edge-tts', ['--text', txt, '--voice', 'zh-CN-XiaoxiaoNeural', '--write-media', _fp], { timeout: 30000, env: _env });
      return fs.existsSync(_fp) ? '/audio/' + _fn : null;
    } catch (_e) { console.warn('[TTS] 段生成失败:', (_e as Error)?.message || _e); return null; }
  };
  const CHUNK = 3;
  const files: (string | null)[] = new Array(segments.length);
  for (let i = 0; i < segments.length; i += CHUNK) {
    const batch = segments.slice(i, i + CHUNK);
    const batchFiles = await Promise.all(batch.map(s => genOne(s)));
    batchFiles.forEach((f, j) => { files[i + j] = f; });
  }
  return files.filter((f): f is string => !!f);
}

/** TTS job 状态查询（S4 P1-2 异步方案：前端轮询补齐长文段） */
export function getTTSJob(jobId: string): { urls: string[]; done: boolean } | null {
  sweepTTSJobs();
  const job = TTS_JOBS.get(jobId);
  return job ? { urls: job.urls, done: job.done } : null;
}

/** TTS job 兜底清理（复审 P2-1：独立定时器防长驻内存；也被 getTTSJob 惰性触发） */
export function sweepTTSJobs(): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of TTS_JOBS) {
    if (now - v.createdAt > TTS_JOB_TTL_MS) { TTS_JOBS.delete(k); removed++; }
  }
  return removed;
}

// ── 🔴 P1-5 流式聊天 job 存储（路径 B: POST /api/chat {stream:true} → jobId → 轮询/SSE） ──

/** 流式聊天 job */
export interface ChatJob {
  status: 'running' | 'done' | 'error';
  /** 已推送的 token 增量（前端轮询时一次性取回补齐） */
  tokens: string[];
  /** 最终 reply（done 后，M5 校准 + 幻觉校验的完整结果，覆盖气泡） */
  reply: string;
  /** 完整 ChatResponse（done 后） */
  result: any | null;
  audio: { audio_url: string | null; audio_urls: string[]; tts_job: string | null };
  createdAt: number;
  error?: string;
}
const CHAT_JOBS = new Map<string, ChatJob>();
/** 3 分钟自动过期（防内存泄漏；与 p1_speed.streaming.job_ttl_ms 对齐） */
const CHAT_JOB_TTL_MS = 180_000;

/** 流式 job 状态查询（惰性 sweep） */
export function getChatJob(jobId: string): ChatJob | null {
  sweepChatJobs();
  return CHAT_JOBS.get(jobId) || null;
}

/** 流式 job 兜底清理（惰性触发 + server.ts 60s 定时器；防长驻内存）
 * S4-M3: job_ttl_ms 从配置读取（默认 180s） */
export function sweepChatJobs(): number {
  const now = Date.now();
  const ttl = getRetrievalFusionConfig()?.p1_speed?.streaming?.job_ttl_ms ?? CHAT_JOB_TTL_MS;
  let removed = 0;
  for (const [k, v] of CHAT_JOBS) {
    if (now - v.createdAt > ttl) { CHAT_JOBS.delete(k); removed++; }
  }
  return removed;
}

/**
 * 🔴 P1-5: TTS 结果构建（同步路径与流式 job 路径共用）。
 * 长文分段滚动播报（V12.5）：≤2 段同步生成无感；>2 段异步 job 轮询补齐。
 */
async function buildTTSResult(
  reply: string,
  ttsEnabled: boolean,
  dataDir: string,
): Promise<{ audio_url: string | null; audio_urls: string[]; tts_job: string | null }> {
  let audio_url: string | null = null;
  let audio_urls: string[] = [];
  let tts_job: string | null = null;
  if (ttsEnabled && reply && reply.length > 1) {
    const segments = segmentForTTS(reply);
    if (segments.length <= TTS_SYNC_MAX_SEGMENTS) {
      try {
        audio_urls = await generateTTSAudio(segments, dataDir);
        if (audio_urls.length > 0) audio_url = audio_urls[0];
      } catch (_err) { console.warn('[TTS] 生成失败:', (_err as Error)?.message || _err); }
    } else {
      tts_job = 'ttsjob_' + randomUUID();
      TTS_JOBS.set(tts_job, { urls: [], done: false, createdAt: Date.now() });
      void generateTTSAudio(segments, dataDir).then(urls => {
        const job = TTS_JOBS.get(tts_job!);
        if (job) { job.urls = urls; job.done = true; }
      }).catch(e => {
        console.warn('[TTS] 异步 job 生成失败:', (e as Error)?.message || e);
        const job = TTS_JOBS.get(tts_job!);
        if (job) job.done = true;
      });
    }
  }
  return { audio_url, audio_urls, tts_job };
}

export interface ChatRouteDeps {
  processChat: (message: string, clientMsgId?: string | null, testMode?: boolean, onToken?: (delta: { text?: string }) => void) => Promise<ChatResponse>;
  /** 🔴 P1-5 流式: 直写 SSE 客户端池（绕过 broadcastEvent 1.5s 限速） */
  pushToSSEClients?: (event: string, data: any) => void;
  resetPipeline: () => Promise<void>;
  conversationHistory: any[];
  conversationDB: any;
  storage: FusionStorageAdapter;
  familyGraph: FamilyGraph;
  m6: any;
  maintenance: any;
  DATA_DIR: string;
  PROJECT_ROOT: string;
  PROJECT_DIR: string;
  saveConversationHistory: () => void;
  listApiKeys: () => any[];
  setApiKey: (name: string, value: string) => void;
  deleteApiKey: (name: string) => void;
  getApiKey: (name: string) => string | undefined;
  entityMeeting?: EntityMeeting;  // V10.1: byte-level meeting trigger
}

export async function handleChatRoutes(deps: ChatRouteDeps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { processChat, resetPipeline, conversationHistory, conversationDB, storage, familyGraph, m6, maintenance, DATA_DIR, PROJECT_ROOT, PROJECT_DIR } = deps;

  // ── 聊天 ──
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
    const { rawBody, text: bodyText } = await readBodyWithBytes(req);
    // 🔧 V10.1: 字节级会晤触发——在 JSON 解析前用原始字节匹配人名
    if (deps.entityMeeting && !deps.entityMeeting.isActive()) {
      _triggerMeetingFromBytes(rawBody, deps.entityMeeting);
    }
    const body = JSON.parse(bodyText);
    if (!body.message || typeof body.message !== 'string') { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return true; }
    // 🛡️ V4.0: 角色扮演已彻底废除，实体会晤替代。不再注入【角色扮演】标记。

    // 🔴 P1-5 流式分支（路径 B）: body.stream===true 才进 job 分支，默认同步路径向后兼容。
    //   S4-M3: streaming.enabled===false → 回退同步路径（一键回滚旧行为）。
    //   job 后台跑完整 processChat（幻觉校验/持久化/TTS 全部落地逻辑不破坏），
    //   onToken 旁路推 chat-token/chat-done 到 SSE；前端轮询 /api/chat/job/status 兜底。
    if (body.stream === true && getRetrievalFusionConfig()?.p1_speed?.streaming?.enabled !== false) {
      const jobId = 'chatjob_' + randomUUID();
      const job: ChatJob = { status: 'running', tokens: [], reply: '', result: null, audio: { audio_url: null, audio_urls: [], tts_job: null }, createdAt: Date.now() };
      CHAT_JOBS.set(jobId, job);
      void (async () => {
        try {
          const result = await processChat(body.message.trim(), body.client_msg_id, body.test_mode === true, (delta) => {
            if (delta?.text) {
              job.tokens.push(delta.text);
              deps.pushToSSEClients?.('chat-token', { job_id: jobId, token: delta.text });
            }
          });
          job.result = result;
          job.reply = result.reply || '';
          // TTS 与同步路径共用（buildTTSResult），后台生成不阻塞
          job.audio = await buildTTSResult(job.reply, body.tts !== false, DATA_DIR);
          job.status = 'done';
          deps.pushToSSEClients?.('chat-done', { job_id: jobId, reply: job.reply, audio_url: job.audio.audio_url, audio_urls: job.audio.audio_urls, tts_job: job.audio.tts_job });
          console.log('[ChatStream] done: ' + jobId + ' tokens=' + job.tokens.length + ' len=' + job.reply.length);
        } catch (e) {
          job.status = 'error';
          job.error = (e as Error)?.message || String(e);
          deps.pushToSSEClients?.('chat-error', { job_id: jobId, error: job.error });
          console.warn('[ChatStream] error: ' + jobId, job.error);
        }
      })();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ stream: true, job_id: jobId, poll_hint_ms: getRetrievalFusionConfig()?.p1_speed?.streaming?.poll_hint_ms ?? 150 }));
      return true;
    }

    const result = await processChat(body.message.trim(), body.client_msg_id, body.test_mode === true);

    // TTS 生成 — 长文分段滚动播报（V12.5，P1-5 抽 helper 与流式路径共用）
    const { audio_url, audio_urls, tts_job } = await buildTTSResult(result.reply || '', body.tts !== false, DATA_DIR);
    // 安全序列化：防止循环引用导致 JSON.stringify 抛异常
    const safeResult = _sanitizeForJSON(result);
    const safeObject = (safeResult && typeof safeResult === 'object' && !Array.isArray(safeResult)) ? safeResult : {};
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...(safeObject as Record<string, unknown>), audio_url, audio_urls, tts_job }));
    } catch (err) {
      console.error('[ChatRoute] /api/chat 异常:', (err as Error)?.message || err);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ reply: '抱歉，出了一点小问题，请再说一次好吗？', turn_count: 0, error: 'chat_route_error' }));
    }
    return true;
  }

  // ── TTS job 状态轮询（S4 P1-2 异步长文音频） ──
  if (req.method === 'GET' && url.pathname === '/api/tts/status') {
    const jobId = (url.searchParams.get('job') || '').trim();
    const job = jobId ? getTTSJob(jobId) : null;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: !!job, done: job?.done ?? false, audio_urls: job?.urls ?? [] }));
    return true;
  }

  // ── 🔴 P1-5 流式聊天 job 状态轮询（路径 B 兜底：SSE 断开时轮询补齐） ──
  if (req.method === 'GET' && url.pathname === '/api/chat/job/status') {
    const jobId = (url.searchParams.get('job') || '').trim();
    const job = jobId ? getChatJob(jobId) : null;
    if (!job) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      status: job.status,
      reply: job.reply,
      tokens: job.tokens,   // S4-m11: SSE 断开时轮询一次性取回补齐中间 token
      result: job.result,
      audio_url: job.audio?.audio_url ?? null,
      audio_urls: job.audio?.audio_urls ?? [],
      tts_job: job.audio?.tts_job ?? null,
      error: job.error || null,
    }));
    return true;
  }

  // ── 撤回消息 ──
  if (req.method === 'POST' && url.pathname === '/api/chat/recall') {
    try {
      const body = JSON.parse(await readBody(req));
      const messageId = body.message_id;
      if (!messageId) { res.writeHead(400); res.end(JSON.stringify({ error: 'message_id required', ok: false })); return true; }
      const idx = (conversationHistory as any[]).findIndex((t: any) => t.id === messageId);
      if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: '消息不存在或已撤回', ok: false })); return true; }
      const entry = (conversationHistory as any)[idx];
      if (Date.now() - new Date(entry.timestamp).getTime() > 30000) { res.writeHead(410); res.end(JSON.stringify({ error: '超过30秒，无法撤回', ok: false })); return true; }
      if (entry.role !== 'user') { res.writeHead(400); res.end(JSON.stringify({ error: '只能撤回自己的消息', ok: false })); return true; }
      conversationHistory.splice(idx, 1);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: (err as Error).message, ok: false })); }
    return true;
  }

  // ── 清除测试对话 ──
  if (req.method === 'POST' && url.pathname === '/api/chat/purge-test') {
    try {
      const sqlite = storage.getSQLite();
      if (sqlite) {
        sqlite.writeRaw("BEGIN");
        sqlite.writeRaw("DELETE FROM conversations WHERE is_test=1");
        const result = sqlite.queryAll("SELECT changes() as cnt");
        const count = (result[0]?.cnt || 0) as number;
        try {
          const rows = sqlite.queryAll("SELECT role, content, timestamp FROM conversations WHERE is_test = 0 OR is_test IS NULL ORDER BY rowid DESC LIMIT 100");
          sqlite.writeRaw("COMMIT");
          if (rows.length > 0) {
            deps.conversationHistory.length = 0;
            deps.conversationHistory.push(...rows.reverse().map(r => ({ role: r.role as 'user' | 'assistant', content: r.content as string, timestamp: r.timestamp as string })));
          }
        } catch (e) { sqlite.writeRaw("ROLLBACK"); throw e; }
        res.writeHead(200); res.end(JSON.stringify({ ok: true, deleted: count }));
      } else { res.writeHead(200); res.end(JSON.stringify({ ok: true, deleted: 0 })); }
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: String(err), ok: false })); }
    return true;
  }

  // ── 候选回复偏好 ──
  if (req.method === 'POST' && url.pathname === '/api/chat/prefer-candidate') {
    try {
      const body = JSON.parse(await readBody(req));
      if (m6 && body.tags && Array.isArray(body.tags)) {
        for (const tag of body.tags) { m6.prefs.recordMention(tag, 0.8); }
      }
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(200); res.end(JSON.stringify({ ok: false })); }
    return true;
  }

  // ── 聊天 SSE 流式 ──
  if (req.method === 'GET' && url.pathname === '/api/chat/stream') {
    const rawMessage = url.searchParams.get('message') || '';
    if (!rawMessage) { res.writeHead(400); res.end(JSON.stringify({ error: 'message required' })); return true; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`: keepalive\n\n`);
    res.flushHeaders?.();
    const result = await processChat(rawMessage.trim());
    const rps = result.reply || '';
    const sentences = rps.split(/(?<=[。！？\n])/g).filter(Boolean).map((s: string) => s.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(sentences.length, 3); i++) {
      res.write(`data: ${JSON.stringify({ type: 'text', content: sentences[i] })}\n\n`);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 200));
    }
    if (sentences.length > 3) {
      res.write(`data: ${JSON.stringify({ type: 'text', content: sentences.slice(3).join('') })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done', content: rps })}\n\n`);
    res.end();
    return true;
  }

  // ── 清除对话历史（仅清前端缓存，不动数据库） ──
  if (req.method === 'POST' && url.pathname === '/api/chat/clear') {
    try {
      // 只清内存中的 conversationHistory，不删数据库
      deps.conversationHistory.length = 0;
      deps.saveConversationHistory();
      console.log('[Clear] 前端缓存已清除');
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: String(err) })); }
    return true;
  }

  // ── 重置 ──
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    maintenance.stop();
    await resetPipeline();
    res.writeHead(200); res.end(JSON.stringify({ status: 'ok', message: '已重置' }));
    return true;
  }

  // ── 状态 ──
  if (req.method === 'GET' && url.pathname === '/api/status') {
    const storageStatus = await storage.getStatus().catch(() => null);
    const familySummary = await familyGraph.getFamilySummary().catch(() => ({ members: [], locations: [] }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'running', version: '0.1.0',
      conversation_turns: Math.floor(conversationHistory.length / 2),
      storage: storageStatus ? { total_records: storageStatus.totalRecords, zone_counts: storageStatus.zoneCounts, seq_pos: storageStatus.currentSeqPos } : null,
      family: { members: familySummary.members.map((m: any) => ({ name: m.name, relation: m.relation_to_user })), total: familySummary.members.length },
    }));
    return true;
  }

  // ── 对话历史（优先返回 conversationHistory，被清除后返回空） ──
  if (req.method === 'GET' && url.pathname === '/api/conversation') {
    try {
      // 🔑 优先返回内存中的 conversationHistory（尊重用户清除操作）
      //    如果内存为空（用户点过清除按钮或新窗口），不再回退到数据库
      if (deps.conversationHistory.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ turns: [] }));
        return true;
      }
      const turns = deps.conversationHistory
        .filter((t: any) => t.role === 'user' || t.role === 'assistant')
        .map((t: any) => ({ role: t.role, content: t.content, timestamp: t.timestamp }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ turns }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: (err as Error).message })); }
    return true;
  }

  return false;
}

/** 安全序列化：防止循环引用 / BigInt / undefined 等导致 JSON.stringify 抛异常 */
function _sanitizeForJSON(obj: unknown): unknown {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'undefined') return null;
    if (value && typeof value === 'object') {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }));
}

function readBody(req: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) { req.destroy(); reject(new Error('Body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// ✅ V10.0: 确保 readBodyWithBytes 被导出并被外部引用 🔴
// 此函数供 handleChatRoutes 调用，不要在最终编译产物中丢失

/** 🔧 V10.1: 读取原始字节 + 解码字符串，供字节级会晤触发使用 */
function readBodyWithBytes(req: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<{ rawBody: Buffer; text: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) { req.destroy(); reject(new Error('Body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      resolve({ rawBody, text: rawBody.toString() });
    });
    req.on('error', reject);
  });
}

/** 🔧 V10.4: 字节级会晤触发——仅在会晤未激活时触发，会中不自动切换 */
function _triggerMeetingFromBytes(rawBody: Buffer, entityMeeting: any): void {
  console.log("[V10.5] triggered, isActive=" + (entityMeeting?.isActive?.() ?? false)); if (entityMeeting?.isActive?.()) return;
  const HC = ['徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟','熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜','张小龙','罗权斌','刘运新','邱运财','陈锋华'];
  // V10.5: 文本匹配优先
  const _text = rawBody.toString('utf-8');
  try {
    const msg = JSON.parse(_text).message || '';
    for (const n of HC) {
      if (msg.includes(n)) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') text match'); return; }
      if (n.length >= 3 && msg.includes(n.slice(-2))) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') short name match'); return; }
    }
  } catch (_e) { console.log("[V10.5] JSON parse failed, falling to byte search"); }
  // 字节匹配兜底
  for (const n of HC) {
    const nb = Buffer.from(n, 'utf-8');
    if (rawBody.indexOf(nb) >= 0) { console.log("[V10.5] byte match: " + n); entityMeeting.enter(n, 0); return; }
    if (n.length >= 3) {
      const sb = Buffer.from(n.slice(-2), 'utf-8');
      if (rawBody.indexOf(sb) >= 0) { entityMeeting.enter(n, 0); return; }
    }
  }
}
