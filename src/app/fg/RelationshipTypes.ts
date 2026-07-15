/**
 * RelationshipTypes.ts — 人类世界关系类型体系
 * ============================================
 * 定义六大类关系的枚举、映射、子类型、置信度配置。
 * 覆盖人类全社交圈层：家庭/亲属/朋友/职场/社交/其他。
 *
 * 使用:
 *   import { RELATION_CATEGORY, getRelationCategory, describeRelation } from './RelationshipTypes.js';
 *   const cat = getRelationCategory('mother_of');  // → RELATION_CATEGORY.FAMILY
 */

// ── 六大关系大类 ──
export enum RELATION_CATEGORY {
  FAMILY    = 'family',     // 家庭直系/姻亲
  KINSHIP   = 'kinship',    // 血亲远亲
  FRIEND    = 'friend',     // 朋友/同窗/战友
  COLLEAGUE = 'colleague',  // 职场/商业
  SOCIAL    = 'social',     // 社交/邻里/师生
  OTHER     = 'other',      // 偶像/历史/公众人物
}

export const CATEGORY_LABELS: Record<RELATION_CATEGORY, string> = {
  [RELATION_CATEGORY.FAMILY]: '家庭关系',
  [RELATION_CATEGORY.KINSHIP]: '亲属关系',
  [RELATION_CATEGORY.FRIEND]: '朋友关系',
  [RELATION_CATEGORY.COLLEAGUE]: '职场关系',
  [RELATION_CATEGORY.SOCIAL]: '社交关系',
  [RELATION_CATEGORY.OTHER]: '其他关系',
};

/** 固有子类型 → 大类映射（全量关系类型字典） */
export interface RelationTypeDef {
  category: RELATION_CATEGORY;
  label: string;           // 中文描述（"母亲"）
  reverse: string;         // 反向关系名（"child_of" → "parent_of"）
}

export const RELATION_TYPE_DEFS: Record<string, RelationTypeDef> = {
  // ── 家庭关系 family ──
  'mother_of':         { category: RELATION_CATEGORY.FAMILY, label: '母亲', reverse: 'child_of' },
  'father_of':         { category: RELATION_CATEGORY.FAMILY, label: '父亲', reverse: 'child_of' },
  'parent_of':         { category: RELATION_CATEGORY.FAMILY, label: '父母', reverse: 'child_of' },
  'spouse_of':         { category: RELATION_CATEGORY.FAMILY, label: '配偶', reverse: 'spouse_of' },
  'child_of':          { category: RELATION_CATEGORY.FAMILY, label: '子女', reverse: 'parent_of' },
  'sibling_of':        { category: RELATION_CATEGORY.FAMILY, label: '兄弟姐妹', reverse: 'sibling_of' },
  'step_mother_of':    { category: RELATION_CATEGORY.FAMILY, label: '继母', reverse: 'step_child_of' },
  'step_father_of':    { category: RELATION_CATEGORY.FAMILY, label: '继父', reverse: 'step_child_of' },
  'mother_in_law_of':  { category: RELATION_CATEGORY.FAMILY, label: '岳母/婆婆', reverse: 'child_in_law_of' },
  'father_in_law_of':  { category: RELATION_CATEGORY.FAMILY, label: '岳父/公公', reverse: 'child_in_law_of' },
  'ex_spouse_of':      { category: RELATION_CATEGORY.FAMILY, label: '前配偶', reverse: 'ex_spouse_of' },

  // ── 亲属关系 kinship ──
  'grandfather_of':    { category: RELATION_CATEGORY.KINSHIP, label: '爷爷/外公', reverse: 'grandchild_of' },
  'grandmother_of':    { category: RELATION_CATEGORY.KINSHIP, label: '奶奶/外婆', reverse: 'grandchild_of' },
  'grandchild_of':     { category: RELATION_CATEGORY.KINSHIP, label: '孙辈', reverse: 'grandparent_of' },
  'uncle_of':          { category: RELATION_CATEGORY.KINSHIP, label: '叔叔/舅舅', reverse: 'nibling_of' },
  'aunt_of':           { category: RELATION_CATEGORY.KINSHIP, label: '姑姑/姨妈', reverse: 'nibling_of' },
  'cousin_of':         { category: RELATION_CATEGORY.KINSHIP, label: '堂表亲', reverse: 'cousin_of' },
  'nibling_of':        { category: RELATION_CATEGORY.KINSHIP, label: '侄子/外甥', reverse: 'uncle_of' },
  'distant_relative_of': { category: RELATION_CATEGORY.KINSHIP, label: '远亲', reverse: 'distant_relative_of' },

  // ── 朋友关系 friend ──
  'close_friend_of':   { category: RELATION_CATEGORY.FRIEND, label: '挚友', reverse: 'close_friend_of' },
  'friend_of':         { category: RELATION_CATEGORY.FRIEND, label: '朋友', reverse: 'friend_of' },
  'classmate_of':      { category: RELATION_CATEGORY.FRIEND, label: '同学', reverse: 'classmate_of' },
  'roommate_of':       { category: RELATION_CATEGORY.FRIEND, label: '室友', reverse: 'roommate_of' },
  'comrade_of':        { category: RELATION_CATEGORY.FRIEND, label: '战友/队友', reverse: 'comrade_of' },
  'childhood_friend_of': { category: RELATION_CATEGORY.FRIEND, label: '发小', reverse: 'childhood_friend_of' },

  // ── 职场关系 colleague ──
  'colleague_of':      { category: RELATION_CATEGORY.COLLEAGUE, label: '同事', reverse: 'colleague_of' },
  'boss_of':           { category: RELATION_CATEGORY.COLLEAGUE, label: '上司', reverse: 'subordinate_of' },
  'subordinate_of':    { category: RELATION_CATEGORY.COLLEAGUE, label: '下属', reverse: 'boss_of' },
  'partner_of':        { category: RELATION_CATEGORY.COLLEAGUE, label: '合伙人', reverse: 'partner_of' },
  'client_of':         { category: RELATION_CATEGORY.COLLEAGUE, label: '客户', reverse: 'server_of' },
  'mentor_of':         { category: RELATION_CATEGORY.COLLEAGUE, label: '导师', reverse: 'protege_of' },
  'protege_of':        { category: RELATION_CATEGORY.COLLEAGUE, label: '门徒', reverse: 'mentor_of' },
  'collaborator_of':   { category: RELATION_CATEGORY.COLLEAGUE, label: '合作伙伴', reverse: 'collaborator_of' },

  // ── 社交关系 social ──
  'neighbor_of':       { category: RELATION_CATEGORY.SOCIAL, label: '邻居', reverse: 'neighbor_of' },
  'fellow_fan_of':     { category: RELATION_CATEGORY.SOCIAL, label: '同好', reverse: 'fellow_fan_of' },
  'teacher_of':        { category: RELATION_CATEGORY.SOCIAL, label: '老师', reverse: 'student_of' },
  'student_of':        { category: RELATION_CATEGORY.SOCIAL, label: '学生', reverse: 'teacher_of' },
  'doctor_of':         { category: RELATION_CATEGORY.SOCIAL, label: '医生', reverse: 'patient_of' },
  'patient_of':        { category: RELATION_CATEGORY.SOCIAL, label: '患者', reverse: 'doctor_of' },
  'acquaintance_of':   { category: RELATION_CATEGORY.SOCIAL, label: '认识的人', reverse: 'acquaintance_of' },
  'member_of':         { category: RELATION_CATEGORY.SOCIAL, label: '成员', reverse: 'org_of' },

  // ── 其他关系 other ──
  'idol_of':           { category: RELATION_CATEGORY.OTHER, label: '偶像/仰慕', reverse: 'fan_of' },
  'historical_figure': { category: RELATION_CATEGORY.OTHER, label: '历史人物', reverse: '' },
  'public_figure':     { category: RELATION_CATEGORY.OTHER, label: '公众人物', reverse: '' },
};

/** 获取关系类型定义 */
export function getRelationType(relation: string): RelationTypeDef | undefined {
  return RELATION_TYPE_DEFS[relation];
}

/** 获取关系所属大类 */
export function getRelationCategory(relation: string): RELATION_CATEGORY | undefined {
  return RELATION_TYPE_DEFS[relation]?.category;
}

/** 获取中文描述 */
export function describeRelation(relation: string): string {
  return RELATION_TYPE_DEFS[relation]?.label || relation.replace(/_/g, '/');
}

/** 获取反向关系 */
export function reverseRelation(relation: string): string {
  return RELATION_TYPE_DEFS[relation]?.reverse || relation;
}

/** 获取某大类的所有关系类型 */
export function getRelationsByCategory(category: RELATION_CATEGORY): string[] {
  return Object.entries(RELATION_TYPE_DEFS)
    .filter(([_, def]) => def.category === category)
    .map(([key]) => key);
}

/** 置信度阈值配置 */
export const CONFIDENCE = {
  /** 低于此值不输出到 LLM 上下文 */
  OUTPUT_THRESHOLD: 0.6,
  /** 对话首次提及的基础置信度 */
  BASE_FROM_CONVERSATION: 0.4,
  /** 含称谓的对话提及（"我妈妈"） */
  KINSHIP_FROM_CONVERSATION: 0.6,
  /** 知识库提取的置信度 */
  FROM_KNOWLEDGE: 0.7,
  /** 自动推理的置信度 */
  FROM_INFERENCE: 0.3,
  /** 累计提及 N 次后的置信度提升 */
  MENTION_BOOST: 0.05,
  /** 单次提及上限 */
  MAX_MENTION_BOOST: 0.3,
};

/** 人物生命阶段 */
export enum LIFE_STAGE {
  INFANT = 'infant',       // 婴儿 0-3
  CHILD = 'child',         // 儿童 4-12
  YOUTH = 'youth',         // 青少年 13-20
  ADULT = 'adult',         // 成年 21-60
  ELDERLY = 'elderly',     // 老年 60+
  DECEASED = 'deceased',   // 已故
  UNKNOWN = 'unknown',
}

export const LIFE_STAGE_LABELS: Record<LIFE_STAGE, string> = {
  [LIFE_STAGE.INFANT]: '婴幼儿',
  [LIFE_STAGE.CHILD]: '孩童',
  [LIFE_STAGE.YOUTH]: '青少年',
  [LIFE_STAGE.ADULT]: '成年',
  [LIFE_STAGE.ELDERLY]: '老年',
  [LIFE_STAGE.DECEASED]: '已故',
  [LIFE_STAGE.UNKNOWN]: '未知',
};

/** 人物状态 */
export enum PERSON_STATUS {
  ACTIVE = 'active',       // 活跃（近期提及）
  DORMANT = 'dormant',     // 休眠（90天未提及）
  ARCHIVED = 'archived',   // 归档（180天未提及）
}

/** 事件类型 */
export enum EVENT_TYPE {
  MILESTONE = 'milestone',           // 人生里程碑
  ACHIEVEMENT = 'achievement',       // 成就/荣誉
  CAREER_CHANGE = 'career_change',   // 职业变动
  CEREMONY = 'ceremony',             // 仪式（婚礼/葬礼）
  ILLNESS = 'illness',               // 疾病
  PASSING = 'passing',               // 离世
  BIRTH = 'birth',                   // 出生
  RELATIONSHIP = 'relationship',     // 关系变动（结婚/离婚）
  MOVING = 'moving',                 // 搬迁
  OTHER = 'other',
}
