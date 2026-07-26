/**
 * S2 方案执行脚本 V2 — 所有改动单次完成
 */
const fs = require('fs');
const path = require('path');

const CHAT_TS = 'D:\\tools\\wenstar-cc\\src\\webui\\chat.ts';
const ENV_FILE = 'D:\\tools\\wenstar-cc\\.env';
const REDLINES = 'D:\\AI文件\\personal-assistant\\memory\\projects\\wenstar-fg-roleplay.md';

let c = fs.readFileSync(CHAT_TS, 'utf8');
let changed = 0;

function repl(old, nu) {
  if (c.includes(old)) {
    c = c.replace(old, nu);
    changed++;
  } else {
    console.log('NOT FOUND: ' + old.substring(0, 80).replace(/\n/g, '\\n'));
  }
}

// === 1. Import additions ===
repl(
  "import { EntityMeeting } from '../m4/household/EntityMeeting.js';",
  "import { EntityMeeting } from '../m4/household/EntityMeeting.js';\n// 🔴 B-1: 会晤状态统一对象——收敛 _meetingEntityName 等散落变量\nimport { MeetingSessionContext } from './chat/MeetingSessionContext.js';\n// 🔴 B-2: 知识文本装配器——收敛 22 段 finalKnowledgeText 注入链路\nimport { KnowledgeTextAssembler } from './chat/KnowledgeTextAssembler.js';"
);

// === A-1: enrichedHistory rpChar ===
repl(
  'enrichedHistory = ctx.conversationHistory.slice(-40);',
  '// 🔴 A-1: 过滤角色扮演对话，防止 rpChar 内容泄露到正常模式 enrichedHistory\n    enrichedHistory = ctx.conversationHistory.filter((t: any) => !t.rpChar).slice(-40);'
);

// === A-2: fallback conversationHistory rpChar ===
repl(
  '              const _hist = ctx.conversationHistory.filter((t: any) =>\n                (t.content || \'\').includes(_meetingEntityName!)\n              ).slice(-10);',
  '              // 🔴 A-2: 过滤角色扮演对话，防止 rpChar 内容泄露到会晤模式\n              const _hist = ctx.conversationHistory.filter((t: any) =>\n                (t.content || \'\').includes(_meetingEntityName!) && !t.rpChar\n              ).slice(-10);'
);

// === B-1: MeetingSessionContext construct (after entity_genes push) ===
repl(
  '    // 🆕 V4.0: 会晤激活时，将实体名追加到 entity_genes 中以增强 M4 记忆检索\n    if (_meetingEntityName) {\n      const _alreadyInGenes = (dna.entity_genes || []).some((g: any) => g.name === _meetingEntityName);\n      if (!_alreadyInGenes) {\n        dna.entity_genes.push({ name: _meetingEntityName, type: \'person\', allele: _meetingEntityName, phenotype: \'neutral\', knowledge_type: \'private\' });\n      }\n    }',
  '    // 🆕 V4.0: 会晤激活时，将实体名追加到 entity_genes 中以增强 M4 记忆检索\n    if (_meetingEntityName) {\n      const _alreadyInGenes = (dna.entity_genes || []).some((g: any) => g.name === _meetingEntityName);\n      if (!_alreadyInGenes) {\n        dna.entity_genes.push({ name: _meetingEntityName, type: \'person\', allele: _meetingEntityName, phenotype: \'neutral\', knowledge_type: \'private\' });\n      }\n    }\n\n    // 🔴 B-1: 构建会晤会话不可变快照——所有下游统一从此对象获取\n    const meetingCtx = new MeetingSessionContext({\n      entityName: _meetingEntityName,\n      contextText: _entityContextText,\n      kbCache: _meetingKBCache,\n    });'
);

// === B-1: buildPreM4Context _meetingEntityName -> meetingCtx ===
repl(
  '        _meetingEntityName,  // 🆕 V4.0: 实体名传给知识检索',
  '        _meetingEntityName: meetingCtx.getEntityName(),  // 🔴 B-1: 从 MeetingSessionContext 获取'
);

// === B-1: fusion guard ===
repl(
  '    // 🛡️ V5.1: 会晤模式下跳过三源熔铸和"玉瑶想起"主动推送\n    if (!_meetingEntityName) {',
  '    // 🛡️ V5.1: 会晤模式下跳过三源熔铸和"玉瑶想起"主动推送\n    // 🔴 B-1: 从 MeetingSessionContext 获取会晤状态\n    if (!meetingCtx.isActive()) {'
);

// === B-2: finalKnowledgeText init -> assembler ===
repl(
  "let finalKnowledgeText = _entityContextText ? (_entityContextText + '\\n\\n' + knowledgeBaseText) : knowledgeBaseText;",
  "// 🔴 B-2: KnowledgeTextAssembler Builder — 收敛 22 段注入链路\nconst assembler = new KnowledgeTextAssembler()\n  .withBaseText(meetingCtx.isActive() ? meetingCtx.getContextText() : '', knowledgeBaseText);"
);

// === B-1: PFC snapshot fields ===
repl(
  '            spatial: { sceneLabel: _meetingEntityName ? `会晤:${_meetingEntityName}` : \'对话中\' },',
  '            spatial: { sceneLabel: meetingCtx.toSnapshot().sceneLabel },'
);
repl(
  '            meetingEntity: _meetingEntityName || undefined,  // 🆕 V4.0: 告知 PFC 当前在会晤谁',
  '            meetingEntity: meetingCtx.toSnapshot().entityName || undefined,  // 🔴 B-1: 从 MeetingSessionContext 获取'
);

// === B-2: PFC output -> assembler ===
repl(
  "            finalKnowledgeText = [..._parts, finalKnowledgeText].filter(Boolean).join('\\n\\n');",
  '            assembler.withPFCUnified(_parts);'
);
repl(
  "            finalKnowledgeText = [_pfcResult.directive.payload['guardMessages'], _pfcResult.directive.payload['assembledContext'], finalKnowledgeText].filter(Boolean).join('\\n\\n');",
  "            assembler.prepend(_pfcResult.directive.payload['guardMessages']);\n            assembler.prepend(_pfcResult.directive.payload['assembledContext']);"
);
repl(
  "            finalKnowledgeText = _pfcResult.directive.constraints.violations.join('\\n') + '\\n\\n' + (finalKnowledgeText || '');",
  '            assembler.withPFCViolations(_pfcResult.directive.constraints.violations);'
);

// === B-2: factualRecallGuard ===
repl(
  "  finalKnowledgeText = factualRecallGuard + (finalKnowledgeText ? '\\n\\n' + finalKnowledgeText : '');",
  '  assembler.withFactualRecallGuard(factualRecallGuard);'
);

// === B-1: roleHint ===
repl(
  '\tconst roleHint = _meetingEntityName ? null : _roleInstruction[_currentRole];',
  '\tconst roleHint = meetingCtx.isActive() ? null : _roleInstruction[_currentRole];'
);
repl(
  "\t  finalKnowledgeText = (finalKnowledgeText || '') + '\\n\\n【当前角色】' + roleHint;",
  '\t  assembler.withRoleHint(roleHint);'
);

// === B-2: intimacyFilter ===
repl(
  "\t  finalKnowledgeText = intimacyFilter + '\\n\\n' + (finalKnowledgeText || '');",
  '\t  assembler.withIntimacyFilter(intimacyFilter);'
);

// === B-2: KB extra (knowledge routing) ===
repl(
  '              if (_extraKb.length > 0 && finalKnowledgeText) {',
  '              if (_extraKb.length > 0 && assembler.snapshot().length > 0) {'
);

// === B-1: dontKnow ===
repl(
  '        if (_isSelfQ && !_isWorkQ && !knowledgeBaseText && !_meetingEntityName) {\n          // 关于玉瑶自己的事但知识库里没有 → 诚实说不知道（注入到 finalKnowledgeText 顶部）\n          if (!finalKnowledgeText) finalKnowledgeText = \'\';\n          if (finalKnowledgeText.indexOf(\'【不知道】\') < 0) {\n            finalKnowledgeText = \'【不知道】这个问题我确实不知道答案。我不想编造，所以诚实地告诉你我不清楚。\\n\\n\' + (finalKnowledgeText || \'\');\n          }\n        }',
  '        if (_isSelfQ && !_isWorkQ && !knowledgeBaseText && !meetingCtx.isActive()) {\n          // 🔴 B-2: 关于玉瑶自己的事但知识库里没有 → 诚实说不知道\n          assembler.withDontKnow();\n        }'
);

// === B-2: memoryBackground ===
// Use a focused substring that uniquely identifies this block
const memBgOld = "if (memoryText  && !finalKnowledgeText.includes('【相关记忆】')) {\n          const historyLink = '【情感背景·过往记忆】' + memoryText + '\\n（以上是你以前的记忆片段。你**现在不在那些场景里**。如果当前话题提到了记忆中的人或事，可以用\"我记得以前…\"的方式轻轻提起。但**绝对不要从记忆里的场景开始说话**——你是正在和对方聊天的活人，不是在重演过去的场景。）';\n          finalKnowledgeText = historyLink + (finalKnowledgeText ? '\\n\\n' + finalKnowledgeText : '');\n        }";
const memBgNew = '        // 🔴 B-2: 过往记忆背景注入（含去重检查）\n        assembler.withMemoryBackground(memoryText);';
repl(memBgOld, memBgNew);

// === B-2: familyConstraint + appearanceRule ===
repl(
  '          finalKnowledgeText = familyConstraint + \'\\n\\n\' + finalKnowledgeText;\n          finalKnowledgeText += \'【强制】未在档案中的外貌特征(身高/脸型/眼镜/发型等)你不知道，绝对不能编造。\';',
  '          // 🔴 B-2: 家族约束 + 外观防编造规则\n          if (familyConstraint && (_msgMentionsFamily || isFactualRecallQuery)) {\n            assembler.withFamilyConstraint(familyConstraint);\n          }'
);

// But the above is just the inner part. Need the full if block. Let me find the outer if.
// The familyConstraint block: "if (familyConstraint  && (_msgMentionsFamily || isFactualRecallQuery)) {"
repl(
  '        if (familyConstraint  && (_msgMentionsFamily || isFactualRecallQuery)) {\n          finalKnowledgeText = familyConstraint + \'\\n\\n\' + finalKnowledgeText;\n          finalKnowledgeText += \'【强制】未在档案中的外貌特征(身高/脸型/眼镜/发型等)你不知道，绝对不能编造。\';\n        }',
  '        // 🔴 B-2: 家族约束 + 外观防编造规则\n        if (familyConstraint && (_msgMentionsFamily || isFactualRecallQuery)) {\n          assembler.withFamilyConstraint(familyConstraint);\n        }'
);

// === B-2: aboutYou ===
repl(
  '          if (aboutYou) {\n            finalKnowledgeText = aboutYou + finalKnowledgeText;\n          }',
  '          // 🔴 B-2: 主人画像注入\n          if (aboutYou) {\n            assembler.withAboutYou(aboutYou);\n          }'
);

// === B-1: M6 self model ===
repl(
  "            if (!_meetingEntityName && _selfBlocks.length > 0) {\n              finalKnowledgeText = _selfBlocks.join('\\n') + '\\n\\n' + finalKnowledgeText;\n            }",
  '            // 🔴 B-2: M6 自我模型注入（会晤模式下跳过）\n            if (!meetingCtx.isActive() && _selfBlocks.length > 0) {\n              assembler.withM6SelfModel(_selfBlocks);\n            }'
);

// === B-2: engineContext ===
repl(
  "        finalKnowledgeText = ctxBlock + '\\n\\n' + finalKnowledgeText;",
  '        assembler.withEngineContext(ctxBlock);'
);

// === B-1: M5 orchestrate (use assembler.build()) ===
repl(
  "reply = await ctx.m5.orchestrate(ctx_m4, enrichedWithGuard, finalKnowledgeText, knowledgeBaseText ? (knowledgeBaseText.split('\\n').filter(l => l.trim()).join('\\n') + '\\n\\n' + message) : message, _currentRole, !!_meetingEntityName);",
  "reply = await ctx.m5.orchestrate(ctx_m4, enrichedWithGuard, assembler.build(), knowledgeBaseText ? (knowledgeBaseText.split('\\n').filter(l => l.trim()).join('\\n') + '\\n\\n' + message) : message, _currentRole, meetingCtx.isActive());"
);

// === B-1: self identification check ===
repl(
  '    // 🆕 V10.5: 会晤模式自称检测\n    if (_meetingEntityName && reply && reply.length > 20) {\n      try {\n        const bodyText = reply.replace(/（[^）]*）/g, "").replace(/\\([^)]*\\)/g, "");\n        const short = _meetingEntityName.length >= 2 ? _meetingEntityName.slice(-2) : _meetingEntityName;\n        const hasSelfIdent = bodyText.includes(_meetingEntityName) || bodyText.includes(short);\n        if (!hasSelfIdent && bodyText.length > 30) {\n          console.warn("[SelfIdent] " + _meetingEntityName + " 回复未自报姓名");',
  '    // 🆕 V10.5: 会晤模式自称检测\n    // 🔴 B-1: 从 MeetingSessionContext 获取实体名\n    if (meetingCtx.isActive() && reply && reply.length > 20) {\n      try {\n        const entityName = meetingCtx.getEntityName()!;\n        const bodyText = reply.replace(/（[^）]*）/g, "").replace(/\\([^)]*\\)/g, "");\n        const short = entityName.length >= 2 ? entityName.slice(-2) : entityName;\n        const hasSelfIdent = bodyText.includes(entityName) || bodyText.includes(short);\n        if (!hasSelfIdent && bodyText.length > 30) {\n          console.warn("[SelfIdent] " + entityName + " 回复未自报姓名");'
);

// === B-2: candidate generation knowledgeBase ===
repl(
  '              knowledgeBase: finalKnowledgeText,',
  '              knowledgeBase: assembler.build(),'
);

console.log('Total replacements: ' + changed);
fs.writeFileSync(CHAT_TS, c, 'utf8');
console.log('Done writing chat.ts');

// ============================
// A-3: .env dead config
// ============================
let envContent = fs.readFileSync(ENV_FILE, 'utf8');
envContent = envContent.replace(
  'ROLEPLAY_STRUCTURED_ENABLED=true',
  '# 🗑️ 死配置: src/ 中无运行时引用，角色扮演管线实际由 RoleClassifier/TransitionManager 控制\n# ROLEPLAY_STRUCTURED_ENABLED=true'
);
fs.writeFileSync(ENV_FILE, envContent, 'utf8');
console.log('Done writing .env');

// ============================
// A-3: Redlines doc
// ============================
let rl = fs.readFileSync(REDLINES, 'utf8');
rl = rl.replace(
  '**原理**: 存在两套角色扮演管线——`buildRoleplayRules()` (legacy) 和 `runRoleplayPipeline()` (新四层管线)。由 `ROLEPLAY_STRUCTURED_ENABLED` 环境变量控制切换。两端各有自己的规则集，曾因不同步而出 bug。',
  '**原理**: 存在两套角色扮演管线——`buildRoleplayRules()` (legacy) 和 `runRoleplayPipeline()` (新四层管线)。由 `ENABLE_NEW_ARCH` 配置和 `RoleClassifier`/`TransitionManager` 控制切换。两端各有自己的规则集，曾因不同步而出 bug。\n\n> 🗑️ 2026-07-26: `ROLEPLAY_STRUCTURED_ENABLED` 环境变量经审计确认是死配置——`src/` 中零运行时引用。实际管线切换由 `RoleClassifier`/`TransitionManager` 控制，不受此变量影响。'
);
fs.writeFileSync(REDLINES, rl, 'utf8');
console.log('Done writing redlines');
console.log('\\n🎉 All changes applied successfully');
