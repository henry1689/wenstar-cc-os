/**
 * SceneMap.ts — 场景认知地图 (V3.1)
 * ==================================
 * 仿人脑海马体的位置细胞+网格细胞机制，构建用户主观经验空间地图。
 *
 * 双世界模型区分:
 *   SceneMap = 用户主观经验认知空间（海马体原生能力，V3.1）
 *   瑶光     = 客观物理世界空间（后续对接）
 *
 * V1.0 轻量化: 场景哈希+层级拓扑+邻接关系，不引入GIS坐标。
 *
 * 三核联动:
 *   ① FG人类关系网络 → 场景下的人际事件挂载 scene 节点
 *   ② 知识库第二大脑 → 场景下沉淀的认知归档对应 scene
 *   ③ 时空一体 —— 记忆同时绑定时间+空间
 *
 * 使用:
 *   const map = new SceneMap(sqlite);
 *   map.recordScene(locationFingerprint, entities, topics);
 *   const memories = map.queryByScene('咖啡厅', { limit: 10 });
 */
import type { SQLiteAdapter } from '../../m2/SQLiteAdapter.js';

export interface SceneNode {
  sceneId: string;
  sceneLabel: string;
  parentScene: string | null;
  adjacency: string[];
  visitCount: number;
  lastVisitedAt: string;
  associatedTopics: string[];
  fgEvents: string[];
  kbEntries: string[];
}

export interface SceneMemoryResult {
  sceneLabel: string;
  memoryIds: string[];
  fgPersons: string[];
  kbTopics: string[];
}

export class SceneMap {
  private sqlite: SQLiteAdapter;

  constructor(sqlite: SQLiteAdapter) {
    this.sqlite = sqlite;
  }

  // ═══════════════════════════════════════════════════════
  //  场景记录（θ 节律每次对话调用）
  // ═══════════════════════════════════════════════════════

  /**
   * 记录或更新一个场景访问
   * @param locationFingerprint DNA 的 location_fingerprint
   * @param entities 本轮涉及的实体（人物）
   * @param topics 本轮话题关键词
   */
  recordScene(locationFingerprint: string, entities: string[], topics: string[]): string {
    if (!locationFingerprint) return '';

    // 位置细胞: 场景哈希 = hash(location_fingerprint 前缀) → 同类场景自动聚类
    const sceneId = this._hashScene(locationFingerprint);
    const sceneLabel = this._extractSceneLabel(locationFingerprint);
    const now = new Date().toISOString();

    try {
      const existing = this.sqlite.queryAll(
        "SELECT visit_count, associated_topics, fg_events, kb_entries FROM scene_map WHERE scene_id = ? LIMIT 1",
        [sceneId]
      );

      if (existing && existing.length > 0) {
        const row = existing[0] as any;
        const newCount = (row.visit_count || 0) + 1;

        // 合并话题
        const oldTopics: string[] = JSON.parse(row.associated_topics || '[]');
        const mergedTopics = [...new Set([...oldTopics, ...topics])].slice(0, 20);
        const fgEvents: string[] = JSON.parse(row.fg_events || '[]');

        // 有新人名 → 追加 FG 事件引用
        if (entities.length > 0) {
          for (const e of entities) {
            if (!fgEvents.includes(e) && e !== '我') fgEvents.push(e);
          }
        }

        this.sqlite.writeRaw(
          `UPDATE scene_map SET scene_label = ?, visit_count = ?, last_visited_at = ?, associated_topics = ?, fg_events = ? WHERE scene_id = ?`,
          [sceneLabel, newCount, now, JSON.stringify(mergedTopics), JSON.stringify(fgEvents.slice(0, 30)), sceneId]
        );
      } else {
        this.sqlite.writeRaw(
          `INSERT INTO scene_map (scene_id, scene_label, parent_scene, adjacency, visit_count, last_visited_at, associated_topics, fg_events, kb_entries)
           VALUES (?, ?, ?, '[]', 1, ?, ?, ?, '[]')`,
          [sceneId, sceneLabel, this._extractParentScene(locationFingerprint),
           now, JSON.stringify(topics.slice(0, 10)), JSON.stringify(entities.filter(e => e !== '我').slice(0, 10))]
        );
      }

      return sceneId;
    } catch (err) {
      console.warn('[SceneMap] 记录失败:', err);
      return sceneId;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  网格细胞: 邻接关系
  // ═══════════════════════════════════════════════════════

  /**
   * 记录场景邻接: 同一天内先后访问 A→B，建立 A↔B 相邻边
   */
  recordAdjacency(sceneA: string, sceneB: string): void {
    if (!sceneA || !sceneB || sceneA === sceneB) return;
    try {
      this._addToJsonArray(sceneA, 'adjacency', sceneB);
      this._addToJsonArray(sceneB, 'adjacency', sceneA);
    } catch { /* 静默 */ }
  }

  /**
   * 从最近访问场景中找到当前场景的父级（上一场景→父场景）
   */
  private _addToJsonArray(sceneId: string, column: string, value: string): void {
    const rows = this.sqlite.queryAll(`SELECT ${column} FROM scene_map WHERE scene_id = ?`, [sceneId]);
    if (!rows || rows.length === 0) return;
    const arr: string[] = JSON.parse((rows[0] as any)[column] || '[]');
    if (!arr.includes(value)) {
      arr.push(value);
      this.sqlite.writeRaw(`UPDATE scene_map SET ${column} = ? WHERE scene_id = ?`, [JSON.stringify(arr.slice(-20)), sceneId]);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  查询（θ 节律 / API 调用）
  // ═══════════════════════════════════════════════════════

  /**
   * 按场景标签模糊查询 → 返回该场景下的所有关联信息
   */
  queryByScene(keyword: string): SceneMemoryResult | null {
    try {
      const rows = this.sqlite.queryAll(
        "SELECT * FROM scene_map WHERE scene_label LIKE ? OR associated_topics LIKE ? LIMIT 1",
        [`%${keyword}%`, `%${keyword}%`]
      );
      if (!rows || rows.length === 0) return null;

      const row = rows[0] as any;
      const sceneLabel = row.scene_label;
      const fgPersons: string[] = JSON.parse(row.fg_events || '[]');
      const kbTopics: string[] = JSON.parse(row.associated_topics || '[]');

      // 反查 memories: 找该场景下的记忆
      const memRows = this.sqlite.queryAll(
        "SELECT id FROM memories WHERE location_fingerprint LIKE ? ORDER BY created_at DESC LIMIT 10",
        [`%${sceneLabel}%`]
      );
      const memoryIds = memRows?.map((r: any) => r.id as string) || [];

      return { sceneLabel, memoryIds, fgPersons, kbTopics };
    } catch { return null; }
  }

  /**
   * 获取热门场景 Top-N
   */
  getTopScenes(limit = 5): SceneNode[] {
    try {
      const rows = this.sqlite.queryAll(
        "SELECT * FROM scene_map ORDER BY visit_count DESC LIMIT ?", [limit]
      );
      return (rows || []).map((r: any) => ({
        sceneId: r.scene_id,
        sceneLabel: r.scene_label,
        parentScene: r.parent_scene,
        adjacency: JSON.parse(r.adjacency || '[]'),
        visitCount: r.visit_count || 0,
        lastVisitedAt: r.last_visited_at,
        associatedTopics: JSON.parse(r.associated_topics || '[]'),
        fgEvents: JSON.parse(r.fg_events || '[]'),
        kbEntries: JSON.parse(r.kb_entries || '[]'),
      }));
    } catch { return []; }
  }

  /**
   * 获取与给定场景相邻的场景列表
   */
  getAdjacentScenes(sceneLabel: string): string[] {
    try {
      const rows = this.sqlite.queryAll(
        "SELECT adjacency FROM scene_map WHERE scene_label LIKE ? LIMIT 1", [`%${sceneLabel}%`]
      );
      if (!rows || rows.length === 0) return [];
      return JSON.parse((rows[0] as any).adjacency || '[]');
    } catch { return []; }
  }

  // ═══════════════════════════════════════════════════════
  //  工具
  // ═══════════════════════════════════════════════════════

  private _hashScene(locationFingerprint: string): string {
    // 位置细胞: 取 fingerprint 前缀生成场景ID，同类场景自动聚类
    const prefix = locationFingerprint.split('_').slice(0, 2).join('_') || locationFingerprint;
    let hash = 0;
    for (let i = 0; i < prefix.length; i++) {
      hash = ((hash << 5) - hash) + prefix.charCodeAt(i);
      hash |= 0;
    }
    return `sc_${Math.abs(hash).toString(16).padStart(12, '0')}`;
  }

  private _extractSceneLabel(fingerprint: string): string {
    const parts = fingerprint.split('_').filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 2).join('_');
    return fingerprint.substring(0, 40);
  }

  private _extractParentScene(fingerprint: string): string | null {
    const parts = fingerprint.split('_').filter(Boolean);
    if (parts.length >= 3) return parts[0] + '_' + parts[1];
    if (parts.length === 2) return parts[0];
    return null;
  }
}
