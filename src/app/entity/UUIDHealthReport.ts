/**
 * UUIDHealthReport — 实体归属健康面板 (V12.0 P0-4)
 * ===================================================
 * 查询 belong_entity_uuid 标注率、垃圾实体、UUID 断裂等指标。
 * 供启动日志和 /api/health 端点使用。
 */

export interface UUIDHealth {
  /** 标注率（百分比） */
  conversationsRate: number;
  memoriesRate: number;
  blackDiamondRate: number;
  knowledgeBaseRate: number;
  entitiesRate: number;

  /** 绝对计数 */
  conversationsTotal: number;
  conversationsAnnotated: number;
  memoriesTotal: number;
  memoriesAnnotated: number;
  blackDiamondTotal: number;
  blackDiamondAnnotated: number;
  knowledgeBaseTotal: number;
  knowledgeBaseAnnotated: number;
  entitiesTotal: number;
  entitiesWithUUID: number;

  /** 异常检测 */
  orphanUUIDs: number;         // belong_entity_uuid 指向不存在的 FG node
  duplicateNameUUIDs: number;  // 同名多 UUID 冲突
  garbageEntities: number;     // 疑似垃圾实体（单字名）
  personsWithoutUUID: number;  // person 类型但无 UUID

  /** 总体健康度（0-100） */
  overallHealth: number;

  timestamp: string;
}

/** 垃圾实体候选（非人物实体的常见误提取） */
const GARBAGE_PATTERNS = [
  '我', '你', '他', '她', '它', '公司', '学校', '家', '小说',
  '开心', '难过', '时候', '东西', '什么', '怎么', '这个', '那个',
  '学生', '老师', '朋友', '同事', '客户',
];

function isGarbageEntity(name: string): boolean {
  if (name.length < 2) return true;
  if (GARBAGE_PATTERNS.includes(name)) return true;
  if (/^\d+$/.test(name)) return true;
  return false;
}

/**
 * 生成 UUID 健康报告
 *
 * @param db sql.js Database 实例
 * @param fg  FamilyGraph 实例（需提供 getAllPersonNames / getUUIDByName）
 */
export function reportUUIDHealth(db: any, fg?: any): UUIDHealth {
  const now = new Date().toISOString();
  const q = (sql: string) => {
    try {
      const r = db.exec(sql);
      return r.length && r[0].values.length ? Number(r[0].values[0][0]) || 0 : 0;
    } catch { return 0; }
  };

  // 标注率
  const conversationsTotal = q("SELECT COUNT(*) FROM conversations");
  const conversationsAnnotated = q("SELECT COUNT(*) FROM conversations WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''");
  const memoriesTotal = q("SELECT COUNT(*) FROM memories");
  const memoriesAnnotated = q("SELECT COUNT(*) FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''");
  const blackDiamondTotal = q("SELECT COUNT(*) FROM black_diamond");
  const blackDiamondAnnotated = q("SELECT COUNT(*) FROM black_diamond WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''");
  const knowledgeBaseTotal = q("SELECT COUNT(*) FROM knowledge_base");
  const knowledgeBaseAnnotated = q("SELECT COUNT(*) FROM knowledge_base WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''");
  const entitiesTotal = q("SELECT COUNT(*) FROM entities WHERE type='person'");
  const entitiesWithUUID = q("SELECT COUNT(*) FROM entities WHERE type='person' AND uuid IS NOT NULL AND uuid != ''");

  // 异常检测
  const orphanUUIDs = q(
    "SELECT COUNT(DISTINCT m.belong_entity_uuid) FROM memories m WHERE m.belong_entity_uuid IS NOT NULL AND m.belong_entity_uuid NOT IN (SELECT e.uuid FROM entities e WHERE e.uuid IS NOT NULL)"
  );
  const personsWithoutUUID = q("SELECT COUNT(*) FROM entities WHERE type='person' AND (uuid IS NULL OR uuid = '')");

  // 垃圾实体
  let garbageEntities = 0;
  try {
    const r = db.exec("SELECT name FROM entities WHERE type='person'");
    if (r.length && r[0].values) {
      for (const [name] of r[0].values) {
        if (isGarbageEntity(String(name))) garbageEntities++;
      }
    }
  } catch { /* skip */ }

  // 同名多UUID
  let duplicateNameUUIDs = 0;
  try {
    const r = db.exec(
      "SELECT name, COUNT(DISTINCT uuid) as cnt FROM entities WHERE type='person' AND uuid IS NOT NULL GROUP BY name HAVING cnt > 1"
    );
    duplicateNameUUIDs = r.length && r[0].values ? r[0].values.length : 0;
  } catch { /* skip */ }

  // 整体健康度
  const rates = [
    conversationsTotal > 0 ? conversationsAnnotated / conversationsTotal : 0,
    memoriesTotal > 0 ? memoriesAnnotated / memoriesTotal : 0,
    blackDiamondTotal > 0 ? blackDiamondAnnotated / blackDiamondTotal : 0,
    knowledgeBaseTotal > 0 ? knowledgeBaseAnnotated / knowledgeBaseTotal : 0,
    entitiesTotal > 0 ? entitiesWithUUID / entitiesTotal : 0,
  ];
  const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const overallHealth = Math.round(avgRate * 100);

  return {
    conversationsRate: Math.round(conversationsTotal > 0 ? conversationsAnnotated / conversationsTotal * 100 : 0),
    memoriesRate: Math.round(memoriesTotal > 0 ? memoriesAnnotated / memoriesTotal * 100 : 0),
    blackDiamondRate: Math.round(blackDiamondTotal > 0 ? blackDiamondAnnotated / blackDiamondTotal * 100 : 0),
    knowledgeBaseRate: Math.round(knowledgeBaseTotal > 0 ? knowledgeBaseAnnotated / knowledgeBaseTotal * 100 : 0),
    entitiesRate: Math.round(entitiesTotal > 0 ? entitiesWithUUID / entitiesTotal * 100 : 0),

    conversationsTotal, conversationsAnnotated,
    memoriesTotal, memoriesAnnotated,
    blackDiamondTotal, blackDiamondAnnotated,
    knowledgeBaseTotal, knowledgeBaseAnnotated,
    entitiesTotal, entitiesWithUUID,

    orphanUUIDs, duplicateNameUUIDs, garbageEntities, personsWithoutUUID,
    overallHealth,
    timestamp: now,
  };
}

/**
 * 格式化健康报告为日志字符串
 */
export function formatHealthReport(report: UUIDHealth): string {
  const lines = [
    `[UUIDHealth] 总体健康度: ${report.overallHealth}%`,
    `  对话标注: ${report.conversationsRate}% (${report.conversationsAnnotated}/${report.conversationsTotal})`,
    `  记忆标注: ${report.memoriesRate}% (${report.memoriesAnnotated}/${report.memoriesTotal})`,
    `  黑钻标注: ${report.blackDiamondRate}% (${report.blackDiamondAnnotated}/${report.blackDiamondTotal})`,
    `  知识库标注: ${report.knowledgeBaseRate}% (${report.knowledgeBaseAnnotated}/${report.knowledgeBaseTotal})`,
    `  实体UUID: ${report.entitiesRate}% (${report.entitiesWithUUID}/${report.entitiesTotal})`,
  ];
  if (report.orphanUUIDs > 0) lines.push(`  ⚠️ 孤儿UUID: ${report.orphanUUIDs} 个 (belong_entity_uuid 指向不存在的实体)`);
  if (report.duplicateNameUUIDs > 0) lines.push(`  ⚠️ 同名多UUID: ${report.duplicateNameUUIDs} 组`);
  if (report.garbageEntities > 0) lines.push(`  ⚠️ 疑似垃圾实体: ${report.garbageEntities} 个`);
  return lines.join('\n');
}

export default { reportUUIDHealth, formatHealthReport };
