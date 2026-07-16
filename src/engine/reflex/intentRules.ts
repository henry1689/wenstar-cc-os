/**
 * intentRules — L0.5 意图规则配置
 *
 * 与路由逻辑解耦，纯配置。
 * 每条规则包含匹配方式、意图、子意图、是否短路。
 * 新增意图只改此文件，不动核心逻辑。
 */
import type { IntentType } from '../bus/types.js';

export interface IntentRule {
  id: string;
  /** 匹配模式：正则或正则数组 */
  pattern: RegExp | RegExp[];
  /** 一级意图 */
  intent: IntentType;
  /** 二级意图（可选） */
  subIntent?: string;
  /** 是否直接短路 LLM */
  bypassLLM?: boolean;
  /** 规则描述（用于日志和调试） */
  desc: string;
}

export const INTENT_RULES: IntentRule[] = [
  // ═══════════════════════
  // 系统指令（短路 LLM）
  // ═══════════════════════
  {
    id: 'sys-clear',
    pattern: /^(清空|清除|重置|重启|恢复出厂).{0,6}(记忆|对话|所有)/,
    intent: 'system_command',
    subIntent: 'clear_memory',
    bypassLLM: true,
    desc: '清空记忆/重置',
  },
  {
    id: 'sys-param',
    pattern: /^(切换|设置|调整|改成).{0,6}(模式|参数|状态)/,
    intent: 'system_command',
    subIntent: 'parameter_adjust',
    bypassLLM: true,
    desc: '参数调整',
  },

  // ═══════════════════════
  // 记忆操作（短路 LLM）
  // ═══════════════════════
  {
    id: 'mem-save',
    pattern: /^(记(住|下|录)|帮我记住|记住|别忘了|备注)/,
    intent: 'memory_operation',
    subIntent: 'save',
    bypassLLM: true,
    desc: '记住某件事',
  },
  {
    id: 'mem-forget',
    pattern: /^(忘(了|记)|删(了|除)|不记得|取消记住)/,
    intent: 'memory_operation',
    subIntent: 'delete',
    bypassLLM: true,
    desc: '忘记/删除记忆',
  },
  {
    id: 'mem-query',
    pattern: /^(查(一?下|询)|找(一?下)|搜索|搜(一?下)|上次说的|之前说的)/,
    intent: 'memory_operation',
    subIntent: 'query',
    bypassLLM: false,
    desc: '查询记忆',
  },

  // ═══════════════════════
  // 角色扮演触发
  // ═══════════════════════
  {
    id: 'rp-start',
    pattern: /扮演(一下|一次|)?([一-鿿]{2,8})/,
    intent: 'rp_trigger',
    subIntent: 'start',
    bypassLLM: false,
    desc: '开始角色扮演',
  },
  {
    id: 'rp-stop',
    pattern: /^(停止|退出|结束|不扮演).{0,4}(扮演|角色)/,
    intent: 'rp_trigger',
    subIntent: 'stop',
    bypassLLM: false,
    desc: '退出角色扮演',
  },

  // ═══════════════════════
  // 知识查询
  // ═══════════════════════
  {
    id: 'kb-query',
    pattern: [/知识库/, /(你)?(知道|记得).{0,4}(吗|么|嘛|不)/, /(有|查).{0,4}(资料|文件|知识)/],
    intent: 'knowledge_query',
    bypassLLM: false,
    desc: '知识库查询',
  },

  // ═══════════════════════
  // 边界拦截
  // ═══════════════════════
  {
    id: 'bv-abuse',
    pattern: /^(你(是|只)(个|一)(程序|代码|AI|机器人)|你什么都不是|你不配)/,
    intent: 'boundary_violation',
    subIntent: 'identity_attack',
    bypassLLM: true,
    desc: '身份攻击',
  },
  {
    id: 'bv-harass',
    pattern: /(强奸|性奴|卖淫|毒品|吸毒|贩毒)/,
    intent: 'boundary_violation',
    subIntent: 'illegal_content',
    bypassLLM: true,
    desc: '违禁内容',
  },
];
