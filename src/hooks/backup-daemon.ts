/**
 * Hook 内存状态导出兜底
 *
 * 轻量定时导出 hookMonitor 内存状态 → 本地 JSON
 * 重启自动恢复 → 保证调试期监控数据不丢失
 *
 * 零侵入：不修改 Hook 探针核心逻辑、不依赖 DB 表
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const BACKUP_PATH = join(DATA_DIR, 'webui', 'hooks', 'hook-monitor-backup.json');

// ── 类型 ──
export interface HookState {
  name: string;
  callCount: number;
  errorCount: number;
  totalDuration: number;
  lastHeartbeat: number;
  lastStatus: string;
  recentDurations: number[];
  lastError: string | null;
}

export interface HookSnapshot {
  _exportedAt: string;
  _version: 1;
  hooks: Record<string, HookState>;
}

// ── 导出 ──
export function exportHookMonitor(hookMonitor: Map<string, HookState>): void {
  try {
    const obj: Record<string, HookState> = {};
    for (const [id, state] of hookMonitor) {
      obj[id] = { ...state };
    }
    const snapshot: HookSnapshot = {
      _exportedAt: new Date().toISOString(),
      _version: 1,
      hooks: obj,
    };
    const dir = dirname(BACKUP_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(BACKUP_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[HookBackup] 导出失败:', (err as Error).message);
  }
}

// ── 导入恢复 ──
export function importHookMonitor(hookMonitor: Map<string, HookState>): number {
  try {
    if (!existsSync(BACKUP_PATH)) return 0;
    const raw = readFileSync(BACKUP_PATH, 'utf-8');
    const snapshot: HookSnapshot = JSON.parse(raw);
    if (snapshot._version !== 1) return 0;

    let restored = 0;
    for (const [id, state] of Object.entries(snapshot.hooks)) {
      if (hookMonitor.has(id)) {
        // 合并：保留现有 name（可能重启间有变更），恢复计数
        const existing = hookMonitor.get(id)!;
        existing.callCount = state.callCount;
        existing.errorCount = state.errorCount;
        existing.totalDuration = state.totalDuration;
        existing.lastHeartbeat = state.lastHeartbeat;
        existing.lastStatus = state.lastStatus;
        existing.recentDurations = state.recentDurations;
        existing.lastError = state.lastError;
        restored++;
      }
    }
    console.log(`[HookBackup] 恢复 ${restored} 个探针状态 (from ${BACKUP_PATH})`);
    return restored;
  } catch (err) {
    console.warn('[HookBackup] 恢复失败:', (err as Error).message);
    return 0;
  }
}

// ── 定时器启动 ──
let _timer: ReturnType<typeof setInterval> | null = null;

export function startBackupDaemon(hookMonitor: Map<string, HookState>, intervalMs = 300000): void {
  if (_timer) return;
  // 立即导出一次
  exportHookMonitor(hookMonitor);
  _timer = setInterval(() => exportHookMonitor(hookMonitor), intervalMs);
  console.log(`[HookBackup] 定时导出已启动 (${intervalMs / 1000}s)`);
}

export function stopBackupDaemon(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
