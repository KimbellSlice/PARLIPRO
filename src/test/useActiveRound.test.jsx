import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../firebase.js', () => ({
  fbSafe: (id) => String(id).replace(/\./g, '_'),
  STALE_MS: 45000,
  writeRoomState: vi.fn(() => Promise.resolve()),
  createRoom: vi.fn(() => Promise.resolve()),
  setRoomSecret: vi.fn(() => Promise.resolve()),
  subscribeToRoom: vi.fn(() => () => {}),
  checkRoomExists: vi.fn(),
  deleteRoom: vi.fn(() => Promise.resolve()),
  updateRoomElapsed: vi.fn(() => Promise.resolve()),
  getRoomOnce: vi.fn(),
  updateHeartbeat: vi.fn(() => Promise.resolve()),
  clearPOHeartbeat: vi.fn(() => Promise.resolve()),
  cleanupStaleRooms: vi.fn(),
  updateCompetitorIntent: vi.fn(() => Promise.resolve()),
  updateCompetitorSplit: vi.fn(() => Promise.resolve()),
  claimCompetitorName: vi.fn(() => Promise.resolve()),
  releaseCompetitorName: vi.fn(() => Promise.resolve()),
  claimSpectatorPresence: vi.fn(() => Promise.resolve()),
  releaseSpectatorPresence: vi.fn(() => Promise.resolve()),
  claimCompetitorNameAtomic: vi.fn(() => Promise.resolve()),
  getAuthUidSync: vi.fn(() => 'test-uid'),
  submitDocketProposal: vi.fn(() => Promise.resolve()),
  withdrawDocketProposal: vi.fn(() => Promise.resolve()),
  adoptDocket: vi.fn(() => Promise.resolve()),
}));

const { useActiveRound } = await import('../App.jsx');

function makeConfig(overrides) {
  return {
    students: [
      { id: 1, name: 'Alice', speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: 0 },
      { id: 2, name: 'Bob', speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: 1 },
    ],
    seatingSlots: [],
    cols: 2,
    frontSide: 'bottom',
    docket: [{ id: 'b1', name: 'Bill One', status: null }],
    roomCode: 'TEST1',
    poName: '',
    roomName: '',
    poPin: '1234',
    questionPrec: 'reverse',
    poStudentId: null,
    legislationPack: [{ id: 'b1', name: 'Bill One' }],
    docketAdopted: true,
    ...overrides,
  };
}

describe('useActiveRound', () => {
  it('walks a full cycle: recognize speaker -> end speech -> question period -> resolve bill -> next bill', () => {
    sessionStorage.clear();
    const onCloseRoom = vi.fn();
    const { result } = renderHook(() => useActiveRound(makeConfig(), onCloseRoom));

    // First speech of the round needs a type choice (authorship/sponsorship).
    act(() => result.current.recognizeSpeaker(1));
    expect(result.current.pendingSpeaker).toBe(1);
    expect(result.current.activeSpeech).toBeNull();

    act(() => result.current.startSpeechFromChoice(1, 'author', 'Authorship'));
    expect(result.current.activeSpeech).toMatchObject({ studentId: 1, side: 'Authorship', speechNumber: 1 });
    expect(result.current.pendingSpeaker).toBeNull();

    act(() => result.current.endSpeech());
    expect(result.current.activeSpeech).toBeNull();
    expect(result.current.mode).toBe('question');
    expect(result.current.inQuestionPeriod).toBe(true);
    expect(result.current.lastSpeakerId).toBe(1);
    expect(result.current.history[0]).toMatchObject({ type: 'speech', name: 'Alice', side: 'Authorship' });

    act(() => result.current.recognizeQuestioner(2));
    expect(result.current.questionCounter).toBe(1);
    expect(result.current.activeQuestioner).toBe('Bob');
    expect(result.current.history[0]).toMatchObject({ type: 'question', name: 'Bob' });

    act(() => result.current.resolveBill(true));
    expect(result.current.docket[0].status).toBe('passed');
    expect(result.current.currentBillIdx).toBe(1);
    expect(result.current.mode).toBe('speech');
    expect(result.current.inQuestionPeriod).toBe(false);
    expect(result.current.roundComplete).toBe(true);
    expect(result.current.history[0]).toMatchObject({ type: 'bill', status: 'Passed' });
  });

  it('undo restores the previous snapshot after recognizing a speaker', () => {
    sessionStorage.clear();
    const { result } = renderHook(() => useActiveRound(makeConfig(), vi.fn()));

    act(() => result.current.recognizeSpeaker(1));
    expect(result.current.pendingSpeaker).toBe(1);

    act(() => result.current.undo());
    expect(result.current.pendingSpeaker).toBeNull();
  });
});
