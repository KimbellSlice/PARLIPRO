import { initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref, remove, set, update } from 'firebase/database';

// ⚠️ REPLACE THIS with your real Firebase config from the Firebase Console
// See FIREBASE_SETUP.md for instructions
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

// Write entire room state
export function writeRoomState(roomCode, state) {
  return set(ref(db, `rooms/${roomCode}`), {
    ...state,
    updatedAt: Date.now()
  });
}

// Subscribe to room state changes
export function subscribeToRoom(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const unsub = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
  return unsub;
}

// Check if a room exists
export function checkRoomExists(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  onValue(roomRef, (snapshot) => {
    callback(snapshot.exists());
  }, { onlyOnce: true });
}

// Delete a room
export function deleteRoom(roomCode) {
  return remove(ref(db, `rooms/${roomCode}`));
}

// Update just the speech elapsed time (lightweight, called every second)
export function updateRoomElapsed(roomCode, elapsed) {
  return update(ref(db, `rooms/${roomCode}`), { speechElapsed: elapsed, updatedAt: Date.now() });
}
