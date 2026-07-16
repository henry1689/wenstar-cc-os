/**
 * PrefrontalCortex.ts — 前额叶决策皮层 (V1.0 / BIONIC-002 Phase 1)
 * ==================================================================
 * 全域唯一顶层指挥中心。接收 SceneSnapshot，编排五子模块，产出 PrefrontalDirective。
 *
 * 仿生编排流程（WS-TIANQUAN-BIONIC-001 §第三部分）:
 *   ① WorkingMemory.load(snapshot)          — 加载到"思维桌面"
 *   ② GoalStack.setImmediate(intent)        — 解析当前意图
 *   ③ ConstraintValidator.validate(input)   — 五维约束校验
 *   ④ DirectiveGenerator.generate(...)       — 编码执行指令
 *   ⑤ afterResponse(...)                     — 运算结束清空 + 复盘
 *
 * 硬性职责边界:
 *   - 禁止生成场景、渲染画面、调取底层记忆素材
 *   - 禁止存储海量会话/知识/时序原始数据
 *   - 仅存放目标栈、约束规则、短时工作内存
 *
 * 使用:
 *   const cortex = new PrefrontalCortex(wm, gs, cv, dg, mc);
 *   const output = await cortex.process({ snapshot, sessionId, rawInput: message });
 *   // ... M3/M4/M5 处理 ...
 *   await cortex.afterResponse(output.directive, outcome);
 */
import type { SceneSnapshot } from '../temporal/types.js';
import type {
  PrefrontalInput, PrefrontalOutput, PrefrontalDirective,
  ActualOutcome, MetacognitionSummary,
  ConstraintInput,
} from './types.js';
import type { M3Decision } from '../../../m3/types/perception.js';
import type { CoreMemoryManager } from '../temporal/CoreMemoryManager.js';
import type { KnowledgeAccessFacade } from '../temporal/KnowledgeAccessFacade.js';
import type { SceneSnapshotBuilder } from '../temporal/SceneSnapshotBuilder.js';
import { WorkingMemory } from './WorkingMemory.js';
import { GoalStack } from './GoalStack.js';
import { ConstraintValidator } from './ConstraintValidator.js';
import { DirectiveGenerator } from './DirectiveGenerator.js';
import { MetacognitionReview } from './MetacognitionReview.js';

export class PrefrontalCortex {
  public readonly workingMemory: WorkingMemory;
  public readonly goalStack: GoalStack;
  public readonly constraintValidator: ConstraintValidator;
  public readonly directiveGenerator: DirectiveGenerator;
  public readonly metacognitionReview: MetacognitionReview;

  private bus: { emit: (event: any) => Promise<void> } | null = null;

  // ── V4.0 Phase 6: 新依赖（通过 setter 注入，未注入时从 globalThis 兜底）──
  private _coreMemoryManager: CoreMemoryManager | null = null;
  private _knowledgeAccessFacade: KnowledgeAccessFacade | null = null;
  private _snapshotBuilder: SceneSnapshotBuilder | null = null;
  private _cortexOrchestrator: any = null;

  constructor(
    wm: WorkingMemory,
    gs: GoalStack,
    cv: ConstraintValidator,
    dg: DirectiveGenerator,
    mc: MetacognitionReview,
  ) {
    this.workingMemory = wm;
    this.goalStack = gs;
    this.constraintValidator = cv;
    this.directiveGenerator = dg;
    this.metacognitionReview = mc;
  }

  /**
   * 设置事件总线（可选注入，不阻塞主流程）
   */
  setEventBus(bus: { emit: (event: any) => Promise<void> }): void {
    this.bus = bus;
  }

  /** V4.0 Phase 6: 注入 CoreMemoryManager（未注入时 process() 内部从 globalThis 兜底） */
  setCoreMemoryManager(cm: CoreMemoryManager): void { this._coreMemoryManager = cm; }
  /** V4.0 Phase 6: 注入 KnowledgeAccessFacade */
  setKnowledgeAccessFacade(facade: KnowledgeAccessFacade): void { this._knowledgeAccessFacade = facade; }
  /** V4.0 Phase 6: 注入 SceneSnapshotBuilder */
  setSnapshotBuilder(builder: SceneSnapshotBuilder): void { this._snapshotBuilder = builder; }
  /** V4.0 Phase 6: 注入 GenerationOrchestrator */
  setCortexOrchestrator(co: any): void { this._cortexOrchestrator = co; }

  /**
   * 【主入口】处理单轮对话输入
   *
   * 编排流程:
   *   ① wm.load(snapshot)          — 加载到工作记忆
   *   ② goals.setImmediate(intent) — 设定即时意图
   *   ③ validator.validate(input)  — 五维约束校验
   *   ④ directiveGen.generate(...) — 生成执行指令
   */
  async process(
    input: PrefrontalInput,
    decision?: M3Decision | null,
  ): Promise<PrefrontalOutput> {
    // V4.0 Phase 3: recordActivity — 从 chat.ts 迁移到 PFC 统一编排
    (globalThis as any).__sleepTimeConsolidator?.recordActivity?.();

    // ① 加载场景快照到工作记忆
    this.workingMemory.load(input.snapshot);

    // ② 解析意图，设定即时目标
    const intent = this._inferIntent(input.rawInput);
    this.goalStack.setImmediate(intent);

    // ③ 构建约束输入并执行五维校验
    const constraintInput = await this._buildConstraintInput(input);
    const constraints = this.constraintValidator.validate(constraintInput);

    // ④ 生成执行指令（使用传入的 decision 或默认值）
    const directive = this.directiveGenerator.generate(
      decision || this._defaultDecision(),
      constraints,
      this.goalStack.getState(),
    );

    // V4.0 Phase 3: 组装上下文 — 将 PFC 守卫消息 + 外部上下文块合并为 assembledContext
    const pfcGuards = this.constraintValidator.buildGuardMessages(constraints, constraintInput);
    if (pfcGuards) {
      directive.payload['guardMessages'] = pfcGuards;
    }
    // 合并外部上下文块（CoreMemory / 经验 / 情绪 / 时空），按 priority 降序排列
    if (input.contextBlocks && input.contextBlocks.length > 0) {
      const sorted = [...input.contextBlocks].sort((a, b) => b.priority - a.priority);
      directive.payload['assembledContext'] = sorted.map(b => b.content).join('\n\n');
    }

    // V4.0 Phase 4: 前瞻模拟 — 新颖场景时预判用户可能反应
    try {
      const novelty = input.snapshot?.novelty;
      if (novelty && novelty.multiplier > 1.0) {
        const sim = (globalThis as any).__prospectiveSimulator;
        if (sim && typeof sim.simulate === 'function') {
          const persons = input.snapshot?.entities?.persons || [];
          const emotionTag = (input.snapshot?.emotion?.pleasure ?? 0) > 0.2 ? 'pos'
            : (input.snapshot?.emotion?.pleasure ?? 0) < -0.2 ? 'neg' : 'neu';
          const simResult = sim.simulate(
            { topic: intent, entities: persons, emotion: emotionTag },
            input.rawInput.substring(0, 30)
          );
          if (simResult.confidence > 0.3 && simResult.matchedScenes >= 2) {
            const simCtx = `【前瞻模拟】相似场景: ${simResult.matchedScenes}个 | `
              + `预测趋势: ${simResult.predictedOutcome || '不确定'} `
              + `(置信${Math.round(simResult.confidence * 100)}%) | `
              + `备选: ${(simResult.alternatives || []).join(' / ') || '无'}`;
            directive.payload['simulation'] = simCtx;
          }
        }
      }
    } catch { /* 模拟不可用不阻塞 */ }

    // V4.0 Phase 4: 推送 PFC 事件到 SSE 客户端
    if (typeof (globalThis as any).broadcastEvent === 'function') {
      (globalThis as any).broadcastEvent('pfc-directive', {
        type: directive.type,
        priority: directive.priority,
        intent,
        constraints: constraints.passed ? 'passed' : 'violated',
        violations: constraints.violations.length,
        time: new Date().toISOString(),
      });
    }

    // V4.0 Phase 2: 发布前额指令事件，打通 TianquanEventBus 正向流
    // V4.0 Phase 5: 同步推送到 GlobalBus (:9100)，打通PFC→yaoling下行链路
    try { const _gb = (globalThis as any).__globalBusClient; if (_gb && typeof _gb.publish === "function") { _gb.publish('prefrontal:directive', { directive: directive.type, intent, priority: directive.priority, sessionId: input.sessionId, timestamp: Date.now() }).catch(() => {}); } } catch { /* GlobalBus不可用不阻塞 */ }
    this.bus?.emit?.({
      type: 'prefrontal:directive_issued',
      traceId: `pfc_${Date.now().toString(36)}`,
      timestamp: Date.now(),
      sessionId: input.sessionId,
      payload: {
        directive,
        sourceModule: 'prefrontal',
        workingMemoryState: { activeSlots: this.workingMemory.activeCount, evictionPolicy: 'lru' },
      },
    }).catch(() => {});

    return {
      directive,
      wmState: this.workingMemory.getState(),
    };
  }

  /**
   * 构建约束校验所需的完整上下文
   */
  async buildConstraintInput(input: PrefrontalInput): Promise<ConstraintInput> {
    return this._buildConstraintInput(input);
  }

  /**
   * 构建统一守卫消息（供 chat.ts 替换 allGuardMsgs 合并逻辑）
   * (从 chat.ts L1622 迁移)
   */
  buildGuardMessages(input: ConstraintInput): string {
    const result = this.constraintValidator.validate(input);
    return this.constraintValidator.buildGuardMessages(result, input);
  }

  /**
   * 交互后复盘（由 chat.ts 在 M5 完成后调用）
   *   ① 元认知复盘（预测 vs 实际）
   *   ② 清空工作记忆
   *   ③ 可选推送梦境引擎
   */
  async afterResponse(
    directive: PrefrontalDirective,
    outcome: ActualOutcome,
  ): Promise<MetacognitionSummary> {
    const summary = this.metacognitionReview.review(directive, outcome);

    // 推送梦境引擎
    if (summary.worthSubmitting && this.bus) {
      await this.metacognitionReview.submitToDreamEngine(summary, this.bus).catch(() => {});
    }

    // 运算结束 → 清空工作记忆 + 重置即时意图
    this.workingMemory.clearAll();
    this.goalStack.clearImmediate();

    return summary;
  }

  /**
   * 角色路由（从 chat.ts L511-523 classifyRole + evaluateTransition 迁移）
   * Phase 3 接入真实的 RoleClassifier / TransitionManager
   */
  classifyCurrentRole(input: {
    message: string;
    perception: Record<string, number>;
    entities: Array<{ name: string; type: string }>;
    previousRole: string;
    previousTransitionState: Record<string, unknown>;
  }): { role: string; transitionState: Record<string, unknown> } {
    // Phase 3: 替换为真实的 RoleClassifier + TransitionManager 调用
    // 目前返回默认角色
    const role = input.previousRole || 'secretary';
    return {
      role,
      transitionState: {
        ...input.previousTransitionState,
        consecutiveIntimate: 0,
      },
    };
  }

  /**
   * 获取当前状态快照（供 API 查询）
   */
  getStatus(): Record<string, unknown> {
    const wmUsage = this.workingMemory.getUsageStats();
    return {
      workingMemory: {
        activeSlots: this.workingMemory.activeCount,
        capacity: this.workingMemory.capacity,
        // V4.0 Phase 3: 槽位利用率监控
        usage: {
          totalLoads: wmUsage.totalLoads,
          totalEvictions: wmUsage.totalEvictions,
          avgSlotLifetimeMs: wmUsage.avgSlotLifetimeMs,
          uptimeMs: wmUsage.uptimeMs,
          evictionRate: wmUsage.uptimeMs > 0
            ? Math.round(wmUsage.totalEvictions / (wmUsage.uptimeMs / 60000)) + '/min'
            : '0/min',
        },
      },
      goalStack: this.goalStack.getState(),
      busReady: !!this.bus,
    };
  }

  // ═══════════════════════════════════════════════════════
  //  内部
  // ═══════════════════════════════════════════════════════

  /** 意图推断（Phase 1 增强，Phase 4 建议与 MasterHarris.classifyIntent 统一）
   *  @note MasterHarris 决定"发往哪个域"，PFC 决定"用什么策略处理"。
   *  建议合并为 IntentClassifier → {targetDomain, processingStrategy, confidence} */
  /** @deprecated Phase 6: 统一到 MasterHarris.classifyIntent — 三套分类器合并为 IntentClassifier */
  private _inferIntent(rawInput: string): string {
    if (/^(你好|嗨|哈[喽啰]|hi|hello)/i.test(rawInput)) return '问候';
    if (/[？?]/.test(rawInput) && /什么|怎么|为什么|谁|哪|多少|如何/.test(rawInput)) return '回答问题';
    if (/(谢谢|感谢|多谢)/.test(rawInput)) return '回应感谢';
    if (/(再见|拜拜|bye)/i.test(rawInput)) return '结束对话';
    if (/(帮我|帮忙|我要|我想|请你|麻烦你)/.test(rawInput)) return '请求协助';
    if (/(扮演|模仿|演一下|cos)/.test(rawInput)) return '角色扮演请求';
    if (/(忘掉|忘记|删除|不提|别再提|不要再提)/.test(rawInput)) return '遗忘指令';
    if (/(开心|难过|生气|焦虑|紧张|害怕|高兴|伤心)/.test(rawInput)) return '情绪表达';
    if (/(好的|嗯|哦|行|可以|知道了|明白了|懂了)/i.test(rawInput)) return '确认/回应';
    if (rawInput.length > 100) return '长篇叙述';
    return '日常对话';
  }

  /** 构建约束校验输入（V4.0 Phase 2: 融合三源数据） */
  async _buildConstraintInput(input: PrefrontalInput): Promise<ConstraintInput> {
    // 🔥 从 globalThis 接入真实数据源（HeartStateStore / FamilyGraph / 会话状态）
    const heartState: any = (globalThis as any).__heartStateStore;
    const fg: any = (globalThis as any).__familyGraph;
    const _cr: string | null = (globalThis as any).__currentRoleplay || null;

    // 情感向量：优先读 HeartStateStore，其次用 snapshot 自带 emotion，最后默认值
    const snapshot = input.snapshot;
    let emotionVector = this._getDefaultEmotionVector();
    if (heartState && typeof heartState.getState === 'function') {
      try {
        const hs = heartState.getState();
        if (hs && hs.emotionVector) {
          emotionVector = { ...hs.emotionVector };
        }
      } catch { /* 静默降级 */ }
    } else if (snapshot?.emotion) {
      emotionVector = {
        ...emotionVector,
        joy: (snapshot.emotion.pleasure > 0 ? snapshot.emotion.pleasure : 0) * 50 + 30,
        sadness: (snapshot.emotion.pleasure < 0 ? -snapshot.emotion.pleasure : 0) * 50,
        affection: snapshot.emotion.intimacy * 50,
        arousal: snapshot.emotion.arousal > 0 ? snapshot.emotion.arousal * 50 : 10,
        trust: 30,
        calm: 50,
      };
    }

    // 🔥 V4.0 Phase 2: 融合瑶灵 32D 体感 + 瑶光 6D 环境 → 增强情感向量
    try {
      const { SensationAdapter } = require('./SensationAdapter.js') as typeof import('./SensationAdapter.js');
      const { somatic, env } = SensationAdapter.getLatestSnapshots();
      if (somatic || env) {
        const enhanced = SensationAdapter.enhance(emotionVector, somatic, env);
        emotionVector = enhanced.emotionVector;
      }
    } catch { /* SensationAdapter 不可用不阻塞 */ }

    // 家族上下文：从 FamilyGraph 读取人物关系
    const familyContext: Array<{ entity: string; relation: string }> = [];
    if (fg && typeof fg.getFamilySummary === 'function') {
      try {
        const summary = await fg.getFamilySummary();
        if (summary?.members) {
          for (const m of summary.members) {
            if (m.name && m.relation_to_user) {
              familyContext.push({ entity: m.name, relation: m.relation_to_user });
            }
          }
        }
      } catch { /* 静默降级 */ }
    }

    // 会话历史：从 globalThis 获取（由 chat.ts 注入）
    const conversationHistory: Array<{ role: string; content: string }> =
      (globalThis as any).__pfcConversationContext || [];

    return {
      message: input.rawInput,
      snapshot: input.snapshot,
      goalState: this.goalStack.getState(),
      emotionVector,
      familyContext,
      socialContext: [],
      conversationHistory,
      currentRoleplay: _cr,
      isRoleplaying: !!_cr,
    };
  }

  /** 默认情感向量（Phase 2 替换为 HeartStateStore 真实值） */
  private _getDefaultEmotionVector(): Record<string, number> {
    return {
      joy: 30, sadness: 0, anger: 0, fear: 0, surprise: 10, disgust: 0,
      calm: 50, anxiety: 0, affection: 20, trust: 30, intimacy: 10, respect: 20,
      arousal: 10, fatigue: 10, excitement: 10, boredom: 0, dominance: 0,
      compliance: 10, warmth: 30, coldness: 0, nostalgia: 0, curiosity: 20,
      shyness: 0, jealousy: 0,
    };
  }

  /** 默认 M3Decision（Phase 2 替换为真实的 M3 输入） */
  private _defaultDecision(): M3Decision {
    return {
      enhanced: {
        branch_id: 'default',
        locus_path: 'root.default',
        raw_input: '',
        entity_genes: [],
        perception: this._getDefaultEmotionVector() as any,
        calcium_score: 0.5,
        calcium_level: 1,
      } as any,
      actions: [],
      reason: 'default',
      timestamp: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════
  //  V4.0 Phase 6: 上下文组装方法（从 chat.ts 迁移）
  //  每个方法保留原始逻辑不变，仅将 globalThis 写入改为 return 值
  // ═══════════════════════════════════════════════════════

  /** 获取 SQLite 句柄（优先注入，降级到 globalThis） */
  private _getSQLite(): any {
    return this._coreMemoryManager
      ? (this._coreMemoryManager as any)._sqlite
      : (globalThis as any).__coreMemory?.getSQLite?.() || null;
  }

  /**
   * ① 构建 CoreMemory 上下文块（从 chat.ts L1904-1924 迁移）
   * @returns CoreMemory 上下文窗口文本
   */
  private async _buildCoreMemory(
    currentRoleplay: string | null,
    ctxM4: any,
    message: string,
  ): Promise<{ contextWindow: string }> {
    const _cm = this._coreMemoryManager || (globalThis as any).__coreMemory;
    if (!_cm) return { contextWindow: '' };

    try {
      // 每10轮刷新画像
      if (typeof _cm.refreshFromProfile === 'function') {
        _cm.refreshFromProfile().catch(() => {});
      }
      // 刷新会话摘要
      if (typeof _cm.refreshFromSession === 'function') {
        _cm.refreshFromSession(message.substring(0, 80));
      }
      let contextWindow = typeof _cm.getContextWindow === 'function'
        ? _cm.getContextWindow() : '';

      // 角色扮演模式：用角色身份覆写 CoreMemory persona 块
      if (currentRoleplay && typeof _cm.setRoleplayOverride === 'function') {
        try {
          const _rpRelCtx = this._buildRoleRelationContext(ctxM4, currentRoleplay);
          _cm.setRoleplayOverride(currentRoleplay, _rpRelCtx);
          contextWindow = _cm.getContextWindow();
        } catch { /* 覆写失败不影响主流程 */ }
      }
      return { contextWindow };
    } catch (e) {
      console.warn('[PFC::CoreMemory] 构建失败:', (e as Error)?.message || e);
      return { contextWindow: '' };
    }
  }

  /** 对于 CoreMemory 覆写：从 M4 上下文中获取角色关系信息 */
  private _buildRoleRelationContext(ctxM4: any, charName: string): string {
    try {
      // 从 M4 家族上下文中查找该角色的关系信息
      const fgContext = ctxM4?.family_context || [];
      const related = fgContext.filter((c: any) =>
        c && (c.entity === charName || c.related_entity === charName));
      if (related.length > 0) {
        return related.map((r: any) =>
          `${r.entity || ''}是${r.relation || '相关人物'}(${r.relation_type || 'social'})`)
          .join('；');
      }
    } catch { /* 静默降级 */ }
    return '';
  }

  /**
   * ② 构建海马体经验摘要（从 chat.ts L1926-1963 迁移）
   *   Facade 优先 → HippocampalIndex 兜底
   */
  private async _buildExperienceSummary(
    entities: string[],
    perception: { pleasure: number; arousal: number; intimacy: number },
    sceneTags: string[] | undefined,
    message: string,
  ): Promise<string | null> {
    let facadeUsed = false;

    // 路径 A: KnowledgeAccessFacade
    const facade = this._knowledgeAccessFacade || (globalThis as any).__knowledgeAccessFacade;
    if (facade && typeof facade.queryByContext === 'function') {
      try {
        const facadeResult = await facade.queryByContext({
          message,
          entities: entities.length > 0 ? entities.slice(0, 5) : [],
          perception: {
            pleasure: perception?.pleasure ?? 0,
            arousal: perception?.arousal ?? 0,
            intimacy: perception?.intimacy ?? 0,
          },
          sceneTags, topK: 5,
        });
        if (facadeResult?.experienceSummary) {
          facadeUsed = true;
          return facadeResult.experienceSummary;
        }
      } catch { /* Facade失败→HippocampalIndex兜底 */ }
    }

    // 路径 B: HippocampalIndex 兜底
    if (!facadeUsed) {
      try {
        const _sqlite = this._getSQLite();
        if (_sqlite && message) {
          const { HippocampalIndex } = await import('../../../app/brain/HippocampalIndex.js');
          const hIdx = new HippocampalIndex(_sqlite);
          const firstWord = (message.match(/[一-龥]{2,4}/g) || [])
            .find((w: string) => w.length >= 2 && !'的了在是我有不和就'.includes(w));
          if (firstWord) {
            return hIdx.lookupExperienceByKeyword(firstWord) || null;
          }
        }
      } catch (e) {
        console.warn('[PFC::ExperienceSummary] 经验摘要查询失败', (e as Error)?.message || e);
      }
    }
    return null;
  }

  /**
   * ③ 构建情绪调节上下文（从 chat.ts L1965-1979 迁移）
   *   查相似经验 → 输出安抚建议
   */
  private _buildEmotionRegulation(
    perception: { pleasure: number; arousal: number; intimacy: number },
    emotionalMemories: any[],
  ): string | null {
    try {
      const _sqlite = this._getSQLite();
      if (!_sqlite || emotionalMemories.length === 0 || !perception) return null;

      // 动态 import — EmotionRegulator 在 app/brain/ 下
      const _regResult: any = null;
      // 注意: 这里需要动态 import，但 PFC 不应该依赖 app/ 层。
      // Phase 6 过渡期保留 globalThis 路径兜底
      const _regModule = (globalThis as any).__emotionRegulator;
      if (_regModule && typeof _regModule.regulate === 'function') {
        const _regulation = _regModule.regulate(perception, emotionalMemories);
        if (_regulation.shouldSoothe && _regulation.basis) {
          const _regCtx = _regModule.formatForContext(_regulation);
          if (_regCtx) return '【情绪调节】' + _regCtx;
        }
      }
    } catch (e) {
      console.warn('[PFC::EmotionRegulator] 情绪调节失败', (e as Error)?.message || e);
    }
    return null;
  }

  /**
   * ④ 构建遗忘指令上下文（从 chat.ts L1981-1995 迁移）
   *   检测用户"忘掉""不提""删除"指令
   */
  private async _buildForgettingContext(
    message: string,
  ): Promise<string | null> {
    try {
      const { SelectiveForgettingEngine } = await import('../../../app/brain/SelectiveForgettingEngine.js');
      const _sqlite = this._getSQLite();
      if (!_sqlite) return null;

      const _fe = new SelectiveForgettingEngine(_sqlite);
      const _intent = _fe.detectForgetIntent(message);
      if (_intent) {
        const _result = await _fe.forgetByKeyword(_intent.target, _intent.action);
        if (_result.forgotten > 0) {
          return `【系统】${_result.summary}`;
        }
      }
    } catch { /* 遗忘引擎不可用不阻塞 */ }
    return null;
  }

  /**
   * ⑤ 构建 SceneSnapshot（从 chat.ts L2026-2067 迁移）
   *   三层 fallback: retrieveAsSnapshot → Builder.build → 轻量快照
   */
  private _buildSnapshot(
    dna: any,
    perception: any,
    decision: any,
    ctxM4: any,
    m4Instance: any,
    sessionId: string,
    rawInput: string,
    emotionalMemories: any[],
    memoryFragments: string[],
  ): any {
    const _entities = (dna?.entity_genes || [])
      .filter((g: any) => g.type === 'person' && g.name !== '我')
      .map((g: any) => ({ name: g.name, type: g.type }));

    // 第1层: M4.retrieveAsSnapshot()
    if (m4Instance && typeof m4Instance.retrieveAsSnapshot === 'function') {
      try {
        const _snap = m4Instance.retrieveAsSnapshot(ctxM4, {
          perception,
          sessionId,
          rawInput,
        });
        if (_snap) return _snap;
      } catch { /* 降级到第2层 */ }
    }

    // 第2层: SceneSnapshotBuilder
    const _builder = this._snapshotBuilder || (globalThis as any).__snapshotBuilder;
    if (_builder && typeof _builder.build === 'function') {
      try {
        const _snap = _builder.build({
          memories: (ctxM4 as any)?.memories || emotionalMemories,
          m4Context: (ctxM4 as any) || { decision, summary: '', family_context: [] },
          perception,
          sessionId,
          rawInput,
          entities: _entities.length > 0 ? _entities : [{ name: '用户', type: 'self' }],
        });
        if (_snap) return _snap;
      } catch { /* 降级到第3层 */ }
    }

    // 第3层: 轻量快照（与 chat.ts 手写版完全一致）
    const p = perception || {};
    return {
      snapshotId: 'pfc_' + Date.now().toString(36),
      contextSignature: (dna?.locus_path || 'root') + '|' + (p.pleasure > 0.2 ? 'pos' : (p.pleasure < -0.2 ? 'neg' : 'neu')),
      temporal: { createdAt: new Date().toISOString(), sessionId: sessionId || '', timeOfDay: 'morning', dayOfWeek: new Date().getDay() },
      spatial: { sceneLabel: '对话中' },
      entities: { persons: _entities.map((e: any) => e.name), topics: [], objects: [] },
      experienceSummary: (memoryFragments || []).join(' | ').substring(0, 200) || '(无)',
      emotion: { pleasure: p.pleasure || 0, arousal: p.arousal || 0, intimacy: p.intimacy || 0, trend: 'stable' },
      memoryPointers: (emotionalMemories || []).map((m: any) => m?.record?.id || '').filter(Boolean),
      knowledgeRefs: [] as string[],
      fgEventRefs: [] as string[],
      calciumScore: decision?.enhanced?.calcium_score || 0.5,
      novelty: { level: 'routine', similarity: 0.5, multiplier: 1.0 },
    };
  }

  /**
   * ⑥ 组装系统提示词（从 chat.ts L1873-1890 迁移）
   *   调 cortex PromptComposer 生成系统提示词
   */
  private async _composeSystemPrompt(
    perception: { pleasure: number; arousal: number; intimacy: number },
    currentRole: string,
    hasFamilyGraph: boolean,
    hasKnowledgeBase: boolean,
    hasMemory: boolean,
    message: string,
  ): Promise<string> {
    try {
      const { composeSystemPrompt } = await import('../../../engine/cortex/PromptComposer.js');
      return composeSystemPrompt({
        emotionVector: { ...perception } as any,
        relationState: {
          phase: currentRole === 'lover' ? 'intimate'
            : currentRole === 'counselor' ? 'therapeutic'
            : 'stable',
          intimacyLevel: perception?.intimacy || 0.5,
        } as any,
        atmosphere: {
          tension: perception?.pleasure < -0.3 ? 0.7 : perception?.pleasure < 0 ? 0.3 : 0,
          warmth: perception?.pleasure > 0 ? 0.6 : 0.3,
          closeness: perception?.intimacy || 0.5,
        } as any,
        memoryPermission: {
          canReferenceMemory: true,
          canReferenceKnowledge: true,
          canReferenceFamily: hasFamilyGraph,
        } as any,
        hasKnowledgeBase,
        hasMemory,
        userMessage: message.substring(0, 200),
      });
    } catch { /* cortex不可用→返回空 */ }
    return '';
  }

  /**
   * ⭐ V4.0 Phase 6 增强 process(): 在原有五步编排基础上，
   *    新增内部上下文组装（CoreMemory + 经验 + 情绪 + 遗忘 + 快照 + 系统提示词）
   *    当 PrefrontalInput 包含扩展字段时，PFC 内部闭环组装并填充到输出。
   *
   *    不重复调用 process()——直接内联编排逻辑，将组装的上下文注入 directive.payload
   */
  async processEnhanced(
    input: PrefrontalInput,
    decision?: M3Decision | null,
  ): Promise<PrefrontalOutput> {
    const _dna = input.dna;
    const _p = input.perception;
    // 无扩展字段 → 走旧路径
    if (!_dna && !_p) {
      return this.process(input, decision);
    }

    const _dec = input.decision || decision || this._defaultDecision();
    const _role = input.currentRole || 'secretary';
    const _rp = input.currentRoleplay || null;
    const _msg = input.rawInput;
    const _sid = input.sessionId;

    // Phase 6: 记录活动（从 process() 第①步前迁移）
    (globalThis as any).__sleepTimeConsolidator?.recordActivity?.();

    // ── 并行执行 PFC 内部上下文组装 ──
    let assembledContext = '';
    let systemPrompt = '';
    let guardMessage = '';
    let emotionContext: { pleasure: number; arousal: number; intimacy: number; dominantEmotion?: string } | undefined;

    try {
      const [coreMem, expSummary, emotionReg, forgetCtx, cortexPrompt] = await Promise.all([
        this._buildCoreMemory(_rp, input.ctxM4, _msg),
        this._buildExperienceSummary(
          _dna?.entity_genes?.filter((g: any) => g.name && g.name.length > 1 && g.name !== '我').map((g: any) => g.name) || [],
          _p || { pleasure: 0, arousal: 0, intimacy: 0 },
          _dna?.scene_tags,
          _msg,
        ),
        Promise.resolve(this._buildEmotionRegulation(
          _p || { pleasure: 0, arousal: 0, intimacy: 0 },
          input.emotionalMemories || [],
        )),
        this._buildForgettingContext(_msg),
        this._composeSystemPrompt(
          _p || { pleasure: 0, arousal: 0, intimacy: 0 },
          _role,
          !!(globalThis as any).__familyGraph,
          !!(globalThis as any).__knowledgeBase,
          (input.emotionalMemories || []).length > 0,
          _msg,
        ),
      ]);

      // 拼装 assembledContext
      const blocks: Array<{ content: string; priority: number }> = [];
      if (coreMem.contextWindow) blocks.push({ content: coreMem.contextWindow.substring(0, 600), priority: 100 });
      if (forgetCtx) blocks.push({ content: forgetCtx, priority: 90 });
      if (expSummary) blocks.push({ content: expSummary, priority: 80 });
      if (emotionReg) blocks.push({ content: emotionReg, priority: 75 });
      blocks.sort((a, b) => b.priority - a.priority);
      assembledContext = blocks.map(b => b.content).join('\n\n');
      systemPrompt = cortexPrompt;
      // V4.0 Phase 7: 时空感知注入（天气/模式豁免）
      if (input.enableTemporalEngine && (input.temporalBlock || input.weatherContext)) {
        const _temporalParts: string[] = [];
        if (input.temporalBlock) _temporalParts.push(input.temporalBlock);
        if (input.weatherContext) _temporalParts.push('【天气查询结果】' + input.weatherContext + '\n（基于以上天气数据，用自然的语气回答用户，不要编造未提供的数据）');
        if (_temporalParts.length > 0) {
          systemPrompt = _temporalParts.join('\n\n') + '\n\n' + (systemPrompt || '');
        }
      }
      emotionContext = _p ? { pleasure: _p.pleasure, arousal: _p.arousal, intimacy: _p.intimacy } : undefined;
    } catch (e) {
      console.warn('[PFC::processEnhanced] 上下文组装失败:', (e as Error)?.message || e);
    }

    // ── 五步编排（与 process() 相同，但使用 PFC 内部组装的上下文）──
    // 使用 input.snapshot（由 chat.ts 预先构建，兼容过渡期）
    const snapshot = input.snapshot;
    this.workingMemory.load(snapshot);

    const intent = this._inferIntent(input.rawInput);
    this.goalStack.setImmediate(intent);

    const constraintInput = await this._buildConstraintInput(input);
    const constraints = this.constraintValidator.validate(constraintInput);

    const directive = this.directiveGenerator.generate(
      _dec, constraints, this.goalStack.getState(),
    );

    // 注入 PFC 组装的上下文到 directive.payload
    if (assembledContext) {
      directive.payload['assembledContext'] = assembledContext;
    }
    if (systemPrompt) {
      directive.payload['cortexSystemPrompt'] = systemPrompt;
    }
    guardMessage = constraints?.violations?.length > 0
      ? constraints.violations.join('\n') : '';

    // V4.0 前瞻模拟 + 事件广播 + 总线发布（与 process() 相同）
    try {
      const novelty = snapshot?.novelty;
      if (novelty && novelty.multiplier > 1.0) {
        const sim = (globalThis as any).__prospectiveSimulator;
        if (sim && typeof sim.simulate === 'function') {
          const persons = snapshot?.entities?.persons || [];
          const emotionTag = (snapshot?.emotion?.pleasure ?? 0) > 0.2 ? 'pos'
            : (snapshot?.emotion?.pleasure ?? 0) < -0.2 ? 'neg' : 'neu';
          const simResult = sim.simulate(
            { topic: intent, entities: persons, emotion: emotionTag },
            input.rawInput.substring(0, 30)
          );
          if (simResult.confidence > 0.3 && simResult.matchedScenes >= 2) {
            directive.payload['simulation'] = `【前瞻模拟】相似场景: ${simResult.matchedScenes}个 | 预测趋势: ${simResult.predictedOutcome || '不确定'} (置信${Math.round(simResult.confidence * 100)}%) | 备选: ${(simResult.alternatives || []).join(' / ') || '无'}`;
          }
        }
      }
    } catch { /* 模拟不可用不阻塞 */ }

    if (typeof (globalThis as any).broadcastEvent === 'function') {
      (globalThis as any).broadcastEvent('pfc-directive', {
        type: directive.type, priority: directive.priority, intent,
        constraints: constraints.passed ? 'passed' : 'violated',
        violations: constraints.violations.length,
        time: new Date().toISOString(),
      });
    }

    try { const _gb = (globalThis as any).__globalBusClient; if (_gb && typeof _gb.publish === "function") { _gb.publish('prefrontal:directive', { directive: directive.type, intent, priority: directive.priority, sessionId: input.sessionId, timestamp: Date.now() }).catch(() => {}); } } catch { /* 不可用不阻塞 */ }
    this.bus?.emit?.({
      type: 'prefrontal:directive_issued',
      traceId: `pfc_${Date.now().toString(36)}`,
      timestamp: Date.now(), sessionId: input.sessionId,
      payload: { directive, sourceModule: 'prefrontal', workingMemoryState: { activeSlots: this.workingMemory.activeCount, evictionPolicy: 'lru' } },
    }).catch(() => {});

    return {
      directive,
      wmState: this.workingMemory.getState(),
      assembledSystemPrompt: systemPrompt || undefined,
      assembledContext: assembledContext || undefined,
      guardMessage: guardMessage || undefined,
      emotionContext,
    };
  }
}