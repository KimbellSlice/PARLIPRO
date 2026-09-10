import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, PO_LEASE_MS, requireUser, sendError } from '../server/firebase-admin.js';

export function getLeaseRenewalRejection(access, controllerLeaseId, uid, now) {
  if (!access) return 'missing_lease';
  if (access.controllerExpiresAt <= now) return 'expired';
  if (access.controllerLeaseId !== controllerLeaseId && access.controllerUid !== uid) return 'credentials_mismatch';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const user = await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    const controllerLeaseId = leaseIdForToken(req.body?.leaseToken);
    if (!code || !controllerLeaseId) return res.status(400).json({ ok: false, error: 'invalid_input' });
    const now = Date.now();
    const expiresAt = now + PO_LEASE_MS;
    const roomRef = getAdminDatabase().ref(`rooms/${code}`);
    const accessRef = roomRef.child('access');
    // Prime this short-lived Admin SDK instance with the server value. Without
    // this read, a transaction can invoke its updater with an empty local cache;
    // returning undefined for that provisional null aborts before the lease is
    // fetched from the server.
    const accessSnapshot = await accessRef.once('value');
    if (!accessSnapshot.exists()) {
      return res.status(403).json({ ok: false, error: 'po_lease_lost', reason: 'missing_lease' });
    }
    let rejectionReason = 'missing_lease';
    const result = await accessRef.transaction((current) => {
      rejectionReason = getLeaseRenewalRejection(current, controllerLeaseId, user.uid, now);
      if (rejectionReason) return;
      return { ...current, controllerUid: user.uid, controllerExpiresAt: expiresAt };
    });
    if (!result.committed) return res.status(403).json({ ok: false, error: 'po_lease_lost', reason: rejectionReason });
    await roomRef.update({ poHeartbeat: { uid: user.uid, ts: now }, updatedAt: now });
    return res.status(200).json({ ok: true, expiresAt });
  } catch (error) {
    return sendError(res, error);
  }
}
