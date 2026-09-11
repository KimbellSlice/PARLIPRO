import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, PO_LEASE_MS, requireUser, runServerTransaction, sendError } from '../server/firebase-admin.js';
import { createApiContext, sendApiResponse } from '../server/api-observability.js';

export function getLeaseRenewalRejection(access, controllerLeaseId, uid, now) {
  if (!access) return 'missing_lease';
  if (access.controllerExpiresAt <= now) return 'expired';
  if (access.controllerLeaseId !== controllerLeaseId && access.controllerUid !== uid) return 'credentials_mismatch';
  return null;
}

export default async function handler(req, res) {
  const context = createApiContext(req, res, 'renew_po_lease');
  if (req.method !== 'POST') return sendApiResponse(res, context, 405, { ok: false, error: 'method_not_allowed' }, 'method_not_allowed');
  try {
    const user = await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    const controllerLeaseId = leaseIdForToken(req.body?.leaseToken);
    if (!code || !controllerLeaseId) return sendApiResponse(res, context, 400, { ok: false, error: 'invalid_input' }, 'invalid_input');
    const now = Date.now();
    const expiresAt = now + PO_LEASE_MS;
    const roomRef = getAdminDatabase().ref(`rooms/${code}`);
    const accessRef = roomRef.child('access');
    let rejectionReason = 'missing_lease';
    const result = await runServerTransaction(accessRef, (current) => {
      rejectionReason = getLeaseRenewalRejection(current, controllerLeaseId, user.uid, now);
      if (rejectionReason) return;
      return { ...current, controllerUid: user.uid, controllerExpiresAt: expiresAt };
    });
    if (!result.committed) return sendApiResponse(res, context, 403, { ok: false, error: 'po_lease_lost', reason: rejectionReason }, 'po_lease_lost', { reason: rejectionReason });
    await roomRef.update({ poHeartbeat: { uid: user.uid, ts: now }, updatedAt: now });
    return sendApiResponse(res, context, 200, { ok: true, expiresAt }, 'success');
  } catch (error) {
    return sendError(res, error, context);
  }
}
