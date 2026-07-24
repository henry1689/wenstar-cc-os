#!/usr/bin/env python3
"""V6.0 Phase 2+4+5+6: 多人上下文 + LLM摘要 + 纪要检索 + 问候协议"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ROOT = 'D:/tools/wenstar-cc'

# ==== EntityContextBuilder.ts: buildMultiEntityContext ====
with open(f'{ROOT}/src/m4/household/EntityContextBuilder.ts', 'r', encoding='utf-8') as f:
    src = f.read()

marker = "/** 获取实体的关系边 */"
insert_idx = src.find(marker)
assert insert_idx >= 0, "marker not found"

multi_ctx = r"""
/**
 * 🆕 V6.0: 构建多人会晤上下文。
 * 注入所有参与者的档案 + 人物间关系描述。
 */
export function buildMultiEntityContext(
  familyGraph: FamilyGraph,
  options: {
    entityNames: string[];
    isFirstTurn?: boolean;
  }
): EntityContextResult {
  const { entityNames, isFirstTurn = false } = options;

  const allProfiles = entityNames
    .map(name => ({ name, profile: familyGraph.getPersonProfile(name) }))
    .filter(p => !!p.profile);

  if (allProfiles.length === 0) {
    return {
      systemText: `多人会晤：${entityNames.join('、')}`,
      summary: '无档案',
      completeness: 0,
    };
  }

  const parts: string[] = [];
  parts.push(`## 多人会晤：${allProfiles.map(p => p.name).join('、')}`);
  parts.push('');
  parts.push(`你正在同时与 ${allProfiles.map(p => p.name).join('、')} 对话。鸿艺把你们叫到一起聊天、回忆、讨论。`);
  parts.push('');

  // 每个人档案摘要
  parts.push('### 在场人员');
  parts.push('');
  for (const { name, profile } of allProfiles) {
    const d = (profile as any).dossier || {};
    const bi = d.basicInfo || {};
    const sp = d.selfProfile || {};
    const si = d.socialIdentity || {};
    const rel = (profile as any).relation_to_user || '';

    parts.push(`**${name}**`);
    const bio: string[] = [];
    if (bi.gender) bio.push(bi.gender);
    if (bi.birthYear) bio.push(`${bi.birthYear}年生`);
    if (bi.education) bio.push(bi.education);
    if (si.currentOccupation) bio.push(si.currentOccupation);
    if (rel) bio.push(`与鸿艺的关系: ${rel}`);
    if (bio.length > 0) parts.push(bio.join(' | '));
    if (sp.traits && sp.traits.length) parts.push(`性格: ${sp.traits.slice(0, 4).join('、')}`);
    parts.push('');
  }

  // 人物间关系
  const interRels = _buildInterRelations(familyGraph, entityNames);
  if (interRels.length > 0) {
    parts.push('### 你们之间的关系');
    for (const rel of interRels) parts.push(`- ${rel}`);
    parts.push('');
  }

  // 规则
  parts.push('### 多人会晤规则');
  parts.push('- 你是你自己（不是玉瑶、不是AI），以你的档案身份和性格说话');
  parts.push('- 鸿艺说"你"时，根据上下文判断他在对谁说话');
  parts.push('- 每次发言开头或中间自然地带上你的自称，让大家知道谁在说话');
  parts.push('- 可以回应其他人说的内容，像真实的多人聚会一样');
  parts.push('- 档案里有的信息自信回答，没有的如实说不知道');

  const systemText = parts.join('\n');

  return {
    systemText,
    summary: `${allProfiles.length}人会晤`,
    completeness: Math.round(
      allProfiles.reduce((s, p) => s + ((p.profile as any).completeness || 0), 0) / allProfiles.length * 100
    ),
  };
}

/**
 * 🆕 V6.0: 提取在场人员两两之间的关系。
 */
function _buildInterRelations(familyGraph: FamilyGraph, entityNames: string[]): string[] {
  const result: string[] = [];
  const fg = familyGraph as any;
  if (typeof fg.getRelatedPersons !== 'function') return result;

  const nameSet = new Set(entityNames);
  const seen = new Set<string>();
  for (const name of entityNames) {
    const persons = fg.getRelatedPersons(name) || [];
    for (const p of persons) {
      if (nameSet.has(p.name) && p.name !== name) {
        const pairKey = [name, p.name].sort().join('\x00');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const label = getRelationLabel(p.relation, true);
        result.push(`${name} 与 ${p.name}: ${label}`);
      }
    }
  }
  return result;
}

"""

src = src[:insert_idx] + multi_ctx + src[insert_idx:]
with open(f'{ROOT}/src/m4/household/EntityContextBuilder.ts', 'w', encoding='utf-8') as f:
    f.write(src)
print('✅ EntityContextBuilder.ts — buildMultiEntityContext')

# ==== EntityGreetingProtocol.ts: buildMultiGreeting ====
with open(f'{ROOT}/src/m4/household/EntityGreetingProtocol.ts', 'r', encoding='utf-8') as f:
    src = f.read()

marker = "export default buildGreetingProtocol;"
assert marker in src, "greeting marker not found"

greeting = r"""
/**
 * 🆕 V6.0: 多人会晤开场协议。
 */
export function buildMultiGreeting(
  profiles: Array<{ name: string; relation: string }>,
  userName: string = '鸿艺',
): string {
  const nameList = profiles.map(p => p.name).join('、');
  const lines: string[] = [];
  lines.push('## 🚪 多人会晤开场协议（仅本轮有效）');
  lines.push('');
  lines.push(`你们是 **${nameList}**。鸿艺把你们叫到一起。这是本次会晤的**第一轮**。`);
  lines.push('');
  lines.push('### 开场流程');
  lines.push('');
  for (const p of profiles) {
    const relDesc = p.relation ? `（鸿艺的${p.relation}）` : '';
    lines.push(`- **${p.name}**${relDesc}：自然地打个招呼，简单说你现在在做什么`);
  }
  lines.push('');
  lines.push('### 规则');
  lines.push('- 每个人都是真实的自己，不是玉瑶，不是AI');
  lines.push('- 只用 **1-2 句话** 打招呼，说完等大家回应');
  lines.push('- 第一个人先说话，其他人随后跟上');

  return lines.join('\n');
}

export default buildGreetingProtocol;
"""

src = src.replace(marker, greeting)
with open(f'{ROOT}/src/m4/household/EntityGreetingProtocol.ts', 'w', encoding='utf-8') as f:
    f.write(src)
print('✅ EntityGreetingProtocol.ts — buildMultiGreeting')

# ==== MeetingMinutesStore.ts: LLM summary ====
with open(f'{ROOT}/src/m4/household/MeetingMinutesStore.ts', 'r', encoding='utf-8') as f:
    src = f.read()

# Make generateAndStore async + support LLM callback
old = """  generateAndStore(
    name: string,
    participants: string[],
    turns: MeetingTurn[],
    summary?: string,
  ): MeetingMinutes {"""
new = """  async generateAndStore(
    name: string,
    participants: string[],
    turns: MeetingTurn[],
    summary?: string,
    generateSummary?: (turns: MeetingTurn[], participants: string[]) => Promise<string>,
  ): Promise<MeetingMinutes> {"""
src = src.replace(old, new)

old2 = """    // 系统自动生成摘要（如果 LLM 未提供）
    const autoSummary = summary || this._generateAutoSummary(name, participantNames, turns);"""
new2 = """    // 🆕 V6.0: LLM 摘要优先，失败降级
    let autoSummary = summary || '';
    if (!autoSummary && generateSummary) {
      try { autoSummary = await generateSummary(turns, participantNames); }
      catch { autoSummary = ''; }
    }
    if (!autoSummary) autoSummary = this._generateAutoSummary(name, participantNames, turns);"""
src = src.replace(old2, new2)

with open(f'{ROOT}/src/m4/household/MeetingMinutesStore.ts', 'w', encoding='utf-8') as f:
    f.write(src)
print('✅ MeetingMinutesStore.ts — async LLM summary')

print('\n🎉 V6.0 Phase 2+4+5+6 全部修补完成')
