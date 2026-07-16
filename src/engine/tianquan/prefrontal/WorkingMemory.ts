/**
 * WorkingMemory.ts — 仿生工作记忆寄存器 (V3.2 / BIONIC-002 Phase C)
 * =================================================================
 * 模仿前额叶皮层的"思维桌面"——固定容量、LRU 驱逐、运算结束自动清空。
 *
 * 仿生特性:
 *   - 固定 7 槽位，不能动态扩容（模仿人脑 7±2 信息块上限）
 *   - LRU 驱逐策略：槽位满时淘汰最久未访问的
 *   - afterResponse() 全部清空（模仿"运算结束自动复位"）
 *   - 每次访问更新槽位时间戳
 *
 * 使用:
 *   const wm = new WorkingMemory();
 *   wm.load(snapshot);       // 加载场景快照
 *   const snap = wm.get(0);  // 读取槽位
 *   wm.discard(2);           // 舍弃指定槽位
 *   wm.clearAll();           // afterResponse() 调用
 */

import type { SceneSnapshot } from '../temporal/types.js';
import type { WorkingMemorySlot, WorkingMemoryState } from './types.js';

const MAX_SLOTS = 7;

export class WorkingMemory {
  private slots: WorkingMemorySlot[];
  // V4.0 Phase 3: 槽位利用率监控
  private _totalLoads = 0;
  private _totalEvictions = 0;
  private _firstLoadAt = 0;

  constructor() {
    this.slots = Array.from({ length: MAX_SLOTS }, (_, i) => ({
      slotId: i,
      occupied: false,
      status: 'discarded' as const,
      loadedAt: 0,
      intermediateResults: [],
    }));
  }

  /**
   * 加载一个 SceneSnapshot 到最合适的槽位。
   * 优先填空槽位，无空位则 LRU 驱逐。
   * @returns 分配的槽位编号
   */
  load(snapshot: SceneSnapshot): number {
    // 1. 找空槽位
    const emptySlot = this.slots.find(s => !s.occupied);
    if (emptySlot) {
      emptySlot.snapshot = snapshot;
      emptySlot.occupied = true;
      emptySlot.status = 'loading';
      emptySlot.loadedAt = Date.now();
      emptySlot.intermediateResults = [];
      this._totalLoads++;if(!this._firstLoadAt)this._firstLoadAt=Date.now();return emptySlot.slotId;
    }

    // 2. 无空位 → LRU 驱逐
    const lruSlot = this.slots
      .filter(s => s.occupied)
      .reduce((oldest, s) => (s.loadedAt < oldest.loadedAt ? s : oldest));

    lruSlot.snapshot = snapshot;
    lruSlot.status = 'loading';
    lruSlot.loadedAt = Date.now();
    lruSlot.intermediateResults = [];
    this._totalLoads++;this._totalEvictions++;return lruSlot.slotId;
  }

  /**
   * 获取指定槽位的快照并更新访问时间
   */
  get(slotId: number): SceneSnapshot | null {
    const slot = this.slots.find(s => s.slotId === slotId);
    if (!slot || !slot.occupied) return null;
    slot.loadedAt = Date.now(); // LRU 刷新
    return slot.snapshot ?? null;
  }

  /**
   * 设置槽位的推演状态
   */
  setStatus(slotId: number, status: WorkingMemorySlot['status']): void {
    const slot = this.slots.find(s => s.slotId === slotId);
    if (slot) slot.status = status;
  }

  /**
   * 向指定槽位追加推演中间结果
   */
  appendResult(slotId: number, result: string): void {
    const slot = this.slots.find(s => s.slotId === slotId);
    if (slot && slot.occupied) {
      slot.intermediateResults.push(result);
    }
  }

  /**
   * 丢弃指定槽位
   */
  discard(slotId: number): void {
    const slot = this.slots.find(s => s.slotId === slotId);
    if (slot) {
      slot.occupied = false;
      slot.snapshot = undefined;
      slot.status = 'discarded';
      slot.loadedAt = 0;
      slot.intermediateResults = [];
    }
  }

  /**
   * 清空所有槽位（afterResponse 调用）
   */
  clearAll(): void {
    for (const slot of this.slots) {
      slot.occupied = false;
      slot.snapshot = undefined;
      slot.status = 'discarded';
      slot.loadedAt = 0;
      slot.intermediateResults = [];
    }
  }

  /**
   * 获取当前工作记忆全局状态
   */
  getUsageStats(): {totalLoads:number;totalEvictions:number;avgSlotLifetimeMs:number;uptimeMs:number} {const uptime=this._firstLoadAt?Date.now()-this._firstLoadAt:0;const avgLife=this._totalLoads>0?uptime/this._totalLoads:0;return {totalLoads:this._totalLoads,totalEvictions:this._totalEvictions,avgSlotLifetimeMs:Math.round(avgLife),uptimeMs:uptime};}
getState(): WorkingMemoryState {
    const activeSlots = this.slots.filter(s => s.occupied).length;
    return {
      maxSlots: MAX_SLOTS,
      activeSlots,
      slots: this.slots.map(s => ({ ...s })),
      evictionPolicy: 'lru',
    };
  }

  /**
   * 是否还有可用槽位
   */
  canLoad(): boolean {
    return this.slots.some(s => !s.occupied);
  }

  /**
   * 获取所有已加载的快照（按钙化排序，优先高钙化的）
   */
  getActiveSnapshots(): SceneSnapshot[] {
    return this.slots
      .filter(s => s.occupied && s.snapshot)
      .map(s => s.snapshot!)
      .sort((a, b) => (b.calciumScore ?? 0) - (a.calciumScore ?? 0));
  }

  /**
   * 获取所有活跃槽位（含中间结果）
   */
  getActiveSlots(): WorkingMemorySlot[] {
    return this.slots
      .filter(s => s.occupied)
      .map(s => ({ ...s }));
  }

  /** 活跃槽位数 */
  get activeCount(): number {
    return this.slots.filter(s => s.occupied).length;
  }

  /** 总槽位数 */
  get capacity(): number {
    return MAX_SLOTS;
  }
}
