import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { sendApiResponse } from './api-observability.js';

const DATABASE_URL = 'https://parlipro-fd42b-default-rtdb.firebaseio.com';

export const PO_LEASE_MS = 75000;

export function createLeaseToken() {
  return randomBytes(32).toString('base64url');
}

export function leaseIdForToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

export function getAdminApp() {
  const existing = getApps();
  if (existing.length) return existing[0];
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    databaseURL: DATABASE_URL,
  });
}

export function getAdminDatabase() {
  return getDatabase(getAdminApp());
}

// Realtime Database transactions invoke their updater immediately from the
// local cache. A fresh serverless instance has no cache, so an updater that
// correctly aborts on null can abort before the initial server read arrives.
// Keep a value listener attached until the transaction completes so its first
// updater invocation starts with a complete server snapshot.
export function runServerTransaction(reference, updater) {
  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => reference.off('value', handleValue);
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const handleValue = () => {
      if (started) return;
      started = true;
      Promise.resolve()
        .then(() => reference.transaction(updater))
        .then(resolve, reject)
        .finally(cleanup);
    };
    reference.on('value', handleValue, handleError);
  });
}

export async function requireUser(req) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer (.+)$/);
  if (!match) {
    const error = new Error('authentication_required');
    error.status = 401;
    throw error;
  }
  try {
    return await getAuth(getAdminApp()).verifyIdToken(match[1]);
  } catch {
    const error = new Error('invalid_authentication');
    error.status = 401;
    throw error;
  }
}

export function normalizeRoomCode(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9]{5}$/i.test(value)) return null;
  return value.toUpperCase();
}

export function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(pin, salt, 64).toString('hex') };
}

export function pinMatches(secret, pin) {
  if (typeof secret?.pinHash === 'string' && typeof secret?.pinSalt === 'string') {
    const actual = Buffer.from(hashPin(pin, secret.pinSalt).hash, 'hex');
    const expected = Buffer.from(secret.pinHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  // Temporary compatibility for chambers created before hashed PINs shipped.
  if (typeof secret?.poPin === 'string') {
    const actual = createHash('sha256').update(pin).digest();
    const expected = createHash('sha256').update(secret.poPin).digest();
    return timingSafeEqual(actual, expected);
  }
  return false;
}

export function sendError(res, error, context) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const errorCode = status >= 500 ? 'server_error' : error.message;
  const outcome = status >= 500 ? 'server_error' : 'request_error';
  const knownErrorCategories = {
    Error: 'error',
    FirebaseError: 'firebase_error',
    RangeError: 'range_error',
    TypeError: 'type_error',
  };
  const errorCategory = knownErrorCategories[error?.name] || 'unknown_error';
  return sendApiResponse(res, context, status, { ok: false, error: errorCode }, outcome, { errorCategory });
}
