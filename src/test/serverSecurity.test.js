// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { getLeaseRenewalRejection } from '../../api/renew-po-lease.js';
import { createLeaseToken, hashPin, leaseIdForToken, normalizeRoomCode, pinMatches, runServerTransaction } from '../../server/firebase-admin.js';

describe('server security helpers', () => {
  it('normalizes valid room codes and rejects paths', () => {
    expect(normalizeRoomCode('abc12')).toBe('ABC12');
    expect(normalizeRoomCode('../x1')).toBeNull();
    expect(normalizeRoomCode('ROOM/1')).toBeNull();
  });

  it('stores and verifies a salted PIN hash', () => {
    const stored = hashPin('123456');
    const secret = { pinSalt: stored.salt, pinHash: stored.hash };
    expect(pinMatches(secret, '123456')).toBe(true);
    expect(pinMatches(secret, '654321')).toBe(false);
    expect(secret.pinHash).not.toContain('123456');
  });

  it('temporarily verifies legacy plaintext PIN records', () => {
    expect(pinMatches({ poPin: '1234' }, '1234')).toBe(true);
    expect(pinMatches({ poPin: '1234' }, '9999')).toBe(false);
  });

  it('creates opaque lease tokens with stable, non-reversible identifiers', () => {
    const token = createLeaseToken();
    const leaseId = leaseIdForToken(token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(leaseId).toMatch(/^[a-f0-9]{64}$/);
    expect(leaseId).not.toContain(token);
    expect(leaseIdForToken(token)).toBe(leaseId);
    expect(leaseIdForToken('not-a-valid-token')).toBeNull();
  });

  it('renews when either the lease token or authenticated browser still matches', () => {
    const now = 1_000;
    const access = { controllerLeaseId: 'stored-token-id', controllerUid: 'original-uid', controllerExpiresAt: 2_000 };

    expect(getLeaseRenewalRejection(access, 'stored-token-id', 'new-uid', now)).toBeNull();
    expect(getLeaseRenewalRejection(access, 'stale-token-id', 'original-uid', now)).toBeNull();
    expect(getLeaseRenewalRejection(access, 'stale-token-id', 'different-uid', now)).toBe('credentials_mismatch');
    expect(getLeaseRenewalRejection({ ...access, controllerExpiresAt: now }, 'stored-token-id', 'original-uid', now)).toBe('expired');
    expect(getLeaseRenewalRejection(null, 'stored-token-id', 'original-uid', now)).toBe('missing_lease');
  });

  it('waits for a server value before starting an abortable transaction', async () => {
    let valueListener;
    const reference = {
      on: vi.fn((_event, callback) => { valueListener = callback; }),
      off: vi.fn(),
      transaction: vi.fn(async (updater) => ({ committed: updater({ controllerUid: 'uid' }) !== undefined })),
    };

    const pending = runServerTransaction(reference, (current) => current);
    expect(reference.transaction).not.toHaveBeenCalled();
    valueListener();
    await expect(pending).resolves.toEqual({ committed: true });
    expect(reference.transaction).toHaveBeenCalledOnce();
    expect(reference.off).toHaveBeenCalledWith('value', valueListener);
  });
});
