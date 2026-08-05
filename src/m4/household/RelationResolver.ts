/**
 * RelationResolver — 人物关系统一解析器 (V12.0 P1-6)
 * ====================================================
 * 所有 "X 与我的关系是什么" 查询必须经过此模块。
 *
 * 权威源声明:
 *   - 人物关系事实唯一权威来源 = FamilyGraph.edges
 *   - nodes.properties.relation_to_user = 展示缓存，不可作为判断依据
 *
 * 设计原则:
 *   - 单一入口: 所有调用方通过此模块而非直接读 profile.relation_to_user
 *   - 可审计: 每次解析记录 source 字段
 */

export interface RelationResult {
  label: string;
  source: 'edges' | 'profile_cache' | 'fixes_map' | 'unknown';
  edgeType?: string;
}

/** P1-4: 硬编码关系修正映射 */
const RELATION_FIXES: Record<string, string> = {
  '徐诗雨': '同事——熊勇的下属（高峰电业）',
  '徐诗韵': '密友——通过姐姐诗雨认识',
  '徐诗涵': '密友——通过姐姐诗雨认识',
  '熊梓铭': '熊勇的女儿（心理学专业学生）',
  '熊梓玥': '熊勇的小女儿（学生）',
  '熊勇': '同事——高峰电业营销总监',
  '王全芬': '熊勇的妻子（全职太太）',
  '阿苏': '徐家姐妹的母亲（全职太太）',
  '徐东伟': '徐家姐妹的父亲（在贵港务工）',
};

/**
 * 解析人物与用户的关系。
 *
 * 优先级: edges → profile缓存 → fixes硬编码 → '未知'
 *
 * @param fg  FamilyGraph 实例（any — FG 接口过大，避免耦合其具体类型）
 * @param personName  人物名
 */
export function resolveRelationToUser(fg: any, personName: string): RelationResult {
  // ① 从 FamilySummary 获取（edges 计算结果）
  try {
    const summary = fg?.getFamilySummary?.();
    if (summary?.members) {
      for (const m of summary.members) {
        if (m.name === personName && m.relation_to_user) {
          return { label: String(m.relation_to_user), source: 'edges' };
        }
      }
    }
  } catch { /* fall through */ }

  // ② 从 profile.relation_to_user 读取缓存
  try {
    const profile = fg?.getPersonProfile?.(personName);
    if (profile?.relation_to_user) {
      return { label: String(profile.relation_to_user), source: 'profile_cache' };
    }
  } catch { /* fall through */ }

  // ③ fixes 硬编码兜底
  if (RELATION_FIXES[personName]) {
    return { label: RELATION_FIXES[personName], source: 'fixes_map' };
  }

  return { label: '未知', source: 'unknown' };
}

/**
 * 批量解析
 */
export function resolveRelations(fg: any, names: string[]): Map<string, RelationResult> {
  const results = new Map<string, RelationResult>();
  for (const name of names) {
    results.set(name, resolveRelationToUser(fg, name));
  }
  return results;
}

/**
 * 判断两个人物之间是否存在关系（名字互相包含）
 */
export function hasRelation(fg: any, personA: string, personB: string): boolean {
  try {
    const summary = fg?.getFamilySummary?.();
    if (summary?.members) {
      return summary.members.some(
        (m: any) => m.name === personA && String(m.relation_to_user || '').includes(personB)
      ) || summary.members.some(
        (m: any) => m.name === personB && String(m.relation_to_user || '').includes(personA)
      );
    }
  } catch { /* fall through */ }
  return false;
}

export default { resolveRelationToUser, resolveRelations, hasRelation };
