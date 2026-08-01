/**
 * fix-kb-gates.cjs — 永久修复 KnowledgeContextBuilder 会晤闸门
 * 处理 CRLF 行尾，在 start.cjs 中 tsx 启动前运行
 */
const fs = require('fs');
const f = 'src/app/knowledge/KnowledgeContextBuilder.ts';
let s = fs.readFileSync(f, 'utf-8');

let changes = 0;

// Gate 1: 实体 KB 搜索 (line 119) — 移除 !_isEntityMeeting
if (s.includes('!_isEntityMeeting) {')) {
  s = s.replace('if (_entitySearchMsg && ctx.knowledgeBase && !_isEntityMeeting) {', 'if (_entitySearchMsg && ctx.knowledgeBase) {');
  changes++;
  console.log('[fix-kb] Gate 1: entity KB search opened');
}

// Gate 2: 通用 KB 搜索 (line 141) — 移除 if 包装
// 匹配: "    if (!_isEntityMeeting) {\r\n    const sceneTags"
const gate2Pattern = /    if \(!_isEntityMeeting\) \{\r?\n    const sceneTags/;
if (gate2Pattern.test(s)) {
  s = s.replace(gate2Pattern, '    {\r\n    const sceneTags');
  changes++;
  console.log('[fix-kb] Gate 2: general KB search opened');
}

// Gate 3: 亲密知识 (line 310) — 移除 if
const gate3Pattern = /会晤模式下不加载两性知识\r?\n  if \(!_isEntityMeeting\) \{/;
if (gate3Pattern.test(s)) {
  s = s.replace(gate3Pattern, '会晤模式下也加载亲密知识 — V5.3\r\n  {');
  changes++;
  console.log('[fix-kb] Gate 3: intimate knowledge opened');
}

// Gate 4: VAD 情感曲谱 (line 332) — 移除 if
const gate4Pattern = /会晤模式下跳过 VAD 情感曲谱\r?\n  if \(!_isEntityMeeting\) \{/;
if (gate4Pattern.test(s)) {
  s = s.replace(gate4Pattern, '会晤模式下也加载 VAD 情感曲谱 — V5.3\r\n  {');
  changes++;
  console.log('[fix-kb] Gate 4: VAD emotion score opened');
}

// Fix B: 消费 _meetingEntityUuid
if (!s.includes('const _meetingEntityUuid')) {
  s = s.replace('const _isEntityMeeting = !!_meetingEntity;', 'const _meetingEntityUuid = (input).ctx?._meetingEntityUuid || null;\n  const _isEntityMeeting = !!_meetingEntity;');
  changes++;
  console.log('[fix-kb] Fix B: _meetingEntityUuid reading added');
}

if (changes > 0) {
  fs.writeFileSync(f, s, 'utf-8');
  console.log('[fix-kb] ✅ ' + changes + ' changes applied');
} else {
  console.log('[fix-kb] ⏭️ No changes needed (already patched)');
}

// Verify
const remaining = (s.match(/!_isEntityMeeting/g) || []).length;
console.log('[fix-kb] Remaining !_isEntityMeeting gates: ' + remaining + ' (expect 1 for clue assistant)');
