/**
 * 启动前补丁 — 给 EntityContextBuilder 注入时间+学生身份
 * 在 `## 你的身份` 之后插入，确保 LLM 第一时间看到时间和身份约束
 */
import { readFileSync, writeFileSync } from 'fs';

const f = 'src/m4/household/EntityContextBuilder.ts';
let s = readFileSync(f, 'utf-8');

if (s.includes('_nbj')) { console.log('[Patch] ⏭️ already patched'); process.exit(0); }

// 锚点: parts.push(`## 你的身份`);
const ANCHOR = 'parts.push(`## 你的身份`);';
if (!s.includes(ANCHOR)) { console.log('[Patch] ⚠️ anchor not found'); process.exit(0); }

const patch = `parts.push('## 你的身份');
  const _nbj = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const _nh = new Date().getHours();
  const _nds = _nh < 6 ? '凌晨' : _nh < 9 ? '早晨' : _nh < 12 ? '上午' : _nh < 14 ? '中午' : _nh < 18 ? '下午' : _nh < 22 ? '晚上' : '深夜';
  parts.push(\`🕐 现在是 **\${_nbj}**（\${_nds}）。你的所有行动必须基于这个时间。深夜不要说上班或出门。\`);
  const _by = basicInfo.birthYear || (profile as any).birthYear || 0;
  const _ed = String(basicInfo.education || '');
  if ((_by >= 2004 && _by <= 2011) || _ed.includes('在读') || _ed.includes('大学') || _ed.includes('学生')) {
    if (_ed && _ed !== 'undefined') parts.push(\`🎓 你是 **\${_ed}**，日常是上课学习，不是上班族。不要说"在办公室加班""开会""出差"。\`);
    else if (_by > 0) parts.push(\`🎓 你是 **学生**，日常是上课学习，不是上班族。不要说"在办公室加班""开会""出差"。\`);
  }`;

s = s.replace(
  `  parts.push(\`## 你的身份\`);`,
  patch
);

writeFileSync(f, s, 'utf-8');
console.log('[Patch] ✅ EntityContextBuilder 时间+学生身份注入完成');

// ── Patch 2: EntityMeeting._resolveEntity 修复 ──
const f2 = 'src/m4/household/EntityMeeting.ts';
let s2 = readFileSync(f2, 'utf-8');
const OLD_RESOLVE = `  private _resolveEntity(name: string): EntityInfo | null {\n    if (!name || name === '我') return null;\n    try {\n      const uuid = (this.familyGraph as any).getUUIDByName?.(name);\n      if (!uuid) return null;\n      const node = (this.familyGraph as any).query?.(\n        "SELECT name, uuid, category FROM nodes WHERE uuid = ?",\n        [uuid]\n      );\n      if (!node || node.length === 0) return null;\n      return {\n        name: node[0].name || name,\n        uuid: node[0].uuid || uuid,\n        category: node[0].category || 'G',\n      };\n    } catch {\n      return null;\n    }\n  }`;

const NEW_RESOLVE = `  private _resolveEntity(name: string): EntityInfo | null {
    if (!name || name === '我') return null;
    try {
      const uuid = (this.familyGraph as any).getUUIDByName?.(name);
      if (!uuid) { console.warn('[EntityMeeting] _resolveEntity uid miss: ' + name); return null; }
      let category = 'G';
      try { const entity = (this.familyGraph as any).getEntityByUUID?.(uuid); if (entity) category = entity.category || 'G'; } catch { /* non-critical */ }
      return { name, uuid, category };
    } catch {
      return null;
    }
  }`;

if (s2.includes(OLD_RESOLVE)) {
  s2 = s2.replace(OLD_RESOLVE, NEW_RESOLVE);
  writeFileSync(f2, s2, 'utf-8');
  console.log('[Patch] ✅ EntityMeeting._resolveEntity 已修复');
} else if (s2.includes('getEntityByUUID')) {
  console.log('[Patch] ⏭️  EntityMeeting 已打过补丁');
} else {
  console.log('[Patch] ⚠️  EntityMeeting 未匹配，可能已变更');
}
