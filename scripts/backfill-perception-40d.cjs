/**
 * backfill-perception-40d.cjs — 40D 感知向量存量回填脚本（V20）
 * =============================================================
 * 为存量 memories 回填 perception_40d 列（40D 感知向量）。
 *
 * 40D 编码完全参照 32D 通用规则细则（双规范结合）:
 *   - WS-ARCH-32D-MEM 工程蓝皮书 spine.proto D1-D32（5 大类，field 10-55）
 *   - DNA 双螺旋完整编码规范 V2.0 §1.1（海胆 32 根语义刺）
 * 40D = spine.proto D1-D32 + 新增 D33-D40（伴侣情感纹理，第 6 大类）
 *
 * 🟢 维度（D09/D12/D14/D15/D17/D19/D33-D40）从存量 24D 派生
 * 🔵 维度（D01-D08/D11/D13/D16/D18/D20/D21-D32）留接口，P3 数据源填充（当前 0）
 *
 * 零 token：纯本地计算。可重复执行（幂等）。参照 backfill-temporals.cjs 范式。
 * 🔴 停服运行：写 fusion_memory.db，需在 wenstar-cc 服务停止时执行（防 sql.js 并发覆写）。
 */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const FM_PATH = path.join(BASE, 'data/webui/fusion_memory.db');

// ── 40D 维度键序（与 src/m3/types/perception-40d.ts PERCEPTION_40D_KEYS 一致）──
const D40_KEYS = [
  'd01_muscle_fatigue', 'd02_pain_level', 'd03_nerve_arousal', 'd04_hormones',
  'd05_pheromone', 'd06_metabolic_cycle', 'd07_self_heal', 'd08_sensory_env',
  'd09_self_identity', 'd10_desire', 'd11_fear_anxiety', 'd12_pleasure',
  'd13_empathy', 'd14_self_protect', 'd15_partner_attachment', 'd16_partner_protect',
  'd17_family_belonging', 'd18_family_protect', 'd19_social_fit', 'd20_team_protect',
  'd21_private_space', 'd22_home_atmosphere', 'd23_workplace', 'd24_public_space',
  'd25_space_distance', 'd26_season_climate', 'd27_micro_physiology', 'd28_nature_expand',
  'd29_social_refine', 'd30_culture_growth', 'd31_subjective_objective', 'd32_global_overview',
  'd33_sexual_attraction', 'd34_energy_merge', 'd35_sincerity', 'd36_dominance',
  'd37_moral_judgment', 'd38_humor', 'd39_dependency', 'd40_possessiveness',
];

// ── 24D → 40D 语义映射（🟢 维度）──
// { key24: 24D 字段名, dim40: 1-indexed D 编号 }
const MAP_24_TO_40 = [
  // 大类2 精神内核
  { key24: 'self_ref',    dim40: 9  },  // D09 自我认知
  { key24: 'pleasure',    dim40: 12 },  // D12 愉悦
  { key24: 'safety',      dim40: 14 },  // D14 个体自保
  // 大类3 圈层人际
  { key24: 'intimacy',    dim40: 15 },  // D15 伴侣依恋
  { key24: 'belonging',   dim40: 17 },  // D17 家庭归属
  { key24: 'etiquette',   dim40: 19 },  // D19 社交适配
  // 大类6 伴侣情感纹理
  { key24: 'sexual_attraction', dim40: 33 },
  { key24: 'energy_merge',      dim40: 34 },
  { key24: 'sincerity',         dim40: 35 },
  { key24: 'dominance',         dim40: 36 },
  { key24: 'moral_judgment',    dim40: 37 },
  { key24: 'humor',             dim40: 38 },
  { key24: 'dependency',        dim40: 39 },
  { key24: 'possessiveness',    dim40: 40 },
];

/** 解码 24D perception_json（兼容数组 [24] 与对象）*/
function decode24D(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 24) {
      // 数组格式 → 固定 24 维顺序（EmotionVectorCodec 定义）
      const KEYS24 = [
        'pleasure','arousal','dominance','aggression','sincerity','humor',
        'factual','logical','certainty','abstract','temporal_focus','self_ref',
        'intimacy','power_diff','dependency','moral_judgment','etiquette','belonging',
        'sexual_attraction','sensory_craving','energy_merge','possessiveness','ecstasy','safety',
      ];
      const obj = {};
      for (let i = 0; i < 24; i++) obj[KEYS24[i]] = Number(parsed[i]) || 0;
      return obj;
    }
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** 将 24D 对象 → 40D 数组（40 元素） */
function map24To40DArray(p24) {
  const arr = new Array(40).fill(0);
  for (const { key24, dim40 } of MAP_24_TO_40) {
    const v = Number(p24[key24]);
    if (isFinite(v)) arr[dim40 - 1] = v;
  }
  return arr;
}

// ── 主流程 ──
function main() {
  console.log('=== 40D 感知向量存量回填开始 ===');
  const db = new Database(FM_PATH);

  // 确认 perception_40d 列存在（无则 ALTER）
  const cols = db.prepare("PRAGMA table_info(memories)").all();
  if (!cols.some(c => c.name === 'perception_40d')) {
    console.log('[Backfill] ⚠️ memories 表无 perception_40d 列，执行 ALTER...');
    db.prepare("ALTER TABLE memories ADD COLUMN perception_40d TEXT").run();
  }

  // 读取已有 24D 感知向量、perception_40d 为空的记忆
  const rows = db.prepare(
    "SELECT id, perception_json, perception_40d FROM memories WHERE perception_40d IS NULL OR perception_40d = ''"
  ).all();

  let updated = 0, skipped = 0;
  const upd = db.prepare('UPDATE memories SET perception_40d = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const r of rows) {
      const p24 = decode24D(r.perception_json);
      if (!p24) { skipped++; continue; }
      const p40 = map24To40DArray(p24);
      upd.run(JSON.stringify(p40), r.id);
      updated++;
    }
  });
  tx();

  // 完整性校验
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity && integrity.integrity_check !== 'ok') {
    console.error('❌ DB 完整性校验失败:', JSON.stringify(integrity));
    process.exitCode = 1;
    db.close();
    return;
  }

  console.log(`✅ 回填完成:`);
  console.log(`  已回填: ${updated} 条`);
  console.log(`  跳过: ${skipped} 条（无 24D 数据）`);
  console.log(`  perception_40d 已有值的: ${rows.length - updated - skipped} 条（幂等跳过）`);

  db.close();
  console.log('=== 回填结束 ===');
}

main();
