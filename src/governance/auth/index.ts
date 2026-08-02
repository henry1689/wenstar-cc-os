// ============================================================
// AUTHZ-B — 授权治理模块 统一导出
// ============================================================

// 类型
export type {
  AuthContext,
  AuthScope,
  SensitivityLevel,
  ValidPurpose,
} from './AuthContext.js';
export { VALID_PURPOSES, isValidPurpose, DEFAULT_AUTH_SCOPE, userSessionScope } from './AuthContext.js';

export type {
  WriteIntent,
  WriteIntentParams,
  OperationType,
  Reversibility,
  UserIntentLevel,
} from './WriteIntent.js';
export { createWriteIntent, validateWriteIntentFields, validateWriteIntentPurpose } from './WriteIntent.js';

export type {
  AuthorizationDecision,
  AuthDecision,
  DenialReason,
} from './AuthorizationDecision.js';
export {
  allowDecision,
  denyDecision,
  requireConfirmationDecision,
  DENIAL_CODES,
} from './AuthorizationDecision.js';

export type {
  AuthzPolicyRule,
  AuthzPolicyRegistry,
} from './AuthzPolicy.js';
export {
  evaluateWriteAuthorization,
  DEFAULT_POLICY_REGISTRY,
  isDenied,
  isAllowed,
  requiresConfirmation,
} from './AuthzPolicy.js';

export type { CreateAuthContextParams } from './createAuthContext.js';
export {
  createAuthContext,
  createUserSessionAuthContext,
  createAgentToolAuthContext,
  createSystemAutoAuthContext,
  createMigrationAuthContext,
} from './createAuthContext.js';

export {
  assertWriteAuthorized,
  checkWriteAuthorized,
  checkAllWriteAuthorized,
  WriteNotAuthorizedError,
  WriteRequiresConfirmationError,
} from './assertWriteAuthorized.js';
