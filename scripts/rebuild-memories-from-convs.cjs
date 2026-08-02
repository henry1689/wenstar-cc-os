/**
 * rebuild-memories-from-convs.cjs — 从 conversations 重建 memories
 *
 * 策略：
 *   1. 按 dialog_group_id 分组，每组生成 1 条锚点记忆
 *   2. 复制 conversations.belong_entity_uuid → memories.belong_entity_uuid
 *   3. 自动检测角色扮演称谓 → memory_kind = 'roleplay'
 *   4. 无 UUID 的 conversation 跳过
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');

const path = require('path');
const DB = path.resolve(__dirname, '..', 'data/webui/fusion_memory.db');
console.log('DB路径:', DB);
if (!require('fs').existsSync(DB)) { console.error('文件不存在:', DB); process.exit(1); }
const db = new Database(DB);

// ── 角色扮演称谓检测 ──
const RP_PATTERNS = [
  /爸爸/, /爷爷/, /女儿/, /儿子/, /哥哥/, /叔叔/, /妈妈/, /妹妹/, /姐姐/,
  /爹爹/, / daddy /i, /主人/, /老公/, /老婆/,
];

function detectMemoryKind(content) {
  for (const p of RP_PATTERNS) {
    if (p.test(content)) return 'roleplay';
  }
  return 'normal';
}

function calcCalciumLevel(score) {
  if (score >= 2) return 3;
  if (score >= 1) return 2;
  if (score >= 0.5) return 1;
  return 0;
}

// ── 获取所有有 UUID 的对话组，按组聚合 ──
console.log('=== 从 conversations 重建 memories ===');

const groups = db.prepare(`
  SELECT
    dialog_group_id,
    belong_entity_uuid,
    COUNT(*) as turn_count,
    SUM(CASE WHEN role='user' THEN 1 ELSE 0 END) as user_turns,
    SUM(CASE WHEN role='assistant' THEN 1 ELSE 0 END) as asst_turns,
    MIN(timestamp) as first_ts,
    MAX(timestamp) as last_ts,
    AVG(COALESCE(calcium_score, 0.5)) as avg_calcium,
    MAX(COALESCE(calcium_score, 0.5)) as max_calcium
  FROM conversations
  WHERE belong_entity_uuid IS NOT NULL
    AND belong_entity_uuid != ''
    AND dialog_group_id IS NOT NULL
  GROUP BY dialog_group_id, belong_entity_uuid
  ORDER BY belong_entity_uuid, first_ts
`).all();

console.log(`对话组: ${groups.length} 个`);

// ── entities UUID→name 映射 ──
const entMap = new Map();
const ents = db.prepare("SELECT uuid, name FROM entities WHERE type='person' AND uuid IS NOT NULL").all();
ents.forEach(e => entMap.set(e.uuid, e.name));

// ── 清空旧回填记忆（id 含 _ANCHOR），保留服务器新生成的 ──
const beforeClean = db.prepare('SELECT COUNT(*) as c FROM memories').get();
const cleaned = db.prepare("DELETE FROM memories WHERE id LIKE '%_ANCHOR' AND source_type IS NULL").run();
const afterClean = db.prepare('SELECT COUNT(*) as c FROM memories').get();
console.log(`清理前: ${beforeClean.c} → 清理后: ${afterClean.c} (删除 ${cleaned.changes} 条旧回填)`);

// ── 批量生成锚点记忆 ──
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO memories (
    id, seq_pos, created_at, perception_json, calcium_score, calcium_level,
    locus_path, leaf_zone, raw_input, memory_kind, lifecycle_state,
    confidence_score, stability_score, thread_id, session_id, source_conversation_ids,
    recall_count, promoted_to_diamond, strength_updated_at, effective_strength,
    is_landmark, primary_emotion, memory_type, dialog_group_id, topic_label,
    global_uid, location_fingerprint, belong_entity_uuid,
    is_foresight, valid_until_ms, foresight_status
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    0, 0, ?, ?,
    1, ?, ?, ?, ?,
    ?, ?, ?,
    0, NULL, 'none'
  )
`);

let inserted = 0;
let skipped = 0;
let insertIdx = 1;  // 递增 seq_pos 计数器
const uuidCount = {};

const tx = db.transaction(() => {
  for (const g of groups) {
    // 取该组所有对话
    const turns = db.prepare(`
      SELECT role, content, timestamp, calcium_score, topic
      FROM conversations
      WHERE dialog_group_id = ? AND belong_entity_uuid = ?
      ORDER BY timestamp
    `).all(g.dialog_group_id, g.belong_entity_uuid);

    if (turns.length === 0) { skipped++; continue; }

    const entityName = entMap.get(g.belong_entity_uuid) || g.belong_entity_uuid;
    const now = new Date().toISOString();
    const id = g.dialog_group_id + '_ANCHOR';

    // 构建 raw_input
    const parts = [];
    parts.push(`【核心·${entityName}】`);
    for (const t of turns.slice(0, 10)) {
      const speaker = t.role === 'user' ? '鸿艺' : entityName;
      const snippet = (t.content || '').substring(0, 150);
      parts.push(`${speaker}：${snippet}`);
    }
    const rawInput = parts.join('\n').substring(0, 4000);

    // 全量 content 检测角色扮演
    const allContent = turns.map(t => t.content || '').join(' ');
    const kind = detectMemoryKind(allContent);

    const calScore = parseFloat((g.max_calcium || g.avg_calcium || 0.5).toFixed(3));
    const calLevel = calcCalciumLevel(calScore);
    const effStrength = Math.min(1.0, calScore * 0.8);

    try {
      const seqPos = insertIdx++;                        // 递增 seq_pos
      insertStmt.run(
        id,                                          // id
        seqPos,                                      // seq_pos (唯一递增)
        g.first_ts || now,                           // created_at
        '[0,0,0,0,0.5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]', // perception_json
        calScore,                                    // calcium_score
        calLevel,                                    // calcium_level
        'user.misc.default',                         // locus_path
        'language_semantic_zone',                    // leaf_zone
        rawInput,                                    // raw_input
        kind,                                        // memory_kind
        calLevel >= 2 ? 'active' : 'candidate',      // lifecycle_state
        0.55,                                        // confidence_score
        calLevel >= 2 ? 0.45 : 0.2,                  // stability_score
        g.dialog_group_id,                           // thread_id
        null,                                        // session_id
        null,                                        // source_conversation_ids
        now,                                         // strength_updated_at
        effStrength,                                 // effective_strength
        '平静',                                      // primary_emotion
        'dialog',                                    // memory_type
        g.dialog_group_id,                           // dialog_group_id
        null,                                        // topic_label
        crypto.randomUUID(),                         // global_uid
        null,                                        // location_fingerprint
        g.belong_entity_uuid                         // belong_entity_uuid 🔑
      );
      inserted++;

      if (!uuidCount[g.belong_entity_uuid]) uuidCount[g.belong_entity_uuid] = { cnt: 0, name: entityName };
      uuidCount[g.belong_entity_uuid].cnt++;
    } catch (e) {
      skipped++;
      if (skipped <= 3) console.warn(`  跳过 ${g.dialog_group_id}: ${e.message}`);
    }
  }
});

tx();
console.log(`\n插入: ${inserted} 条, 跳过: ${skipped} 条`);

// ── 验证 ──
const after = db.prepare('SELECT COUNT(*) as c FROM memories').get();
const hasUUID = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != ''").get();
const nullUUID = db.prepare("SELECT COUNT(*) as c FROM memories WHERE belong_entity_uuid IS NULL OR belong_entity_uuid = ''").get();

console.log(`\n=== 结果 ===`);
console.log(`总计: ${after.c}  有UUID: ${hasUUID.c}  无UUID: ${nullUUID.c}`);

console.log(`\n=== UUID Top 15 ===`);
const top = db.prepare("SELECT belong_entity_uuid, COUNT(*) as cnt FROM memories WHERE belong_entity_uuid IS NOT NULL AND belong_entity_uuid != '' GROUP BY belong_entity_uuid ORDER BY cnt DESC LIMIT 15").all();
top.forEach(r => {
  const name = entMap.get(r.belong_entity_uuid) || '??';
  console.log(`  ${name.padEnd(10)} ${r.belong_entity_uuid}  ${r.cnt}条`);
});

console.log(`\n=== roleplay vs normal ===`);
const kindDist = db.prepare("SELECT memory_kind, COUNT(*) as cnt FROM memories GROUP BY memory_kind").all();
kindDist.forEach(r => console.log(`  ${r.memory_kind}: ${r.cnt}条`));

db.close();
console.log('\n✅ 重建完成');
