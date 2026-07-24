/**
 * EntityContextBuilder — 实体会晤人物上下文构建器 V10.0
 * ======================================================
 * 从实体 dossier + edges 构建 LLM 上下文。
 * V10.0: 家庭+社交双区块，acquaintance_of 传递闭包，去重+方向修正
 */
import type { FamilyGraph, PersonProfile, PersonDossier } from './FamilyGraph.js';
import { getRelationLabel, getCorrectedRelation } from './shared/RelationLabels.js';
import { buildGreetingProtocol } from './EntityGreetingProtocol.js';

export interface EntityContextOptions {
  entityName: string; appearance?: boolean; feminineDetails?: boolean;
  recentHistoryCount?: number; isFirstTurn?: boolean; userName?: string;
  recentConversations?: Array<{ role: string; content: string; timestamp: string }>;
}
export interface EntityContextResult { systemText: string; summary: string; completeness: number; }

const GARBAGE_NAMES = new Set(['我','妹妹','妈妈','老婆','爸爸','姐姐','哥哥','弟弟','叔叔','公司','学生','小说','开心','时候你','纪实小','计划吗','那你','加班','爸爸','妈妈','姑姑','上司','小龙','老邱','老大','焦虑','方案','无聊','徐茜','徐敏','什么名字','那你说','那继续']);
const EXCLUDE_RELS = new Set(['grandchild_of','grandmother_of','grandfather_of','grandparent_of','lives_in','residence_of','has_appearance','has_feature','其他','认识的人']);

const SOCIAL_LABELS: Record<string,string> = {
  'colleague_of':'同事','boss_of':'上司','subordinate_of':'下属',
  'friend_of':'朋友','classmate_of':'同学','partner_of':'合伙人',
  'client_of':'客户','neighbor_of':'邻居','teacher_of':'老师',
  'spouse_of':'配偶','acquaintance_of':'认识的人',
};

export function buildEntityContext(familyGraph: FamilyGraph, options: EntityContextOptions): EntityContextResult {
  const { entityName, appearance=true, feminineDetails=false, recentHistoryCount=5, isFirstTurn=false, userName='鸿艺', recentConversations } = options;
  const profile = familyGraph.getPersonProfile(entityName);
  if (!profile) return { systemText: `你是 ${entityName}。（暂无详细档案）`, summary: `${entityName}: 档案不存在`, completeness: 0 };

  const dossier = profile.dossier || {} as PersonDossier;
  const selfProfile = dossier.selfProfile || {};
  const basicInfo = dossier.basicInfo || {};
  const socialIdentity = dossier.socialIdentity || {};
  const edges = _getRelatedEdges(familyGraph, entityName);
  const parts: string[] = [];

  // ═══ 身份 ═══
  parts.push(`## 你的身份`);
  parts.push(`你是 **${entityName}**。以下是你的人生档案，请严格基于此档案回复。`);
  parts.push('');

  // ===== 家庭关系摘要(核心+扩展亲属) =====
  const PARENT_RELS = new Set(["child_of","parent_of","mother_of","father_of"]);
  const SIBLING_RELS = new Set(["elder_sister_of","younger_sister_of","sister_of","elder_brother_of","younger_brother_of","brother_of","sibling_of"]);
  const EXT_FAMILY_RELS = new Set(["aunt_of","uncle_of","niece_of","nephew_of","cousin_of","grandmother_of","grandfather_of","grandchild_of"]);
  const parentEdges = edges.filter((e: any) => PARENT_RELS.has(e.relation));
  const siblingEdges = edges.filter((e: any) => SIBLING_RELS.has(e.relation));
  const extFamilyEdges = edges.filter((e: any) => EXT_FAMILY_RELS.has(e.relation));

  const hasFamily = parentEdges.length > 0 || siblingEdges.length > 0 || extFamilyEdges.length > 0;
  if (hasFamily) {
    parts.push('### 你的家人');
    const fatherNames: string[] = [];
    const motherNames: string[] = [];
    for (const e of parentEdges) {
      const p = familyGraph.getPersonProfile(e.entity);
      if (p && (p as any)?.dossier?.basicInfo?.gender === '女') motherNames.push(e.entity);
      else fatherNames.push(e.entity);
    }
    if (fatherNames.length) parts.push(`父亲：${fatherNames.join('、')}`);
    if (motherNames.length) parts.push(`母亲：${motherNames.join('、')}`);
    if (siblingEdges.length) {
      // 🔴 去重：同一人可能有多条同级关系边（如 elder_sister_of + younger_sister_of 同时存在），按名字去重
      const seenSibs = new Set<string>();
      const uniqueSibs = siblingEdges.filter((e: any) => { if (seenSibs.has(e.entity)) return false; seenSibs.add(e.entity); return true; });
      parts.push(`兄弟姐妹：${uniqueSibs.map((e: any) => `${e.entity}（${e.relationLabel}）`).join('、')}`);
    }
    if (extFamilyEdges.length) {
      // 分组展示
      const grouped: Record<string, string[]> = {};
      for (const e of extFamilyEdges) {
        const lbl = e.relationLabel || e.relation;
        if (!grouped[lbl]) grouped[lbl] = [];
        grouped[lbl].push(e.entity);
      }
      for (const [lbl, names] of Object.entries(grouped)) {
        parts.push(`${lbl}：${names.join('、')}`);
      }
    }
    parts.push('');
  }

  // ═══ 基本信息 ═══
  const bioParts: string[] = [];
  if (basicInfo.gender) bioParts.push(`性别: ${basicInfo.gender}`);
  if (basicInfo.birthYear) bioParts.push(`出生年: ${basicInfo.birthYear}`);
  if (basicInfo.education) bioParts.push(`学历: ${basicInfo.education}`);
  if (basicInfo.maritalStatus) bioParts.push(`婚姻: ${basicInfo.maritalStatus}`);
  if (bioParts.length > 0) { parts.push('### 基本信息'); parts.push(bioParts.join('  |  ')); parts.push(''); }

  // ═══ 社会身份 ═══
  const socParts: string[] = [];
  if (socialIdentity.currentOccupation) socParts.push(`职业: ${socialIdentity.currentOccupation}`);
  if (socialIdentity.currentWorkplace) socParts.push(`工作单位: ${socialIdentity.currentWorkplace}`);

  // 🔴 关系标签：优先从 FG edges 计算（不会被迁移覆盖），fallback 到 profile.relation_to_user
  const MY_RELATION_LABELS: Record<string, string> = {
    'child_of': '鸿艺的孩子', 'parent_of': '鸿艺的家长', 'mother_of': '鸿艺的母亲', 'father_of': '鸿艺的父亲',
    'younger_sister_of': '鸿艺的妹妹', 'elder_sister_of': '鸿艺的姐姐', 'sister_of': '鸿艺的姐妹',
    'younger_brother_of': '鸿艺的弟弟', 'elder_brother_of': '鸿艺的哥哥', 'brother_of': '鸿艺的兄弟', 'sibling_of': '鸿艺的兄妹',
    'spouse_of': '鸿艺的配偶', 'colleague_of': '同事', 'boss_of': '上司', 'subordinate_of': '下属',
    'friend_of': '朋友', 'classmate_of': '同学', 'acquaintance_of': '认识的人',
  };
  let _relationLabel = '';
  for (const e of edges) {
    if (MY_RELATION_LABELS[e.relation]) {
      _relationLabel = MY_RELATION_LABELS[e.relation];
      if (!['认识的人', '同事', '朋友', '同学'].includes(_relationLabel)) break; // 亲密关系优先
    }
  }
  if (!_relationLabel && profile.relation_to_user) _relationLabel = profile.relation_to_user;
  // V10.4: 使用共享修正函数（RelationLabels.ts 唯一定义点）
  _relationLabel = getCorrectedRelation(entityName, _relationLabel);
  if (_relationLabel) socParts.push(`与鸿艺的关系: ${_relationLabel}`);
  if (socParts.length > 0) { parts.push('### 社会身份'); parts.push(socParts.join('  |  ')); parts.push(''); }

  // ═══ 性格 ═══
  if (selfProfile.traits?.length) { parts.push('### 性格'); parts.push(selfProfile.traits.join('、')); parts.push(''); }

  // ═══ 社交关系（系统级：通过 acquaintance_of 传递闭包构建完整人际网络） ═══
  // 原理：entity → acquaintance_of → 所有人 → 过滤社交类型标签
  // 展示 entity 直接和间接认识的所有同事/朋友等
  const allKnownNames = familyGraph.getAllPersonNames?.() || [];
  const knownSet = new Set(allKnownNames.filter((n: string) => !GARBAGE_NAMES.has(n) && n !== entityName));
  const socialDirect = edges.filter((e: any) => SOCIAL_LABELS[e.relation]);
  const seen = new Set(socialDirect.map((e: any) => e.entity));

  // 传递闭包：通过 acquaintance_of 找到所有间接认识的人
  const acqEdges = edges.filter((e: any) => e.relation === 'acquaintance_of');
  for (const ae of acqEdges) {
    if (!seen.has(ae.entity) && knownSet.has(ae.entity)) {
      socialDirect.push({ ...ae, relation: 'acquaintance_of', relationLabel: '认识的人' });
      seen.add(ae.entity);
    }
  }

  if (socialDirect.length > 0) {
    // 收集家庭标签中已有的人（不重复展示在社交区）
    const familyNames = new Set<string>();
    for (const e of [...parentEdges, ...siblingEdges, ...extFamilyEdges]) familyNames.add(e.entity);

    // V10.0: 标签升级 — 通过传递闭包确定精确关系类型
    const upgraded = socialDirect
      .filter((e: any) => !familyNames.has(e.entity)) // 排除已有家族边的人
      .map((e: any) => {
        const personEdges = _getRelatedEdges(familyGraph, e.entity);
        const isColleague = personEdges.some((pe: any) => pe.relation === 'colleague_of');
        const isBoss = personEdges.some((pe: any) => pe.relation === 'boss_of');
        const isSub = personEdges.some((pe: any) => pe.relation === 'subordinate_of');
        if (isBoss) return { ...e, label: '上司' };
        if (isSub) return { ...e, label: '下属' };
        if (isColleague) return { ...e, label: '同事' };
        return { ...e, label: SOCIAL_LABELS[(e as any).relation] || e.relationLabel };
      });

    parts.push('### 你认识的人');
    for (const e of upgraded) {
      parts.push(`- ${e.entity}：${(e as any).label}`);
    }
    parts.push('（以上是你的人际网络。有人问你认不认识，你认识——档案里写了。不知道具体细节就说"知道但不太清楚详情"。）');
    parts.push('');
  }

  // ═══ 外貌 ═══
  if (appearance) {
    const ap: string[] = [];
    if (selfProfile.appearance) ap.push(selfProfile.appearance);
    if (selfProfile.bodyFeatures) ap.push(selfProfile.bodyFeatures);
    if (selfProfile.style) ap.push(selfProfile.style);
    if (ap.length > 0) { parts.push('### 外貌'); parts.push(ap.join(' | ')); parts.push(''); }
  }

  // ═══ 人生里程碑 ═══
  if (dossier.lifeMilestones?.length) {
    parts.push('### 人生里程碑');
    for (const ms of dossier.lifeMilestones.slice(0, 3)) parts.push(`- ${ms.date}: ${ms.event}`);
    parts.push('');
  }

  // ═══ 行为约束 ═══
  parts.push('### 规则');
  parts.push(`- 你就是 ${entityName} 本人。基于你的档案和过去的对话记忆来回应鸿艺。`);
  parts.push(`- 🔴【自称铁律 · 系统级规范】你的每一条回复中，除了括号里的心理描写外，在**正文语句里**必须自然地带上你的名字或自称（如"${entityName}觉得…""${entityName.slice(-2)}在这儿呢""我${entityName}…"）。这是为了让鸿艺一眼认出是谁在说话，也是系统识别说话人的兜底规则。`);
  parts.push('- 🔴【回忆 ≠ 编造】下面的【过去的对话记忆】是你和鸿艺之间**真实发生过的对话**——这是你亲身的经历，不是编造。当你回顾这些记忆时，是在**回忆事实**。你可以自然地讲述记忆中发生的事、说过的话——因为那些是真实存在的。');
  parts.push('- 🔴【反编造铁律】你只能在记忆中找到的内容范围内回忆。如果记忆片段中完全没有鸿艺提到的某个具体事件、场景或细节——那说明这件事确实没发生过，或者你确实不记得了。此时你应该诚实地说"这个我没印象了"或"你再提醒我一下？"——**绝不能自己补全细节**。');
  parts.push('- 提到别人时你仍是你自己，不替别人说话。');

  let systemText = parts.join('\n');
  if (isFirstTurn) {
    const greeting = buildGreetingProtocol(profile, userName);
    if (greeting) systemText = greeting + '\n\n' + systemText;
  }

  return {
    systemText,
    summary: `${entityName}: ${profile.relation_to_user || ''} ${socialIdentity.currentOccupation || ''}`.trim(),
    completeness: Math.round((profile.completeness || 0) * 100),
  };
}

/** 获取实体的关系边——过滤+去重+按类型分类 */
function _getRelatedEdges(familyGraph: FamilyGraph, entityName: string): Array<{ entity: string; relationLabel: string; relation: string }> {
  try {
    const fg = familyGraph as any;
    if (typeof fg.getRelatedPersons !== 'function') return [];
    const persons = fg.getRelatedPersons(entityName) || [];
    // 排序：家族边优先，确保去重时保留家族关系而非 acquaintance_of
    const FAM_PRIORITY = new Set(['child_of','parent_of','mother_of','father_of','spouse_of',
      'elder_sister_of','younger_sister_of','sister_of','brother_of','sibling_of',
      'aunt_of','uncle_of','niece_of','nephew_of','cousin_of','grandmother_of','grandfather_of',
      // V10.0: 工作关系也优先于 acquaintance_of
      'colleague_of','boss_of','subordinate_of','friend_of','classmate_of']);
    persons.sort((a: any, b: any) => (FAM_PRIORITY.has(a.relation) ? 0 : 1) - (FAM_PRIORITY.has(b.relation) ? 0 : 1));

    return persons
      .filter((p: any) => !GARBAGE_NAMES.has(p.name) && !EXCLUDE_RELS.has(p.relation))
      .map((p: any) => ({ entity: p.name || p.entity, relationLabel: getRelationLabel(p.relation, false), relation: p.relation }))
      .filter((p: any, i: number, arr: any[]) => !arr.slice(0, i).some((x: any) => x.entity === p.entity)); // 去重
  } catch { return []; }
}

/** V6.0: 多人会晤上下文 */
export function buildMultiEntityContext(familyGraph: FamilyGraph, options: { entityNames: string[]; isFirstTurn?: boolean }): EntityContextResult {
  const { entityNames, isFirstTurn = false } = options;
  const allProfiles = entityNames.map(name => ({ name, profile: familyGraph.getPersonProfile(name) })).filter(p => !!p.profile);
  if (allProfiles.length === 0) return { systemText: `多人会晤：${entityNames.join('、')}`, summary: '无档案', completeness: 0 };
  const parts: string[] = [];
  parts.push(`## 多人会晤：${allProfiles.map(p => p.name).join('、')}`);
  parts.push('');
  for (const { name, profile } of allProfiles) {
    const bi = (profile as any).dossier?.basicInfo || {};
    const si = (profile as any).dossier?.socialIdentity || {};
    const sp = (profile as any).dossier?.selfProfile || {};
    parts.push(`**${name}**`);
    const b: string[] = [];
    if (bi.gender) b.push(bi.gender);
    if (bi.birthYear) b.push(`${bi.birthYear}年生`);
    if (si.currentOccupation) b.push(si.currentOccupation);
    if (b.length) parts.push(b.join(' | '));
    if (sp.traits?.length) parts.push(`性格: ${sp.traits.slice(0,4).join('、')}`);
    parts.push('');
  }
  parts.push('### 规则');
  parts.push('- 你是你自己（不是玉瑶、不是AI），以档案身份和性格说话');
  parts.push('- 每次发言自然带上自称，让大家知道谁在说话');
  return { systemText: parts.join('\n'), summary: `${allProfiles.length}人会晤`, completeness: 50 };
}

export default buildEntityContext;
