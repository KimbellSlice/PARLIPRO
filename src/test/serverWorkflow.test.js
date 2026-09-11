// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({ database: null }));

vi.mock('../../server/firebase-admin.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAdminDatabase: () => testState.database,
    requireUser: async (req) => {
      const match = String(req.headers.authorization || '').match(/^Bearer user:(.+)$/);
      if (!match) {
        const error = new Error('invalid_authentication');
        error.status = 401;
        throw error;
      }
      return { uid: match[1] };
    },
  };
});

import claimPo from '../../api/claim-po.js';
import closeRoom from '../../api/close-room.js';
import createRoom from '../../api/create-room.js';
import releasePo from '../../api/release-po.js';
import renewPoLease from '../../api/renew-po-lease.js';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function splitPath(path = '') {
  return String(path).split('/').filter(Boolean);
}

function getAtPath(root, path) {
  return splitPath(path).reduce((value, key) => value?.[key], root);
}

function setAtPath(root, path, value) {
  const parts = splitPath(path);
  if (!parts.length) throw new Error('Root replacement is not supported by this test double');
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    if (!parent[part] || typeof parent[part] !== 'object') parent[part] = {};
    parent = parent[part];
  }
  const key = parts.at(-1);
  if (value === null) delete parent[key];
  else parent[key] = clone(value);
}

class MemorySnapshot {
  constructor(value, key = null) {
    this.value = clone(value ?? null);
    this.key = key;
  }

  val() {
    return clone(this.value);
  }

  exists() {
    return this.value !== null;
  }

  child(path) {
    return new MemorySnapshot(getAtPath(this.value, path), splitPath(path).at(-1) || null);
  }
}

class MemoryReference {
  constructor(database, path = '') {
    this.database = database;
    this.path = splitPath(path).join('/');
  }

  child(path) {
    return new MemoryReference(this.database, [this.path, path].filter(Boolean).join('/'));
  }

  async once(event) {
    expect(event).toBe('value');
    this.database.warm(this.path);
    return this.snapshot();
  }

  on(event, callback) {
    expect(event).toBe('value');
    queueMicrotask(() => {
      this.database.warm(this.path);
      callback(this.snapshot());
    });
  }

  off() {}

  async transaction(updater) {
    const current = this.database.isWarm(this.path)
      ? clone(getAtPath(this.database.data, this.path) ?? null)
      : null;
    if (!this.database.isWarm(this.path)) this.database.coldTransactions += 1;
    const next = updater(current);
    if (next === undefined) return { committed: false, snapshot: this.snapshot() };
    setAtPath(this.database.data, this.path, next);
    this.database.warm(this.path);
    return { committed: true, snapshot: this.snapshot() };
  }

  async update(updates) {
    for (const [path, value] of Object.entries(updates)) {
      setAtPath(this.database.data, [this.path, path].filter(Boolean).join('/'), value);
    }
  }

  async remove() {
    setAtPath(this.database.data, this.path, null);
  }

  snapshot() {
    return new MemorySnapshot(getAtPath(this.database.data, this.path), splitPath(this.path).at(-1) || null);
  }
}

class MemoryDatabase {
  constructor() {
    this.data = {};
    this.warmedPaths = new Set();
    this.coldTransactions = 0;
  }

  ref(path = '') {
    return new MemoryReference(this, path);
  }

  warm(path) {
    this.warmedPaths.add(splitPath(path).join('/'));
  }

  isWarm(path) {
    const normalized = splitPath(path).join('/');
    return [...this.warmedPaths].some((warmPath) =>
      warmPath === '' || normalized === warmPath || normalized.startsWith(`${warmPath}/`));
  }

  resetCache() {
    this.warmedPaths.clear();
  }
}

function request(body, uid = 'owner', method = 'POST') {
  return {
    method,
    body,
    headers: { authorization: `Bearer user:${uid}`, 'x-forwarded-for': '192.0.2.1' },
    socket: {},
  };
}

async function invoke(handler, body, uid = 'owner', method = 'POST') {
  const response = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  await handler(request(body, uid, method), response);
  return response;
}

function initialRoomState(roomCode = 'ABCDE') {
  return {
    roomCode,
    students: [{ id: 'student-1', name: 'Ada' }, { id: 'student-2', name: 'Grace' }],
    legislationPack: [{ id: 'bill-1', title: 'A Bill' }],
  };
}

describe('server endpoint workflow', () => {
  let logSpies;

  beforeEach(() => {
    testState.database = new MemoryDatabase();
    logSpies = ['info', 'warn', 'error'].map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates, claims, repeatedly renews, releases, reclaims, expires, and closes a chamber', async () => {
    const created = await invoke(createRoom, {
      roomCode: 'abcde',
      pin: '123456',
      state: initialRoomState(),
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).toEqual({ ok: true, roomCode: 'ABCDE' });
    expect(created.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);

    const claimed = await invoke(claimPo, { roomCode: 'ABCDE', pin: '123456', studentId: 'student-1' }, 'po-one');
    expect(claimed.statusCode).toBe(200);
    expect(claimed.body.leaseToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const firstLeaseToken = claimed.body.leaseToken;

    for (let renewal = 0; renewal < 3; renewal += 1) {
      testState.database.resetCache();
      const renewed = await invoke(renewPoLease, { roomCode: 'ABCDE', leaseToken: firstLeaseToken }, 'po-one');
      expect(renewed.statusCode).toBe(200);
      expect(renewed.body).toMatchObject({ ok: true });
    }

    testState.database.resetCache();
    const unrelated = await invoke(renewPoLease, { roomCode: 'ABCDE', leaseToken: 'A'.repeat(43) }, 'unrelated');
    expect(unrelated.statusCode).toBe(403);
    expect(unrelated.body).toEqual({ ok: false, error: 'po_lease_lost', reason: 'credentials_mismatch' });

    testState.database.resetCache();
    const released = await invoke(releasePo, { roomCode: 'ABCDE', leaseToken: firstLeaseToken }, 'po-one');
    expect(released.statusCode).toBe(200);

    const claimedAfterRelease = await invoke(claimPo, { roomCode: 'ABCDE', pin: '123456', studentId: 'student-2' }, 'po-two');
    expect(claimedAfterRelease.statusCode).toBe(200);
    expect(claimedAfterRelease.body.leaseToken).not.toBe(firstLeaseToken);

    const access = testState.database.data.rooms.ABCDE.access;
    access.controllerExpiresAt = Date.now() - 1;
    const claimedAfterExpiry = await invoke(claimPo, { roomCode: 'ABCDE', pin: '123456' }, 'po-three');
    expect(claimedAfterExpiry.statusCode).toBe(200);

    testState.database.resetCache();
    const closed = await invoke(closeRoom, {
      roomCode: 'ABCDE',
      leaseToken: claimedAfterExpiry.body.leaseToken,
    }, 'po-three');
    expect(closed.statusCode).toBe(200);
    expect(testState.database.data.rooms?.ABCDE).toBeUndefined();
    expect(testState.database.data.roomSecrets?.ABCDE).toBeUndefined();

    const logged = logSpies.flatMap((spy) => spy.mock.calls.flat()).join(' ');
    for (const secret of ['123456', firstLeaseToken, 'Ada', 'Grace', 'student-1', 'student-2', 'user:po-one']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('waits for server state before lease transactions on a cold serverless instance', async () => {
    await invoke(createRoom, { roomCode: 'CACHE', pin: '123456', state: initialRoomState('CACHE') });
    const claimed = await invoke(claimPo, { roomCode: 'CACHE', pin: '123456' }, 'po');

    testState.database.resetCache();
    const coldTransactionsBeforeControl = testState.database.coldTransactions;
    const rawTransaction = await testState.database.ref('rooms/CACHE/access').transaction((current) =>
      current ? { ...current, rawTransactionRan: true } : undefined);
    expect(rawTransaction.committed).toBe(false);
    expect(testState.database.coldTransactions).toBe(coldTransactionsBeforeControl + 1);

    testState.database.resetCache();
    const renewed = await invoke(renewPoLease, {
      roomCode: 'CACHE',
      leaseToken: claimed.body.leaseToken,
    }, 'po');
    expect(renewed.statusCode).toBe(200);
    expect(testState.database.coldTransactions).toBe(coldTransactionsBeforeControl + 1);
  });

  it('rejects malformed endpoint input', async () => {
    const cases = [
      [createRoom, { roomCode: '../x1', pin: '123456', state: initialRoomState() }],
      [claimPo, { roomCode: 'ABCDE', pin: '12ab' }],
      [renewPoLease, { roomCode: 'ABCDE', leaseToken: 'short' }],
      [releasePo, { roomCode: 'ABCDE', leaseToken: 'short' }],
      [closeRoom, { roomCode: 'ROOM/1' }],
    ];

    for (const [handler, body] of cases) {
      const response = await invoke(handler, body);
      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({ ok: false, error: 'invalid_input' });
    }
  });

  it('rejects missing and expired leases', async () => {
    const missing = await invoke(renewPoLease, {
      roomCode: 'EMPTY',
      leaseToken: 'A'.repeat(43),
    }, 'po');
    expect(missing.statusCode).toBe(403);
    expect(missing.body).toEqual({ ok: false, error: 'po_lease_lost', reason: 'missing_lease' });

    await invoke(createRoom, { roomCode: 'OLDIE', pin: '123456', state: initialRoomState('OLDIE') });
    const claimed = await invoke(claimPo, { roomCode: 'OLDIE', pin: '123456' }, 'po');
    testState.database.data.rooms.OLDIE.access.controllerExpiresAt = Date.now() - 1;
    testState.database.resetCache();

    const expired = await invoke(renewPoLease, {
      roomCode: 'OLDIE',
      leaseToken: claimed.body.leaseToken,
    }, 'po');
    expect(expired.statusCode).toBe(403);
    expect(expired.body).toEqual({ ok: false, error: 'po_lease_lost', reason: 'expired' });
  });
});
