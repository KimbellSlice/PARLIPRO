import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, onDisconnect, runTransaction, get, serverTimestamp } from 'firebase/database';
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
const _authReady = new Promise((resolve, reject) => {
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    callback(value);
  };
  const timeout = setTimeout(() => finish(reject, new Error('Authentication timed out')), 15000);
  onAuthStateChanged(auth, (user) => {
    if (user) {
      _authUid = user.uid;
      clearTimeout(timeout);
      finish(resolve, user.uid);
    } else {
      signInAnonymously(auth).catch((error) => {
        clearTimeout(timeout);
        finish(reject, error);
      });
    }
  }, (error) => {
    clearTimeout(timeout);
    finish(reject, error);
  });
});

// Get the current auth UID (resolves once auth is ready)
export function getAuthUid() { return _authReady; }

// Get the current auth UID synchronously (may be null if not yet ready)
export function getAuthUidSync() { return _authUid; }

export async function authenticatedPost(path, body) {
  await getAuthUid();
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Server returned an invalid response (${response.status})`);
  }
  if (!response.ok && !['locked', 'incorrect_pin', 'po_already_active'].includes(result.error)) {
    const error = new Error(result.error || `Request failed (${response.status})`);
    error.code = result.error;
    throw error;
  }
  return result;
}

// Staleness threshold — presence is considered stale after this many ms
export const STALE_MS = 45000;

export function writeRoomState(roomCode, state) {
  return update(ref(db, `rooms/${roomCode}`), {
    ...state,
    updatedAt: serverTimestamp()
  });
}

// Create a new room through the trusted server so the room and PIN hash are
// reserved together and ownership is bound to the authenticated caller.
export function createRoom(roomCode, state, pin) {
  return authenticatedPost('/api/create-room', { roomCode, state, pin });
}

// ═══ PO CONTROL LEASES ═══

export function claimPOLease(roomCode, pin) {
  return authenticatedPost('/api/claim-po', { roomCode, pin });
}

export function renewPOLease(roomCode) {
  return authenticatedPost('/api/renew-po-lease', { roomCode });
}

export function releasePOLease(roomCode) {
  return authenticatedPost('/api/release-po', { roomCode });
}

export function subscribeToRoom(roomCode, callback, onError = console.error) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const unsub = onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  }, onError);
  return unsub;
}

export function checkRoomExists(roomCode, callback, onError) {
  return get(ref(db, `rooms/${roomCode}`))
    .then((snapshot) => callback(snapshot.exists()))
    .catch((error) => { if (onError) onError(error); else throw error; });
}

export function getRoomOnce(roomCode, callback, onError) {
  return get(ref(db, `rooms/${roomCode}`))
    .then((snapshot) => callback(snapshot.val()))
    .catch((error) => { if (onError) onError(error); else throw error; });
}

export function deleteRoom(roomCode) {
  return authenticatedPost('/api/close-room', { roomCode });
}

// ═══ INCREMENTAL STATE UPDATES ═══
// Instead of writing the entire room, update only changed fields

export function updateRoomElapsed(roomCode, elapsed) {
  return update(ref(db, `rooms/${roomCode}`), { speechElapsed: elapsed });
}

export function updateRoomField(roomCode, field, value) {
  return update(ref(db, `rooms/${roomCode}`), { [field]: value, updatedAt: serverTimestamp() });
}

export function updateRoomFields(roomCode, fields) {
  return update(ref(db, `rooms/${roomCode}`), { ...fields, updatedAt: serverTimestamp() });
}

// ═══ PO PRESENCE (with onDisconnect) ═══

export function updateHeartbeat(roomCode) {
  const hbRef = ref(db, `rooms/${roomCode}/poHeartbeat`);
  onDisconnect(hbRef).set(null);
  return set(hbRef, { ts: serverTimestamp(), uid: _authUid });
}

export function clearPOHeartbeat(roomCode) {
  const hbRef = ref(db, `rooms/${roomCode}/poHeartbeat`);
  onDisconnect(hbRef).cancel();
  return set(hbRef, null);
}

// ═══ COMPETITOR PRESENCE (with onDisconnect) ═══

export function fbSafe(id) { return String(id).replace(/[.#$]/g, '_').replaceAll('[', '_').replaceAll(']', '_').replaceAll('/', '_'); }

export function claimCompetitorName(roomCode, studentId) {
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  onDisconnect(claimRef).remove();
  return update(claimRef, { claimedAt: serverTimestamp(), uid: _authUid });
}

export function releaseCompetitorName(roomCode, studentId) {
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  onDisconnect(claimRef).cancel();
  return set(claimRef, null);
}

// ═══ SPECTATOR PRESENCE (with onDisconnect) ═══

export async function claimSpectatorPresence(roomCode, spectatorId) {
  const uid = await getAuthUid();
  // Use auth UID as spectator ID for security rules
  const id = spectatorId || uid;
  const presRef = ref(db, `rooms/${roomCode}/spectatorPresence/${fbSafe(id)}`);
  onDisconnect(presRef).remove();
  return update(presRef, { heartbeat: serverTimestamp(), uid });
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
// Uses a Realtime Database transaction — the actual primitive RTDB provides
// for check-and-set — instead of a separate read then write, which has a
// race window two clients can both slip through when claiming the same name
// at the same moment.

export async function claimCompetitorNameAtomic(roomCode, studentId) {
  // Wait for anonymous sign-in to actually complete before reading _authUid —
  // this can fire on mount, before onAuthStateChanged's real-user callback
  // has run, which would otherwise write uid: null and fail the security
  // rule's uid-match validation (indistinguishable from "name already taken").
  const uid = await getAuthUid();
  const claimRef = ref(db, `rooms/${roomCode}/competitorClaims/${fbSafe(studentId)}`);
  return runTransaction(claimRef, (existing) => {
    if (existing && existing.claimedAt && (Date.now() - existing.claimedAt) < STALE_MS && existing.uid !== uid) {
      return; // abort — leaves the existing claim untouched
    }
    return { claimedAt: serverTimestamp(), uid };
  }).then((result) => {
    if (!result.committed) {
      throw new Error("Name already claimed");
    }
    onDisconnect(claimRef).remove();
    return result;
  });
}

// ═══ ROOM CLEANUP ═══

// ═══ DOCKET PROPOSALS ═══

export function submitDocketProposal(roomCode, studentId, studentName, bills) {
  return set(ref(db, `rooms/${roomCode}/docketProposals/${fbSafe(studentId)}`), {
    bills,
    name: studentName,
    submittedAt: serverTimestamp(),
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
    updatedAt: serverTimestamp()
  });
}
