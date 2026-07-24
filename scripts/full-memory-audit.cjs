const D = require('D:/tools/wenstar-cc/node_modules/better-sqlite3');
const db = new D('D:/tools/wenstar-cc/data/webui/fusion_memory.db', {readonly: true});
const fg = new D('D:/tools/wenstar-cc/data/webui/knowledge/family_graph.db', {readonly: true});

const CHARS = [
  {name:'玉瑶',        uuid:'TXS-000000001'},
  {name:'熊梓铭',      uuid:'TXS-000000003'},
  {name:'熊勇',        uuid:'TXS-000000004'},
  {name:'王全芬',      uuid:'TXS-000000005'},
  {name:'林土锋',      uuid:'TXS-000000006'},
  {name:'徐诗雨',      uuid:'TXS-000000007'},
  {name:'阿珍',        uuid:'TXS-000000008'},
  {name:'宁清华',      uuid:'TXS-000000002'},
  {name:'徐诗韵',      uuid:'TXS-000000011'},
  {name:'徐诗涵',      uuid:'TXS-000000018'},
  {name:'熊梓玥',      uuid:'TXS-000000019'},
  {name:'徐东伟',      uuid:'TXS-000000021'},
  {name:'阿苏',        uuid:'TXS-000000017'},
  {name:'陈雪花',      uuid:'TXS-000000009'},
  {name:'曾美容',      uuid:'TXS-000000010'},
  {name:'陈斌',        uuid:'TXS-000000012'},
  {name:'刘运新',      uuid:'TXS-000000013'},
  {name:'赖陈喜',      uuid:'TXS-000000014'},
  {name:'邱运财',      uuid:'TXS-000000015'},
  {name:'张小龙',      uuid:'TXS-000000016'},
  {name:'罗权斌',      uuid:'TXS-000000020'},
  {name:'陈锋华',      uuid:'TXS-000000022'},
];

console.log('═══════════════════════════════════════════════════════');
console.log('        全记忆库四层标注审计 (原始磁盘数据)            ');
console.log('═══════════════════════════════════════════════════════\n');

let totalConvsKeyword = 0, totalConvsUuid = 0;
let totalMemsKeyword = 0, totalMemsUuid = 0;
let totalVL = 0, totalBD = 0;

const ISSUES = [];

for (const c of CHARS) {
  // === Layer 1: conversations (上下文) ===
  const convsKw = db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE content LIKE '%${c.name}%'`).get().c;
  const convsUuid = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=?').get(c.uuid).c;
  const convsAstUuid = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid=? AND role='assistant'").get(c.uuid).c;

  // === Layer 2: memories (砂金) ===
  const memsKw = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE raw_input LIKE '%${c.name}%'`).get().c;
  const memsUuid = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid=?').get(c.uuid).c;

  // === Layer 3: vault_log (金库) ===
  const vlCount = db.prepare(`SELECT COUNT(*) as c FROM vault_log WHERE content_md LIKE '%${c.name}%' OR detail LIKE '%${c.name}%'`).get().c;

  // === Layer 4: black_diamond (黑钻) ===
  const bdKw = db.prepare(`SELECT COUNT(*) as c FROM black_diamond WHERE summary LIKE '%${c.name}%' OR tags LIKE '%${c.name}%'`).get().c;
  const bdUuid = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid=?').get(c.uuid).c;

  totalConvsKeyword += convsKw; totalConvsUuid += convsUuid;
  totalMemsKeyword += memsKw; totalMemsUuid += memsUuid;
  totalVL += vlCount; totalBD += bdKw;

  // FG
  const fgNode = fg.prepare(`SELECT properties,status FROM nodes WHERE name='${c.name}'`).get();
  const rel = fgNode ? (JSON.parse(fgNode.properties).relation_to_user || 'NULL') : 'MISSING';

  // Status icon
  const convsOk = convsKw > 0 && convsUuid > 0;
  const memsOk = memsKw > 0 && memsUuid > 0;
  const issues = [];
  if (convsKw > 0 && convsUuid === 0) issues.push('convs有数据无UUID');
  if (memsKw > 0 && memsUuid === 0) issues.push('mems有数据无UUID');
  if (convsKw === 0 && memsKw === 0) continue; // 无对话数据，跳过

  const statusIcon = (convsOk && memsOk) ? '✅' : (convsOk || memsOk) ? '⚠️' : '❌';

  console.log(`${statusIcon} ${c.name.padEnd(6)} convs:${String(convsUuid).padStart(4)}/${String(convsKw).padStart(4)} mems:${String(memsUuid).padStart(3)}/${String(memsKw).padStart(3)} VL:${String(vlCount).padStart(3)} BD:${String(bdKw).padStart(2)} rel:${rel.substring(0,30)}`);

  if (issues.length) ISSUES.push(c.name + ': ' + issues.join(', '));
}

console.log('');
console.log('═══════ 总计 ═══════');
const ct = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
const cl = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE belong_entity_uuid IS NOT NULL').get().c;
const mt = db.prepare('SELECT COUNT(*) as c FROM memories').get().c;
const ml = db.prepare('SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL').get().c;
const bt = db.prepare('SELECT COUNT(*) as c FROM black_diamond').get().c;
const bl = db.prepare('SELECT COUNT(*) as c FROM black_diamond WHERE belong_entity_uuid IS NOT NULL').get().c;
console.log(`conversations: ${cl}/${ct} (${(cl/ct*100).toFixed(1)}%)`);
console.log(`memories:      ${ml}/${mt} (${(ml/mt*100).toFixed(1)}%)`);
console.log(`black_diamond: ${bl}/${bt}`);
console.log(`以上22角色 convsUuid总计: ${totalConvsUuid} | memsUuid总计: ${totalMemsUuid}`);

if (ISSUES.length > 0) {
  console.log('');
  console.log('═══════ ⚠️ 仍有问题的角色 ═══════');
  for (const i of ISSUES) console.log('  ' + i);
} else {
  console.log('');
  console.log('✅ 所有有对话的角色，四层标注均无空白');
}

db.close();
fg.close();
