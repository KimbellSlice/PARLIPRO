import { getAdminDatabase, leaseIdForToken, normalizeRoomCode, requireUser, sendError } from '../server/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const user = await requireUser(req);
    const code = normalizeRoomCode(req.body?.roomCode);
    if (!code) return res.status(400).json({ ok: false, error: 'invalid_input' });
    const db = getAdminDatabase();
    const now = Date.now();
    const controllerLeaseId = leaseIdForToken(req.body?.leaseToken);
    const accessRef = db.ref(`rooms/${code}/access`);
    if (!(await accessRef.once('value')).exists()) {
      return res.status(403).json({ ok: false, error: 'not_authorized' });
    }
    const lock = await accessRef.transaction((access) => {
      const authorized = access?.ownerUid === user.uid || (controllerLeaseId && access?.controllerLeaseId === controllerLeaseId && access?.controllerExpiresAt > now);
      if (!authorized) return;
      return { ...access, controllerUid: user.uid, controllerExpiresAt: now + 10000, closing: true };
    });
    if (!lock.committed) return res.status(403).json({ ok: false, error: 'not_authorized' });
    await db.ref().update({ [`rooms/${code}`]: null, [`roomSecrets/${code}`]: null });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return sendError(res, error);
  }
}
