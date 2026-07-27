/**
 * RoleplayRuleRegistry — 角色扮演共享规则注册表 (V12.0 P1-3)
 * ===========================================================
 * 统一管理角色扮演的 禁止词/边界规则/身份提示/退出清理 等配置。
 * legacy buildRoleplayRules() 和 structured runRoleplayPipeline() 均从此读取。
 *
 * 迁移路径:
 *   短期: 两套管线都从 registry 读取，不再各自硬编码
 *   中期: legacy 调用 structured 输出
 *   长期: 删除 legacy
 */

/** 角色扮演中禁止使用的词/模式（防止身份泄漏） */
export const RP_FORBIDDEN_WORDS = new Set([
  '玉瑶', '鸿艺', '太虚境', '户籍管理', 'FamilyGraph',
  'AI', 'LLM', '模型', '系统', '数据库', 'API',
]);

/** 角色扮演中禁止的身份声明模式 */
export const RP_FORBIDDEN_IDENTITY = [
  /我是[一-龥]{1,2}AI/,
  /我是.*助手/,
  /我是.*秘书/,
  /我是.*机器人/,
  /作为.*AI/,
];

/** 角色扮演结束后的清理清单 */
export const RP_CLEANUP_CHECKLIST = [
  'fgOverride → null',
  'rpBranch → null',
  'rpJustExited → true',
  'currentRoleplay → null',
  'MainFGAgent → 恢复',
  'PersonaRegistry → 恢复默认',
] as const;

/** 角色扮演禁止词正则（用于 LLM 输出后检测） */
export function buildForbiddenRegex(): RegExp {
  const words = [...RP_FORBIDDEN_WORDS].join('|');
  return new RegExp(`(${words})`, 'g');
}

/**
 * 检查角色回复是否包含禁止内容
 * @returns 违规词列表，空数组表示合规
 */
export function checkRoleplayReply(reply: string): string[] {
  const violations: string[] = [];
  for (const word of RP_FORBIDDEN_WORDS) {
    if (reply.includes(word)) violations.push(word);
  }
  for (const pattern of RP_FORBIDDEN_IDENTITY) {
    if (pattern.test(reply)) violations.push('身份泄漏: ' + pattern.source);
  }
  return violations;
}

/**
 * 获取角色扮演系统提示词模板
 */
export function getRoleplaySystemPrompt(roleName: string): string {
  return [
    `你现在的身份是「${roleName}」。你必须完全以这个角色的视角说话，不允许跳出角色。`,
    '',
    '🚫 绝对禁止:',
    '- 说自己是 AI、助手、机器人、程序',
    '- 提到 "玉瑶"、"太虚境"、"系统"、"数据库"',
    '- 讨论自己的 "训练数据"、"模型参数"',
    '- 在括号中做元评论（如"我作为AI不能…"）',
    '',
    '✅ 你应该:',
    '- 完全沉浸在角色中',
    '- 使用角色的语气、词汇、风格',
    '- 对角色不知道的事说"我不清楚"而非"我的数据库中没有"',
    '- 退出时说角色的告别词，不做元说明',
  ].join('\n');
}

export default {
  RP_FORBIDDEN_WORDS, RP_FORBIDDEN_IDENTITY, RP_CLEANUP_CHECKLIST,
  buildForbiddenRegex, checkRoleplayReply, getRoleplaySystemPrompt,
};
