import { randomUUID } from 'node:crypto';

const API_OPERATIONS = new Set(['claim_po', 'cleanup_rooms', 'close_room', 'create_room', 'release_po', 'renew_po_lease']);
const HTTP_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
const SAFE_OUTCOMES = new Set([
  'authentication_required',
  'incorrect_pin',
  'invalid_input',
  'invalid_student',
  'locked',
  'method_not_allowed',
  'not_authorized',
  'not_controller',
  'not_found',
  'po_already_active',
  'po_lease_lost',
  'request_error',
  'room_code_taken',
  'server_error',
  'success',
]);
const SAFE_REASONS = new Set(['credentials_mismatch', 'expired', 'missing_lease']);
const SAFE_ERROR_CATEGORIES = new Set(['error', 'firebase_error', 'range_error', 'type_error', 'unknown_error']);

function safeDetails(details) {
  const safe = {};
  if (Number.isFinite(details?.pathsDeleted)) safe.pathsDeleted = details.pathsDeleted;
  if (SAFE_REASONS.has(details?.reason)) safe.reason = details.reason;
  if (SAFE_ERROR_CATEGORIES.has(details?.errorCategory)) safe.errorCategory = details.errorCategory;
  return safe;
}

function writeLog(statusCode, record) {
  const message = JSON.stringify(record);
  if (statusCode >= 500) console.error(message);
  else if (statusCode >= 400) console.warn(message);
  else console.info(message);
}

export function createApiContext(req, res, operation) {
  const requestId = randomUUID();
  res.setHeader?.('x-request-id', requestId);
  return {
    operation: API_OPERATIONS.has(operation) ? operation : 'unknown',
    method: HTTP_METHODS.has(req.method) ? req.method : 'UNKNOWN',
    requestId,
    startedAt: Date.now(),
    logged: false,
  };
}

export function sendApiResponse(res, context, statusCode, payload, outcome, details) {
  if (!context.logged) {
    context.logged = true;
    writeLog(statusCode, {
      timestamp: new Date().toISOString(),
      event: 'api_request',
      operation: context.operation,
      requestId: context.requestId,
      method: context.method,
      statusCode,
      outcome: SAFE_OUTCOMES.has(outcome) ? outcome : 'unknown',
      durationMs: Math.max(0, Date.now() - context.startedAt),
      ...safeDetails(details),
    });
  }
  return res.status(statusCode).json(payload);
}
