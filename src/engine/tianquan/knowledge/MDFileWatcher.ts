/**
 * MDFileWatcher.ts — MD 文件变更监测器 (V4.0 Phase 2)
 * ======================================================
 * 基于 polling 的轻量文件变更检测（每 5 分钟扫描一次）。
 * 不依赖 chokidar/fs.watch，适合 < 1000 个文件的知识库规模。
 *
 * 使用:
 *   const watcher = new MDFileWatcher(gateway);
 *   watcher.onChange((changes) => { ... });
 *   watcher.start();
 */

import type { SecondBrainGateway } from './SecondBrainGateway.js';
import type { MDFileManifest } from './types.js';

export interface FileChange {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  previousSha256?: string;
  currentSha256?: string;
  timestamp: string;
}

export type ChangeCallback = (changes: FileChange[]) => void;

export class MDFileWatcher {
  private gateway: SecondBrainGateway;
  private _pollingTimer: ReturnType<typeof setInterval> | null = null;
  private _pollingMs: number;
  private _lastSnapshots = new Map<string, string>(); // path → sha256
  private _changeQueue: FileChange[] = [];
  private _callbacks: ChangeCallback[] = [];
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(gateway: SecondBrainGateway, pollingMs = 300_000) {
    this.gateway = gateway;
    this._pollingMs = pollingMs;
  }

  start(): void {
    if (this._pollingTimer) return;
    // 首次快照
    this._takeSnapshot();
    this._pollingTimer = setInterval(() => this._poll(), this._pollingMs);
    console.log(`[MDFileWatcher] 启动 (polling=${this._pollingMs / 1000}s)`);
  }

  stop(): void {
    if (this._pollingTimer) clearInterval(this._pollingTimer);
    this._pollingTimer = null;
  }

  onChange(callback: ChangeCallback): void {
    this._callbacks.push(callback);
  }

  /** 批量获取变更（调用方可在夜间同步时消费此队列） */
  getChanges(): FileChange[] {
    const changes = [...this._changeQueue];
    this._changeQueue = [];
    return changes;
  }

  /** 手动记录一次变更（供 KnowledgeSyncPipeline 在文件操作后调用） */
  recordChange(change: FileChange): void {
    this._changeQueue.push(change);
  }

  // ─── 内部 ───

  private _takeSnapshot(): void {
    const files = this.gateway.scanWikiMDFiles();
    for (const f of files) {
      this._lastSnapshots.set(f.path, f.sha256);
    }
  }

  private _poll(): void {
    const files = this.gateway.scanWikiMDFiles();
    const currentPaths = new Set<string>();
    const changes: FileChange[] = [];

    for (const f of files) {
      currentPaths.add(f.path);
      const prevSha = this._lastSnapshots.get(f.path);
      if (prevSha === undefined) {
        // 新增
        changes.push({
          type: 'created', path: f.path,
          currentSha256: f.sha256,
          timestamp: new Date().toISOString(),
        });
      } else if (prevSha !== f.sha256) {
        // 修改
        changes.push({
          type: 'modified', path: f.path,
          previousSha256: prevSha, currentSha256: f.sha256,
          timestamp: new Date().toISOString(),
        });
      }
      this._lastSnapshots.set(f.path, f.sha256);
    }

    // 检测删除
    for (const [p] of this._lastSnapshots) {
      if (!currentPaths.has(p)) {
        changes.push({
          type: 'deleted', path: p,
          previousSha256: this._lastSnapshots.get(p),
          timestamp: new Date().toISOString(),
        });
        this._lastSnapshots.delete(p);
      }
    }

    if (changes.length > 0) {
      this._changeQueue.push(...changes);
      // 防抖 500ms 后通知回调
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        for (const cb of this._callbacks) {
          try { cb([...changes]); } catch { /* 回调异常不阻塞 */ }
        }
      }, 500);
    }
  }
}
