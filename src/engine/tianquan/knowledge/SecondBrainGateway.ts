/**
 * SecondBrainGateway.ts — 第二大脑统一入口 (V4.0 Phase 2)
 * ==========================================================
 * 知识库（第二大脑）与天权系统的唯一入口。
 * 扫描 data/knowledge-v4/ 目录，提供 MD 文件清单、摘要、[[wikilink]] 查询。
 *
 * 职责:
 *   - 扫描 raw/ + wiki/ + governance/ 目录结构
 *   - 构建 MD 文件索引（frontmatter + 正文摘要）
 *   - 提供按文件路径/wikilink关键词的查询接口
 *   - 管理 projections/knowledge.db 投影层
 *
 * 与 KnowledgeBridge 的关系:
 *   - SecondBrainGateway = 第二大脑侧，读 MD 文件系统
 *   - KnowledgeBridge = 第一大脑侧，查 SQLite 投影
 *   - 两者不重叠，互补
 *
 * 使用:
 *   const gateway = new SecondBrainGateway(vaultPath);
 *   await gateway.initialize();
 *   const files = gateway.scanWikiMDFiles();
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { MDFileManifest, WikiEntry } from './types.js';

export class SecondBrainGateway {
  readonly vaultPath: string;
  private _initialized = false;
  /** 内存索引：相对路径 → MDFileManifest */
  private _index = new Map<string, MDFileManifest>();

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /** 初始化：扫描 vault 目录，构建内存索引 */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._ensureDirectories();
    await this._buildIndex();
    this._initialized = true;
    console.log(`[2ndBrain] 初始化完成: ${this._index.size} 个 MD 文件`);
  }

  /** 扫描 wiki/ 下所有 MD 文件清单 */
  scanWikiMDFiles(): MDFileManifest[] {
    this._ensureInit();
    return [...this._index.values()];
  }

  /** 按相对路径获取一个文件的清单 */
  getManifest(relativePath: string): MDFileManifest | null {
    this._ensureInit();
    return this._index.get(relativePath) || null;
  }

  /** 校验路径安全：确保解析后的路径仍在 vaultPath 内，防止路径遍历攻击 */
  private _validatePath(subdir: string, relativePath: string): string | null {
    const resolved = path.resolve(this.vaultPath, subdir, relativePath);
    const allowedPrefix = path.resolve(this.vaultPath, subdir) + path.sep;
    if (!resolved.startsWith(allowedPrefix) && resolved !== path.resolve(this.vaultPath, subdir)) {
      console.warn('[SecondBrainGateway] 路径遍历拒绝:', relativePath);
      return null;
    }
    return resolved;
  }

  /** 获取 MD 文件的摘要（frontmatter + 首 200 字符正文） */
  getMDSummary(relativePath: string): string | null {
    const manifest = this._index.get(relativePath);
    if (!manifest) return null;
    const fullPath = this._validatePath('wiki', relativePath);
    if (!fullPath) return null;
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = this._parseFrontmatter(raw);
      const body = parsed.body || '';
      const summary = body.substring(0, 200).replace(/\n/g, ' ').trim();
      return summary || `[${manifest.title}]`;
    } catch {
      return `[${manifest.title}]`;
    }
  }

  /** 获取完整的 WikiEntry（含正文、关系、反向链接） */
  getWikiEntry(relativePath: string): WikiEntry | null {
    const manifest = this._index.get(relativePath);
    if (!manifest) return null;
    const fullPath = this._validatePath('wiki', relativePath);
    if (!fullPath) return null;
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = this._parseFrontmatter(raw);
      const relations = (parsed.frontmatter?.relations as any[]) || [];
      const backlinks = this._findBacklinks(relativePath);
      return {
        manifest,
        summary: (parsed.body || '').substring(0, 200).replace(/\n/g, ' ').trim(),
        content: parsed.body || '',
        relations: relations.map((r: any) => ({ target: r.target || '', type: r.type || '' })),
        backlinks,
      };
    } catch {
      return null;
    }
  }

  /** 按 wikilink 关键词查找关联的 MD 文件 */
  queryByWikilink(keyword: string): MDFileManifest[] {
    this._ensureInit();
    const results: MDFileManifest[] = [];
    for (const [relPath, manifest] of this._index) {
      // 匹配文件名、标题、别名、标签或 wikilink 引用
      const fileName = path.basename(relPath, '.md');
      if (
        fileName.includes(keyword) ||
        manifest.title.includes(keyword) ||
        manifest.aliases.some(a => a.includes(keyword)) ||
        manifest.tags.some(t => t.includes(keyword)) ||
        manifest.wikilinks.some(w => w.includes(keyword))
      ) {
        results.push(manifest);
      }
    }
    return results;
  }

  /** 获取索引统计 */
  getStats(): { totalFiles: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const m of this._index.values()) {
      byType[m.type] = (byType[m.type] || 0) + 1;
    }
    return { totalFiles: this._index.size, byType };
  }

  // ═══════════════════════════════════════════════════════
  //  内部
  // ═══════════════════════════════════════════════════════

  private _ensureInit(): void {
    if (!this._initialized) throw new Error('SecondBrainGateway 未初始化，请先调用 initialize()');
  }

  private _ensureDirectories(): void {
    const dirs = ['raw', 'wiki', 'governance', 'projections'];
    for (const d of dirs) {
      const p = path.join(this.vaultPath, d);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
  }

  /** 全量扫描 knowledge-md/ 构建内存索引（wiki子目录 + 根目录双路径） */
  private async _buildIndex(): Promise<void> {
    this._index.clear();
    // V10.1: 同时扫描 wiki/ 子目录（旧结构）和根目录（平铺模式）
    const wikiPath = path.join(this.vaultPath, 'wiki');
    let scanned = false;
    if (fs.existsSync(wikiPath) && fs.statSync(wikiPath).isDirectory()) {
      await this._scanDir(wikiPath, 'wiki');
      scanned = true;
    }
    // 根目录也扫描（knowledge-md/ 中有大量平铺MD文件）
    await this._scanDir(this.vaultPath, '');
    if (!scanned && this._index.size === 0) {
      console.log('[2ndBrain] 无MD文件发现——请确认 knowledge-md/ 目录');
    }
  }

  private async _scanDir(dir: string, relPrefix: string): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await this._scanDir(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const manifest = this._buildManifest(fullPath, relPath);
          if (manifest) this._index.set(relPath, manifest);
        } catch { /* 跳过无法解析的文件 */ }
      }
    }
  }

  private _buildManifest(fullPath: string, relPath: string): MDFileManifest | null {
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const stat = fs.statSync(fullPath);
    const parsed = this._parseFrontmatter(raw);
    const fm: Record<string, any> = (parsed.frontmatter || {}) as Record<string, any>;

    const sha256 = createHash('sha256').update(raw).digest('hex');
    const wikilinks = this._extractWikilinks(raw);

    return {
      uuid: fm.uuid || `auto_${sha256.substring(0, 12)}`,
      path: relPath,
      title: fm.title || path.basename(relPath, '.md'),
      type: fm.type || 'unknown',
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      aliases: Array.isArray(fm.aliases) ? fm.aliases : [],
      sha256,
      size: stat.size,
      createdAt: fm.created || stat.birthtime.toISOString(),
      updatedAt: fm.updated || stat.mtime.toISOString(),
      lastIndexedAt: fm.last_indexed,
      indexStatus: fm.index_status || 'pending',
      sourceType: fm.source_type || 'manual',
      confidence: fm.confidence || 'medium',
      claimType: fm.claim_type || 'stated',
      wikilinks,
    };
  }

  /** 简易 YAML frontmatter 解析（不依赖 gray-matter 库） */
  private _parseFrontmatter(raw: string): { frontmatter: Record<string, unknown> | null; body: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: null, body: raw };
    const yamlBlock = match[1];
    const body = match[2] || '';
    const fm: Record<string, unknown> = {};
    // 简易 YAML 解析（仅支持字符串、数组、单行值）
    const lines = yamlBlock.split('\n');
    let currentKey = '';
    for (const line of lines) {
      const arrayMatch = line.match(/^\s+-\s+(.+)$/);
      if (arrayMatch && currentKey) {
        const arr = fm[currentKey] as any[];
        if (Array.isArray(arr)) arr.push(arrayMatch[1].trim().replace(/^["']|["']$/g, ''));
        continue;
      }
      const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
      if (kvMatch) {
        currentKey = kvMatch[1];
        let value: unknown = kvMatch[2].trim();
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (/^".*"$/.test(value as string) || /^'.*'$/.test(value as string)) {
          value = (value as string).slice(1, -1);
        }
        fm[currentKey] = value;
      }
    }
    return { frontmatter: fm, body };
  }

  /** 提取正文中的 [[wikilink]] */
  private _extractWikilinks(raw: string): string[] {
    const links: string[] = [];
    const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      links.push(match[1].trim());
    }
    return [...new Set(links)];
  }

  /** 查找反向链接（哪些文件引用了当前文件） */
  private _findBacklinks(targetPath: string): string[] {
    const fileName = path.basename(targetPath, '.md');
    const backlinks: string[] = [];
    for (const [relPath, manifest] of this._index) {
      if (relPath === targetPath) continue;
      if (manifest.wikilinks.some(w => {
        const wName = w.replace(/\.md$/, '');
        return wName === fileName || manifest.aliases.includes(w);
      })) {
        backlinks.push(relPath);
      }
    }
    return backlinks;
  }
}
