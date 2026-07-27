/**
 * DossierService — 人物档案门面服务 (V12.0 P1-1)
 * ================================================
 * FamilyGraph 的 typed wrapper，封装 PersonProfile/dossier 读写操作。
 * 不修改 FamilyGraph 内部实现 — 只提供类型安全的外部 API。
 */

/** 档案完整性分数 (0-100) */
export type CompletenessScore = number;

export class DossierService {
  constructor(private fg: any) {}

  /** 获取人物完整档案 */
  get(name: string): any | null {
    try {
      return this.fg.getPersonProfile?.(name) ?? null;
    } catch { return null; }
  }

  /** 更新人物档案字段 */
  update(name: string, fields: Record<string, any>): boolean {
    try {
      this.fg.updatePersonProfile?.(name, fields);
      return true;
    } catch { return false; }
  }

  /** 获取人物的关系描述（走 RelationResolver 而非旧 relation_to_user） */
  getRelation(name: string): string {
    const profile = this.get(name);
    if (!profile) return '未知';
    return profile.relation_to_user || '未知';
  }

  /** 获取人物出生年份（年龄唯一来源） */
  getBirthYear(name: string): number | null {
    const profile = this.get(name);
    if (!profile) return null;
    const dossier = profile.dossier;
    const by = dossier?.basicInfo?.birthYear || profile.birthYear;
    return by ? parseInt(String(by), 10) || null : null;
  }

  /** 判断档案是否完整 */
  getCompleteness(name: string): CompletenessScore {
    const profile = this.get(name);
    if (!profile) return 0;
    const keys = ['name', 'relation_to_user', 'appearance', 'personality', 'occupation', 'birthYear'];
    const filled = keys.filter(k => !!profile[k]);
    return Math.round((filled.length / keys.length) * 100);
  }

  /** 获取外貌描述 */
  getAppearance(name: string): string {
    return this.get(name)?.appearance || '';
  }

  /** 批量获取已知人物名列表 */
  listNames(): string[] {
    try {
      return this.fg.getFamilySummary?.()?.members?.map((m: any) => m.name) || [];
    } catch { return []; }
  }
}

export default DossierService;
