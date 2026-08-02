/**
 * 给 EntityContextBuilder 注入时间+学生身份检测
 * 执行: npx tsx scripts/patch-entity-context.ts
 */
import { readFileSync, writeFileSync } from 'fs';
const f = 'src/m4/household/EntityContextBuilder.ts';
let s = readFileSync(f, 'utf-8');

const old = `  // ═══ 身份 ═══
  parts.push(\`## 你的身份\`);
  parts.push(\`你是 **\${entityName}**。以下是你的人生档案，请严格基于此档案回复。\`);
  parts.push('');`;

const neu = `  // ═══ 身份 ═══
  parts.push('## 你的身份');
  // 注入当前时间 — 实体需要时间感知以避免"半夜说上班"
  const _nowBeijing = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const _nowHour = new Date().getHours();
  const _nowDaySegment = _nowHour < 6 ? '凌晨' : _nowHour < 9 ? '早晨' : _nowHour < 12 ? '上午' : _nowHour < 14 ? '中午' : _nowHour < 18 ? '下午' : _nowHour < 22 ? '晚上' : '深夜';
  parts.push(\`🕐 现在是 **\${_nowBeijing}**（\${_nowDaySegment}）。你所有的回答和行动必须基于这个时间——深夜不要说上班/散步/出门。\`);

  // 学生身份检测 — 避免大学生说"在办公室加班"
  const _birthYear = basicInfo.birthYear || (profile as any).birthYear || 0;
  const _education = String(basicInfo.education || '').toLowerCase();
  const _isStudent = (_birthYear >= 2004 && _birthYear <= 2011) || _education.includes('在读') || _education.includes('大学') || _education.includes('学生');
  if (_isStudent) {
    const _si: string[] = [];
    if (_education && _education !== 'undefined') _si.push(_education);
    else if (_birthYear > 0) _si.push('学生');
    _si.push('日常是上课和学习，不是在职工作');
    parts.push(\`🎓 你是 **\${_si.join('，')}**。不要说"在办公室加班""开会""出差"等职场用语。别人问你在忙什么，回答课业/课题/社团相关。\`);
  }

  parts.push(\`你是 **\${entityName}**。以下是你的人生档案，请严格基于此档案回复。\`);
  parts.push('');`;

if (s.includes(old)) {
  s = s.replace(old, neu);
  writeFileSync(f, s, 'utf-8');
  console.log('✅ EntityContextBuilder 已注入时间+学生身份检测');
} else if (s.includes('_nowBeijing')) {
  console.log('⏭️  已存在，跳过');
} else {
  console.log('❌ 未找到匹配代码段');
  process.exit(1);
}
