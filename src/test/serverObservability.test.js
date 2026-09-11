// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import claimPo from '../../api/claim-po.js';
import cleanupRooms from '../../api/cleanup-rooms.js';
import closeRoom from '../../api/close-room.js';
import createRoom from '../../api/create-room.js';
import releasePo from '../../api/release-po.js';
import renewPoLease from '../../api/renew-po-lease.js';
import { createApiContext, sendApiResponse } from '../../server/api-observability.js';
import { sendError } from '../../server/firebase-admin.js';

function response() {
  return {
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
}

describe('API observability', () => {
  let info;
  let warn;
  let error;

  beforeEach(() => {
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a structured completion record and returns its request ID', () => {
    const res = response();
    const context = createApiContext({ method: 'POST' }, res, 'create_room');

    sendApiResponse(res, context, 201, { ok: true, roomCode: 'ABCDE' }, 'success');

    expect(info).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const record = JSON.parse(info.mock.calls[0][0]);
    expect(record).toEqual({
      timestamp: expect.any(String),
      event: 'api_request',
      operation: 'create_room',
      requestId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      method: 'POST',
      statusCode: 201,
      outcome: 'success',
      durationMs: expect.any(Number),
    });
    expect(res.headers['x-request-id']).toBe(record.requestId);
  });

  it.each([
    ['claim_po', claimPo, 'GET'],
    ['cleanup_rooms', cleanupRooms, 'POST'],
    ['close_room', closeRoom, 'GET'],
    ['create_room', createRoom, 'GET'],
    ['release_po', releasePo, 'GET'],
    ['renew_po_lease', renewPoLease, 'GET'],
  ])('instruments the %s endpoint before request validation', async (operation, handler, method) => {
    const res = response();

    await handler({ method, headers: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      operation,
      requestId: res.headers['x-request-id'],
      statusCode: 405,
      outcome: 'method_not_allowed',
    });
  });

  it('never logs request headers, bodies, response bodies, or unsafe metadata', () => {
    const secrets = {
      authorization: 'Bearer secret-auth-token',
      pin: '918273',
      leaseToken: 'private-lease-token',
      firebaseKey: 'private-firebase-credential',
      studentName: 'Private Student Name',
    };
    const req = {
      method: 'POST',
      headers: { authorization: secrets.authorization },
      body: secrets,
    };
    const res = response();
    const context = createApiContext(req, res, 'renew_po_lease');

    sendApiResponse(
      res,
      context,
      403,
      { ok: false, leaseToken: secrets.leaseToken, studentName: secrets.studentName },
      secrets.pin,
      { reason: secrets.authorization, pathsDeleted: 2, firebaseKey: secrets.firebaseKey },
    );

    expect(warn).toHaveBeenCalledOnce();
    const logged = warn.mock.calls[0][0];
    for (const secret of Object.values(secrets)) expect(logged).not.toContain(secret);
    expect(JSON.parse(logged)).toMatchObject({
      operation: 'renew_po_lease',
      statusCode: 403,
      outcome: 'unknown',
      pathsDeleted: 2,
    });
  });

  it('logs server failures without serializing raw exceptions', () => {
    const res = response();
    const context = createApiContext({ method: 'POST' }, res, 'claim_po');
    const failure = new Error('private-pin-123456 private-key-value');
    failure.stack = 'private stack containing Bearer secret-auth-token';

    sendError(res, failure, context);

    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).not.toContain('private-pin-123456');
    expect(error.mock.calls[0][0]).not.toContain('private-key-value');
    expect(error.mock.calls[0][0]).not.toContain('secret-auth-token');
    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
      operation: 'claim_po',
      statusCode: 500,
      outcome: 'server_error',
      errorCategory: 'error',
    });
    expect(res.body).toEqual({ ok: false, error: 'server_error' });
  });
});
