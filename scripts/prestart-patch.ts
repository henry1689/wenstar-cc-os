/**
 * 启动前补丁 — 给 EntityContextBuilder 注入时间+学生身份
 * 在 `## 你的身份` 之后插入，确保 LLM 第一时间看到时间和身份约束
 */
import { readFileSync, writeFileSync } from 'fs';

const f = 'src/m4/household/EntityContextBuilder.ts';
let s = readFileSync(f, 'utf-8');

const _alreadyPatched1 = s.includes('_nbj');
if (!_alreadyPatched1) {
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
} else {
	console.log('[Patch] ⏭️ EntityContextBuilder 已打过补丁');
}

// ── Patch 2: EntityMeeting._resolveEntity 修复 ──
const f2 = 'src/m4/household/EntityMeeting.ts';
let s2 = readFileSync(f2, 'utf-8');

// 🔧 用唯一锚点匹配，不受缩进变化影响
const ANCHOR_MTG = '.query?.(';
const ANCHOR_NEW = 'getEntityByUUID';
if (s2.includes(ANCHOR_NEW) && !s2.includes(ANCHOR_MTG)) {
  console.log('[Patch] ⏭️  EntityMeeting 已打过补丁');
} else if (s2.includes(ANCHOR_MTG)) {
  // 替换整个 _resolveEntity 方法体 — 从 "private _resolveEntity" 到方法闭包 "}\n  }"
  const _oldMethod = s2.match(/private _resolveEntity\(name: string\): EntityInfo \| null \{[\s\S]*?\n  \}/);
  if (_oldMethod) {
    const _newMethod = `private _resolveEntity(name: string): EntityInfo | null {
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
    s2 = s2.replace(_oldMethod[0], _newMethod);
    writeFileSync(f2, s2, 'utf-8');
    console.log('[Patch] ✅ EntityMeeting._resolveEntity 已修复');
  } else {
    console.log('[Patch] ⚠️  EntityMeeting regex 未匹配');
  }
} else {
  console.log('[Patch] ⚠️  EntityMeeting 未找到锚点');
}

// ── Patch 3: retrieval-stage.ts — 会晤实体自有记忆检索 ──
const f3 = 'src/webui/chat/retrieval-stage.ts';
let s3 = readFileSync(f3, 'utf-8');
const ANCHOR_RET = '会晤信息隔离墙 — 会晤实体不检索任何用户记忆';
if (!s3.includes(ANCHOR_RET)) {
  console.log('[Patch] ⏭️  retrieval-stage 已打过补丁或锚点变更');
} else {
  const _oldRet = `  // 🛡️ V5.1: 会晤信息隔离墙 — 会晤实体不检索任何用户记忆
  if (_meetingEntityName) {
    return {
      isTopicShift: false, isFollowUp: false, hasContinuationMarkers: false,
      isCasualChat: true, isLimitedRetrieval: false, hasNewEntity: false, hasPersonEntity: false,
      emotionalMemories: [],
      memoryGate: { mode: 'casual' as const, needsMemorySearch: false, needsKnowledgeSearch: false, fillerPhrase: '', hallucinationGuard: '', strictMode: false },
      memoryGateFillerUsed: false,
    };
  }`;
  const _newRet = `  // 🛡️ V5.2: 会晤信息隔离墙 — 阻断用户记忆，检索实体自有记忆
  if (_meetingEntityName) {
    try {
      const _fg = ctx.m4?.getFamilyGraph?.();
      const _entityUuid = _fg?.getUUIDByName?.(_meetingEntityName);
      const _sqlite = ctx.storage?.getSQLite?.();
      if (_entityUuid && _sqlite && typeof _sqlite.queryAll === 'function') {
        const _entityMems = _sqlite.queryAll(
          "SELECT id, raw_input, calcium_score, effective_strength FROM memories WHERE belong_entity_uuid = ? ORDER BY calcium_score DESC LIMIT 12",
          [_entityUuid]
        ) || [];
        for (const _em of (_entityMems || []).slice(0, 5)) {
          const _t = (_em.raw_input || '').substring(0, 100);
          if (_t.length > 4) memoryFragments.push('【' + _meetingEntityName + '的记忆】' + _t);
        }
        if (_entityMems.length > 0) console.log('[EntityMem] 会晤实体自有记忆: ' + _entityMems.length + ' 条');
        const _goldRows = _sqlite.queryAll(
          "SELECT detail, content_md FROM vault_log WHERE belong_entity_uuid = ? ORDER BY created_at DESC LIMIT 5",
          [_entityUuid]
        ) || [];
        for (const _gr of _goldRows) {
          const _t = (_gr.content_md || _gr.detail || '').substring(0, 100);
          if (_t.length > 4 && !memoryFragments.some(function(f) { return f.includes(_t.substring(0, 20)); }))
            memoryFragments.push('【金库记忆】' + _t);
        }
        const _sandRows = _sqlite.queryAll(
          "SELECT raw_input, calcium_level FROM memories WHERE belong_entity_uuid = ? AND calcium_level >= 2 ORDER BY calcium_score DESC LIMIT 5",
          [_entityUuid]
        ) || [];
        for (const _sr of _sandRows.slice(0, 3)) {
          const _t = (_sr.raw_input || '').substring(0, 80);
          if (_t.length > 4 && !memoryFragments.some(function(f) { return f.includes(_t.substring(0, 20)); })) {
            const _tag = _sr.calcium_level >= 3 ? '💎' : '📌';
            memoryFragments.push('【' + _tag + '重要记忆】' + _t);
          }
        }
        // V5.3: 记忆不足时降级检索 conversations（对话记录）
        if (memoryFragments.length < 5) {
          try {
            const _convRows = _sqlite.queryAll(
              "SELECT dialog_group_id, content, role, timestamp FROM conversations WHERE belong_entity_uuid = ? ORDER BY timestamp DESC LIMIT 80",
              [_entityUuid]
            ) || [];
            const _seenGroups = {};
            const _convTopics = [];
            for (let _ci = 0; _ci < _convRows.length && _convTopics.length < 10; _ci++) {
              const _cr = _convRows[_ci];
              if (_seenGroups[_cr.dialog_group_id]) continue;
              _seenGroups[_cr.dialog_group_id] = true;
              const _t = (_cr.content || '').substring(0, 100);
              if (_t.length > 4 && !memoryFragments.some(function(f) { return f.includes(_t.substring(0, 20)); }))
                _convTopics.push('【对话·' + _meetingEntityName + '】' + _t);
            }
            for (let _ti = 0; _ti < _convTopics.length; _ti++) {
              memoryFragments.push(_convTopics[_ti]);
            }
            if (_convTopics.length > 0) console.log('[EntityMem] V5.3对话降级: ' + _convTopics.length + ' 条');
          } catch (_ce) { /* 对话降级不阻塞 */ }
        }
      }
    } catch (_e) { /* 实体记忆检索失败不阻塞 */ }
    return {
      isTopicShift: false, isFollowUp: false, hasContinuationMarkers: false,
      isCasualChat: true, isLimitedRetrieval: false, hasNewEntity: false, hasPersonEntity: false,
      emotionalMemories: [],
      memoryGate: { mode: 'casual' as const, needsMemorySearch: false, needsKnowledgeSearch: false, fillerPhrase: '', hallucinationGuard: '', strictMode: false },
      memoryGateFillerUsed: false,
    };
  }`;
  if (s3.includes(_oldRet)) {
    s3 = s3.replace(_oldRet, _newRet);
    writeFileSync(f3, s3, 'utf-8');
    console.log('[Patch] ✅ retrieval-stage 实体自有记忆检索已注入');
  } else {
    // fallback: 宽松匹配
    const _re = /\/\/ 🛡️ V5\.1: 会晤信息隔离墙[\s\S]*?memoryGateFillerUsed: false,\s*\};\s*\}/;
    if (_re.test(s3)) {
      s3 = s3.replace(_re, _newRet);
      writeFileSync(f3, s3, 'utf-8');
      console.log('[Patch] ✅ retrieval-stage 宽松匹配成功');
    } else {
      console.log('[Patch] ❌ retrieval-stage 所有匹配策略均失败');
    }
  }
}

// ── Patch 4: KnowledgeContextBuilder.ts — 开放会晤知识库闸门 ──
const f4 = 'src/app/knowledge/KnowledgeContextBuilder.ts';
let s4 = readFileSync(f4, 'utf-8');
const _patched = s4.includes('V5.2: 会晤模式下开放实体知识库检索');
if (!_patched && s4.includes('会晤模式下绝对不注入通用知识库')) {
  s4 = s4.replace(
    "// 🛡️ V10.0: 会晤模式下绝对不注入通用知识库——实体上下文由 EntityContextBuilder 提供\n    // 之前的代码用实体名全库搜索会导致熊梓铭文档泄漏给徐诗雨等人物\n    if (_entitySearchMsg && ctx.knowledgeBase && !_isEntityMeeting) {",
    "// 🛡️ V5.2: 会晤模式下开放实体知识库检索 — 用实体名搜索该实体的档案\n    // 跨实体泄漏由 knowledgeBase.weightedSearch 的 UUID 过滤控制\n    if (_entitySearchMsg && ctx.knowledgeBase) {"
  );
  s4 = s4.replace(
    "// 🆕 V4.0·Phase 2: 始终搜知识库，按搜索等级决定注入强度\n    // 🛡️ V5.1: 会晤隔离墙 — 会晤模式下不搜通用知识库\n    if (!_isEntityMeeting) {",
    "// 🆕 V4.0·Phase 2: 始终搜知识库，按搜索等级决定注入强度\n    // 🛡️ V5.2: 会晤模式下也搜知识库\n    {"
  );
  s4 = s4.replace("} // 🛡️ V5.1: 会晤隔离墙 — 关闭 if(!_isEntityMeeting)", "} // 🛡️ V5.2: 会晤模式知识库检索结束");
  s4 = s4.replace("if (!_isEntityMeeting && (!knowledgeBaseText || knowledgeBaseText.length < 200)) {", "if (!knowledgeBaseText || knowledgeBaseText.length < 200) {");
  s4 = s4.replace(
    "// ── 亲密模式两性知识 ──\n  // 🛡️ V5.1: 会晤模式下不加载两性知识\n  if (!_isEntityMeeting) {",
    "// ── 亲密模式两性知识 ──\n  // 🛡️ V5.2: 会晤模式下也加载亲密知识\n  {"
  );
  s4 = s4.replace("} // 🛡️ V5.1: 会晤隔离墙 — 亲密KB结束", "} // 🛡️ V5.2: 亲密KB结束");
  s4 = s4.replace(
    "// ── VAD 谱曲引擎 (8100) ──\n  // 🛡️ V5.1: 会晤模式下跳过 VAD 情感曲谱\n  if (!_isEntityMeeting) {",
    "// ── VAD 谱曲引擎 (8100) ──\n  // 🛡️ V5.2: 会晤模式下也加载 VAD 情感曲谱\n  {"
  );
  s4 = s4.replace("} // 🛡️ V5.1: 会晤隔离墙 — VAD结束", "} // 🛡️ V5.2: VAD结束");
  writeFileSync(f4, s4, 'utf-8');
  console.log('[Patch] ✅ KnowledgeContextBuilder 6道闸门已开放');
} else if (_patched) {
  console.log('[Patch] ⏭️  KnowledgeContextBuilder 已打过补丁');
} else {
  console.log('[Patch] ⚠️  KnowledgeContextBuilder 锚点未找到');
}

// ── Patch 5: KnowledgeContextBuilder.ts — 新增 _meetingEntityUuid 字段 ──
if (!s4.includes('_meetingEntityUuid')) {
  s4 = s4.replace(
    "_meetingEntityName?: string | null;  // 🆕 V4.0: 会晤实体名",
    "_meetingEntityName?: string | null;  // 🆕 V4.0: 会晤实体名\n    _meetingEntityUuid?: string | null;  // 🆕 V5.3: 会晤实体UUID"
  );
  s4 = s4.replace(
    "const _meetingEntity = (input as any).ctx?._meetingEntityName;\n  const _isEntityMeeting = !!_meetingEntity;",
    "const _meetingEntity = (input as any).ctx?._meetingEntityName;\n  const _meetingEntityUuid = (input as any).ctx?._meetingEntityUuid || null;\n  const _isEntityMeeting = !!_meetingEntity;"
  );
  writeFileSync(f4, s4, 'utf-8');
  console.log('[Patch] ✅ KnowledgeContextBuilder _meetingEntityUuid 字段已添加');
} else {
  console.log('[Patch] ⏭️  KnowledgeContextBuilder _meetingEntityUuid 已存在');
}

// ── Patch 6: chat.ts — KB 缓存顺序已通过 git commit 修复，此 Patch 跳过 ──
// ── Patch 7: chat.ts — 传入 _meetingEntityUuid 给 buildPreM4Context ──
const f6 = 'src/webui/chat.ts';
let s6 = readFileSync(f6, 'utf-8');
if (s6.includes('_meetingEntityName,') && !s6.includes('_meetingEntityUuid,')) {
  // 在 _meetingEntityName 后添加 _meetingEntityUuid
  s6 = s6.replace(
    "_meetingEntityName,  // 🆕 V4.0: 实体名传给知识检索",
    "_meetingEntityName,  // 🆕 V4.0: 实体名传给知识检索\n          _meetingEntityUuid: ctx._entityMeeting?.getEntityUUID?.() || null,  // 🆕 V5.3: 实体UUID过滤KB"
  );
  writeFileSync(f6, s6, 'utf-8');
  console.log('[Patch] ✅ chat.ts _meetingEntityUuid 已传入 buildPreM4Context');
}

// ── Patch 8: server-chat-routes.ts — _triggerMeetingFromBytes 文本匹配降级 ──
const f8 = 'src/webui/server-chat-routes.ts';
let s8 = readFileSync(f8, 'utf-8');
if (s8.includes('V10.5')) {
  console.log('[Patch] ⏭️ server-chat-routes 已打过补丁');
} else if (s8.includes('_triggerMeetingFromBytes')) {
  // 🔧 更灵活的匹配：找到函数签名到下一个顶层函数/EOF
  const _fnStart = s8.indexOf('function _triggerMeetingFromBytes');
  // 找到函数闭包：匹配 "}\n}" (函数 + 模块闭包) 或仅 "  }" (独立函数)
  let _fnEnd = s8.indexOf('\n}\n', _fnStart + 30);
  if (_fnEnd < 0) _fnEnd = s8.indexOf('\n  }', _fnStart + 30);
  if (_fnStart >= 0 && _fnEnd > _fnStart) {
    const _oldFn8 = s8.substring(_fnStart, _fnEnd + 4);
    const _newFn8 = `function _triggerMeetingFromBytes(rawBody: Buffer, entityMeeting: any): void {
  if (entityMeeting?.isActive?.()) return;
  const HC = ['徐诗雨','徐诗韵','徐诗涵','熊梓铭','熊梓玥','阿珍','阿苏','徐东伟','熊勇','王全芬','林土锋','宁清华','陈雪花','曾美容','陈斌','赖陈喜','张小龙','罗权斌','刘运新','邱运财','陈锋华'];
  // V10.5: 文本匹配优先（绕过 GBK/UTF-8 编码差异）
  const _text = rawBody.toString('utf-8');
  try {
    const _msg = JSON.parse(_text).message || '';
    for (const n of HC) {
      if (_msg.includes(n)) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') from text match'); return; }
      if (n.length >= 3 && _msg.includes(n.slice(-2))) { entityMeeting.enter(n, 0); console.log('[V10.5] enter(' + n + ') from short text match'); return; }
    }
  } catch (_e) {}
  for (const n of HC) {
    const nameBuf = Buffer.from(n, 'utf-8');
    if (rawBody.indexOf(nameBuf) >= 0) { entityMeeting.enter(n, 0); console.log('[V10.1] enter(' + n + ') bytes'); return; }
    if (n.length >= 3) { const shortBuf = Buffer.from(n.slice(-2), 'utf-8'); if (rawBody.indexOf(shortBuf) >= 0) { entityMeeting.enter(n, 0); console.log('[V10.1] enter(' + n + ') short bytes'); return; } }
  }
  }`;
    s8 = s8.replace(_oldFn8, _newFn8);
    writeFileSync(f8, s8, 'utf-8');
    console.log('[Patch] ✅ _triggerMeetingFromBytes 文本匹配降级已注入');
  } else {
    console.log('[Patch] ⚠️ _triggerMeetingFromBytes 边界未找到');
  }
} else {
  console.log('[Patch] ⚠️ server-chat-routes 未找到 _triggerMeetingFromBytes');
}

// ── KB 闸门修复 (已移至 start.cjs，此处跳过) ──
// ── Edge清理 (已移至 start.cjs，此处跳过) ──
// ── 记忆重建 (已移至 start.cjs，此处跳过) ──
// ── KB清理 (已移至 start.cjs，此处跳过) ──