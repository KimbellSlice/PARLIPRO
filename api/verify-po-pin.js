import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Same Realtime Database as src/firebase.js — this value isn't secret, it's
// already public in the client bundle. What's secret is the service account
// credential below, which never ships to the client.
const DATABASE_URL = 'https://parlipro-fd42b-default-rtdb.firebaseio.com';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

function getApp() {
  const existing = getApps();
  if (existing.length) return existing[0];
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    }),
    databaseURL: DATABASE_URL
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const { roomCode, pin } = req.body || {};
  if (typeof roomCode !== 'string' || !/^[A-Z0-9]{4,8}$/i.test(roomCode) ||
      typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ ok: false, error: 'invalid_input' });
    return;
  }
  const code = roomCode.toUpperCase();

  try {
    const db = getDatabase(getApp());
    const secretRef = db.ref(`roomSecrets/${code}`);
    const secretSnap = await secretRef.once('value');
    const secret = secretSnap.val();

    if (!secret || !secret.poPin) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    const matches = secret.poPin === pin;
    const now = Date.now();

    const attemptsResult = await secretRef.child('pinAttempts').transaction((current) => {
      if (current && current.lockUntil && now < current.lockUntil) {
        return current; // still locked, leave untouched
      }
      if (matches) {
        return { count: 0, lockUntil: 0 };
      }
      const count = (current && current.count ? current.count : 0) + 1;
      return { count, lockUntil: count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0 };
    });

    const finalAttempts = attemptsResult.snapshot.val() || { count: 0, lockUntil: 0 };

    if (finalAttempts.lockUntil && now < finalAttempts.lockUntil) {
      res.status(429).json({
        ok: false,
        error: 'locked',
        lockedForSeconds: Math.ceil((finalAttempts.lockUntil - now) / 1000)
      });
      return;
    }

    if (matches) {
      res.status(200).json({ ok: true, poPin: secret.poPin });
      return;
    }

    res.status(200).json({
      ok: false,
      error: 'incorrect_pin',
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - finalAttempts.count)
    });
  } catch (err) {
    console.error('verify-po-pin error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
}
