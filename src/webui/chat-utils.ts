/**
 * chat-utils.ts — 聊天工具函数集 (从 chat.ts 2900行拆出)
 * 纯函数，无模块状态依赖，可直接导入使用
 */

/** 防泄漏：超过上限时清理一半 */
const topicAskCount = new Map<string, number>();
const TOPIC_ASK_MAX = 500;

export function getTopicRepeatCount(message: string): number {
  // 防泄漏：超过上限时清理一半
  if (topicAskCount.size > TOPIC_ASK_MAX) {
    const keysToDelete = [...topicAskCount.keys()].slice(0, TOPIC_ASK_MAX / 2);
    for (const k of keysToDelete) topicAskCount.delete(k);
  }
  const words = message.match(/[一-龥]{4,}/g);
  if (!words) return 0;
  for (const w of words) {
    const cnt = (topicAskCount.get(w) ?? 0) + 1;
    topicAskCount.set(w, cnt);
    return cnt;
  }
  return 0;
}

const _invalidPersonNames = new Set([
  '上班','吃饭','工作','散步','开会','咖啡','宠物','小孩','游戏',
  '小屄','小逼','平胸','关上','关系','别喜欢','别说别','小小','小长',
  '应用','强调','时代','时光','那个深','那次','解自己','解女子','解剖学',
  '累','老是','老板','满足','亲戚','同事','李四','张三','钟师',
  '王建国','周总开','喜欢','爱','结婚','运动','跑步','游泳','健身',
  '手机','电脑','电视','电影','音乐','阅读','学习','考试','成绩',
  '回家','出门','睡觉','起床','洗澡','刷牙','洗脸','衣服','鞋子',
  '今天','明天','昨天','上午','下午','晚上','中午','早上','现在',
  '这个','那个','什么','怎么','为什么','因为','所以','如果','然后',
  '可以','应该','能够','需要','知道','觉得','认为','希望','相信',
]);

export function isValidPersonName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 6) return false;
  if (_invalidPersonNames.has(name)) return false;
  if (/^[a-zA-Z0-9_]+$/.test(name)) return false;
  return true;
}

export function isSelfNameQuestion(message: string): boolean {
  return /(?:^|你还记得|还记得)我(?:叫什么|名字(?:是什么|叫啥|叫什么)?)(?:吗|呢|么|嘛)?[？?]?$/.test(message.trim()) &&
    !/我(?:姐姐|妹妹|哥哥|弟弟|妈妈|爸爸|老婆|老公|女友|男友)/.test(message);
}

export type FactSnapshot = {
  selfName?: string;
  kinshipFacts: Record<string, { name?: string; location?: string; occupation?: string }>;
};

export function collectFactSnapshot(texts: string[]): FactSnapshot {
  const snapshot: FactSnapshot = { kinshipFacts: {} };
  const kinships = ['姐姐', '妹妹', '哥哥', '弟弟', '妈妈', '爸爸', '老婆', '老公', '女友', '男友'];
  for (const text of texts) {
    if (!snapshot.selfName) {
      const selfMatch = text.match(/我叫([A-Za-z0-9_\-一-龥]{2,12})/);
      if (selfMatch) snapshot.selfName = selfMatch[1];
    }
    for (const kinship of kinships) {
      const current = snapshot.kinshipFacts[kinship] || {};
      const nameMatch = text.match(new RegExp(`我${kinship}叫([^，。！？\\s]{1,12})`));
      if (nameMatch && isValidPersonName(nameMatch[1])) current.name = nameMatch[1];
      const locationMatch = text.match(new RegExp(`我${kinship}.*?在([^，。！？\\s]{2,10})(?:上班|工作|住)`));
      if (locationMatch && !/哪|哪里|哪儿|什么/.test(locationMatch[1])) current.location = locationMatch[1];
      const occupationMatch = text.match(new RegExp(`我${kinship}.*?(?:是|做)([^，。！？\\s]{1,12})(?:的)?`));
      if (occupationMatch && !/姐姐|妹妹|哥哥|弟弟|妈妈|爸爸|老婆|老公|女友|男友|什么|哪/.test(occupationMatch[1])) {
        current.occupation = occupationMatch[1];
      }
      if (current.name || current.location || current.occupation) {
        snapshot.kinshipFacts[kinship] = current;
      }
    }
  }
  return snapshot;
}

export function buildDirectFactReply(message: string, snapshot: FactSnapshot): string | null {
  if (isSelfNameQuestion(message) && snapshot.selfName) {
    return `你叫${snapshot.selfName}。`;
  }
  const kinships = Object.keys(snapshot.kinshipFacts);
  const targetKinship = kinships.find((kinship) => message.includes(kinship));
  if (!targetKinship) return null;
  const fact = snapshot.kinshipFacts[targetKinship];
  if (!fact) return null;
  const wantsName = /叫什么|叫啥|名字|是谁/.test(message);
  const wantsLocation = /在哪|哪里|哪儿|上班|工作|住哪/.test(message);
  const wantsOccupation = /做什么|干什么|职业|工作/.test(message);
  const parts: string[] = [];
  if (wantsName && fact.name) parts.push(`你${targetKinship}叫${fact.name}`);
  if (wantsLocation && fact.location) parts.push(`在${fact.location}${fact.occupation ? `做${fact.occupation}` : '上班'}`);
  else if (wantsOccupation && fact.occupation) parts.push(`做${fact.occupation}`);
  else if (wantsOccupation && fact.location) parts.push(`在${fact.location}上班`);
  if (parts.length === 0) return null;
  return parts.join('，') + '。';
}

export function buildFactStatementAck(message: string, snapshot: FactSnapshot): string | null {
  if (/[？?]/.test(message)) return null;
  const statements: string[] = [];
  if (snapshot.selfName && /我叫/.test(message)) {
    statements.push(`你叫${snapshot.selfName}`);
  }
  for (const [kinship, fact] of Object.entries(snapshot.kinshipFacts)) {
    if (!message.includes(kinship)) continue;
    const parts: string[] = [];
    if (fact.name) parts.push(`你${kinship}叫${fact.name}`);
    if (fact.location && fact.occupation) parts.push(`在${fact.location}做${fact.occupation}`);
    else if (fact.location) parts.push(`在${fact.location}上班`);
    else if (fact.occupation) parts.push(`做${fact.occupation}`);
    if (parts.length > 0) statements.push(parts.join('，'));
  }
  if (statements.length === 0) return null;
  return `记住了，${statements.join('；')}。`;
}

export function collectFactLookupTerms(message: string): string[] {
  const terms = ['姐姐', '妹妹', '哥哥', '弟弟', '妈妈', '爸爸', '老婆', '老公', '女友', '男友']
    .filter((kinship) => message.includes(kinship));
  if (/我.*叫什么|我叫什么|我名字|我叫/.test(message)) terms.push('我叫');
  return [...new Set(terms)];
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isDirectedEmotion(text: string): boolean {
  if (!text) return true;
  const hasDirectAddress = /[你]/.test(text);
  const isFirstPersonNarrative = /我(?:以前|曾经|那时|过去|觉得|认为|当时|以前)/.test(text);
  const isThirdPerson = /[他她它]/.test(text);
  const segments = text.split(/,/);
  for (const seg of segments) {
    if (/[你]/.test(seg) && /喜欢|开心|高兴|快乐|难过|悲伤|兴奋|激动|爱|想|恨|爽|舒服/.test(seg)) return true;
  }
  if (isFirstPersonNarrative && !hasDirectAddress) return false;
  if (isThirdPerson && !hasDirectAddress) return false;
  if (!hasDirectAddress) {
    const hasEmotionWord = /喜欢|开心|高兴|快乐|难过|悲伤|痛苦|幸福|兴奋|激动|爱|想|恨|哭|笑|爽|舒服|难受|憋|痒|麻|软|硬|热|暖|敏感|疼|痛/.test(text);
    const hasIntimateWord = /操|干|日|舔|咬|插|顶|揉|捏|掐|摸|吻|吸|骚|浪|湿|水|屌|鸡|奶|肿|硬/.test(text);
    if (!hasEmotionWord && !hasIntimateWord) return false;
  }
  return true;
}

export const PERC_LABELS: Record<string,{q:number;label:string}> = {
  pleasure:{q:1,label:"E1愉悦度"}, arousal:{q:1,label:"E2唤醒度"}, dominance:{q:1,label:"E3支配感"},
  aggression:{q:1,label:"E4攻击性"}, sincerity:{q:1,label:"E5真诚度"}, humor:{q:1,label:"E6幽默感"},
  factual:{q:2,label:"C1事实性"}, logical:{q:2,label:"C2逻辑性"}, certainty:{q:2,label:"C3确定性"},
  abstract:{q:2,label:"C4抽象度"}, temporal_focus:{q:2,label:"C5时间焦点"}, self_ref:{q:2,label:"C6自我参照"},
  intimacy:{q:3,label:"S1亲密度"}, power_diff:{q:3,label:"S2权力差"}, dependency:{q:3,label:"S3依赖度"},
  moral_judgment:{q:3,label:"S4道德审判"}, etiquette:{q:3,label:"S5社交礼仪"}, belonging:{q:3,label:"S6群体归属"},
  sexual_attraction:{q:4,label:"I1性吸引力"}, sensory_craving:{q:4,label:"I2感官渴望"}, energy_merge:{q:4,label:"I3能量交融"},
  possessiveness:{q:4,label:"I4占有欲"}, ecstasy:{q:4,label:"I5愉悦/高潮"}, safety:{q:4,label:"I6安全感"},
};

export const FALLBACK_REPLIES = [
  "嗯～我在呢。你说，我听着。","嗯，我在听。你说。","唔…好呀，你说吧。",
  "嗯～好呀。你说。","好嘞～你说吧，我听着呢。","诶～你说，我在听。",
];

export const LEVEL_NAMES = ["粉末","液体","固体","晶体"];
