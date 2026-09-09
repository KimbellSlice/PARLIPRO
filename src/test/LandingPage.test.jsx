import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../firebase.js', () => ({
  fbSafe: (id) => String(id).replace(/\./g, '_'),
  STALE_MS: 45000,
  writeRoomState: vi.fn(),
  createRoom: vi.fn(),
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

const { LandingPage } = await import('../App.jsx');

describe('LandingPage', () => {
  it('renders the create/join entry points', () => {
    render(<LandingPage onCreateRoom={() => {}} onJoinRoom={() => {}} onJoinCompetitor={() => {}} onRejoinPO={() => {}} />);
    expect(screen.getByText(/create chamber/i)).toBeInTheDocument();
    expect(screen.getByText(/join as competitor/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/chamber code/i)).toBeInTheDocument();
  });
});
