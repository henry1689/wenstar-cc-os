/**
 * SafetyInterceptor — 脑干反射层·安全拦截器
 *
 * 最高优先级拦截器，在输入进入分类系统之前拦截。
 * 违禁内容、身份攻击、极端内容 → 直接短路，不进入上层
 *
 * V4.0 Phase 4: 规则从 2 组 (~12条) 扩展到 6 组 (~35条)
 */
import type { IEventBus, ILifecycle, IStorageProvider } from '../types.js';
import type { OutputFinalizedEvent, UserInputEvent } from '../bus/types.js';

const BLOCKED_PATTERNS = [
  // ── 人身攻击 ──
  /自杀|自残|我要死|不想活了|杀了我|nmsl|畜生|操你妈|操你祖宗/i,
  /fuck you mother|kill myself|i want to die|self.?harm/i,

  // ── V4.0 新增: 隐私泄露检测 ──
  /1[3-9]\d{9}/,                                    // 手机号
  /\d{6}(19|20)\d{2}(0[1-9]|1[0-2])\d{4}[\dXx]/,   // 18位身份证
  /\d{15}(\d{2}[0-9Xx])?/,                           // 15或18位身份证(宽松)
  /(\d{3,4}[-.]?\d{7,8})/,                            // 固话
  /(\d{16}|\d{19})/,                                   // 银行卡号

  // ── V4.0 新增: 自我伤害 ──
  /割腕|跳楼|上吊|跳海|自焚|服毒|卧轨/i,
  /不想.*活下去|活着.*没意思|解脱/i,
  /全都.*一样.*没意义|世界.*抛弃|再.*也.*不用.*醒/i,

  // ── V4.0 新增: 未成年人保护 ──
  /未满(\d{1,2})岁|才(\d{1,2})岁|不到(\d{1,2})岁.*在一起/i,
  /未成年人.*亲热|未成年.*恋爱|小学生.*谈恋爱/i,
];

const EXTREME_REDLINE = [
  // 原有
  /去死|弄死你|你.*去死/i,

  // V4.0 新增: 极端暴力
  /杀你全家|灭门|碎尸|分尸|剁成.*肉泥/i,
  /恐怖组织|炸弹.*制作|制造.*枪/i,
  /强奸|轮奸|迷奸|强暴/i,
  /人肉搜索|曝光.*隐私.*报复/i,

  // V4.0 新增: 儿童性虐待 (CSAM)
  /儿童.*色情|幼女|幼童.*性|恋童.*资源/i,
  /child.*porn|cp.*资源|炼铜/i,
];

// V4.0 新增: 轻度警告（不拦截，仅日志记录）
const WARN_PATTERNS = [
  /色情|黄色|成人.*内容|成人.*网站/i,
  /赌博|赌场|博彩/i,
  /毒品|吸毒|贩毒|海洛因|冰毒|大麻.*交易/i,
];

export class SafetyInterceptor implements ILifecycle {
  private bus: IEventBus | null = null;
  private _boundHandleInput: ((event: any) => void) | null = null;

  async init(bus: IEventBus, _storage?: IStorageProvider): Promise<void> {
    this.bus = bus;
    // 最高优先级：100（必须最先执行）
    this._boundHandleInput = this.handleInput.bind(this);
    bus.on('user:input', this._boundHandleInput, 100);
  }

  reset(): void {}
  destroy(): void {
    if (this.bus && this._boundHandleInput) {
      this.bus.off('user:input', this._boundHandleInput);
    }
    this.bus = null;
    this._boundHandleInput = null;
  }

  private handleInput = async (event: UserInputEvent): Promise<void> => {
    const text = event.payload.content;

    // 红线拦截 — 直接短路
    for (const pattern of EXTREME_REDLINE) {
      if (pattern.test(text)) {
        console.log(`[Safety] 🔴 红线拦截: traceId=${event.traceId}`);
        this.emitBlocked(event, '极端内容已拦截，如需帮助请联系专业人员');
        return;
      }
    }

    // 违禁内容拦截
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(text)) {
        console.log(`[Safety] 🟡 违禁拦截: traceId=${event.traceId}`);
        this.emitBlocked(event, '检测到敏感内容，已自动拦截。如需帮助请联系专业人员');
        return;
      }
    }

    // V4.0 轻度警告（不拦截，仅记录）
    for (const pattern of WARN_PATTERNS) {
      if (pattern.test(text)) {
        console.warn(`[Safety] ⚠️ 敏感话题: traceId=${event.traceId}`);
        break; // 一个话题只需记录一次
      }
    }
  };

  private emitBlocked(event: UserInputEvent, message: string): void {
    const output: OutputFinalizedEvent = {
      type: 'output:finalized',
      traceId: event.traceId,
      timestamp: Date.now(),
      sessionId: event.sessionId,
      payload: {
        content: message,
        renderType: 'text',
        shouldPersist: false,
      },
    };
    // 设置短路标记——后续 handler 不再执行
    (this.handleInput as any).skipRemaining = true;
    this.bus?.emit(output);
  }
}
