import { randomUUID } from 'node:crypto';
import { getAdminDatabase, hashPin, normalizeRoomCode, requireUser, sendError } from '../server/firebase-admin.js';

const MAX_ROOM_BYTES = 250000;

function validateInitialState(state, code) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (state.roomCode !== code || !Array.isArray(state.students) || !Array.isArray(state.legislationPack)) return false;
  if (state.students.length < 2 || state.students.length > 100 || state.legislationPack.length < 1 || state.legislationPack.length > 100) return false;
  return Buffer.byteLength(JSON.stringify(state), 'utf8') <= MAX_ROOM_BYTES;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const user = await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    const pin = req.body?.pin;
    const state = req.body?.state;
    if (!code || typeof pin !== 'string' || !/^\d{6}$/.test(pin) || !validateInitialState(state, code)) {
      return res.status(400).json({ ok: false, error: 'invalid_input' });
    }

    const db = getAdminDatabase();
    const secretRef = db.ref(`roomSecrets/${code}`);
    const reservationId = randomUUID();
    const reservation = await secretRef.transaction((current) => current === null ? {
      reservationId,
      ownerUid: user.uid,
      reservedAt: Date.now(),
    } : undefined);
    if (!reservation.committed) return res.status(409).json({ ok: false, error: 'room_code_taken' });

    const roomRef = db.ref(`rooms/${code}`);
    if ((await roomRef.once('value')).exists()) {
      await secretRef.transaction((current) => current?.reservationId === reservationId ? null : undefined);
      return res.status(409).json({ ok: false, error: 'room_code_taken' });
    }

    const { salt, hash } = hashPin(pin);
    const now = Date.now();
    try {
      await db.ref().update({
        [`rooms/${code}`]: {
          ...state,
          access: { ownerUid: user.uid, controllerUid: null, controllerExpiresAt: 0 },
          createdAt: now,
          updatedAt: now,
        },
        [`roomSecrets/${code}`]: {
          ownerUid: user.uid,
          pinSalt: salt,
          pinHash: hash,
          createdAt: now,
        },
      });
    } catch (error) {
      await secretRef.transaction((current) => current?.reservationId === reservationId ? null : undefined);
      throw error;
    }
    return res.status(201).json({ ok: true, roomCode: code });
  } catch (error) {
    return sendError(res, error);
  }
}
