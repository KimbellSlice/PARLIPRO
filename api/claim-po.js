import { createHash } from 'node:crypto';
import { getAdminDatabase, hashPin, normalizeRoomCode, pinMatches, PO_LEASE_MS, requireUser, sendError } from '../server/firebase-admin.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
const MAX_IP_ATTEMPTS = 20;
const IP_LOCKOUT_MS = 60000;

function incrementFailures(reference, now, maxAttempts, lockoutMs) {
  return reference.transaction((current) => {
    const count = current?.lockUntil && current.lockUntil <= now ? 1 : (current?.count || 0) + 1;
    return { count, lockUntil: count >= maxAttempts ? now + lockoutMs : 0, updatedAt: now };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const user = await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    const pin = req.body?.pin;
    if (!code || typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ ok: false, error: 'invalid_input' });
    }

    const db = getAdminDatabase();
    const roomRef = db.ref(`rooms/${code}`);
    const room = (await roomRef.once('value')).val();
    if (!room) return res.status(404).json({ ok: false, error: 'not_found' });
    const requestedStudentId = req.body?.studentId ?? null;
    const students = Array.isArray(room.students) ? room.students : Object.values(room.students || {});
    if (requestedStudentId !== null && !students.some((student) => String(student?.id) === String(requestedStudentId))) {
      return res.status(400).json({ ok: false, error: 'invalid_student' });
    }
    const secretRef = db.ref(`roomSecrets/${code}`);
    const secret = (await secretRef.once('value')).val();
    if (!secret) return res.status(404).json({ ok: false, error: 'not_found' });

    const attemptKey = createHash('sha256').update(user.uid).digest('hex');
    const attemptRef = secretRef.child(`pinAttempts/${attemptKey}`);
    const forwardedFor = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const ipKey = createHash('sha256').update(forwardedFor).digest('hex');
    const ipAttemptRef = secretRef.child(`ipAttempts/${ipKey}`);
    const now = Date.now();
    const [currentAttempt, currentIpAttempt] = await Promise.all([
      attemptRef.once('value').then((snapshot) => snapshot.val()),
      ipAttemptRef.once('value').then((snapshot) => snapshot.val()),
    ]);
    const lockUntil = Math.max(currentAttempt?.lockUntil || 0, currentIpAttempt?.lockUntil || 0);
    if (lockUntil > now) {
      return res.status(429).json({ ok: false, error: 'locked', lockedForSeconds: Math.ceil((lockUntil - now) / 1000) });
    }

    if (!pinMatches(secret, pin)) {
      const [attemptResult, ipAttemptResult] = await Promise.all([
        incrementFailures(attemptRef, now, MAX_ATTEMPTS, LOCKOUT_MS),
        incrementFailures(ipAttemptRef, now, MAX_IP_ATTEMPTS, IP_LOCKOUT_MS),
      ]);
      const attempts = attemptResult.snapshot.val();
      const ipAttempts = ipAttemptResult.snapshot.val();
      const newLockUntil = Math.max(attempts.lockUntil || 0, ipAttempts.lockUntil || 0);
      if (newLockUntil > now) {
        return res.status(429).json({ ok: false, error: 'locked', lockedForSeconds: Math.ceil((newLockUntil - now) / 1000) });
      }
      return res.status(200).json({ ok: false, error: 'incorrect_pin', attemptsLeft: MAX_ATTEMPTS - attempts.count });
    }

    const accessRef = roomRef.child('access');
    const expiresAt = now + PO_LEASE_MS;
    const lease = await accessRef.transaction((current) => {
      if (!current) return { ownerUid: secret.ownerUid || user.uid, controllerUid: user.uid, controllerExpiresAt: expiresAt };
      if (current.controllerUid && current.controllerUid !== user.uid && current.controllerExpiresAt > now) return;
      return { ...current, controllerUid: user.uid, controllerExpiresAt: expiresAt };
    });
    if (!lease.committed) return res.status(409).json({ ok: false, error: 'po_already_active' });
    const roomUpdates = {
      poStudentId: requestedStudentId,
      poHeartbeat: { uid: user.uid, ts: now },
      updatedAt: now,
    };
    if (requestedStudentId !== null) {
      const safeStudentId = String(requestedStudentId).replace(/[.#$]/g, '_').replaceAll('[', '_').replaceAll(']', '_').replaceAll('/', '_');
      roomUpdates[`competitorClaims/${safeStudentId}`] = null;
    }
    await roomRef.update(roomUpdates);
    if (!secret.pinHash && secret.poPin) {
      const migrated = hashPin(pin);
      await secretRef.update({ pinSalt: migrated.salt, pinHash: migrated.hash, poPin: null, ownerUid: secret.ownerUid || user.uid });
    }
    await attemptRef.remove();
    return res.status(200).json({ ok: true, expiresAt, poStudentId: requestedStudentId });
  } catch (error) {
    return sendError(res, error);
  }
}
