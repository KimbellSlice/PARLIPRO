import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, requireUser, runServerTransaction, sendError } from '../server/firebase-admin.js';
import { createApiContext, sendApiResponse } from '../server/api-observability.js';

export default async function handler(req, res) {
  const context = createApiContext(req, res, 'close_room');
  if (req.method !== 'POST') return sendApiResponse(res, context, 405, { ok: false, error: 'method_not_allowed' }, 'method_not_allowed');
  try {
    const user = await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    if (!code) return sendApiResponse(res, context, 400, { ok: false, error: 'invalid_input' }, 'invalid_input');
    const db = getAdminDatabase();
    const now = Date.now();
    const controllerLeaseId = leaseIdForToken(req.body?.leaseToken);
    const accessRef = db.ref(`rooms/${code}/access`);
    const lock = await runServerTransaction(accessRef, (access) => {
      const authorized = access?.ownerUid === user.uid || (controllerLeaseId && access?.controllerLeaseId === controllerLeaseId && access?.controllerExpiresAt > now);
      if (!authorized) return;
      return { ...access, controllerUid: user.uid, controllerExpiresAt: now + 10000, closing: true };
    });
    if (!lock.committed) return sendApiResponse(res, context, 403, { ok: false, error: 'not_authorized' }, 'not_authorized');
    await db.ref().update({ [`rooms/${code}`]: null, [`roomSecrets/${code}`]: null });
    return sendApiResponse(res, context, 200, { ok: true }, 'success');
  } catch (error) {
    return sendError(res, error, context);
  }
}
