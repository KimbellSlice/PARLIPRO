import { initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref, remove, set, update } from 'firebase/database';

// Replace with your real Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDEeij30fHJwxK5BQRbo2xMCECmp1dNkO4",
  authDomain: "parlipro-fd42b.firebaseapp.com",
  databaseURL: "https://parlipro-fd42b-default-rtdb.firebaseio.com",
  projectId: "parlipro-fd42b",
  storageBucket: "parlipro-fd42b.firebasestorage.app",
  messagingSenderId: "523648822839",
  appId: "1:523648822839:web:5a4943d1d86d66afa859b2",
  measurementId: "G-083MJQDC0R"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export function writeRoomState(roomCode, state) {
  return update(ref(db, `rooms/${roomCode}`), {
    ...state,
    updatedAt: Date.now()
  });
}

// Create a new room (uses set to establish the full node)
export function createRoom(roomCode, state) {
  return set(ref(db, `rooms/${roomCode}`), {
    ...state,
    updatedAt: Date.now()
  });
}

export function subscribeToRoom(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const unsub = onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  });
  return unsub;
}

export function checkRoomExists(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  onValue(roomRef, (snapshot) => {
    callback(snapshot.exists());
  }, { onlyOnce: true });
}

export function getRoomOnce(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  }, { onlyOnce: true });
}

export function deleteRoom(roomCode) {
  return remove(ref(db, `rooms/${roomCode}`));
}

export function updateRoomElapsed(roomCode, elapsed) {
  return update(ref(db, `rooms/${roomCode}`), { speechElapsed: elapsed, updatedAt: Date.now() });
}

export function updateHeartbeat(roomCode) {
  return update(ref(db, `rooms/${roomCode}`), { poHeartbeat: Date.now() });
}

export function cleanupStaleRooms() {
  const roomsRef = ref(db, 'rooms');
  onValue(roomsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    Object.keys(data).forEach(code => {
      const room = data[code];
      if (room.updatedAt && room.updatedAt < cutoff) {
        remove(ref(db, `rooms/${code}`)).catch(console.error);
      }
    });
  }, { onlyOnce: true });
}

// Helper: make IDs safe for Firebase paths (no dots)
function fbSafe(id) { return String(id).replace(/\./g, '_'); }

// Competitor: set speech/question intent
export function updateCompetitorIntent(roomCode, studentId, intentType, value) {
  return update(ref(db, `rooms/${roomCode}/competitorIntents/${fbSafe(studentId)}`), { [intentType]: value });
}

// Competitor: set split for a bill
export function updateCompetitorSplit(roomCode, studentId, billId, side) {
  return update(ref(db, `rooms/${roomCode}/splits/${fbSafe(studentId)}`), { [fbSafe(billId)]: side });
}

// Competitor: claim a name (heartbeat)
export function claimCompetitorName(roomCode, studentId) {
  return update(ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`), { claimedAt: Date.now() });
}

// Competitor: release a name claim
export function releaseCompetitorName(roomCode, studentId) {
  return set(ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`), null);
}

// Spectator: heartbeat (track active spectators)
export function claimSpectatorPresence(roomCode, spectatorId) {
  return update(ref(db, `rooms/${roomCode}/spectatorPresence/${fbSafe(spectatorId)}`), { heartbeat: Date.now() });
}

export function releaseSpectatorPresence(roomCode, spectatorId) {
  return set(ref(db, `rooms/${roomCode}/spectatorPresence/${fbSafe(spectatorId)}`), null);
}

// Atomic claim with transaction-like check
export function claimCompetitorNameAtomic(roomCode, studentId) {
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  return new Promise((resolve, reject) => {
    onValue(claimRef, (snapshot) => {
      const existing = snapshot.val();
      if (existing && existing.claimedAt && (Date.now() - existing.claimedAt) < 15000) {
        reject(new Error("Name already claimed"));
      } else {
        update(claimRef, { claimedAt: Date.now() }).then(resolve).catch(reject);
      }
    }, { onlyOnce: true });
  });
}
