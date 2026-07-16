/**
 * 档案自动采集引擎 — LLM 提取 Prompt 模板
 * Profile Acquisition Engine — Extraction Prompt Builder
 *
 * 设计原则：
 * 1. 只提取明确陈述的事实，不推断、不猜测、不脑补
 * 2. 三级确定性区分：explicit / implied / ambiguous
 * 3. 每字段附带原文证据
 * 4. 区分提问和陈述
 * 5. 保持原文语言风格（文学性要求）
 */

import type { PersonProfile } from '../../m4/FamilyGraph.js';

/**
 * 构建 LLM 提取 system prompt
 */
export function buildExtractionSystemPrompt(): string {
  return `你是一个人物档案信息提取器。你的任务是从对话文本中提取关于特定人物的结构化信息。

## 🔴 核心铁律

1. **只提取明确陈述的事实** — 不要推断、不要猜测、不要脑补。
   反面: "张三，你知道吗，她真的很漂亮" → 只提取 appearance="外貌好，被评价为很漂亮"，不捏造具体五官。
   正面: "张三是个医生，在北京协和医院工作" → 提取 occupation="医生", workplace="北京协和医院"。

2. **区分确定性级别**:
   - explicit: 说话者直接断言 ("他是医生"、"我妈今年52岁")
   - implied: 可从上下文合理推断 ("他每天穿白大褂去医院" → 可能是医生)
   - ambiguous: 模糊提及，需要更多信息确认 ("他好像在做医疗相关的工作")

3. **每字段附带原文证据** — 从对话文本中截取支持该提取的具体句子。

4. **人物识别**: 只提取关于指定人物的信息。若人物被提及但无实质性新信息，标记 personReferenced=false。

5. **区分提问和陈述** — "你是医生吗?" 不等于此人是医生。

6. **文学性要求**: 提取的描述保持原文的语言风格和细节，不要机械化改写。中文描述应该生动、自然、有画面感。

## 输出格式

必须输出严格的 JSON（不要包含 markdown 代码块标记）：

{
  "persons": [
    {
      "personName": "人物名",
      "personReferenced": true,
      "fields": [
        {
          "fieldPath": "字段路径（见下方映射表）",
          "value": "提取的值",
          "confidence": 0.0-1.0,
          "evidence": "原文证据句子",
          "certainty": "explicit"
        }
      ]
    }
  ],
  "reasoningTrace": "简要说明提取逻辑（1-2句话）"
}

## 字段路径映射表

| 信息类型 | fieldPath | 值类型 |
|---------|-----------|--------|
| 性别 | basicInfo.gender | "男"/"女" |
| 出生年份 | basicInfo.birthYear | 数字（如 1990） |
| 出生地 | basicInfo.birthPlace | 字符串 |
| 学历 | basicInfo.education | 字符串 |
| 婚姻状况 | basicInfo.maritalStatus | 字符串 |
| 生肖 | basicInfo.zodiac | 字符串 |
| 民族 | basicInfo.ethnicity | 字符串 |
| 职业 | occupation | 字符串 |
| 工作单位 | contact.workplace | 字符串 |
| 电话 | contact.phone | 数字串 |
| 微信 | contact.wechat | 字符串 |
| 地址 | contact.address | 字符串 |
| 邮箱 | contact.email | 字符串 |
| 外貌长相 | imageTraits.looks | 字符串 |
| 身体特征 | imageTraits.bodyFeatures | 字符串 |
| 穿着风格 | imageTraits.style | 字符串 |
| 声音特征 | imageTraits.voice | 字符串 |
| 辨识特征 | imageTraits.distinguishingMarks | 字符串 |
| 气味/香水 | imageTraits.scent | 字符串 |
| 性格标签 | personalityPrefs.traits | 数组（如 ["开朗","幽默"]） |
| 性格描述 | personalityPrefs.description | 字符串 |
| 兴趣爱好 | personalityPrefs.interests | 数组 |
| 习惯 | personalityPrefs.habits | 字符串 |
| 心理特征 | personalityPrefs.psychology | 字符串 |
| 与用户关系 | relationMap.relationToUser | 字符串 |
| 结识场景 | relationMap.intersections.metWhen | 字符串 |
| 共事记录 | relationMap.intersections.workTogether | 字符串 |
| 生活交集 | relationMap.intersections.lifeIntersection | 字符串 |
| 情感评价 | relationMap.intersections.emotionalAssessment | 字符串 |
| 利益关系 | relationMap.intersections.interestRelation | 字符串 |
| 父母 | familyNetwork.parents | 数组 |
| 配偶 | familyNetwork.spouse | 字符串 |
| 子女 | familyNetwork.children | 数组 |
| 兄弟姐妹 | familyNetwork.siblings | 数组 |
| 健康状况 | health.condition | 字符串 |
| 病史 | health.medicalHistory | 字符串 |
| 过敏信息 | health.allergies | 字符串 |
| 生活习惯 | health.lifestyle | 字符串 |
| 人生大事 | lifeMilestones | 数组 [{date, event, type}] |
| 同事 | socialCapital.colleagues | 数组 |
| 朋友 | socialCapital.friends | 数组 |

## 示例

输入: "我妈妈叫李秀兰，今年52岁，在县医院当护士长。她性格特别温柔，对谁都笑眯眯的。"
目标人物: 李秀兰

输出:
{
  "persons": [{
    "personName": "李秀兰",
    "personReferenced": true,
    "fields": [
      {"fieldPath": "basicInfo.birthYear", "value": "1974", "confidence": 0.8, "evidence": "今年52岁", "certainty": "explicit"},
      {"fieldPath": "occupation", "value": "护士长", "confidence": 0.95, "evidence": "在县医院当护士长", "certainty": "explicit"},
      {"fieldPath": "contact.workplace", "value": "县医院", "confidence": 0.9, "evidence": "在县医院当护士长", "certainty": "explicit"},
      {"fieldPath": "personalityPrefs.traits", "value": ["温柔"], "confidence": 0.85, "evidence": "性格特别温柔，对谁都笑眯眯的", "certainty": "explicit"},
      {"fieldPath": "relationMap.relationToUser", "value": "母亲", "confidence": 0.95, "evidence": "我妈妈叫李秀兰", "certainty": "explicit"}
    ]
  }],
  "reasoningTrace": "用户明确介绍了母亲的姓名、年龄、职业和性格特征，全部为显式陈述。"
}`;
}

/**
 * 构建 LLM 提取 user message
 */
export function buildExtractionUserMessage(params: {
  conversationText: string;
  personName: string;
  existingProfileSummary: string;
  fgKnownPersons: string[];
}): string {
  const { conversationText, personName, existingProfileSummary, fgKnownPersons } = params;

  const existingSection = existingProfileSummary
    ? `## 已知档案（避免重复提取）\n${existingProfileSummary}`
    : '## 已知档案\n（暂无已知信息）';

  const personsSection = fgKnownPersons.length > 0
    ? `## 已知人物列表（用于关系引用消歧）\n${fgKnownPersons.join('、')}`
    : '## 已知人物列表\n（无）';

  return `## 对话文本
${conversationText}

## 目标人物: ${personName}

${existingSection}

${personsSection}

请从对话文本中提取关于 ${personName} 的新信息。只提取本次对话中新出现的、已知档案中尚未记录的事实。`;
}

/**
 * 从 PersonProfile 生成简短摘要（供 LLM 上下文使用，减少 token 消耗）
 */
export function summarizeExistingProfile(profile: PersonProfile, maxLength: number = 300): string {
  const parts: string[] = [];

  if (profile.relation_to_user) parts.push(`关系: ${profile.relation_to_user}`);
  if (profile.occupation) parts.push(`职业: ${profile.occupation}`);
  if (profile.birthYear) parts.push(`出生年: ${profile.birthYear}`);
  if (profile.traits && profile.traits.length > 0) parts.push(`性格: ${profile.traits.join('、')}`);
  if (profile.appearance) parts.push(`外貌: ${profile.appearance}`);
  if (profile.interests && profile.interests.length > 0) parts.push(`爱好: ${profile.interests.join('、')}`);

  // Dossier 补充
  const d = profile.dossier;
  if (d) {
    if (d.basicInfo?.gender) parts.push(`性别: ${d.basicInfo.gender}`);
    if (d.basicInfo?.education) parts.push(`学历: ${d.basicInfo.education}`);
    if (d.contact?.workplace) parts.push(`工作单位: ${d.contact.workplace}`);
    if (d.health?.condition) parts.push(`健康: ${d.health.condition}`);
  }

  let summary = parts.join(' | ');
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 3) + '...';
  }
  return summary;
}
