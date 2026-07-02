/**
 * RoleplayHealthGuard — 角色扮演运行时自检（防复发第一层）
 *
 * 每轮对话结束后自动执行，检测角色扮演是否偏离正常轨道。
 *
 * 🔴 检测项：
 *   1. 角色锁检测 — _currentRoleplay 是否意外丢失
 *   2. 指令前缀检测 — finalKnowledgeText 是否以【角色扮演】开头
 *   3. 历史隔离检测 — enrichedHistory 是否包含玉瑶回复
 *   4. 回复身份检测 — LLM 回复中是否混淆了身份
 *   5. 规则注入检测 — 完整四条规则是否都在
 *
 * 偏离自动修复 + 日志告警，不静默。
 */
export interface RoleplayHealthReport {
  healthy: boolean;
  issues: string[];
  fixes: string[];
  activeRole: string | null;
}

/** 玉瑶的自称模式 — LLM 跳回玉瑶时会用这些词 */
const YUYAO_SELF_REF_PATTERNS = [
  /(?:^|[，。！？\n])?(?:我|诗雨|玉瑶)(?:是|叫|就是)你[的]?(?:秘书|助理|老婆|宝贝|玉瑶|诗雨)/,
  /我[是叫]诗雨[，,。]/,
  /(?:^|[。\n])诗雨[来去]了/,
  /(?:我是|我叫)玉瑶/,
  /诗雨[在就]这/,
];

/** 角色扮演必含的关键词（四项规则+身份声明） */
const RP_REQUIRED_KEYWORDS = [
  '【角色扮演】', '忘记你原来的身份',
  '强制规则①', '强制规则②',
  '强制规则③', '强制规则④',
];

/**
 * 执行角色扮演健康检查
 *
 * 在 orchestrate 返回后调用。
 */
export function checkRoleplayHealth(
  reply: string,
  finalKnowledgeText: string,
  enrichedHistory: Array<{ role: string; content: string }>,
  roleName: string | null,
): RoleplayHealthReport {
  const issues: string[] = [];
  const fixes: string[] = [];

  // ── 检查 1: 角色锁 ──
  if (!roleName) {
    issues.push('角色锁丢失: _currentRoleplay 为 null');
    fixes.push('无法自动恢复，需要用户重新输入"扮演XXX"');
    return { healthy: false, issues, fixes, activeRole: null };
  }

  // ── 检查 2: 指令前缀 ──
  if (!finalKnowledgeText || !finalKnowledgeText.startsWith('【角色扮演】')) {
    issues.push('指令前缀丢失: finalKnowledgeText 不以【角色扮演】开头');
    fixes.push('在 chat.ts 持续扮演块中自动重建（已实现）');
  }

  // ── 检查 3: 规则完整性 ──
  for (const kw of RP_REQUIRED_KEYWORDS) {
    if (!finalKnowledgeText.includes(kw)) {
      issues.push(`规则缺失: finalKnowledgeText 缺少 "${kw}"`);
      fixes.push('使用 buildRoleplayRules() 重建完整指令');
      break; // 一个缺失就够了
    }
  }

  // ── 检查 4: 历史隔离 ──
  const yuyaoInHistory = enrichedHistory.some(t =>
    (t.content && typeof t.content === 'string') &&
    (t.content.includes('我是玉瑶') || t.content.includes('我是诗雨') ||
     t.content.includes('我是你的秘书') || t.content.includes('诗雨是你'))
  );
  if (yuyaoInHistory) {
    issues.push('历史隔离失效: enrichedHistory 包含玉瑶身份的内容');
    fixes.push('在 chat.ts enrichedHistory 构建处已过滤（Fix-2）');
  }

  // ── 检查 5: 回复身份 ──
  if (reply && typeof reply === 'string') {
    for (const pattern of YUYAO_SELF_REF_PATTERNS) {
      if (pattern.test(reply)) {
        issues.push(`回复身份漂移: LLM 回复中使用了玉瑶/诗雨自称（匹配: ${pattern}）`);
        fixes.push('需要下轮重注入完整角色指令');
        break;
      }
    }
  }

  // ── 检查 6: 反事实幻觉检测 — 回复中是否编造了角色设定中不存在的人物 ──
  if (reply && typeof reply === 'string' && finalKnowledgeText && roleName) {
    const knownPeople: string[] = [roleName];
    const namePattern = /「([一-龥]{2,4})」/g;
    let m;
    while ((m = namePattern.exec(finalKnowledgeText)) !== null) {
      if (!knownPeople.includes(m[1])) knownPeople.push(m[1]);
    }
    // 排除非人名的常见词
    const NON_NAMES = new Set([
      '姐姐','妹妹','哥哥','弟弟','妈妈','爸爸','奶奶','爷爷','老婆','老公',
      '阿姨','叔叔','不是','什么','怎么','这个','那个','哪里','多少',
      '为什么','知道','问题','时候','这样','那样','不错','可以','可能',
      '因为','所以','然后','但是','而且','今年','二十','十八','十四',
      '年纪','年龄','多大','几岁',
    ]);
    const replyWords = reply.match(/[一-龥]{2,4}(?=[，。！？\s\n]|的|了|是|有|在|说|叫)/g) || [];
    for (const w of replyWords) {
      if (knownPeople.includes(w) || NON_NAMES.has(w)) continue;
      issues.push(`反事实幻觉: 回复中提到了设定里不存在的人物「${w}」`);
      break;
    }
  }

  const healthy = issues.length === 0;
  if (!healthy) {
    console.error(
      `[RoleplayHealth] ❌ 健康检查失败 role=${roleName} issues=${issues.length}`,
      issues.join('; '),
    );
  } else {
    console.log(`[RoleplayHealth] ✅ 健康 role=${roleName}`);
  }

  return { healthy, issues, fixes, activeRole: roleName };
}
