/**
 * llm-config — LLM 参数统一配置中心
 *
 * 📜 架构优化：温度/超时/重试/推理参数按场景分组
 * 一处修改，全局生效
 */

import type { RoleType } from '../../app/role/RoleClassifier.js';

/** 场景类型 */
export type LLMScenario = 'daily' | 'recall' | 'intimate' | 'roleplay' | 'short_mode';
export type LLMProviderType = 'deepseek' | 'doubao';

/** 单场景参数配置 */
export interface LLMScenarioConfig {
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  frequencyPenalty: number;
  presencePenalty: number;
  reasoningEffort?: 'low' | 'medium' | 'max';
}

/** 所有场景参数（权威来源） */
const SCENARIO_CONFIGS: Record<LLMScenario, LLMScenarioConfig> = {
  /** 日常对话：中性情绪、工作、闲聊 */
  daily: {
    temperature: 0.9,
    maxTokens: 2000,
    timeoutMs: 15_000,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2,
  },

  /** 回忆/分享：需要更多创造力和输出长度 */
  recall: {
    temperature: 1.0,
    maxTokens: 1500,
    timeoutMs: 10_000,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2,
  },

  /** 亲密场景：高创造、长输出、宽松惩罚 */
  intimate: {
    temperature: 1.0,
    maxTokens: 2500,
    timeoutMs: 20_000,
    frequencyPenalty: 0.0,
    presencePenalty: 0.2,
  },

  /** 角色扮演/会晤：标准温度、正常输出 */
  roleplay: {
    temperature: 0.7,
    maxTokens: 3000,
    timeoutMs: 20_000,
    frequencyPenalty: 0.1,
    presencePenalty: 0.5,
  },

  /** 简短模式：极短输出 */
  short_mode: {
    temperature: 0.4,
    maxTokens: 600,
    timeoutMs: 10_000,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2,
  },
};

/** 场景检测规则 */
type ScenarioRule = {
  match: (level: number, rawInput: string, role: RoleType) => boolean;
  scenario: LLMScenario;
};

const SCENARIO_RULES: ScenarioRule[] = [
  // 角色扮演优先检测
  { match: (_l, _r, role) => role === 'recaller', scenario: 'roleplay' },
  // 故事/长文创作
  { match: (_l, r, _role) => /讲(个|一)?故事|写(个|一)?小说/.test(r), scenario: 'recall' },
  // 回忆/分享
  { match: (_l, r, _role) => /感觉|感受|回忆|分享|记得|印象|那时|那次/.test(r), scenario: 'recall' },
  // 亲密场景
  { match: (l, _r, role) => l >= 2 || role === 'lover', scenario: 'intimate' },
];

/**
 * 根据情绪等级 + 用户消息 + 角色 选择场景配置
 */
export function selectLLMConfig(level: number, rawInput: string, role?: RoleType): LLMScenarioConfig {
  for (const rule of SCENARIO_RULES) {
    if (rule.match(level, rawInput, role as RoleType)) {
      return SCENARIO_CONFIGS[rule.scenario];
    }
  }
  return SCENARIO_CONFIGS['daily'];
}

/** 获取指定场景的配置（直接查表） */
export function getScenarioConfig(scenario: LLMScenario): LLMScenarioConfig {
  return SCENARIO_CONFIGS[scenario];
}

/**
 * 🆕 V10.0 P3-3: 获取 LLM Provider 配置
 * 豆包 250K 上下文窗口 → 对话历史可增至 500 轮，记忆注入增至 20000 chars
 */
export function getProviderConfig(): {
  type: LLMProviderType;
  baseUrl: string;
  model: string;
  maxHistoryTurns: number;
  maxMemoryChars: number;
} {
  const type: LLMProviderType = (process.env['LLM_PROVIDER'] as LLMProviderType) || 'deepseek';

  if (type === 'doubao') {
    return {
      type: 'doubao',
      baseUrl: process.env['DOUBAO_BASE_URL'] || 'https://ark.cn-beijing.volces.com/api/v3',
      model: process.env['DOUBAO_MODEL'] || 'doubao-seed-2-0-pro-260215',
      maxHistoryTurns: 500,    // 250K 窗口 → 500轮
      maxMemoryChars: 20000,   // 250K 窗口 → 20000 chars记忆
    };
  }

  return {
    type: 'deepseek',
    baseUrl: process.env['LLM_API_BASE_URL'] || 'https://api.deepseek.com/v1',
    model: process.env['LLM_MODEL'] || process.env['DEEPSEEK_MODEL'] || 'deepseek-v4-flash',
    maxHistoryTurns: 200,     // 104K 窗口 → 200轮
    maxMemoryChars: 8000,     // 104K 窗口 → 8000 chars记忆
  };
}

/** 获取当前 Provider 最大注入字符数 */
export function getMaxMemoryChars(): number {
  return getProviderConfig().maxMemoryChars;
}

/** 获取当前 Provider 最大历史轮数 */
export function getMaxHistoryTurns(): number {
  return getProviderConfig().maxHistoryTurns;
}

export { SCENARIO_CONFIGS, SCENARIO_RULES };
