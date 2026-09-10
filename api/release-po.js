import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, requireUser, sendError } from '../server/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    const controllerLeaseId = leaseIdForToken(req.body?.leaseToken);
    if (!code || !controllerLeaseId) return res.status(400).json({ ok: false, error: 'invalid_input' });
    const db = getAdminDatabase();
    const accessRef = db.ref(`rooms/${code}/access`);
    if (!(await accessRef.once('value')).exists()) {
      return res.status(403).json({ ok: false, error: 'not_controller' });
    }
    const result = await accessRef.transaction((current) => {
      if (!current || current.controllerLeaseId !== controllerLeaseId) return;
      return { ...current, controllerUid: null, controllerExpiresAt: 0, controllerLeaseId: null };
    });
    if (!result.committed) return res.status(403).json({ ok: false, error: 'not_controller' });
    await db.ref(`rooms/${code}`).update({ poHeartbeat: null, poStudentId: null, updatedAt: Date.now() });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return sendError(res, error);
  }
}
