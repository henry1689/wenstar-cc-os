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
