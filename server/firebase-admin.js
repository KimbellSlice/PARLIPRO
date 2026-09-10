import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

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

export function sendError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error('API error:', error);
  res.status(status).json({ ok: false, error: status >= 500 ? 'server_error' : error.message });
}
