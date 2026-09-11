import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, requireUser, runServerTransaction, sendError } from '../server/firebase-admin.js';
import { createApiContext, sendApiResponse } from '../server/api-observability.js';

export default async function handler(req, res) {
  const context = createApiContext(req, res, 'release_po');
  if (req.method !== 'POST') return sendApiResponse(res, context, 405, { ok: false, error: 'method_not_allowed' }, 'method_not_allowed');
  try {
    await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    const controllerLeaseId = leaseIdForToken(req.body?.leaseToken);
    if (!code || !controllerLeaseId) return sendApiResponse(res, context, 400, { ok: false, error: 'invalid_input' }, 'invalid_input');
    const db = getAdminDatabase();
    const accessRef = db.ref(`rooms/${code}/access`);
    const result = await runServerTransaction(accessRef, (current) => {
      if (!current || current.controllerLeaseId !== controllerLeaseId) return;
      return { ...current, controllerUid: null, controllerExpiresAt: 0, controllerLeaseId: null };
    });
    if (!result.committed) return sendApiResponse(res, context, 403, { ok: false, error: 'not_controller' }, 'not_controller');
    await db.ref(`rooms/${code}`).update({ poHeartbeat: null, poStudentId: null, updatedAt: Date.now() });
    return sendApiResponse(res, context, 200, { ok: true }, 'success');
  } catch (error) {
    return sendError(res, error, context);
  }
}
