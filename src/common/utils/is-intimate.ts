/**
 * isIntimate — 统一亲密检测工具函数
 *
 * 📜 架构铁律：全局只有此处定义亲密关键词
 * 所有模块（RoleClassifier / DeepSeekLLMProvider / M5Orchestrator）统一调用此函数
 * 消除三处正则不一致导致的亲密检测结果冲突
 */

// ─── 亲密关键词（权威来源） ───
const INTIMATE_KEYWORDS = /想你了|抱我|吻我|亲我|摸我|操[你我]|干[你我]|插[你我进去]|艹[你我]|肏[你我]|要你|想要|好想要|想你|抱抱|亲亲|搂|贴|蹭|吻|亲|抱|摸|模|爱|好硬|好烫|好湿|好紧|好热|进来|进去|射[了出来]|丢了|奶子|胸|乳房|奶|屁股|臀|好想|想要你/;

// ─── 深度亲密文本（用于激活 PassionateMode） ───
const DEEP_INTIMATE_TEXT = /高潮|操[你我]|干[你我]|插[你我进去]|艹[你我]|肏[你我]|要你|要死了|射[了出来你]|丢了|受不[了住]|好想要|想要你|给我[插干操舔含上口]|抱我|吻我|亲我|摸我|舔我|含我|奶子|胸|乳房|屁股|臀/;

// ─── 学术话题拦截（防止"人体解剖学"误触发亲密） ───
const ACADEMIC_GUARD = /大学|选修课|必修课|课程|专业|学期|考试|学分|论文|实验室|上课|教授|导师|同学|教材|课本|作业|成绩|考研|毕业|学位|奖学金|人体解剖|生理学|心理学|AI应用|人工智能|编程|代码|读大学|一年级|大二|大三|大四/;

// ─── 呻吟词检测 ───
const MOAN_TEXT = /^(嗯|啊|哼|哦|唔|呼|哈|操)+$/;

/**
 * 检测消息是否包含亲密意图
 * 用于角色分类器（判断是否切 lover 角色）
 */
export function isIntimate(message: string): boolean {
  return INTIMATE_KEYWORDS.test(message);
}

/**
 * 检测是否需要激活 PassionateMode（深度亲密模式）
 * 用于 DeepSeekLLMProvider 的 contextBlock 注入
 */
export function isDeepIntimate(message: string): boolean {
  return DEEP_INTIMATE_TEXT.test(message);
}

/**
 * 检测是否为呻吟词（纯语气词）
 */
export function isMoan(message: string): boolean {
  return message.length <= 6 && MOAN_TEXT.test(message.trim());
}

/**
 * 检测是否为学术话题（需拦截亲密模式）
 */
export function isAcademic(message: string): boolean {
  return ACADEMIC_GUARD.test(message);
}

/**
 * 检测消息是否包含亲密关键词（排除学术场景）
 * 完整的亲密场景判定
 */
export function isIntimateScene(message: string, isAcademicTopic: boolean): boolean {
  if (isAcademicTopic) return false;
  return isIntimate(message) || isMoan(message);
}

export { INTIMATE_KEYWORDS, DEEP_INTIMATE_TEXT, ACADEMIC_GUARD };
