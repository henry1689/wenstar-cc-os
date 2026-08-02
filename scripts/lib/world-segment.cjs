// ============================================================
// WORLD-SEGMENT-A — World Segmentation Foundation (v1)
// ============================================================
//
// 只读·纯函数·无 I/O·无 DB·无副作用
//
// 受控词汇：
//   core        = 系统级运维/治理数据
//   personal    = 用户个人学习/记忆/偏好数据
//   project     = 项目/工作空间特定运营数据
//   simulation  = 虚构/沙箱/生成/探索性世界数据
//   archive     = 遗留/历史/已退役数据
//   unknown     = 未分类或待定
//
// WORLD-SEGMENT-A 不迁移生产数据。
// WORLD-SEGMENT-A 不强制执行访问控制。
// WORLD-SEGMENT-A 不修改现有脚本。
// WORLD-SEGMENT-A 是仅分类的基础层。
// ============================================================

'use strict';

// ═══════════════════════════════════════════
// 词汇表
// ═══════════════════════════════════════════

var WORLD_SEGMENTS = Object.freeze({
  CORE:        'core',
  PERSONAL:    'personal',
  PROJECT:     'project',
  SIMULATION:  'simulation',
  ARCHIVE:     'archive',
  UNKNOWN:     'unknown',
});

var SEGMENT_SET = Object.freeze({
  core:        true,
  personal:    true,
  project:     true,
  simulation:  true,
  archive:     true,
  unknown:     true,
});

// 分类启发式 — 保守的最小匹配
var CLASSIFICATION_HINTS = Object.freeze([
  { field: 'worldSegment',   segment: null, weight: 100 },
  { field: 'world_segment',  segment: null, weight: 100 },
  { field: 'segment',        segment: null, weight: 100 },
  // 关键词启发式 (低权重, 仅在无显式字段时使用)
  { pattern: /governance|system|operational|infrastructure|harness|agent-cnc/i, segment: 'core',       weight: 10 },
  { pattern: /personal|memory|preference|user-profile|learning|dream/i,             segment: 'personal',  weight: 10 },
  { pattern: /project|workspace|task|workflow|repo/i,                               segment: 'project',   weight: 10 },
  { pattern: /simulation|sandbox|fiction|generated|exploratory|test-fixture/i,      segment: 'simulation',weight: 10 },
  { pattern: /archive|legacy|deprecated|retired|historical/i,                       segment: 'archive',   weight: 10 },
]);

// ═══════════════════════════════════════════
// isWorldSegment
// ═══════════════════════════════════════════

/**
 * 仅对有效的世界段字符串返回 true。
 * 拒绝 null/undefined/''/非字符串。
 * @param {*} value
 * @returns {boolean}
 */
function isWorldSegment(value) {
  if (typeof value !== 'string') return false;
  return SEGMENT_SET.hasOwnProperty(value);
}

// ═══════════════════════════════════════════
// normalizeWorldSegment
// ═══════════════════════════════════════════

/**
 * 规范化:
 *   - trim 空格
 *   - 转小写
 *   - 无效输入 → 'unknown'
 *   - 有效段值 → 原样返回
 *
 * 永不抛出。
 *
 * @param {*} value
 * @returns {string} 有效的段字符串
 */
function normalizeWorldSegment(value) {
  if (value === null || value === undefined) return WORLD_SEGMENTS.UNKNOWN;
  if (typeof value !== 'string') return WORLD_SEGMENTS.UNKNOWN;

  var cleaned = value.trim().toLowerCase();
  if (cleaned.length === 0) return WORLD_SEGMENTS.UNKNOWN;

  return SEGMENT_SET.hasOwnProperty(cleaned) ? cleaned : WORLD_SEGMENTS.UNKNOWN;
}

// ═══════════════════════════════════════════
// assertWorldSegment
// ═══════════════════════════════════════════

/**
 * 断言段值有效。
 *
 * @param {*} value
 * @param {object} [opts]
 * @param {boolean} [opts.allowUnknown=false] — true 时允许 'unknown'
 * @returns {string} 规范化段值
 * @throws {TypeError} 如果无效（或为 unknown 且不允许）
 */
function assertWorldSegment(value, opts) {
  var allowUnknown = !!(opts && opts.allowUnknown);
  var normalized = normalizeWorldSegment(value);

  if (normalized === WORLD_SEGMENTS.UNKNOWN) {
    if (allowUnknown) return normalized;
    throw new TypeError(
      'WORLD-SEGMENT-A: invalid world segment "' + String(value) +
      '". Allowed: core, personal, project, simulation, archive, unknown.'
    );
  }

  return normalized;
}

// ═══════════════════════════════════════════
// classifyWorldSegment
// ═══════════════════════════════════════════

/**
 * 从结构化输入中读取并分类世界段。
 *
 * 优先级:
 *   1. 输入中显式 worldSegment / world_segment / segment 字段 (胜出)
 *   2. 按关键词启发式对 type/category/source 字段分类
 *   3. 回退到 'unknown'
 *
 * 只读。无副作用。无外部调用。
 *
 * @param {*} input — string | object | null | undefined
 * @returns {string} 分类后的段值
 */
function classifyWorldSegment(input) {
  // 字符串直接规范化
  if (typeof input === 'string') {
    return normalizeWorldSegment(input);
  }

  // null/undefined → unknown
  if (input === null || input === undefined) {
    return WORLD_SEGMENTS.UNKNOWN;
  }

  // 非对象 → unknown
  if (typeof input !== 'object') {
    return WORLD_SEGMENTS.UNKNOWN;
  }

  // 1. 显式段字段
  var explicitFields = ['worldSegment', 'world_segment', 'segment'];
  for (var i = 0; i < explicitFields.length; i++) {
    var val = input[explicitFields[i]];
    if (val !== undefined && val !== null) {
      var norm = normalizeWorldSegment(val);
      if (norm !== WORLD_SEGMENTS.UNKNOWN) {
        return norm;
      }
    }
  }

  // 2. 关键词启发式
  var candidateFields = ['type', 'category', 'source', 'label', 'kind'];
  var searchText = '';

  for (var j = 0; j < candidateFields.length; j++) {
    var fv = input[candidateFields[j]];
    if (typeof fv === 'string' && fv.length > 0) {
      searchText += fv + ' ';
    }
  }

  if (searchText.length > 0) {
    for (var k = 0; k < CLASSIFICATION_HINTS.length; k++) {
      var hint = CLASSIFICATION_HINTS[k];
      if (hint.pattern && hint.pattern.test(searchText)) {
        return hint.segment;
      }
    }
  }

  // 3. 回退
  return WORLD_SEGMENTS.UNKNOWN;
}

// ═══════════════════════════════════════════
// attachWorldSegment
// ═══════════════════════════════════════════

/**
 * 返回附加了 worldSegment 的浅拷贝。
 * 不修改原始对象。
 *
 * @param {object} record — 要附加段信息的记录
 * @param {*} segment — 段值（将被规范化）
 * @param {object} [opts]
 * @param {boolean} [opts.allowUnknown=true] — 默认允许 unknown
 * @returns {object} 带有 worldSegment 的浅拷贝
 * @throws {TypeError} 如果段无效且 allowUnknown=false
 */
function attachWorldSegment(record, segment, opts) {
  var allowUnknown = !opts || opts.allowUnknown !== false; // 默认允许
  var normalized;

  if (allowUnknown) {
    normalized = normalizeWorldSegment(segment);
  } else {
    normalized = assertWorldSegment(segment, { allowUnknown: false });
  }

  // 浅拷贝, 附加 worldSegment
  var copy = {};
  var keys = Object.keys(record || {});
  for (var i = 0; i < keys.length; i++) {
    copy[keys[i]] = record[keys[i]];
  }
  copy.worldSegment = normalized;
  return copy;
}

// ═══════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════

module.exports = {
  WORLD_SEGMENTS: WORLD_SEGMENTS,
  isWorldSegment: isWorldSegment,
  normalizeWorldSegment: normalizeWorldSegment,
  assertWorldSegment: assertWorldSegment,
  classifyWorldSegment: classifyWorldSegment,
  attachWorldSegment: attachWorldSegment,
};
