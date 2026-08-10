/**
 * backfill-temporals.cjs — 时空标签存量回填脚本（V20）
 * =========================================================
 * 方案 A：不改任何 .ts 代码，用数据回填恢复时空管理链路。
 *
 * 为存量 memories 回填：
 *   time_period        — 时段（按 created_at 小时）
 *   season             — 季节（按 created_at 月份）
 *   lunar_term         — 农历/节气（从 LUNAR_2026 映射）
 *   location_fingerprint — 场景指纹（优先用 dialog_group_id，其次实体）
 *
 * 零 token：纯本地计算。可重复执行（幂等）。
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const { createHash } = require('node:crypto');

const BASE = path.resolve(__dirname, '..');
const FM_PATH = path.join(BASE, 'data/webui/fusion_memory.db');

// ── 时段映射 ──
function timePeriod(d) {
  const h = d.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 12) return 'morning';
  if (h >= 12 && h < 14) return 'noon';
  if (h >= 14 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

// ── 季节映射 ──
function season(d) {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

// ── 农历/节气（LUNAR_2026 映射）──
function loadLunar() {
  try {
    // 从 dist 或 src 读 LUNAR_2026
    const candidates = [
      path.join(BASE, 'dist', 'config', 'app-identity.js'),
      path.join(BASE, 'src', 'config', 'app-identity.ts'),
    ];
    for (const c of candidates) {
      if (require('fs').existsSync(c)) {
        // 动态加载
        const mod = require(c);
        if (mod.LUNAR_2026) return mod.LUNAR_2026;
      }
    }
  } catch (e) { /* 加载失败返回空 */ }
  return null;
}

// ── 场景指纹（对话组/实体哈希）──
function locationFingerprint(dg, entities, text) {
  const _dg = dg || '';
  const _ents = (entities || []).filter(n => n && n !== '我').join(',');
  const raw = `${_dg}|${_ents}|${(text || '').slice(0, 20)}`;
  if (!_dg && !_ents) return '';
  return createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

// ── 主流程 ──
function main() {
  console.log('=== 时空标签存量回填开始 ===');
  const db = new Database(FM_PATH);
  const lunar = loadLunar();
  console.log('LUNAR_2026 加载:', lunar ? `✅ ${Object.keys(lunar).length} 条` : '❌ 未加载');

  // 读取待回填的 memories（排除会被 _rebuildMemoryAnchors 重建的 ANCHOR/CHUNK 行）
  // S4-FIX: ANCHOR/CHUNK 每次启动被 rebuild 无条件 DELETE+重建且 INSERT 不含时空列 → 回填瞬态。
  //         只回填非 ANCHOR/CHUNK 的耐久记忆。
  const rows = db.prepare(
    "SELECT id, created_at, dialog_group_id, fg_entity_names, raw_input FROM memories WHERE id NOT LIKE '%_ANCHOR' AND id NOT LIKE '%_CHUNK%'"
  ).all();

  let tp = 0, se = 0, lu = 0, loc = 0, skipped = 0;
  const upd = db.prepare(
    "UPDATE memories SET time_period = COALESCE(?, time_period), season = COALESCE(?, season), lunar_term = COALESCE(?, lunar_term), location_fingerprint = COALESCE(?, location_fingerprint) WHERE id = ?"
  );

  // S4-FIX: 全部写入包进单事务，避免崩溃产生 rollback journal（sql.js 不理解 journal，可能读到撕裂状态）
  const tx = db.transaction(() => {
    for (const r of rows) {
      const d = new Date(r.created_at || Date.now());
      if (isNaN(d.getTime())) { skipped++; continue; }
      const t = timePeriod(d);
      const s = season(d);
      const md = (d.getMonth() + 1) * 100 + d.getDate();
      const l = lunar ? (lunar[md] || '') : '';
      // 指纹：优先 dialog_group_id，其次 fg_entity_names（S4-FIX: 去掉 raw_input 文本，保证场景稳定）
      const entities = r.fg_entity_names ? String(r.fg_entity_names).split(',').map(n => n.trim()).filter(Boolean) : [];
      const fp = locationFingerprint(r.dialog_group_id, entities, '');

      if (t) tp++;
      if (s) se++;
      if (l) lu++;
      if (fp) loc++;
      upd.run(t, s, l || null, fp || null, r.id);
    }
  });
  tx();

  // S4-FIX: 完整性校验
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity && integrity.integrity_check !== 'ok') {
    console.error('❌ DB 完整性校验失败:', JSON.stringify(integrity));
    process.exitCode = 1;
    db.close();
    return;
  }

  // 统计
  console.log(`✅ 回填完成:`);
  console.log(`  time_period: ${tp}/${rows.length}`);
  console.log(`  season: ${se}/${rows.length}`);
  console.log(`  lunar_term: ${lu}/${rows.length}`);
  console.log(`  location_fingerprint: ${loc}/${rows.length}`);

  db.close();
  console.log('=== 回填结束 ===');
}

main();
