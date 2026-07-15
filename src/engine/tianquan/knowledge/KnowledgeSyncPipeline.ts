/**
 * KnowledgeSyncPipeline.ts — 夜间批量同步流水线 (V4.0 Phase 2)
 * ==============================================================
 * 将第二大脑（知识库 MD 文件）的变更同步到第一大脑（memories 表）。
 * Phase 2 为骨架实现：文件扫描 + 摘要提取 + 标签提取。
 * Phase 3 补充：向量编码 + PFC 校验 + 写入 memories 表。
 *
 * 使用:
 *   const pipeline = new KnowledgeSyncPipeline(gateway, watcher, sqlite);
 *   const report = await pipeline.run(changedFiles);
 */

import type { SecondBrainGateway } from './SecondBrainGateway.js';
import type { MDFileWatcher } from './MDFileWatcher.js';
import type { SQLiteAdapter } from '../../../m2/SQLiteAdapter.js';
import type { SyncReport } from './types.js';

export class KnowledgeSyncPipeline {
  private gateway: SecondBrainGateway;
  private watcher: MDFileWatcher;
  private sqlite: SQLiteAdapter;

  constructor(
    gateway: SecondBrainGateway,
    watcher: MDFileWatcher,
    sqlite: SQLiteAdapter,
  ) {
    this.gateway = gateway;
    this.watcher = watcher;
    this.sqlite = sqlite;
  }

  /**
   * 执行同步流水线
   * @param changedFiles 可选：指定要处理的文件列表；不传则从 MDFileWatcher 获取
   */
  async run(changedFiles?: string[]): Promise<SyncReport> {
    const startTime = Date.now();
    const report: SyncReport = {
      timestamp: new Date().toISOString(),
      totalScanned: 0,
      changed: 0,
      newFiles: 0,
      deletedFiles: 0,
      summariesGenerated: 0,
      embeddingsGenerated: 0,
      goldEntriesCreated: 0,
      cascadeCleared: 0,
      errors: [],
    };

    try {
      // ① 获取变更文件列表
      const changes = changedFiles
        ? changedFiles.map(p => ({ type: 'modified' as const, path: p, timestamp: new Date().toISOString() }))
        : this.watcher.getChanges();

      const newFiles = changes.filter(c => c.type === 'created');
      const modFiles = changes.filter(c => c.type === 'modified');
      const delFiles = changes.filter(c => c.type === 'deleted');

      report.changed = changes.length;
      report.newFiles = newFiles.length;
      report.deletedFiles = delFiles.length;

      // ② 处理删除：记录级联待处理标记
      for (const del of delFiles) {
        try {
          // 在 source_tracking 中标记 expired（级联删除由 SleepTimeConsolidator 执行）
          this.sqlite.writeRaw(
            "UPDATE source_tracking SET status = 'orphaned' WHERE source_path = ? AND status = 'active'",
            [del.path]
          );
          report.cascadeCleared++;
        } catch (err) {
          report.errors.push(`删除处理失败 ${del.path}: ${(err as Error).message}`);
        }
      }

      // ③ 处理新增和修改
      const processFiles = [...newFiles, ...modFiles];
      report.totalScanned = processFiles.length;

      for (const change of processFiles) {
        try {
          const manifest = this.gateway.getManifest(change.path);
          if (!manifest) {
            report.errors.push(`文件不存在: ${change.path}`);
            continue;
          }

          // ④ 提取摘要（首 200 字符）
          const summary = this.gateway.getMDSummary(change.path);
          if (summary) report.summariesGenerated++;

          // ⑤ 提取标签（从 frontmatter 和正文关键词）
          const tags = this._extractTags(manifest, summary || '');

          // ⑥ Phase 2 骨架：将摘要写入 hippocampal_index 作为经验条目
          //    Phase 3 补充：向量编码 + PFC 校验 + 写入 memories 表
          const expSig = `exp:wiki:${manifest.uuid}`.substring(0, 64);
          const expContent = `【${manifest.title}】${summary || ''} | 标签: ${tags.join(', ')}`.substring(0, 500);

          this.sqlite.writeRaw(
            `INSERT OR REPLACE INTO hippocampal_index (context_signature, memory_locations, calcium_boost, last_activated_at, experience_summary, created_at)
             VALUES (?, '["__wiki__"]', 0.3, ?, ?, ?)`,
            [expSig, new Date().toISOString(), expContent, new Date().toISOString()]
          );

          report.goldEntriesCreated++;
        } catch (err) {
          report.errors.push(`文件处理失败 ${change.path}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      report.errors.push(`同步流水线整体失败: ${(err as Error).message}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SyncPipeline] 同步完成: ${report.goldEntriesCreated} 条, ${report.errors.length} 个错误 (${elapsed}s)`);

    return report;
  }

  // ─── 内部 ───

  /** 从 manifest 和正文摘要中提取标签 */
  private _extractTags(manifest: any, summary: string): string[] {
    const tags = new Set<string>(manifest.tags || []);

    // 简单关键词提取
    const keywordPatterns = [
      { regex: /工作|项目|方案|会议|客户|文档|报告/, tag: '工作' },
      { regex: /健康|身体|锻炼|跑步|游泳|健身/, tag: '健康' },
      { regex: /家人|父母|爸爸|妈妈|姐姐|妹妹|哥哥|弟弟/, tag: '家庭' },
      { regex: /喜欢|偏好|习惯|爱好|兴趣/, tag: '偏好' },
      { regex: /学习|研究|知识|读书|课程/, tag: '学习' },
      { regex: /旅行|旅游|出行|游玩/, tag: '旅行' },
    ];

    for (const { regex, tag } of keywordPatterns) {
      if (regex.test(summary)) tags.add(tag);
    }

    return [...tags].slice(0, 10);
  }
}
