#!/usr/bin/env python3
"""Patch FamilyGraph.ts: add backup + self node integrity check."""
import os

os.chdir('d:/tools/wenstar-cc')

with open('src/m4/FamilyGraph.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old = "    this.markDirty();\n  }"

new = """    this.markDirty();

    // FG基建加固：启动时自动备份 + "我"节点完整性检查
    this._ensureBackup();
    this._ensureSelfNode();
  }

  /**
   * FG基建加固：自动备份到 data/webui/backups/family_graph/
   */
  private _ensureBackup(): void {
    try {
      const backupDir = join(dirname(this.dbPath), '..', 'backups', 'family_graph');
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const backupPath = join(backupDir, 'family_graph_backup_' + ts + '.db');
      if (existsSync(this.dbPath)) {
        copyFileSync(this.dbPath, backupPath);
        console.log('[FG Shield] 自动备份完成: ' + backupPath);
      }
    } catch (e) {
      console.warn('[FG Shield] 自动备份失败:', e);
    }
  }

  /**
   * FG基建加固：确保"我"节点存在（家族图谱的基石）
   */
  private _ensureSelfNode(): void {
    try {
      const existing = this.query("SELECT id FROM nodes WHERE name = ? AND type = ?", ['我', 'person']);
      if (existing.length === 0) {
        const meId = uid();
        const now = new Date().toISOString();
        const meProps = JSON.stringify({ name: '我', type: 'self', relation_to_user: '自己' });
        this.run("INSERT INTO nodes (id, type, name, properties, created_at, updated_at) VALUES (?, 'person', '我', ?, ?, ?)",
          [meId, meProps, now, now]);
        console.log('[FG Shield] "我"节点丢失！已重建 id=' + meId);
        this.markDirty(true);
      } else {
        this.userNodeId = existing[0].id;
      }
    } catch (e) {
      console.error('[FG Shield] "我"节点检查失败:', e);
    }
  }"""

if old in content:
    content = content.replace(old, new)
    with open('src/m4/FamilyGraph.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK: Added backup + self-node check')
else:
    print('FAIL: pattern not found')
    # Debug: show around the area
    idx = content.find('this.markDirty()')
    if idx >= 0:
        print(content[idx:idx+50])
