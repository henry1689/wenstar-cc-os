// ============================================================
// SCRIPT-GOV-B — Audit Evidence Chain (CommonJS)
// ============================================================
//
// 提供受治理脚本执行的最小审计证据链：
//   AuthContext  — 谁/什么发起了脚本执行
//   AuditEvent   — 治理决策的不可变记录
//   FileAuditSink — 本地 JSONL 追加写入
//
// 环境变量：
//   SCRIPT_GOV_AUDIT_LOG=<path>      覆盖审计日志路径
//   SCRIPT_GOV_AUDIT_DISABLED=1      禁用所有审计写入
//
// 安全约束：
//   - 审计事件不得包含机密值
//   - 审计事件不得包含完整 DB 内容
//   - 审计事件不得包含真实个人数据（PII）
//   - 审计写入失败不得意外允许执行
// ============================================================

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// WORLD-SEGMENT-B: 导入世界段规范化函数（仅分类，零 I/O/DB/副作用）
var _ws = null;
function _getWorldSegment(contract) {
  if (!_ws) {
    try { _ws = require('./lib/world-segment.cjs'); } catch(e) { /* 回退：world-segment 模块不可用时使用 unknown */ }
  }
  if (!_ws) return 'unknown';
  // 从合约中提取显式的 worldSegment 字段，否则回退到 unknown
  var explicit = (contract && (contract.worldSegment || contract.world_segment)) || null;
  return _ws.normalizeWorldSegment(explicit);
}

var DEFAULT_AUDIT_DIR = '.var/audit';
var DEFAULT_AUDIT_FILE = 'script-governance.jsonl';

function _getAuditLogPath() {
  if (process.env.SCRIPT_GOV_AUDIT_LOG) return process.env.SCRIPT_GOV_AUDIT_LOG;
  return path.join(path.resolve(process.cwd(), DEFAULT_AUDIT_DIR), DEFAULT_AUDIT_FILE);
}

function _isAuditDisabled() {
  return process.env.SCRIPT_GOV_AUDIT_DISABLED === '1';
}

function _ensureDir(filePath) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch(e) {} }
}

function _shortId() {
  return 'evt_' + crypto.randomUUID().substring(0, 12);
}

// ═══════════════════════════════════════════
// AuthContext
// ═══════════════════════════════════════════

/**
 * 从合约的 operator 字段推导 AuthContext。
 * @param {object} contract — 脚本执行合约
 * @returns {object} { operator, actorType, reason, ticket, runId, timestamp }
 */
function createAuthContext(contract) {
  var op = (contract && contract.operator) || {};
  return {
    operator: op.operatorId || null,
    actorType: op.operatorId ? 'human' : 'unknown',
    reason: op.reason || null,
    ticket: op.ticket || null,
    runId: _shortId(),
    timestamp: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════
// AuditEvent
// ═══════════════════════════════════════════

/**
 * 为治理决策创建不可变审计事件。
 * 不包含机密、完整 DB 内容、或 PII。
 *
 * @param {object} contract — 脚本执行合约
 * @param {object} validationResult — validateGate() 的返回值 { allowed, errors, warnings }
 * @param {string} [phase] — 'preflight' | 'final' (默认 'preflight')
 * @returns {object} 冻结的 AuditEvent
 */
function createAuditEvent(contract, validationResult, phase) {
  var p = phase || 'preflight';
  var auth = createAuthContext(contract);
  var issues = [];
  var errs = (validationResult && validationResult.errors) || [];
  for (var i = 0; i < errs.length; i++) {
    issues.push('[' + errs[i].rule + '] ' + errs[i].message);
  }
  var warns = (validationResult && validationResult.warnings) || [];
  for (var j = 0; j < warns.length; j++) {
    issues.push('[WARN:' + warns[j].rule + '] ' + warns[j].message);
  }

  var event = {
    schema: 'script-gov.audit.v1',
    eventId: _shortId(),
    timestamp: new Date().toISOString(),
    scriptId: (contract && contract.scriptId) || 'unknown',
    operation: (contract && contract.operationType) || 'unknown',
    risk: (contract && contract.riskLevel) || 'unknown',
    mode: (contract && contract.mode) || 'unknown',
    environment: (contract && contract.environment) || 'local',
    phase: p,
    outcome: (validationResult && validationResult.allowed) ? 'accepted' : 'denied',
    exitCode: (validationResult && validationResult.allowed) ? null : 2,
    validationIssues: issues,
    worldSegment: _getWorldSegment(contract),
    auth: auth
  };

  // 不可变 — Object.freeze 防止意外修改
  return Object.freeze(event);
}

// ═══════════════════════════════════════════
// FileAuditSink
// ═══════════════════════════════════════════

/**
 * 将审计事件追加写入本地 JSONL 文件。
 * 每行一个 JSON 对象，UTF-8 编码，仅追加。
 * 不依赖外部服务，不访问网络。
 *
 * @param {object} event — createAuditEvent() 返回的冻结事件
 * @param {string} [sinkPath] — 可选覆盖路径（默认 .var/audit/script-governance.jsonl）
 */
function recordAuditEvent(event, sinkPath) {
  if (_isAuditDisabled()) return;
  try {
    var p = sinkPath || _getAuditLogPath();
    _ensureDir(p);
    fs.appendFileSync(p, JSON.stringify(event) + '\n', 'utf8');
  } catch (e) {
    // 审计写入失败不得意外允许业务逻辑继续。
    // 记录到 stderr；调用者负责在拒绝后 exit(2)。
    console.error('[SCRIPT-GOV-B] audit write failed: ' + (e.message || e));
  }
}

// ═══════════════════════════════════════════
// Convenience
// ═══════════════════════════════════════════

/**
 * 便捷函数：从合约+验证结果创建并写入审计事件。
 * 脚本可使用此单次调用在拒绝/接受时发出审计事件。
 *
 * @param {object} contract — 脚本执行合约
 * @param {object} validationResult — validateGate() 返回值
 * @param {string} [phase] — 'preflight' | 'final'
 * @param {string} [sinkPath] — 可选覆盖审计日志路径
 */
function recordGovernanceDecision(contract, validationResult, phase, sinkPath) {
  if (_isAuditDisabled()) return;
  try {
    var event = createAuditEvent(contract, validationResult, phase);
    recordAuditEvent(event, sinkPath);
  } catch (e) {
    console.error('[SCRIPT-GOV-B] recordGovernanceDecision failed: ' + (e.message || e));
  }
}

module.exports = {
  createAuthContext: createAuthContext,
  createAuditEvent: createAuditEvent,
  recordAuditEvent: recordAuditEvent,
  recordGovernanceDecision: recordGovernanceDecision,
  getAuditLogPath: _getAuditLogPath,
  isAuditDisabled: _isAuditDisabled
};
