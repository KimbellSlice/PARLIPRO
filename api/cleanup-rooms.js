import { getAdminDatabase, sendError } from '../server/firebase-admin.js';

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      return res.status(401).json({ ok: false, error: 'authentication_required' });
    }
    const db = getAdminDatabase();
    const cutoff = Date.now() - ROOM_TTL_MS;
    const snapshot = await db.ref('rooms').orderByChild('updatedAt').endAt(cutoff).once('value');
    const updates = {};
    snapshot.forEach((room) => {
      updates[`rooms/${room.key}`] = null;
      updates[`roomSecrets/${room.key}`] = null;
    });
    const abandonedReservations = await db.ref('roomSecrets').orderByChild('reservedAt').endAt(Date.now() - 10 * 60 * 1000).once('value');
    abandonedReservations.forEach((secret) => {
      if (secret.child('reservationId').exists()) updates[`roomSecrets/${secret.key}`] = null;
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
    return res.status(200).json({ ok: true, pathsDeleted: Object.keys(updates).length });
  } catch (error) {
    return sendError(res, error);
  }
}
