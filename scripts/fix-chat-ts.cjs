/**
 * fix-chat-ts.cjs — 一次性修复 chat.ts 中两个 P0 问题:
 *   1. KB 缓存移到 buildPreM4Context() 之后
 *   2. 传入 _meetingEntityUuid 给 buildPreM4Context
 */
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'src', 'webui', 'chat.ts');
let s = fs.readFileSync(f, 'utf-8');

// ── Fix 1: 删除旧 KB 缓存块（line ~820-832），改为注释 ──
const oldCache = s.match(/\/\/ 🆕 V4\.0: 知识库缓存 — 首轮缓存，后续轮次持续注入\n[\s\S]*?\n          \}/);
if (oldCache) {
  s = s.replace(oldCache[0], '          // KB 缓存已移至 buildPreM4Context 之后（见下方）');
  console.log('[fix-chat] 旧 KB 缓存块已删除');
} else {
  console.log('[fix-chat] 未找到旧 KB 缓存块（可能已修改）');
}

// ── Fix 2: 在 buildPreM4Context 之后插入 KB 缓存 ──
const postAnchor = 'clueReply = _preM4.clueReply;';
const newKbCache = `clueReply = _preM4.clueReply;

    // 🔧 V5.3: KB 缓存注入——在 buildPreM4Context 填充 knowledgeBaseText 后执行
    if (_meetingEntityName && _entityContextText) {
      const _cachedKB = _meetingKBCache.get(_meetingEntityName);
      if (ctx._entityMeeting?.isFirstTurn?.()) {
        const _kbForCache = knowledgeBaseText?.substring(0, 3000) || '';
        if (_kbForCache.length > 20) {
          _meetingKBCache.set(_meetingEntityName, _kbForCache);
          _entityContextText += '\\n\\n【关于你的知识库档案】\\n以下是你的知识库档案内容，你需要了解这些：\\n' + _kbForCache;
        }
      } else if (_cachedKB) {
        _entityContextText += '\\n\\n【关于你的知识库档案】\\n以下是之前查到的你的知识库档案，继续基于这些信息回复：\\n' + _cachedKB;
      }
    }`;

if (s.includes(postAnchor) && !s.includes('V5.3: KB 缓存注入')) {
  s = s.replace(postAnchor, newKbCache);
  console.log('[fix-chat] KB 缓存注入已添加');
} else {
  console.log('[fix-chat] KB 缓存注入已存在或锚点未找到');
}

// ── Fix 3: 传入 _meetingEntityUuid ──
const entityNameAnchor = '_meetingEntityName,  // 🆕 V4.0: 实体名传给知识检索';
if (s.includes(entityNameAnchor) && !s.includes('_meetingEntityUuid')) {
  s = s.replace(entityNameAnchor, '_meetingEntityName,  // 🆕 V4.0: 实体名传给知识检索\n          _meetingEntityUuid: ctx._entityMeeting?.getEntityUUID?.() || null,  // 🆕 V5.3: 实体UUID过滤KB');
  console.log('[fix-chat] _meetingEntityUuid 已添加');
} else {
  console.log('[fix-chat] _meetingEntityUuid 已存在或锚点未找到');
}

fs.writeFileSync(f, s, 'utf-8');
console.log('[fix-chat] ✅ chat.ts 修复完成');
