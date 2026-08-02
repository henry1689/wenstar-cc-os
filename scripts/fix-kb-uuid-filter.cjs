/**
 * fix-kb-uuid-filter.cjs — P1-3: KB 注入按 UUID 过滤
 * 在 KnowledgeContextBuilder.ts 中增加会晤模式下的 KB 结果过滤
 */
const fs = require('fs');
const { execSync } = require('child_process');

const f = 'src/app/knowledge/KnowledgeContextBuilder.ts';
let s = fs.readFileSync(f, 'utf-8');

const filterBlock = `
        // 🛡️ V5.3: 会晤模式下按 entity UUID 过滤 KB 结果
        if (_meetingEntityUuid) {
          _topHits = _topHits.filter(function(k) {
            var kUuid = k.belong_entity_uuid || null;
            return !kUuid || kUuid === _meetingEntityUuid;
          });
        }`;

const anchor = 'if (_topHits.length > 0) {';

if (s.includes('V5.3: 会晤模式下按 entity UUID')) {
  console.log('P1-3: 已打过补丁');
  process.exit(0);
}

if (s.includes(anchor)) {
  s = s.replace(anchor, filterBlock + '\n        if (_topHits.length > 0) {');
  fs.writeFileSync(f, s, 'utf-8');
  console.log('P1-3: KB UUID 过滤已注入');
} else {
  console.log('P1-3: 锚点未找到');
  process.exit(1);
}
