/**
 * WikiLinkResolver.ts — [[wikilink]] 解析与图谱构建 (V4.0 Phase 2)
 * ==================================================================
 * 解析 MD 文件中的 [[wikilink]] 语法（支持 [[实体名]]、[[路径]]、[[名|别名]]）。
 * 构建跨文件引用图谱和反向链接索引。
 *
 * 使用:
 *   const resolver = new WikiLinkResolver(gateway);
 *   const graph = resolver.buildLinkGraph();
 *   const backlinks = resolver.getBacklinks('徐诗雨');
 */

import type { SecondBrainGateway } from './SecondBrainGateway.js';

export interface LinkEdge {
  source: string;       // 源文件路径
  target: string;       // 目标 wikilink 文本
  context: string;      // wikilink 周围 50 字符上下文
  alias?: string;       // 别名（[[名|别名]]）
}

export interface LinkGraph {
  edges: LinkEdge[];
  /** 节点（文件路径）→ 出链列表 */
  forwardLinks: Map<string, string[]>;
  /** wikilink 文本 → 引用该文本的文件列表 */
  backlinks: Map<string, string[]>;
}

export class WikiLinkResolver {
  private gateway: SecondBrainGateway;
  private _graph: LinkGraph | null = null;

  constructor(gateway: SecondBrainGateway) {
    this.gateway = gateway;
  }

  /** 构建完整的 [[wikilink]] 引用图谱 */
  buildLinkGraph(): LinkGraph {
    if (this._graph) return this._graph;

    const edges: LinkEdge[] = [];
    const forwardLinks = new Map<string, string[]>();
    const backlinks = new Map<string, string[]>();

    const files = this.gateway.scanWikiMDFiles();
    for (const file of files) {
      const entry = this.gateway.getWikiEntry(file.path);
      if (!entry) continue;

      // 解析正文中的 [[wikilink]]
      const linkMatches = entry.content.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
      const outLinks: string[] = [];

      for (const match of linkMatches) {
        const target = match[1].trim();
        const alias = match[2]?.trim();
        const matchIdx = match.index || 0;
        const contextStart = Math.max(0, matchIdx - 25);
        const contextEnd = Math.min(entry.content.length, matchIdx + match[0].length + 25);
        const context = entry.content.substring(contextStart, contextEnd).replace(/\n/g, ' ');

        const edge: LinkEdge = { source: file.path, target, context, alias };
        edges.push(edge);
        outLinks.push(target);

        // 构建反向链接
        if (!backlinks.has(target)) backlinks.set(target, []);
        const bls = backlinks.get(target)!;
        if (!bls.includes(file.path)) bls.push(file.path);
      }

      forwardLinks.set(file.path, outLinks);
    }

    this._graph = { edges, forwardLinks, backlinks };
    console.log(`[WikiLink] 图谱构建完成: ${edges.length} 条边, ${backlinks.size} 个被引用节点`);
    return this._graph;
  }

  /** 获取某个实体的反向链接列表 */
  getBacklinks(entityName: string): string[] {
    if (!this._graph) this.buildLinkGraph();
    return this._graph!.backlinks.get(entityName) || [];
  }

  /** 查找两个文件之间的链接路径（BFS，最多 3 跳） */
  findPath(fromPath: string, toPath: string, maxHops = 3): string[] | null {
    if (!this._graph) this.buildLinkGraph();
    const graph = this._graph!;

    // BFS
    const visited = new Set<string>();
    const queue: Array<{ path: string; route: string[] }> = [{ path: fromPath, route: [fromPath] }];
    visited.add(fromPath);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.route.length > maxHops + 1) continue;

      const outLinks = graph.forwardLinks.get(current.path) || [];
      for (const link of outLinks) {
        // 尝试将 wikilink 解析为实际文件路径
        const targetPath = this._resolveWikilinkToPath(link);
        if (targetPath === toPath) return [...current.route, toPath];
        if (targetPath && !visited.has(targetPath)) {
          visited.add(targetPath);
          queue.push({ path: targetPath, route: [...current.route, targetPath] });
        }
      }
    }
    return null;
  }

  /** 使缓存失效（文件变更后调用） */
  invalidate(): void {
    this._graph = null;
  }

  // ─── 内部 ───

  /** 将 wikilink 文本解析为实际文件路径 */
  private _resolveWikilinkToPath(wikilink: string): string | null {
    const cleanName = wikilink.replace(/\.md$/, '');
    const files = this.gateway.scanWikiMDFiles();

    // 精确匹配
    for (const f of files) {
      if (f.path === `${cleanName}.md` || f.path === cleanName) return f.path;
    }
    // 标题匹配
    for (const f of files) {
      if (f.title === cleanName) return f.path;
    }
    // 别名匹配
    for (const f of files) {
      if (f.aliases.includes(cleanName)) return f.path;
    }
    return null;
  }
}
