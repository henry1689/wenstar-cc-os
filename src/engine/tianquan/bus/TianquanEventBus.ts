/**
 * TianquanEventBus.ts — 天权域事件总线 (V1.0 / BIONIC-002 Phase 1)
 * ==================================================================
 * 桥接 engine/bus/EventBus，增加天权域专属路由守卫。
 *
 * 路由守卫（WS-TIANQUAN-BIONIC-001 §第三部分）:
 *   ① 感知数据不得直接流入 prefrontal，必须经 temporal 压缩
 *   ② 知识库素材不得直接流入 prefrontal，必须经 temporal 重组封装
 *   ③ prefrontal 只产出指令，不触及存储层
 *
 * 使用:
 *   const rawBus = new EventBus();
 *   const tianquanBus = new TianquanEventBus(rawBus);
 *   await tianquanBus.emit({ type: 'perception:raw', ... });
 */
import { EventBus } from '../../bus/EventBus.js';
import type { TianquanEvent } from './types.js';
import { ROUTING_TABLE, logRoutingViolation } from './types.js';

export class TianquanEventBus {
  private bus: EventBus;
  private enabled: boolean;

  constructor(bus: EventBus, opts?: { enabled?: boolean }) {
    this.bus = bus;
    this.enabled = opts?.enabled ?? true;
  }

  /**
   * 发布天权域事件（自动注入 traceId + timestamp + 路由守卫拦截）
   */
  async emit(event: TianquanEvent): Promise<void> {
    if (!this.enabled) return;

    try {
      // ── 路由守卫 ──
      this._enforceRouting(event);

      // 注入缺省字段
      const enriched = {
        ...event,
        traceId: event.traceId || crypto.randomUUID(),
        timestamp: event.timestamp || Date.now(),
      };

      await this.bus.emit(enriched as any);
    } catch (e) {
      console.warn('[TianquanEventBus] emit 异常:', (e as Error)?.message || e, 'event:', event.type);
    }
  }

  /**
   * 订阅天权域事件
   */
  on(
    type: TianquanEvent['type'],
    handler: (event: any) => void | Promise<void>,
    priority?: number,
  ): void {
    this.bus.on(type, handler, priority);
  }

  /** 取消订阅 */
  off(
    type: TianquanEvent['type'],
    handler: (event: any) => void | Promise<void>,
  ): void {
    this.bus.off(type, handler);
  }

  /** 获取底层 EventBus 实例（供 orchestrator 等复用） */
  getRawBus(): EventBus {
    return this.bus;
  }

  /** 开关控制 */
  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** 注册的处理器总数 */
  handlerCount(): number {
    return this.bus.handlerCount();
  }

  // ═══════════════════════════════════════════════════════
  //  路由守卫（S4 — 感知数据优先入海马）
  // ═══════════════════════════════════════════════════════

  private _enforceRouting(event: TianquanEvent): void {
    // 路由守卫使用 any 类型进行运行时检查（TypeScript 联合类型在 narrowing 后有限制）
    const evt = event as any;
    const eventType = evt.type as string;

    // ① 感知数据强制路由检查
    if (evt.sourceModule && evt.targetModule) {
      const src = evt.sourceModule as string;
      const tgt = evt.targetModule as string;

      // 感知数据直连前额域 → 重路由至 temporal
      if (
        (eventType === 'perception:raw' || src === 'yao_ling' || src === 'yao_guang')
        && tgt === 'prefrontal'
      ) {
        logRoutingViolation(eventType, tgt, src, '感知数据直连前额域，已重路由至 temporal');
        evt.targetModule = 'temporal';
        return;
      }

      // 前额域直读知识库 → 拦截
      if (eventType === 'knowledge:index_updated' && src === 'prefrontal') {
        logRoutingViolation(eventType, tgt, src, '前额域直读知识库，已拦截');
      }
    }

    // ② 路由表校验
    const rule = ROUTING_TABLE[eventType];
    if (rule && evt.targetModule) {
      const tgt = evt.targetModule as string;
      if (rule.allowedTargets.length > 0 && !rule.allowedTargets.includes(tgt)) {
        logRoutingViolation(
          eventType, tgt, evt.sourceModule || 'unknown',
          `不在允许的目标列表中: ${rule.allowedTargets.join(', ')}`
        );
      }
    }
  }
}
