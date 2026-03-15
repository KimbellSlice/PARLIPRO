import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, remove, onDisconnect } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

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
const auth = getAuth(app);

// ═══ ANONYMOUS AUTH ═══
let _authUid = null;
const _authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      _authUid = user.uid;
      resolve(user.uid);
    } else {
      signInAnonymously(auth).catch(console.error);
    }
  });
});

// Get the current auth UID (resolves once auth is ready)
export function getAuthUid() { return _authReady; }

// Get the current auth UID synchronously (may be null if not yet ready)
export function getAuthUidSync() { return _authUid; }

// Staleness threshold — presence is considered stale after this many ms
export const STALE_MS = 45000;

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

// ═══ INCREMENTAL STATE UPDATES ═══
// Instead of writing the entire room, update only changed fields

export function updateRoomElapsed(roomCode, elapsed) {
  return update(ref(db, `rooms/${roomCode}`), { speechElapsed: elapsed });
}

export function updateRoomField(roomCode, field, value) {
  return update(ref(db, `rooms/${roomCode}`), { [field]: value, updatedAt: Date.now() });
}

export function updateRoomFields(roomCode, fields) {
  return update(ref(db, `rooms/${roomCode}`), { ...fields, updatedAt: Date.now() });
}

// ═══ PO PRESENCE (with onDisconnect) ═══

export function updateHeartbeat(roomCode) {
  const hbRef = ref(db, `rooms/${roomCode}/poHeartbeat`);
  onDisconnect(hbRef).set(null);
  return set(hbRef, { ts: Date.now(), uid: _authUid });
}

export function clearPOHeartbeat(roomCode) {
  const hbRef = ref(db, `rooms/${roomCode}/poHeartbeat`);
  onDisconnect(hbRef).cancel();
  return set(hbRef, null);
}

// ═══ COMPETITOR PRESENCE (with onDisconnect) ═══

function fbSafe(id) { return String(id).replace(/\./g, '_'); }

export function claimCompetitorName(roomCode, studentId) {
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  onDisconnect(claimRef).remove();
  return update(claimRef, { claimedAt: Date.now(), uid: _authUid });
}

export function releaseCompetitorName(roomCode, studentId) {
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  onDisconnect(claimRef).cancel();
  return set(claimRef, null);
}

// ═══ SPECTATOR PRESENCE (with onDisconnect) ═══

export function claimSpectatorPresence(roomCode, spectatorId) {
  // Use auth UID as spectator ID for security rules
  const id = spectatorId || _authUid;
  const presRef = ref(db, `rooms/${roomCode}/spectatorPresence/${fbSafe(id)}`);
  onDisconnect(presRef).remove();
  return update(presRef, { heartbeat: Date.now(), uid: _authUid });
}

export function releaseSpectatorPresence(roomCode, spectatorId) {
  const id = spectatorId || _authUid;
  const presRef = ref(db, `rooms/${roomCode}/spectatorPresence/${fbSafe(id)}`);
  onDisconnect(presRef).cancel();
  return set(presRef, null);
}

// ═══ COMPETITOR INTENTS & SPLITS ═══

export function updateCompetitorIntent(roomCode, studentId, intentType, value) {
  return update(ref(db, `rooms/${roomCode}/competitorIntents/${fbSafe(studentId)}`), { [intentType]: value });
}

export function updateCompetitorSplit(roomCode, studentId, billId, side) {
  return update(ref(db, `rooms/${roomCode}/splits/${fbSafe(studentId)}`), { [fbSafe(billId)]: side });
}

// ═══ ATOMIC CLAIM ═══

export function claimCompetitorNameAtomic(roomCode, studentId) {
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  return new Promise((resolve, reject) => {
    onValue(claimRef, (snapshot) => {
      const existing = snapshot.val();
      if (existing && existing.claimedAt && (Date.now() - existing.claimedAt) < STALE_MS && existing.uid !== _authUid) {
        reject(new Error("Name already claimed"));
      } else {
        onDisconnect(claimRef).remove();
        update(claimRef, { claimedAt: Date.now(), uid: _authUid }).then(resolve).catch(reject);
      }
    }, { onlyOnce: true });
  });
}

// ═══ ROOM CLEANUP ═══

export function cleanupStaleRooms() {
  const roomsRef = ref(db, 'rooms');
  onValue(roomsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    const cutoff = Date.now() - (12 * 60 * 60 * 1000); // 12 hours
    Object.keys(data).forEach(code => {
      const room = data[code];
      if (room.updatedAt && room.updatedAt < cutoff) {
        remove(ref(db, `rooms/${code}`)).catch(console.error);
      }
    });
  }, { onlyOnce: true });
}

// ═══ DOCKET PROPOSALS ═══

export function submitDocketProposal(roomCode, studentId, studentName, bills) {
  return set(ref(db, `rooms/${roomCode}/docketProposals/${fbSafe(studentId)}`), {
    bills,
    name: studentName,
    submittedAt: Date.now(),
    uid: _authUid
  });
}

export function withdrawDocketProposal(roomCode, studentId) {
  return set(ref(db, `rooms/${roomCode}/docketProposals/${fbSafe(studentId)}`), null);
}

export function adoptDocket(roomCode, docketBills, legislationPack) {
  // Build the official docket from legislation pack using bill IDs
  const officialDocket = docketBills.map(id => legislationPack.find(b => String(b.id) === String(id))).filter(Boolean);
  return update(ref(db, `rooms/${roomCode}`), {
    docket: officialDocket,
    docketAdopted: true,
    updatedAt: Date.now()
  });
}
