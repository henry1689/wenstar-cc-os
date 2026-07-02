/**
 * EngineContext — 引擎上下文共享存储
 *
 * 作为新旧架构之间的轻量桥梁。
 * ontextor 写入 -> chat.ts 读取 -> 注入到 knowledgeBaseText
 *
 * 零接口改动，零依赖。
 */
let _emotionLabel = '';
let _desireHints: string[] = [];
let _emergenceHint = '';
let _relationLabel = '';
/** 时空感知块（天象农历节气月相物候） */
let _temporalBlock = '';
let _commMode = 'face_to_face';

export const EngineContext = {
  set(emotion: string, desires: string[], emergence: string, relation: string): void {
    _emotionLabel = emotion;
    _desireHints = desires;
    _emergenceHint = emergence;
    _relationLabel = relation;
  },

  /** 设置时空感知块（由 orchestrator 在初始化时注入，每30分钟刷新） */
  setTemporalBlock(block: string): void {
    _temporalBlock = block;
  },

  getTemporalBlock(): string {
    return _temporalBlock;
  },

  setCommMode(mode: string): void {
    _commMode = mode;
  },

  getCommMode(): string {
    return _commMode;
  },

  /** 取格式化引擎上下文块（注入到 knowledgeBase） */
  getBlock(): string {
    const parts: string[] = [];
    if (_temporalBlock) parts.push(_temporalBlock);
    if (_emotionLabel) parts.push(`【情感状态】${_emotionLabel}`);
    if (_relationLabel && _relationLabel !== 'stranger') parts.push(`【关系阶段】${_relationLabel}`);
    if (_desireHints.length) parts.push(`【内心】${_desireHints.join('；')}`);
    if (_emergenceHint) parts.push(`【此刻感受】${_emergenceHint}`);
    return parts.length ? parts.join('\n') : '';
  },

  reset(): void {
    _emotionLabel = '';
    _desireHints = [];
    _emergenceHint = '';
    _relationLabel = '';
    _temporalBlock = '';
  },
};
