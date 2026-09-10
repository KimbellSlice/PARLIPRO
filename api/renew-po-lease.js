import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, PO_LEASE_MS, requireUser, sendError } from '../server/firebase-admin.js';

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
    const result = await roomRef.child('access').transaction((current) => {
      if (!current || current.controllerLeaseId !== controllerLeaseId || current.controllerExpiresAt <= now) return;
      return { ...current, controllerUid: user.uid, controllerExpiresAt: expiresAt };
    });
    if (!result.committed) return res.status(403).json({ ok: false, error: 'po_lease_lost' });
    await roomRef.update({ poHeartbeat: { uid: user.uid, ts: now }, updatedAt: now });
    return res.status(200).json({ ok: true, expiresAt });
  } catch (error) {
    return sendError(res, error);
  }
}
