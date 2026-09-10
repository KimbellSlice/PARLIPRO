// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createLeaseToken, hashPin, leaseIdForToken, normalizeRoomCode, pinMatches } from '../../server/firebase-admin.js';

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
});
