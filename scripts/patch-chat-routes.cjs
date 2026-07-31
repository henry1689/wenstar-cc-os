// Fix _triggerMeetingFromBytes — add text-based fallback for GBK-encoded HTTP bodies
const fs = require('fs');
const f = 'src/webui/server-chat-routes.ts';
let s = fs.readFileSync(f, 'utf-8');

const oldFn = `function _triggerMeetingFromBytes(rawBody: Buffer, entityMeeting: any): void {
  // 🔴 V10.4: 会晤已激活时不自动切换——只在未激活时触发进入
  //
  if (entityMeeting?.isActive?.()) return;

  const HC = ['徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟','熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜','张小龙','罗权斌','刘运新','邱运财','陈锋华'];
  for (const n of HC) {
    const nameBuf = Buffer.from(n, 'utf-8');
    if (rawBody.indexOf(nameBuf) >= 0) {
      entityMeeting.enter(n, 0);
      console.log('[V10.1 BYTE] enter(' + n + ') from raw body bytes');
      return;
    }
    // 末2字匹配
    if (n.length >= 3) {
      const shortBuf = Buffer.from(n.slice(-2), 'utf-8');
      if (rawBody.indexOf(shortBuf) >= 0) {
        entityMeeting.enter(n, 0);
        console.log('[V10.1 BYTE] enter(' + n + ') from short-name bytes');
        return;
      }
    }
  }
}`;

const newFn = `function _triggerMeetingFromBytes(rawBody: Buffer, entityMeeting: any): void {
  // 🔴 V10.4: 会晤已激活时不自动切换——只在未激活时触发进入
  if (entityMeeting?.isActive?.()) return;

  const HC = ['徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟','熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜','张小龙','罗权斌','刘运新','邱运财','陈锋华'];

  // V10.5: 优先用文本匹配（避免 UTF-8/GBK 编码差异）
  const _text = rawBody.toString('utf-8');
  try {
    const _msg = JSON.parse(_text).message || '';
    for (const n of HC) {
      if (_msg.includes(n)) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') from text match'); return; }
      if (n.length >= 3 && _msg.includes(n.slice(-2))) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') from short text match'); return; }
    }
  } catch {}

  // fallback: byte-level search (legacy)
  for (const n of HC) {
    const nameBuf = Buffer.from(n, 'utf-8');
    if (rawBody.indexOf(nameBuf) >= 0) {
      entityMeeting.enter(n, 0);
      console.log('[V10.1 BYTE] enter(' + n + ') from raw body bytes');
      return;
    }
    if (n.length >= 3) {
      const shortBuf = Buffer.from(n.slice(-2), 'utf-8');
      if (rawBody.indexOf(shortBuf) >= 0) {
        entityMeeting.enter(n, 0);
        console.log('[V10.1 BYTE] enter(' + n + ') from short-name bytes');
        return;
      }
    }
  }
}`;

if (s.includes(oldFn)) {
  s = s.replace(oldFn, newFn);
  fs.writeFileSync(f, s, 'utf-8');
  console.log('[patch-chat-routes] ✅ _triggerMeetingFromBytes 已修复');
} else if (s.includes('V10.5')) {
  console.log('[patch-chat-routes] ⏭️ 已打过补丁');
} else {
  console.log('[patch-chat-routes] ⚠️ 未匹配原始函数');
}
