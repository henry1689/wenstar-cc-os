/**
 * fix-v10-trigger.cjs — 用清晰格式替换压缩版 _triggerMeetingFromBytes
 */
const fs = require('fs');
const cp = require('child_process');
let s = fs.readFileSync('src/webui/server-chat-routes.ts', 'utf-8');

// 找到压缩函数的开始位置
const fnStart = s.indexOf('function _triggerMeetingFromBytes');
if (fnStart < 0) { console.log('NOT FOUND'); process.exit(1); }

// 找到函数结尾 (匹配花括号)
let braceLevel = 0, inFn = false, fnEnd = -1;
for (let i = fnStart; i < s.length; i++) {
  if (s[i] === '{') { braceLevel++; inFn = true; }
  else if (s[i] === '}') { braceLevel--; if (inFn && braceLevel <= 0) { fnEnd = i + 1; break; } }
}
if (fnEnd < 0) { console.log('BRACE MISMATCH'); process.exit(1); }

const oldFn = s.substring(fnStart, fnEnd);
const newFn = `function _triggerMeetingFromBytes(rawBody: Buffer, entityMeeting: any): void {
  if (entityMeeting?.isActive?.()) return;
  const HC = ['徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟','熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜','张小龙','罗权斌','刘运新','邱运财','陈锋华'];
  // V10.5: 文本匹配优先
  const _text = rawBody.toString('utf-8');
  try {
    const msg = JSON.parse(_text).message || '';
    for (const n of HC) {
      if (msg.includes(n)) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') text match'); return; }
      if (n.length >= 3 && msg.includes(n.slice(-2))) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') short name match'); return; }
    }
  } catch (_e) { /* fall through to byte search */ }
  // 字节匹配兜底
  for (const n of HC) {
    const nb = Buffer.from(n, 'utf-8');
    if (rawBody.indexOf(nb) >= 0) { entityMeeting.enter(n, 0); return; }
    if (n.length >= 3) {
      const sb = Buffer.from(n.slice(-2), 'utf-8');
      if (rawBody.indexOf(sb) >= 0) { entityMeeting.enter(n, 0); return; }
    }
  }
}`;

s = s.substring(0, fnStart) + newFn + s.substring(fnEnd);
fs.writeFileSync('src/webui/server-chat-routes.ts', s, 'utf-8');
console.log('PATCHED: ' + (fnEnd - fnStart) + ' -> ' + newFn.length + ' bytes');

// 立即提交
cp.execSync('git add src/webui/server-chat-routes.ts', { stdio: 'inherit' });
cp.execSync('git commit -m "fix: V10.5 clean format with debug logging"', { stdio: 'inherit' });
console.log('COMMITTED');
