import { getAdminDatabase, sendError } from '../server/firebase-admin.js';
import { createApiContext, sendApiResponse } from '../server/api-observability.js';

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

export default async function handler(req, res) {
  const context = createApiContext(req, res, 'cleanup_rooms');
  if (req.method !== 'GET') return sendApiResponse(res, context, 405, { ok: false, error: 'method_not_allowed' }, 'method_not_allowed');
  try {
    const expected = process.env.CRON_SECRET;
    if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
      return sendApiResponse(res, context, 401, { ok: false, error: 'authentication_required' }, 'authentication_required');
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
    const pathsDeleted = Object.keys(updates).length;
    return sendApiResponse(res, context, 200, { ok: true, pathsDeleted }, 'success', { pathsDeleted });
  } catch (error) {
    return sendError(res, error, context);
  }
}
