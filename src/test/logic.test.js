import { describe, it, expect, vi } from 'vitest';

// App.jsx imports firebase.js at module scope, which calls initializeApp()
// and signInAnonymously() against the real project. Mock it so importing
// pure logic out of App.jsx doesn't make real network/auth calls.
vi.mock('../firebase.js', () => ({
  fbSafe: (id) => String(id).replace(/[.#$]/g, '_').replaceAll('[', '_').replaceAll(']', '_').replaceAll('/', '_'),
  STALE_MS: 45000,
  writeRoomState: vi.fn(),
  createRoom: vi.fn(),
  claimPOLease: vi.fn(),
  renewPOLease: vi.fn(() => Promise.resolve()),
  releasePOLease: vi.fn(() => Promise.resolve()),
  setRoomSecret: vi.fn(),
  subscribeToRoom: vi.fn(),
  checkRoomExists: vi.fn(),
  deleteRoom: vi.fn(),
  updateRoomElapsed: vi.fn(),
  getRoomOnce: vi.fn(),
  updateHeartbeat: vi.fn(),
  clearPOHeartbeat: vi.fn(),
  cleanupStaleRooms: vi.fn(),
  updateCompetitorIntent: vi.fn(),
  updateCompetitorSplit: vi.fn(),
  claimCompetitorName: vi.fn(),
  releaseCompetitorName: vi.fn(),
  claimSpectatorPresence: vi.fn(),
  releaseSpectatorPresence: vi.fn(),
  claimCompetitorNameAtomic: vi.fn(),
  getAuthUidSync: vi.fn(() => 'test-uid'),
  submitDocketProposal: vi.fn(),
  withdrawDocketProposal: vi.fn(),
  adoptDocket: vi.fn(),
}));

const { sortPrec, computeRecommendedDocket, sanitizeInput, containsProfanity, getActivePoStudentId } = await import('../App.jsx');
const { fbSafe } = await import('../firebase.js');

function student(overrides) {
  return { id: 1, name: 'Student', speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: 0, questionOrder: 0, ...overrides };
}

describe('getActivePoStudentId', () => {
  it('returns the selected PO only while a controller lease is active', () => {
    const state = { poStudentId: 'student-1', access: { controllerUid: 'uid-1', controllerExpiresAt: 2000 } };
    expect(getActivePoStudentId(state, 1000)).toBe('student-1');
    expect(getActivePoStudentId(state, 2000)).toBeNull();
  });

  it('does not strand a PO name when no controller owns the room', () => {
    expect(getActivePoStudentId({ poStudentId: 'student-1', access: { controllerUid: null, controllerExpiresAt: 0 } }, 1000)).toBeNull();
  });
});

describe('sortPrec', () => {
  it('orders speech precedence by fewest speeches first', () => {
    const a = student({ id: 'a', speeches: 2, initialOrder: 0 });
    const b = student({ id: 'b', speeches: 0, initialOrder: 1 });
    const c = student({ id: 'c', speeches: 1, initialOrder: 2 });
    const result = sortPrec([a, b, c], 'speech', 'reverse');
    expect(result.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks speech ties by who spoke longest ago (lowest last speechHistory entry)', () => {
    const a = student({ id: 'a', speeches: 1, speechHistory: [5], initialOrder: 0 });
    const b = student({ id: 'b', speeches: 1, speechHistory: [2], initialOrder: 1 });
    const result = sortPrec([a, b], 'speech', 'reverse');
    expect(result.map(s => s.id)).toEqual(['b', 'a']);
  });

  it('question precedence "reverse" mode breaks ties by reverse initial order', () => {
    const a = student({ id: 'a', questions: 0, initialOrder: 0 });
    const b = student({ id: 'b', questions: 0, initialOrder: 1 });
    const result = sortPrec([a, b], 'question', 'reverse');
    expect(result.map(s => s.id)).toEqual(['b', 'a']);
  });

  it('question precedence "match" mode breaks ties by initial order (same as speech)', () => {
    const a = student({ id: 'a', questions: 0, initialOrder: 0 });
    const b = student({ id: 'b', questions: 0, initialOrder: 1 });
    const result = sortPrec([a, b], 'question', 'match');
    expect(result.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('question precedence "random" mode breaks ties by questionOrder', () => {
    const a = student({ id: 'a', questions: 0, initialOrder: 0, questionOrder: 5 });
    const b = student({ id: 'b', questions: 0, initialOrder: 1, questionOrder: 2 });
    const result = sortPrec([a, b], 'question', 'random');
    expect(result.map(s => s.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const list = [student({ id: 'a', speeches: 2 }), student({ id: 'b', speeches: 0 })];
    const original = [...list];
    sortPrec(list, 'speech', 'reverse');
    expect(list).toEqual(original);
  });
});

describe('computeRecommendedDocket', () => {
  const bill = (id) => ({ id, name: `Bill ${id}` });

  it('returns an empty array for an empty legislation pack', () => {
    expect(computeRecommendedDocket([], {}, null)).toEqual([]);
  });

  it('scores balanced-interest bills higher than lopsided ones', () => {
    const pack = [bill('balanced'), bill('lopsided')];
    const splits = {
      s1: { balanced: 'aff', lopsided: 'aff' },
      s2: { balanced: 'neg', lopsided: 'aff' },
    };
    const result = computeRecommendedDocket(pack, splits, null);
    expect(result[0].id).toBe('balanced');
  });

  it('excludes the PO\'s own splits from scoring', () => {
    const pack = [bill('x')];
    const splits = { [fbSafe('po-1')]: { x: 'aff' } };
    const result = computeRecommendedDocket(pack, splits, 'po-1');
    expect(result[0].interest).toBe(0);
  });

  it('caps the recommendation at 5 bills', () => {
    const pack = Array.from({ length: 8 }, (_, i) => bill(String(i)));
    const result = computeRecommendedDocket(pack, {}, null);
    expect(result.length).toBe(5);
  });
});

describe('sanitizeInput', () => {
  it('strips angle brackets and braces', () => {
    expect(sanitizeInput('<script>{}</script>')).toBe('script/script');
  });

  it('truncates to 150 characters', () => {
    expect(sanitizeInput('a'.repeat(200)).length).toBe(150);
  });
});

describe('containsProfanity', () => {
  it('flags a listed word on its own', () => {
    expect(containsProfanity('shit happens')).toBe(true);
  });

  it('does not flag clean text', () => {
    expect(containsProfanity('Congressional Debate is fun')).toBe(false);
  });

  it('respects word boundaries (does not flag substrings)', () => {
    expect(containsProfanity('classic')).toBe(false);
  });
});

describe('fbSafe', () => {
  it('replaces dots with underscores', () => {
    expect(fbSafe('1.23.4')).toBe('1_23_4');
  });

  it('replaces every character forbidden in a Firebase key', () => {
    expect(fbSafe('a.b#c$d[e]/f')).toBe('a_b_c_d_e__f');
  });
});
