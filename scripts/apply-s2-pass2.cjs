/**
 * S2 Pass 2 — Replace remaining patterns using ASCII-only markers
 */
const fs = require('fs');
const CHAT_TS = 'D:\\tools\\wenstar-cc\\src\\webui\\chat.ts';
let c = fs.readFileSync(CHAT_TS, 'utf8');

// Helper: replace between two unique ASCII markers
function replBetween(before, after, replacement) {
  const start = c.indexOf(before);
  if (start === -1) { console.log('SKIP before: ' + before); return false; }
  const fromIdx = start + before.length;
  const end = c.indexOf(after, fromIdx);
  if (end === -1) { console.log('SKIP after: ' + after); return false; }
  const toIdx = end + after.length;
  c = c.substring(0, start) + before + replacement + after + c.substring(toIdx);
  console.log('OK: ' + before.substring(0, 40) + ' -> replaced');
  return true;
}

function simpleReplace(old, nu) {
  const idx = c.indexOf(old);
  if (idx === -1) {
    // Try regex
    const re = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (re.test(c)) {
      c = c.replace(re, nu);
      console.log('OK (regex): ' + old.substring(0, 40));
      return;
    }
    console.log('SKIP: ' + old.substring(0, 40));
    return;
  }
  c = c.replace(old, nu);
  console.log('OK: ' + old.substring(0, 40));
}

// === P1: KB extra text append (L1333) ===
simpleReplace(
  'finalKnowledgeText += \'\\n\\n【知识库补充】\' + _extraKb.map(function(k) { return k.title; }).join(\', \') + \'\\n\' + _extraKb.map(function(k) { return (k.content || \'\').substring(0, 200); }).join(\'\\n\');',
  'assembler.append(\'\\n\\n【知识库补充】\' + _extraKb.map(function(k) { return k.title; }).join(\', \') + \'\\n\' + _extraKb.map(function(k) { return (k.content || \'\').substring(0, 200); }).join(\'\\n\'));'
);

// === P2: "_meetingEntityName" in fusion guard ===
simpleReplace(
  'if (!_meetingEntityName) {\n    const _refined = await refinePostM4Context({',
  'if (!meetingCtx.isActive()) {\n    const _refined = await refinePostM4Context({'
);

// === P3: DontKnow block ===
// Use unique markers: "_isSelfQ &&" and "finalKnowledgeText.indexOf('【不知道】')"
let dontStart = c.indexOf('        if (_isSelfQ && !_isWorkQ && !knowledgeBaseText && !_meetingEntityName)');
if (dontStart > 0) {
  // Find the closing brace of this if block
  let depth = 0;
  let pos = dontStart;
  while (pos < c.length) {
    if (c[pos] === '{') depth++;
    else if (c[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
    pos++;
  }
  let block = c.substring(dontStart, pos);
  console.log('DontKnow block length:', block.length);
  let newBlock = '        if (_isSelfQ && !_isWorkQ && !knowledgeBaseText && !meetingCtx.isActive()) {\n          // 🔴 B-2: 关于玉瑶自己的事但知识库里没有 → 诚实说不知道\n          assembler.withDontKnow();\n        }';
  c = c.substring(0, dontStart) + newBlock + c.substring(pos);
  console.log('OK: DontKnow');
} else {
  console.log('SKIP: DontKnow block not found');
}

// === P4: memoryBackground block ===
let memStart = c.indexOf('if (memoryText  && !finalKnowledgeText.includes(');
if (memStart > 0) {
  let depth = 0, pos = memStart;
  while (pos < c.length) {
    if (c[pos] === '{') depth++;
    else if (c[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
    pos++;
  }
  let newBlock = '        // 🔴 B-2: 过往记忆背景注入（含去重检查）\n        assembler.withMemoryBackground(memoryText);';
  c = c.substring(0, memStart) + newBlock + c.substring(pos);
  console.log('OK: memoryBackground');
} else {
  console.log('SKIP: memoryBackground block not found');
}

// === P5: familyConstraint + appearanceRule ===
let famStart = c.indexOf('if (familyConstraint  && (_msgMentionsFamily || isFactualRecallQuery))');
if (famStart > 0) {
  let depth = 0, pos = famStart;
  while (pos < c.length) {
    if (c[pos] === '{') depth++;
    else if (c[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
    pos++;
  }
  let newBlock = '        // 🔴 B-2: 家族约束 + 外观防编造规则\n        if (familyConstraint && (_msgMentionsFamily || isFactualRecallQuery)) {\n          assembler.withFamilyConstraint(familyConstraint);\n        }';
  c = c.substring(0, famStart) + newBlock + c.substring(pos);
  console.log('OK: familyConstraint');
} else {
  console.log('SKIP: familyConstraint block not found');
}

// === P6: aboutYou ===
let aboutStart = c.indexOf('          if (aboutYou) {\n            finalKnowledgeText = aboutYou + finalKnowledgeText;');
if (aboutStart > 0) {
  let depth = 0, pos = aboutStart;
  while (pos < c.length) {
    if (c[pos] === '{') depth++;
    else if (c[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
    pos++;
  }
  let newBlock = '          // 🔴 B-2: 主人画像注入\n          if (aboutYou) {\n            assembler.withAboutYou(aboutYou);\n          }';
  c = c.substring(0, aboutStart) + newBlock + c.substring(pos);
  console.log('OK: aboutYou');
} else {
  console.log('SKIP: aboutYou block not found');
}

// === P7: M6 self model ===
let m6Start = c.indexOf('if (!_meetingEntityName && _selfBlocks.length > 0) {\n              finalKnowledgeText = _selfBlocks.join(');
if (m6Start > 0) {
  let depth = 0, pos = m6Start;
  while (pos < c.length) {
    if (c[pos] === '{') depth++;
    else if (c[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
    pos++;
  }
  let newBlock = '            // 🔴 B-2: M6 自我模型注入（会晤模式下跳过）\n            if (!meetingCtx.isActive() && _selfBlocks.length > 0) {\n              assembler.withM6SelfModel(_selfBlocks);\n            }';
  c = c.substring(0, m6Start) + newBlock + c.substring(pos);
  console.log('OK: M6 self model');
} else {
  console.log('SKIP: M6 block not found');
}

// === P8: A-2 rpChar filter ===
simpleReplace(
  "(t.content || '').includes(_meetingEntityName!)\n              ).slice(-10);",
  "(t.content || '').includes(_meetingEntityName!) && !t.rpChar\n              ).slice(-10);"
);

// === P9: MeetingSessionContext construction ===
let constructStart = c.indexOf("dna.entity_genes.push({ name: _meetingEntityName, type: 'person', allele: _meetingEntityName");
if (constructStart > 0) {
  // Find the end of this block (the closing } of the if)
  let pos = constructStart;
  while (pos < c.length && c[pos] !== '\n') pos++;
  pos++; // skip newline
  // Skip the closing }
  if (c.substring(pos, pos+5).trim() === '}') {
    pos += c.indexOf('\n', pos) - pos + 1;
  }
  // Insert MeetingSessionContext construction
  let insert = '\n    // 🔴 B-1: 构建会晤会话不可变快照——所有下游统一从此对象获取\n    const meetingCtx = new MeetingSessionContext({\n      entityName: _meetingEntityName,\n      contextText: _entityContextText,\n      kbCache: _meetingKBCache,\n    });\n';
  c = c.substring(0, pos) + insert + c.substring(pos);
  console.log('OK: MeetingSessionContext construct');
} else {
  console.log('SKIP: MeetingSessionContext construct not found');
}

// === P10: B-1 self identification ===
let siStart = c.indexOf('if (_meetingEntityName && reply && reply.length > 20) {');
if (siStart > 0) {
  let depth = 0, pos = siStart;
  let endPos = -1;
  while (pos < c.length) {
    if (c[pos] === '{') depth++;
    else if (c[pos] === '}') { depth--; if (depth === 0) { endPos = pos + 1; break; } }
    pos++;
  }
  if (endPos > 0) {
    // Also include the closing `} catch {} // 非关键`
    if (c.substring(endPos, endPos + 10).trim() === '}') {
      endPos += c.indexOf('\n', endPos) - endPos + 1;
    }
    let newBlock = '    // 🔴 B-1: 从 MeetingSessionContext 获取实体名\n    if (meetingCtx.isActive() && reply && reply.length > 20) {\n      try {\n        const entityName = meetingCtx.getEntityName()!;\n        const bodyText = reply.replace(/（[^）]*）/g, "").replace(/\\([^)]*\\)/g, "");\n        const short = entityName.length >= 2 ? entityName.slice(-2) : entityName;\n        const hasSelfIdent = bodyText.includes(entityName) || bodyText.includes(short);\n        if (!hasSelfIdent && bodyText.length > 30) {\n          console.warn("[SelfIdent] " + entityName + " 回复未自报姓名");\n        }\n      } catch {} // 非关键\n    }';
    c = c.substring(0, siStart) + newBlock + c.substring(endPos);
    console.log('OK: self identification');
  }
} else {
  console.log('SKIP: self identification not found');
}

// === P11: followUp ===
let fuStart = c.indexOf('finalKnowledgeText = \'【用户上一句】');
if (fuStart > 0) {
  // Find the end of this statement (semicolon)
  let pos = fuStart;
  let depth = 0;
  while (pos < c.length) {
    if (c[pos] === ';' && depth === 0) break;
    if (c[pos] === '(' || c[pos] === '[') depth++;
    else if (c[pos] === ')' || c[pos] === ']') depth--;
    pos++;
  }
  pos++; // skip semicolon
  let fuText = c.substring(fuStart, pos);
  console.log('followUp text length:', fuText.length);
  // Replace the content: change "finalKnowledgeText = '...' + (finalKnowledgeText || '')" → "assembler.withFollowUp('...')"
  let idx = fuText.indexOf("+ (finalKnowledgeText || '')");
  if (idx > 0) {
    let newFu = fuText.substring(0, idx - 1).replace('finalKnowledgeText = ', 'assembler.withFollowUp(') + ')';
    c = c.substring(0, fuStart) + newFu + c.substring(pos);
    console.log('OK: followUp');
  } else {
    console.log('SKIP: followUp pattern changed');
  }
} else {
  console.log('SKIP: followUp not found');
}

fs.writeFileSync(CHAT_TS, c, 'utf8');
console.log('\nDone with pass 2');
