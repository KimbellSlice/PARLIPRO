import { useState, useRef, useEffect, useCallback } from "react";
import { writeRoomState, createRoom, subscribeToRoom, checkRoomExists, deleteRoom, updateRoomElapsed, getRoomOnce, updateHeartbeat, clearPOHeartbeat, cleanupStaleRooms, updateCompetitorIntent, updateCompetitorSplit, claimCompetitorName, releaseCompetitorName, claimSpectatorPresence, releaseSpectatorPresence, claimCompetitorNameAtomic, STALE_MS, getAuthUidSync } from "./firebase.js";

const generateCode = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join(""); };
const generatePin = () => String(Math.floor(1000 + Math.random() * 9000));
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const COLORS = ["#2D4A3E", "#3B2D4A", "#4A2D2D", "#2D3B4A", "#4A3B2D", "#2D4A44", "#3E2D4A", "#4A2D3B", "#2D424A", "#44402D", "#3A2D4A", "#2D4A36", "#4A2D44", "#2D3E4A", "#4A362D", "#2D4A4A", "#422D4A", "#4A2D36", "#2D454A", "#4A422D"];
const sortPrec = (s, type, questionPrecMode) => { const k = type === "speech" ? "speeches" : "questions", h = type === "speech" ? "speechHistory" : "questionHistory"; return [...s].sort((a, b) => { if ((a[k]||0) !== (b[k]||0)) return (a[k]||0) - (b[k]||0); const aH = a[h] || [], bH = b[h] || []; const aL = aH.length ? aH[aH.length - 1] : -1, bL = bH.length ? bH[bH.length - 1] : -1; if (aL !== bL) return aL - bL; if (type === "question" && questionPrecMode === "random") return (a.questionOrder||0) - (b.questionOrder||0); if (type === "question" && questionPrecMode === "reverse") return (b.initialOrder||0) - (a.initialOrder||0); return (a.initialOrder||0) - (b.initialOrder||0); }); };
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,600;6..72,700&family=DM+Mono:wght@400;500&display=swap";

// Profanity filter
const BAD_WORDS = ["fuck","shit","ass","bitch","damn","dick","pussy","cock","cunt","bastard","slut","whore","fag","nigger","nigga","retard","twat","wanker","piss","bollocks","arse","asshole","motherfucker","bullshit","goddamn","jackass","dumbass","douche","dildo","penis","vagina","tits","boobs","butthole","shithead","dickhead","fuckhead","asswipe","cocksucker","fucker","bitchass","hoe","thot","stfu","gtfo","milf"];
const fbSafe = (id) => String(id).replace(/\./g, '_');
const badWordRegex = new RegExp(`\\b(${BAD_WORDS.join("|")})\\b`, "i");
const containsProfanity = (text) => badWordRegex.test(text);
const sanitizeInput = (text) => text.replace(/[<>{}]/g, "").slice(0, 50);
const BG = "linear-gradient(160deg, #1a1714 0%, #231f1b 50%, #1a1714 100%)";
const GOLD = "#D4A843";
const copyToClipboard = (text) => {
  try {
    navigator.clipboard.writeText(text);
    // Show toast
    const toast = document.createElement("div");
    toast.textContent = "Copied!";
    Object.assign(toast.style, { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "#D4A843", color: "#1a1714", fontFamily: "'DM Mono', monospace", fontSize: "12px", fontWeight: "600", padding: "6px 16px", borderRadius: "6px", zIndex: "9999", opacity: "1", transition: "opacity 0.3s ease" });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; }, 1200);
    setTimeout(() => { document.body.removeChild(toast); }, 1600);
  } catch(e) { /* fallback: no-op */ }
};
const IS = { width: "100%", padding: "10px 14px", background: "#2a2520", border: "1px solid #3a3530", borderRadius: 6, color: "#E8E0D0", fontSize: 14, fontFamily: "'Newsreader', Georgia, serif", outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" };

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

function useProfanityToast() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const trigger = () => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2000);
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const Toast = visible ? (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#4A2D2D", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 8, padding: "8px 16px", fontFamily: "'DM Mono', monospace", fontSize: 11, zIndex: 9999, animation: "profanityFadeIn 0.15s ease-out", pointerEvents: "none" }}>
      Please use appropriate language
    </div>
  ) : null;
  return { trigger, Toast };
}

const Brand = ({ size = "large" }) => (
  <div style={{ textAlign: size === "large" ? "center" : "left" }}>
    {size === "large" ? (
      <>
        <img src="/PARLIPRO.png" alt="ParliPro" style={{ height: 120, display: "block", margin: "0 auto 8px" }} />
        <h1 style={{ fontSize: 28, fontWeight: 300, margin: 0, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif" }}>Congressional Debate<br/>Parliamentary Tool</h1>
      </>
    ) : (
      <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: GOLD, letterSpacing: "0.25em", textTransform: "uppercase" }}>ParliPro</div>
    )}
  </div>
);

function SpeechTimer({ onTick, isRestore, savedElapsed, savedRunning, onStateChange }) {
  const [elapsed, setElapsed] = useState(isRestore ? (savedElapsed || 0) : 0);
  const [running, setRunning] = useState(isRestore ? !!savedRunning : false);
  const ref = useRef(null);
  const isMobile = useIsMobile();
  useEffect(() => { if (running) ref.current = setInterval(() => setElapsed(p => p + 1), 1000); else clearInterval(ref.current); return () => clearInterval(ref.current); }, [running]);
  useEffect(() => { if (onTick) onTick(elapsed); }, [elapsed]);
  useEffect(() => { if (onStateChange) onStateChange(elapsed, running); }, [elapsed, running]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
      <div style={{ fontSize: isMobile ? 28 : 38, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: elapsed > 180 ? "#C45A5A" : "#E8E0D0", letterSpacing: "0.05em", lineHeight: 1 }}>{fmtTime(elapsed)}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setRunning(r => !r)} style={{ padding: "6px 18px", background: running ? "#4A2D2D" : "#2D4A3E", color: running ? "#E8A0A0" : "#A0E8C0", border: running ? "1px solid #6B3A3A" : "1px solid #3A6B4E", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer", minWidth: 72 }}>{running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}</button>
        <button onClick={() => { setRunning(false); setElapsed(0); }} style={{ padding: "6px 12px", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>Reset</button>
      </div>
    </div>
  );
}

function QuestionBlockTimer({ timerKey, onBlockEnd }) {
  const [seconds, setSeconds] = useState(30);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef(null);
  const isMobile = useIsMobile();
  useEffect(() => { setSeconds(30); setRunning(true); }, [timerKey]);
  useEffect(() => {
    if (running && seconds > 0) intervalRef.current = setInterval(() => setSeconds(p => { if (p <= 1) { clearInterval(intervalRef.current); setRunning(false); if (onBlockEnd) onBlockEnd(); return 0; } return p - 1; }), 1000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [running, timerKey]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
      <div style={{ fontSize: isMobile ? 22 : 28, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: seconds <= 5 ? "#C45A5A" : seconds === 0 ? "#6b6358" : "#7BA3BF", letterSpacing: "0.05em", lineHeight: 1 }}>0:{String(seconds).padStart(2, "0")}</div>
      <button onClick={() => setRunning(r => !r)} style={{ padding: "5px 14px", background: running ? "#4A2D2D" : "#2D3B4A", color: running ? "#E8A0A0" : "#A0C8E0", border: running ? "1px solid #6B3A3A" : "1px solid #3A4E6B", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", minWidth: 60 }}>{running ? "Pause" : seconds > 0 ? "Resume" : "Done"}</button>
      <button onClick={() => { setRunning(false); setSeconds(30); }} style={{ padding: "5px 10px", background: "transparent", color: "#6b6358", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Reset</button>
    </div>
  );
}

// ═══ LANDING PAGE ═══
function LandingPage({ onCreateRoom, onJoinRoom, onJoinCompetitor, onRejoinPO }) {
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [checking, setChecking] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [rosterNames, setRosterNames] = useState([]);
  const [rosterClaims, setRosterClaims] = useState({});
  const [pendingRoomData, setPendingRoomData] = useState(null);
  const [pin, setPin] = useState("");
  const [pendingCode, setPendingCode] = useState("");

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a valid chamber code"); return; }
    setChecking(true); setJoinError("");
    checkRoomExists(code, (exists) => {
      setChecking(false);
      if (exists) onJoinRoom(code);
      else setJoinError("Chamber not found. Check the code and try again.");
    });
  };

  const handleJoinAsCompetitor = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a valid chamber code"); return; }
    setChecking(true); setJoinError("");
    getRoomOnce(code, (data) => {
      setChecking(false);
      if (!data) { setJoinError("Chamber not found."); return; }
      if (!data.students || data.students.length === 0) { setJoinError("Chamber has no roster yet."); return; }
      setPendingCode(code);
      setRosterNames(data.students.map(s => ({ id: s.id, name: s.name })));
      setRosterClaims(data.competitorClaims || {});
      setPendingRoomData(data);
      setShowNamePicker(true);
    });
  };

  // Re-fetch claims and PO status while name picker is open
  useEffect(() => {
    if (!showNamePicker || !pendingCode) return;
    const iv = setInterval(() => {
      getRoomOnce(pendingCode, (data) => {
        if (data) {
          setRosterClaims(data.competitorClaims || {});
          setPendingRoomData(data);
        }
      });
    }, 3000);
    return () => clearInterval(iv);
  }, [showNamePicker, pendingCode]);

  const handleRejoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a chamber code first"); return; }
    setChecking(true); setJoinError("");
    getRoomOnce(code, (data) => {
      setChecking(false);
      if (!data) { setJoinError("Chamber not found."); return; }
      if (!data.poPin) { setJoinError("This chamber has no PO PIN set."); return; }
      if (data.poHeartbeat && (Date.now() - (data.poHeartbeat.ts || data.poHeartbeat)) < STALE_MS) {
        setJoinError("A PO is currently active in this room. Close that session first, or wait a few seconds if it crashed.");
        return;
      }
      setPendingCode(code);
      setShowPinEntry(true);
    });
  };

  const [landingPinAttempts, setLandingPinAttempts] = useState(0);
  const [landingPinLockUntil, setLandingPinLockUntil] = useState(0);
  const handlePinSubmit = () => {
    if (Date.now() < landingPinLockUntil) { setJoinError(`Too many attempts. Wait ${Math.ceil((landingPinLockUntil - Date.now()) / 1000)}s.`); return; }
    getRoomOnce(pendingCode, (data) => {
      if (data && data.poPin === pin) {
        setLandingPinAttempts(0);
        onRejoinPO(pendingCode, data);
      } else {
        const newAttempts = landingPinAttempts + 1;
        setLandingPinAttempts(newAttempts);
        if (newAttempts >= 5) {
          setLandingPinLockUntil(Date.now() + 30000);
          setJoinError("Too many attempts. Locked for 30s.");
        } else {
          setJoinError(`Incorrect PIN. ${5 - newAttempts} attempts left.`);
        }
        setShowPinEntry(false);
        setPin("");
      }
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <Brand size="large" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 32 }}>
          <button onClick={onCreateRoom} style={{ width: "100%", padding: "18px 0", background: `linear-gradient(135deg, ${GOLD}, #C49632)`, color: "#1a1714", border: "none", borderRadius: 10, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>Create Chamber</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#3a3530" }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", letterSpacing: "0.15em", textTransform: "uppercase" }}>or enter a chamber code</span>
            <div style={{ flex: 1, height: 1, background: "#3a3530" }} />
          </div>
          <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); setShowPinEntry(false); setShowNamePicker(false); }} onKeyDown={e => e.key === "Enter" && handleJoinAsCompetitor()} placeholder="CHAMBER CODE" aria-label="Chamber code" maxLength={6} style={{ ...IS, textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 20, letterSpacing: "0.2em", padding: "14px" }} />

          {showPinEntry ? (
            <div style={{ background: "#2a2520", border: `1px solid ${GOLD}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Enter PO PIN to rejoin</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={e => e.key === "Enter" && pin.length === 4 && handlePinSubmit()} placeholder="4-digit PIN" maxLength={4} style={{ ...IS, flex: 1, textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 20, letterSpacing: "0.3em", padding: "12px" }} />
                <button onClick={handlePinSubmit} disabled={pin.length !== 4} style={{ padding: "12px 20px", background: pin.length === 4 ? GOLD : "#3a3530", color: pin.length === 4 ? "#1a1714" : "#6b6358", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: pin.length === 4 ? "pointer" : "not-allowed" }}>Rejoin</button>
              </div>
              <button onClick={() => { setShowPinEntry(false); setPin(""); }} style={{ marginTop: 8, background: "none", border: "none", color: "#6b6358", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button>
            </div>
          ) : showNamePicker ? (
            <div style={{ background: "#2a2520", border: `1px solid ${GOLD}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Select your name</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflow: "auto" }}>
                {rosterNames.map(s => {
                  const claim = (rosterClaims || {})[fbSafe(s.id)];
                  const claimedByCompetitor = claim && claim.claimedAt && (Date.now() - claim.claimedAt) < STALE_MS;
                  const claimedByPO = pendingRoomData?.poStudentId === s.id;
                  const taken = claimedByCompetitor || claimedByPO;
                  return (
                    <button key={s.id} onClick={() => !taken && onJoinCompetitor(pendingCode, s.id, s.name)} disabled={taken} style={{ padding: "12px 16px", background: taken ? "#1e1b17" : "#1e1b17", color: taken ? "#6b6358" : "#E8E0D0", border: taken ? "1px solid #2a2520" : "1px solid #3a3530", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: taken ? "not-allowed" : "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{s.name}</span>
                      {taken && <span style={{ fontSize: 9, color: claimedByPO ? GOLD : "#C45A5A", textTransform: "uppercase" }}>{claimedByPO ? "PO" : "In Chamber"}</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => { setShowNamePicker(false); }} style={{ marginTop: 8, background: "none", border: "none", color: "#6b6358", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleJoinAsCompetitor} disabled={checking} style={{ width: "100%", padding: "14px 0", background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: checking ? "wait" : "pointer" }}>{checking ? "..." : "Join as Competitor"}</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleJoin} disabled={checking} style={{ flex: 1, padding: "10px 0", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: checking ? "wait" : "pointer" }}>{checking ? "..." : "Spectator"}</button>
                <button onClick={handleRejoin} disabled={checking} style={{ flex: 1, padding: "10px 0", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: checking ? "wait" : "pointer" }}>{checking ? "..." : "Rejoin as PO"}</button>
              </div>
            </div>
          )}

          {joinError && <div style={{ color: "#C45A5A", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{joinError}</div>}
        </div>
        <div style={{ marginTop: 40, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a4540" }}>Built for NSDA / TFA Congressional Debate</div>
      </div>
    </div>
  );
}

// ═══ SETUP PHASE ═══
function SetupPhase({ onStart }) {
  const [poName, setPoName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showPasteBox, setShowPasteBox] = useState(true);
  const profanity = useProfanityToast();
  const [students, setStudents] = useState([]);
  const [billInput, setBillInput] = useState("");
  const [docket, setDocket] = useState([]);
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(4);
  const [frontSide, setFrontSide] = useState("bottom");
  const [step, setStep] = useState("roster");
  const [seatingSlots, setSeatingSlots] = useState([]);
  const [seatingDirty, setSeatingDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [seatDrag, setSeatDrag] = useState(null);
  const [questionPrec, setQuestionPrec] = useState("reverse");
  const [roomCode] = useState(generateCode);
  const [poPin] = useState(generatePin);
  const nameRef = useRef(null);
  const billRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => { if (step === "seating" && !seatingDirty) setSeatingSlots(Array.from({ length: rows * cols }, (_, i) => students[i] || null)); }, [step]);
  useEffect(() => { if (step === "seating") { const ex = seatingSlots.filter(Boolean); setSeatingSlots(Array.from({ length: rows * cols }, (_, i) => ex[i] || null)); } }, [rows, cols]);

  const addStudent = () => { const n = sanitizeInput(nameInput.trim()); if (!n || students.some(s => s.name.toLowerCase() === n.toLowerCase())) return; if (containsProfanity(n)) { setNameInput(""); profanity.trigger(); return; } setStudents(p => [...p, { id: Date.now() + Math.random(), name: n, speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: p.length }]); setNameInput(""); setSeatingDirty(false); nameRef.current?.focus(); };
  const handlePasteList = (text) => {
    const names = text.split(/\n/).map(l => sanitizeInput(l.trim())).filter(n => n && n.length > 0);
    let added = 0, skipped = 0, profane = 0;
    setStudents(prev => {
      let next = [...prev];
      for (const name of names) {
        if (containsProfanity(name)) { profane++; continue; }
        if (next.some(s => s.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
        next.push({ id: Date.now() + Math.random() + added, name, speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: next.length });
        added++;
      }
      return next;
    });
    setSeatingDirty(false);
    setShowPasteBox(false);
    if (profane > 0) profanity.trigger();
  };
  const removeStudent = (id) => { setStudents(p => p.filter(s => s.id !== id).map((s, i) => ({ ...s, initialOrder: i }))); setSeatingDirty(false); };
  const randomize = () => { setStudents(p => shuffle(p).map((s, i) => ({ ...s, initialOrder: i }))); setSeatingDirty(false); };
  const addBill = () => { const n = sanitizeInput(billInput.trim()); if (!n) return; if (containsProfanity(n)) { setBillInput(""); profanity.trigger(); return; } setDocket(p => [...p, { id: Date.now() + Math.random(), name: n, status: null }]); setBillInput(""); billRef.current?.focus(); };
  const removeBill = (id) => setDocket(p => p.filter(b => b.id !== id));
  const moveBill = (idx, dir) => { const ns = [...docket]; const [item] = ns.splice(idx, 1); ns.splice(idx + dir, 0, item); setDocket(ns); };
  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => { e.preventDefault(); if (dragIdx === null || dragIdx === idx) return; const ns = [...students]; const [d] = ns.splice(dragIdx, 1); ns.splice(idx, 0, d); setStudents(ns.map((s, i) => ({ ...s, initialOrder: i }))); setDragIdx(idx); };
  const handleSeatDragOver = (e, tgt) => { e.preventDefault(); if (seatDrag === null || seatDrag === tgt) return; const ns = [...seatingSlots]; const item = ns[seatDrag]; ns.splice(seatDrag, 1); ns.splice(tgt, 0, item); setSeatingSlots(ns); setSeatDrag(tgt); setSeatingDirty(true); };

  const hasRoster = students.length >= 2;
  const hasDocket = docket.length >= 1;
  const hasSeating = seatingSlots.filter(Boolean).length >= 2;
  const hasPO = true;
  const canStart = hasRoster && hasDocket && hasSeating;
  const check = (d) => <span style={{ fontSize: 10, marginLeft: 4, color: d ? "#5AE89A" : "#6b6358" }}>{d ? "✓" : "○"}</span>;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", padding: isMobile ? "0 12px 40px" : "0 16px 40px" }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <header role="banner" style={{ textAlign: "center", padding: isMobile ? "24px 0 16px" : "40px 0 20px" }}>
        <Brand size="large" />
        <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: isMobile ? 12 : 16, background: "#2a2520", borderRadius: 8, padding: isMobile ? "8px 14px" : "8px 20px", border: "1px solid #3a3530", flexWrap: "wrap", justifyContent: "center" }}>
          <div>
            <span style={{ fontSize: 11, color: "#9B917F", fontFamily: "'DM Mono', monospace" }}>ROOM</span>
            <span style={{ fontSize: isMobile ? 18 : 22, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: GOLD, letterSpacing: "0.15em", marginLeft: 8 }}>{roomCode}</span>
          </div>
          <div style={{ borderLeft: "1px solid #3a3530", paddingLeft: isMobile ? 12 : 16 }}>
            <span style={{ fontSize: 11, color: "#9B917F", fontFamily: "'DM Mono', monospace" }}>PO PIN</span>
            <span style={{ fontSize: isMobile ? 18 : 22, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#E8E0D0", letterSpacing: "0.15em", marginLeft: 8 }}>{poPin}</span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>Share the chamber code with participants. The PO PIN is required to claim the Presiding Officer role.</div>
      </header>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <label style={LS}>Chamber Name <span style={{ color: "#4a4540", textTransform: "none" }}>(optional)</span></label>
          <input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder='e.g. "Prelims House 3"' aria-label="Chamber name" style={IS} />
        </div>
        <div style={{ display: "flex", marginBottom: 24, borderRadius: 8, overflow: "hidden", border: "1px solid #3a3530" }}>
          {[{ key: "roster", label: "Roster", done: hasRoster }, { key: "seating", label: "Seating", done: hasSeating }, { key: "docket", label: "Docket", done: hasDocket }].map(t => (
            <button key={t.key} onClick={() => setStep(t.key)} style={{ flex: 1, padding: "11px 0", background: step === t.key ? GOLD : "transparent", color: step === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: step === t.key ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, textTransform: "uppercase" }}>{t.label}{check(t.done)}</button>
          ))}
        </div>
        {step === "roster" && (<>
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Add Students ({students.length})</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={nameRef} value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudent()} placeholder="Name, then Enter" aria-label="Student name" style={{ ...IS, width: "auto", flex: 1 }} />
              <button onClick={addStudent} style={{ padding: "10px 20px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
              <button onClick={() => setShowPasteBox(p => !p)} style={{ padding: "10px 14px", background: showPasteBox ? "#2a2520" : "transparent", color: showPasteBox ? GOLD : "#9B917F", border: `1px solid ${showPasteBox ? GOLD : "#3a3530"}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Paste List</button>
            </div>
            {showPasteBox && (
              <div style={{ marginTop: 10, padding: 14, background: "#2a2520", borderRadius: 8, border: `1px solid ${GOLD}44` }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Paste a list of names (one per line)</div>
                <textarea id="paste-roster" rows={6} placeholder={"Name 1\nName 2\nName 3\n..."} style={{ width: "100%", background: "#1e1b17", color: "#E8E0D0", border: "1px solid #3a3530", borderRadius: 6, padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontSize: 13, lineHeight: 1.6, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => { const el = document.getElementById("paste-roster"); if (el && el.value.trim()) handlePasteList(el.value); }} style={{ padding: "8px 18px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add All</button>
                  <button onClick={() => setShowPasteBox(false)} style={{ padding: "8px 14px", background: "transparent", color: "#6b6358", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          {students.length > 1 && <button onClick={randomize} style={{ padding: "7px 16px", background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", marginBottom: 16 }}>↻ Randomize Order</button>}
          {students.length > 0 && <p style={{ fontSize: 11, color: "#9B917F", fontStyle: "italic", marginBottom: 10, fontFamily: "'DM Mono', monospace" }}>Order reflects starting speech precedence. Drag to reorder.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {students.map((s, idx) => (
              <div key={s.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={e => handleDragOver(e, idx)} onDragEnd={() => setDragIdx(null)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "grab" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6358", width: 22, textAlign: "right" }}>{idx + 1}.</span>
                <div style={{ flex: 1, background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}cc, ${COLORS[idx % COLORS.length]}99)`, borderRadius: 7, padding: "9px 14px", fontSize: 14, fontWeight: 600, border: dragIdx === idx ? `2px solid ${GOLD}` : "2px solid transparent" }}>{s.name}</div>
                <button onClick={() => removeStudent(s.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>×</button>
              </div>
            ))}
          </div>
          {students.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b6358", fontStyle: "italic" }}>Add students in initial precedence order, or add then randomize.</div>}
          {students.length > 1 && (<div style={{ marginTop: 16, padding: "14px 16px", background: "#2a2520", borderRadius: 8, border: "1px solid #3a3530" }}>
            <label style={{ ...LS, marginBottom: 8 }}>Question Precedence</label>
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530" }}>
              {[{ key: "reverse", label: "Reverse Speaker" }, { key: "random", label: "Randomized" }, { key: "match", label: "Match Speaker" }].map(o => (
                <button key={o.key} onClick={() => setQuestionPrec(o.key)} style={{ flex: 1, padding: "9px 0", background: questionPrec === o.key ? GOLD : "transparent", color: questionPrec === o.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: questionPrec === o.key ? 600 : 400, cursor: "pointer" }}>{o.label}</button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#6b6358", fontStyle: "italic", marginTop: 8, fontFamily: "'DM Mono', monospace" }}>{questionPrec === "reverse" ? "Question tiebreakers use reverse roster order — students with lowest speech precedence ask first." : questionPrec === "random" ? "Question precedence will be shuffled independently of speaker order." : "Question tiebreakers use the same roster order as speeches."}</p>
          </div>)}
        </>)}
        {step === "seating" && (<>
          {students.length < 2 ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b6358", fontStyle: "italic" }}>Add at least 2 students in the Roster tab first.</div> : (<>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div><label style={LS}>Columns</label><select value={cols} onChange={e => setCols(Number(e.target.value))} style={{ ...IS, width: 70, padding: "8px 10px" }}>{[3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={LS}>Rows</label><select value={rows} onChange={e => setRows(Number(e.target.value))} style={{ ...IS, width: 70, padding: "8px 10px" }}>{[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={LS}>Front</label><div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530" }}>{[{ k: "top", a: "▲" }, { k: "bottom", a: "▼" }, { k: "left", a: "◀" }, { k: "right", a: "▶" }].map(o => (<button key={o.k} onClick={() => setFrontSide(o.k)} style={{ padding: "7px 10px", background: frontSide === o.k ? GOLD : "transparent", color: frontSide === o.k ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: frontSide === o.k ? 600 : 400, cursor: "pointer" }}>{o.a}</button>))}</div></div>
            </div>
            <p style={{ fontSize: 12, color: "#9B917F", fontStyle: "italic", marginBottom: 12 }}>Drag to rearrange.</p>
            {frontSide === "top" && <div style={{ textAlign: "center", padding: "6px 0 10px", color: GOLD, fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderBottom: "1px solid #3a3530", marginBottom: 12 }}>▲ Front / PO</div>}
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {frontSide === "left" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "10px 6px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderRight: "1px solid #3a3530", marginRight: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>◀ Front / PO</div>}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, maxWidth: 520, margin: "0 auto", flex: 1 }}>
                {seatingSlots.map((student, idx) => (
                  <div key={student ? `s-${student.id}` : `e-${idx}`} draggable={!!student} onDragStart={() => student && setSeatDrag(idx)} onDragOver={e => handleSeatDragOver(e, idx)} onDragEnd={() => setSeatDrag(null)} style={{ minHeight: 50, borderRadius: 7, border: student ? "none" : "2px dashed #3a3530", display: "flex", alignItems: "center", justifyContent: "center", cursor: student ? "grab" : "default" }}>
                    {student ? <div style={{ width: "100%", background: `linear-gradient(135deg, ${COLORS[student.initialOrder % COLORS.length]}cc, ${COLORS[student.initialOrder % COLORS.length]}99)`, borderRadius: 7, padding: "10px 8px", fontSize: 13, fontWeight: 600, textAlign: "center", border: seatDrag === idx ? `2px solid ${GOLD}` : "2px solid transparent", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: seatDrag === idx ? 0.7 : 1 }}>{student.name}</div> : <span style={{ color: "#3a3530", fontSize: 11 }}>—</span>}
                  </div>
                ))}
              </div>
              {frontSide === "right" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "10px 6px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderLeft: "1px solid #3a3530", marginLeft: 10, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(180deg)" }}>◀ Front / PO</div>}
            </div>
            {frontSide === "bottom" && <div style={{ textAlign: "center", padding: "10px 0 6px", color: GOLD, fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderTop: "1px solid #3a3530", marginTop: 12 }}>▼ Front / PO</div>}
          </>)}
        </>)}
        {step === "docket" && (<>
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Add Legislation ({docket.length})</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={billRef} value={billInput} onChange={e => setBillInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addBill()} placeholder="Bill name, then Enter" aria-label="Bill name" style={{ ...IS, width: "auto", flex: 1 }} />
              <button onClick={addBill} style={{ padding: "10px 20px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#9B917F", fontStyle: "italic", marginBottom: 12 }}>Bills debated in this order.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {docket.map((b, idx) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6358", width: 22, textAlign: "right" }}>{idx + 1}.</span>
                <div style={{ flex: 1, background: "#2a2520", border: "1px solid #3a3530", borderRadius: 7, padding: "9px 14px", fontSize: 14, fontWeight: 600 }}>{b.name}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {idx > 0 && <button onClick={() => moveBill(idx, -1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▲</button>}
                  {idx < docket.length - 1 && <button onClick={() => moveBill(idx, 1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▼</button>}
                </div>
                <button onClick={() => removeBill(b.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>×</button>
              </div>
            ))}
          </div>
          {docket.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b6358", fontStyle: "italic" }}>Add at least one bill.</div>}
        </>)}
        <button disabled={!canStart} onClick={() => { if (containsProfanity(roomName)) { setRoomName(""); profanity.trigger(); return; } const finalStudents = seatingSlots.filter(Boolean).map((s, i) => ({ ...s, questionOrder: questionPrec === "random" ? null : s.initialOrder })); if (questionPrec === "random") { const shuffled = shuffle(finalStudents.map((_, i) => i)); finalStudents.forEach((s, i) => { s.questionOrder = shuffled[i]; }); } onStart({ students: finalStudents, seatingSlots: seatingSlots.map(s => s ? { ...s, questionOrder: finalStudents.find(f => f.id === s.id)?.questionOrder ?? s.initialOrder } : null), cols, rows, docket, frontSide, roomCode, poName: sanitizeInput(poName.trim()), roomName: sanitizeInput(roomName.trim()), poPin, questionPrec }); }} style={{ width: "100%", marginTop: 28, padding: "16px 0", background: canStart ? `linear-gradient(135deg, ${GOLD}, #C49632)` : "#3a3530", color: canStart ? "#1a1714" : "#6b6358", border: "none", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: canStart ? "pointer" : "not-allowed", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {canStart ? "Create Chamber →" : `Complete setup (${[!hasRoster && "Roster", !hasSeating && "Seating", !hasDocket && "Docket"].filter(Boolean).join(", ")})`}
        </button>
      </div>
      {profanity.Toast}
    </div>
  );
}

// ═══ SHARED DISPLAY COMPONENTS ═══
function SeatingGrid({ seatingSlots, cols, frontSide, students, seekers, activeSpeech, mode, interactive, onToggle, poStudentId, lastSpeakerId, inQuestionPeriod }) {
  const getStudent = (id) => students.find(s => s.id === id);
  const isMobile = useIsMobile();
  return (
    <>
      {frontSide === "top" && <div style={{ textAlign: "center", padding: "4px 0 8px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderBottom: "1px solid #2a2520", marginBottom: 8 }}>▲ Front / PO</div>}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {frontSide === "left" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "8px 5px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderRight: "1px solid #2a2520", marginRight: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>◀ PO</div>}
        <div role="grid" aria-label="Seating chart" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: isMobile ? 5 : 10, maxWidth: isMobile ? "100%" : "100%", flex: 1 }}>
          {seatingSlots.map((student, idx) => {
            if (!student) return <div key={idx} role="gridcell" style={{ minHeight: isMobile ? 44 : 64, borderRadius: 8, border: "2px dashed #2a2520" }} />;
            const s = getStudent(student.id); if (!s) return null;
            const isPO = poStudentId && s.id === poStudentId;
            const isSk = seekers?.includes(s.id), isSp = activeSpeech?.studentId === s.id, isLastSpeaker = inQuestionPeriod && lastSpeakerId === s.id, col = COLORS[(s.initialOrder||0) % COLORS.length], locked = (!!activeSpeech && mode === "speech") || isPO || isLastSpeaker;
            return (<div key={idx} role="gridcell" tabIndex={interactive && !locked ? 0 : -1} aria-label={`${s.name}${isPO ? " (PO)" : ""}${isLastSpeaker ? " (Speaker)" : ""}, ${s.speeches||0} speeches, ${s.questions||0} questions${isSk ? ", selected" : ""}${isSp ? ", speaking" : ""}`} aria-pressed={isSk} onClick={() => interactive && !locked && !isPO && onToggle?.(s.id)} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && interactive && !locked && !isPO) { e.preventDefault(); onToggle?.(s.id); } }} style={{ background: isPO ? "#2a2520" : isLastSpeaker ? "linear-gradient(135deg, #2D3A4A, #1E2A3A)" : isSp ? "linear-gradient(135deg, #2D4A3E, #1E3A2E)" : isSk ? `linear-gradient(135deg, ${GOLD}, #C49632)` : `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 5px 5px" : "12px 10px 10px", cursor: interactive && !locked && !isPO ? "pointer" : "default", textAlign: "center", border: isPO ? "2px dashed #3a3530" : isLastSpeaker ? "2px solid #7BA3BF" : isSp ? "2px solid #5AE89A" : isSk ? "2px solid #F0D78C" : "2px solid transparent", transition: "all 0.15s ease", color: isPO ? "#6b6358" : isLastSpeaker ? "#9BB8CF" : isSk ? "#1a1714" : "#E8E0D0", position: "relative", userSelect: "none", opacity: isPO ? 0.4 : isLastSpeaker ? 0.5 : locked && !isSp ? 0.5 : 1, outline: "none" }}>
              {isLastSpeaker && <div style={{ position: "absolute", top: isMobile ? -6 : -8, right: isMobile ? -4 : -6, background: "#7BA3BF", color: "#1a1714", fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 7 : 8, fontWeight: 700, padding: isMobile ? "1px 3px" : "1px 5px", borderRadius: 3, textTransform: "uppercase" }}>Speaker</div>}
              <div style={{ fontSize: isMobile ? 11 : 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: isMobile ? 1 : 4 }}>{s.name}</div>
              {isPO && <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: GOLD, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>PO</div>}
              <div style={{ fontSize: isMobile ? 8 : 10, fontFamily: "'DM Mono', monospace", opacity: 0.75, display: "flex", justifyContent: "center", gap: isMobile ? 4 : 8 }}><span>🎤{s.speeches||0}</span><span>❓{s.questions||0}</span></div>
              {isSk && !isSp && <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "#F0D78C", border: "2px solid #1a1714" }} />}
              {isSp && <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "#5AE89A", border: "2px solid #1a1714" }} />}
            </div>);
          })}
        </div>
        {frontSide === "right" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "8px 5px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderLeft: "1px solid #2a2520", marginLeft: 8, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(180deg)" }}>◀ PO</div>}
      </div>
      {frontSide === "bottom" && <div style={{ textAlign: "center", padding: "8px 0 4px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderTop: "1px solid #2a2520", marginTop: 8 }}>▼ Front / PO</div>}
    </>
  );
}

function OrdersTab({ docket, history, students, currentBillIdx, roundComplete, poName, roomName, poStudentId }) {
  const isMobile = useIsMobile();
  const isPOStudent = (id) => poStudentId && String(id) === String(poStudentId);
  const totalSpeeches = history.filter(h => h.type === "speech").length;
  const totalQuestions = history.filter(h => h.type === "question").length;
  const totalSpeechTime = history.filter(h => h.type === "speech").reduce((a, h) => a + (h.duration || 0), 0);
  const billsPassed = docket.filter(b => b.status === "passed").length;
  const billsFailed = docket.filter(b => b.status === "failed").length;
  const billsDebated = docket.filter(b => b.status).length;
  const studentStats = [...students].sort((a, b) => (b.speeches||0) - (a.speeches||0));

  const exportRecap = () => {
    const now = new Date().toLocaleString();
    const speechHistory = history.filter(h => h.type === "speech");
    const questionHistory = history.filter(h => h.type === "question");
    const billHistory = history.filter(h => h.type === "bill");
    const html = `<!DOCTYPE html><html><head><title>ParliPro Session Recap</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Georgia, serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .meta { font-size: 12px; color: #666; margin-bottom: 24px; font-family: monospace; }
      h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin: 24px 0 10px; font-family: monospace; font-weight: 600; }
      .stats { display: flex; gap: 16px; margin-bottom: 24px; }
      .stat { flex: 1; background: #f5f3f0; border-radius: 8px; padding: 16px; text-align: center; }
      .stat-val { font-size: 28px; font-weight: 600; font-family: monospace; }
      .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-top: 4px; font-family: monospace; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
      th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #ddd; font-family: monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
      td { padding: 8px 10px; border-bottom: 1px solid #eee; }
      .passed { color: #2a7d4f; font-weight: 600; }
      .failed { color: #c44; font-weight: 600; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #aaa; font-family: monospace; }
      .logo-header { text-align: center; margin-bottom: 24px; }
      .logo-header img { height: 80px; margin-bottom: 8px; }
      .logo-header h1 { font-size: 22px; margin: 0; }
      @media print { body { padding: 20px; } }
    </style></head><body>
      <div class="logo-header">
        <img src="/PARLIPRO.png" alt="ParliPro" />
        <h1>Session Recap</h1>
      </div>
      <div class="meta">${roomName ? roomName + " · " : ""}${poName ? "PO: " + poName + " · " : ""}${now}</div>
      <div class="stats">
        <div class="stat"><div class="stat-val">${totalSpeeches}</div><div class="stat-label">Speeches</div></div>
        <div class="stat"><div class="stat-val">${totalQuestions}</div><div class="stat-label">Questions</div></div>
        <div class="stat"><div class="stat-val">${fmtTime(totalSpeechTime)}</div><div class="stat-label">Speech Time</div></div>
      </div>
      <h2>Docket — ${billsDebated}/${docket.length} Debated</h2>
      <table><thead><tr><th>#</th><th>Bill</th><th>Result</th></tr></thead><tbody>
        ${docket.map((b, i) => `<tr><td>${i + 1}</td><td>${b.name}</td><td class="${b.status || ''}">${b.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : "—"}</td></tr>`).join("")}
      </tbody></table>
      <h2>Student Activity</h2>
      <table><thead><tr><th>#</th><th>Name</th><th>Speeches</th><th>Questions</th></tr></thead><tbody>
        ${studentStats.map((s, i) => { const isPO = isPOStudent(s.id); return `<tr style="${isPO ? 'opacity:0.6' : ''}"><td>${isPO ? "—" : i + 1}</td><td>${s.name}${isPO ? ' <span style="color:#D4A843;font-size:10px;font-weight:600">PO</span>' : ""}</td><td>${isPO ? "—" : (s.speeches||0)}</td><td>${isPO ? "—" : (s.questions||0)}</td></tr>`; }).join("")}
      </tbody></table>
      <h2>Speech Log</h2>
      <table><thead><tr><th>#</th><th>Speaker</th><th>Side</th><th>Bill</th><th>Duration</th><th>Time</th></tr></thead><tbody>
        ${speechHistory.reverse().map((h, i) => `<tr><td>${i + 1}</td><td>${h.name}</td><td>${h.side || "—"}</td><td>${h.bill || "—"}</td><td>${h.duration != null ? fmtTime(h.duration) : "—"}</td><td>${new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td></tr>`).join("")}
      </tbody></table>
      ${questionHistory.length > 0 ? `<h2>Question Log</h2>
      <table><thead><tr><th>#</th><th>Questioner</th><th>Bill</th><th>Time</th></tr></thead><tbody>
        ${questionHistory.reverse().map((h, i) => `<tr><td>${i + 1}</td><td>${h.name}</td><td>${h.bill || "—"}</td><td>${new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td></tr>`).join("")}
      </tbody></table>` : ""}
      <div class="footer">Generated by ParliPro · ${now}</div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div role="region" aria-label="Orders of the Day" style={{ flex: 1, padding: isMobile ? 16 : 24, overflow: "auto" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/PARLIPRO.png" alt="ParliPro" style={{ height: 80, display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase" }}>Orders of the Day</div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={exportRecap} aria-label="Export session recap" style={{ padding: "6px 14px", background: "#2a2520", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer", textTransform: "uppercase" }}>Export Recap ↗</button>
        </div>
        <div role="list" aria-label="Session statistics" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[{ l: "Speeches", v: totalSpeeches, c: GOLD }, { l: "Questions", v: totalQuestions, c: "#7BA3BF" }, { l: "Speech Time", v: fmtTime(totalSpeechTime), c: "#E8E0D0" }].map(c => (
            <div key={c.l} role="listitem" style={{ background: "#2a2520", borderRadius: 8, padding: 16, border: "1px solid #3a3530", textAlign: "center" }}><div aria-label={`${c.l}: ${c.v}`} style={{ fontSize: 28, fontWeight: 600, color: c.c, fontFamily: "'DM Mono', monospace" }}>{c.v}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{c.l}</div></div>
          ))}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Docket — {billsDebated}/{docket.length} debated ({billsPassed} passed, {billsFailed} failed)</div>
        <div role="list" aria-label="Docket" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {docket.map((b, i) => (<div key={b.id || i} role="listitem" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#2a2520", borderRadius: 7, border: i === currentBillIdx && !roundComplete ? `1px solid ${GOLD}` : "1px solid #3a3530" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{i + 1}.</span><span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: b.status || i === currentBillIdx ? "#E8E0D0" : "#6b6358" }}>{b.name}</span>{b.status ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span> : i === currentBillIdx && !roundComplete ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: GOLD }}>IN DEBATE</span> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a4540" }}>Pending</span>}</div>))}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Student Activity</div>
        <div role="list" aria-label="Student activity" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {studentStats.map((s, idx) => { const isPO = isPOStudent(s.id); return (<div key={s.id} role="listitem" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: isPO ? "#2a2520" : "#2a2520", borderRadius: 6, border: isPO ? `1px solid ${GOLD}44` : "1px solid #3a3530", opacity: isPO ? 0.7 : 1 }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{isPO ? "—" : idx + 1 - (poStudentId ? studentStats.slice(0, idx).filter(x => isPOStudent(x.id)).length : 0)}</span><span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}{isPO ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD, marginLeft: 8, fontWeight: 600 }}>PO</span> : ""}</span>{!isPO && <><span aria-label={`${s.speeches||0} speeches`} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: GOLD }}>🎤 {s.speeches||0}</span><span aria-label={`${s.questions||0} questions`} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#7BA3BF" }}>❓ {s.questions||0}</span></>}</div>); })}
        </div>
      </div>
    </div>
  );
}

function LogTab({ history }) {
  return (
    <div role="region" aria-label="Activity log" style={{ flex: 1, padding: "20px 24px", maxWidth: 600, margin: "0 auto", overflow: "auto" }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Round Activity Log</div>
      {history.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#6b6358", fontStyle: "italic" }}>No activity yet.</div> : (
        <div role="list" aria-label="Activity entries" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {history.map((entry, idx) => (
            <div key={idx} role="listitem" aria-label={`${entry.type}: ${entry.name}${entry.side ? ", " + entry.side : ""}${entry.status ? ", " + entry.status : ""}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#2a2520", borderRadius: 6, borderLeft: `3px solid ${entry.type === "speech" ? GOLD : entry.type === "question" ? "#7BA3BF" : "#5AE89A"}` }}>
              <span style={{ fontSize: 16 }}>{entry.type === "speech" ? "🎤" : entry.type === "question" ? "❓" : "📜"}</span>
              <span style={{ flex: 1, fontSize: 13 }}>
                <strong>{entry.name}</strong>
                {entry.side && <span style={{ color: GOLD, fontSize: 12 }}> — {entry.side}</span>}
                {entry.status && <span style={{ color: entry.status === "Passed" ? "#5AE89A" : "#C45A5A", fontSize: 12, fontWeight: 600 }}> — {entry.status}</span>}
                {entry.bill && entry.type !== "bill" && <span style={{ color: "#6b6358", fontSize: 11 }}> · {entry.bill}</span>}
                {entry.type === "speech" && entry.duration != null && <span style={{ color: "#9B917F", fontSize: 11 }}> · {fmtTime(entry.duration)}</span>}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>{new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocketTab({ docket, currentBillIdx, roundComplete, editable, onAdd, onRemove, onMove, billInput, setBillInput, inputRef, splits, students, poStudentId }) {
  const [expandedBill, setExpandedBill] = useState(null);
  const getSplitTotals = (billId) => {
    if (!splits) return null;
    let aff = 0, neg = 0;
    Object.entries(splits).forEach(([safeId, studentSplits]) => {
      if (poStudentId && safeId === fbSafe(poStudentId)) return;
      const s = studentSplits[fbSafe(billId)];
      if (s === "aff") aff++;
      else if (s === "neg") neg++;
      else if (s === "both") { aff++; neg++; }
    });
    return (aff > 0 || neg > 0) ? { aff, neg } : null;
  };
  const getSplitNames = (billId) => {
    if (!splits || !students) return { aff: [], neg: [] };
    const affNames = [], negNames = [];
    Object.entries(splits).forEach(([safeId, studentSplits]) => {
      if (poStudentId && safeId === fbSafe(poStudentId)) return;
      const side = studentSplits[fbSafe(billId)];
      const student = students.find(s => fbSafe(s.id) === safeId);
      const name = student ? student.name : safeId;
      if (side === "aff") affNames.push(name);
      else if (side === "neg") negNames.push(name);
      else if (side === "both") { affNames.push(name); negNames.push(name); }
    });
    return { aff: affNames.sort((a, b) => a.localeCompare(b)), neg: negNames.sort((a, b) => a.localeCompare(b)) };
  };
  return (
    <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>{editable ? "Edit Docket" : "Docket"}</div>
        {editable && (<div style={{ display: "flex", gap: 8, marginBottom: 16 }}><input ref={inputRef} value={billInput} onChange={e => setBillInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} placeholder="Add bill..." aria-label="Add bill name" style={{ flex: 1, ...IS }} /><button onClick={onAdd} style={{ padding: "10px 20px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button></div>)}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docket.map((b, idx) => { const isPast = idx < currentBillIdx; const isCurrent = idx === currentBillIdx && !roundComplete; const totals = getSplitTotals(b.id); const isExpanded = expandedBill === b.id; return (
            <div key={b.id || idx}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: isPast ? 0.5 : 1 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6358", width: 22, textAlign: "right" }}>{idx + 1}.</span>
              <div style={{ flex: 1, background: "#2a2520", border: isCurrent ? `1px solid ${GOLD}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 14px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, cursor: totals ? "pointer" : "default" }} onClick={() => totals && setExpandedBill(isExpanded ? null : b.id)}>
                {b.name}{b.status && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span>}{isCurrent && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD }}>CURRENT</span>}
                {totals ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#6b6358", marginLeft: "auto", fontWeight: 600 }}><span style={{ color: "#5AE89A" }}>{totals.aff}A</span>/<span style={{ color: "#C45A5A" }}>{totals.neg}N</span> <span style={{ fontSize: 9, color: "#6b6358" }}>{isExpanded ? "▲" : "▼"}</span></span> : null}
              </div>
              {editable && !isPast && !isCurrent && (<><div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{idx > currentBillIdx + 1 && <button onClick={() => onMove(idx, -1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▲</button>}{idx < docket.length - 1 && <button onClick={() => onMove(idx, 1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▼</button>}</div><button onClick={() => onRemove(b.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>×</button></>)}
            </div>
            {isExpanded && (() => { const names = getSplitNames(b.id); return (
              <div style={{ marginLeft: 30, marginTop: 4, marginBottom: 4, padding: "10px 14px", background: "#1e1b17", borderRadius: 6, border: "1px solid #3a3530", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#5AE89A", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Affirmative ({names.aff.length})</div>
                  {names.aff.length > 0 ? names.aff.map((n, i) => <div key={i} style={{ fontSize: 12, color: "#E8E0D0", padding: "2px 0" }}>{n}</div>) : <div style={{ fontSize: 11, color: "#4a4540", fontStyle: "italic" }}>None</div>}
                </div>
                <div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#C45A5A", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Negative ({names.neg.length})</div>
                  {names.neg.length > 0 ? names.neg.map((n, i) => <div key={i} style={{ fontSize: 12, color: "#E8E0D0", padding: "2px 0" }}>{n}</div>) : <div style={{ fontSize: 11, color: "#4a4540", fontStyle: "italic" }}>None</div>}
                </div>
              </div>
            ); })()}
            </div>); })}
        </div>
      </div>
    </div>
  );
}

// ═══ ROSTER TAB (edit students during round) ═══
function RosterTab({ students, onRename, onAdd }) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [addInput, setAddInput] = useState("");
  const profanity = useProfanityToast();
  const startEdit = (s) => { setEditId(s.id); setEditName(s.name); };
  const saveEdit = () => { const n = sanitizeInput(editName.trim()); if (n) { if (containsProfanity(n)) { setEditName(""); profanity.trigger(); return; } onRename(editId, n); } setEditId(null); setEditName(""); };
  const handleAdd = () => { const n = sanitizeInput(addInput.trim()); if (!n) return; if (containsProfanity(n)) { setAddInput(""); profanity.trigger(); return; } onAdd(n); setAddInput(""); };
  return (
    <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>Edit Roster</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={addInput} onChange={e => setAddInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Add new student..." aria-label="Add student name" style={{ flex: 1, ...IS }} />
          <button onClick={handleAdd} style={{ padding: "10px 20px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
        </div>
        <p style={{ fontSize: 11, color: "#9B917F", fontStyle: "italic", marginBottom: 12, fontFamily: "'DM Mono', monospace" }}>Tap a name to edit it.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {students.map((s, idx) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#2a2520", borderRadius: 7, border: editId === s.id ? `1px solid ${GOLD}` : "1px solid #3a3530" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{idx + 1}</span>
              {editId === s.id ? (
                <><input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveEdit()} autoFocus style={{ flex: 1, ...IS, padding: "6px 10px", fontSize: 13, background: "#1e1b17" }} /><button onClick={saveEdit} style={{ padding: "4px 12px", background: GOLD, color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Save</button><button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 14 }}>×</button></>
              ) : (
                <><span onClick={() => startEdit(s)} style={{ flex: 1, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{s.name}</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>🎤{s.speeches||0} ❓{s.questions||0}</span><button onClick={() => startEdit(s)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 10 }}>✏️</button></>
              )}
            </div>
          ))}
        </div>
      </div>
      {profanity.Toast}
    </div>
  );
}

// ═══ ACTIVE ROUND (PO) ═══
function ActiveRound({ config, onCloseRoom, onReleasePO }) {
  const { students: initStudents, seatingSlots: initSlots, cols, frontSide, docket: initDocket, roomCode, poName, roomName, poPin, questionPrec: configQuestionPrec, poStudentId } = config;

  // Try restoring from session (for rejoin / refresh)
  const restored = (() => {
    try {
      const d = sessionStorage.getItem(`parlipro-po-${roomCode}`);
      if (d) return JSON.parse(d);
    } catch(e) {}
    return null;
  })();

  const [students, setStudents] = useState(restored?.students || initStudents);
  const [seatingSlots, setSeatingSlots] = useState(restored?.seatingSlots || initSlots);
  const [mode, setMode] = useState(restored?.mode || "speech");
  const [seekers, setSeekers] = useState(restored?.seekers || []);
  const [speechCounter, setSpeechCounter] = useState(restored?.speechCounter || 0);
  const [questionCounter, setQuestionCounter] = useState(restored?.questionCounter || 0);
  const [history, setHistory] = useState(restored?.history || []);
  const [activeTab, setActiveTab] = useState("main");
  const [activeSpeech, setActiveSpeech] = useState(restored?.activeSpeech || null);
  const [pendingSpeaker, setPendingSpeaker] = useState(restored?.pendingSpeaker || null);
  const [affCount, setAffCount] = useState(restored?.affCount || 0);
  const [negCount, setNegCount] = useState(restored?.negCount || 0);
  const [speechSequence, setSpeechSequence] = useState(restored?.speechSequence || []);
  const [timerKey, setTimerKey] = useState(0);
  const [isRestoredSpeech, setIsRestoredSpeech] = useState(!!restored?.activeSpeech);
  const timerStateRef = useRef({ elapsed: restored?.timerElapsed || 0, running: restored?.timerRunning || false });
  const [restoredTimerElapsed] = useState(restored?.timerElapsed || 0);
  const [restoredTimerRunning] = useState(restored?.timerRunning || false);
  const [docket, setDocket] = useState(restored?.docket || initDocket);
  const [currentBillIdx, setCurrentBillIdx] = useState(restored?.currentBillIdx || 0);
  const [showPQConfirm, setShowPQConfirm] = useState(false);
  const currentSpeechElapsed = useRef(0);
  const [docketBillInput, setDocketBillInput] = useState("");
  const docketInputRef = useRef(null);
  const [speechStartTime, setSpeechStartTime] = useState(restored?.speechStartTime || null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showReleasePOConfirm, setShowReleasePOConfirm] = useState(false);
  const [competitorIntents, setCompetitorIntents] = useState({});
  const [competitorSplits, setCompetitorSplits] = useState({});
  const [competitorClaims, setCompetitorClaims] = useState({});
  const [spectatorPresence, setSpectatorPresence] = useState({});
  const isMobile = useIsMobile();
  const [showPrec, setShowPrec] = useState(!isMobile);
  const [mobileShowQueue, setMobileShowQueue] = useState(true);
  const [showNextSpeechConfirm, setShowNextSpeechConfirm] = useState(false);
  const [inQuestionPeriod, setInQuestionPeriod] = useState(restored?.inQuestionPeriod || false);
  const [lastSpeakerId, setLastSpeakerId] = useState(restored?.lastSpeakerId || null);
  const [questionBlockNum, setQuestionBlockNum] = useState(restored?.questionBlockNum || 0);
  const [questionBlockTimerKey, setQuestionBlockTimerKey] = useState(0);
  const [activeQuestioner, setActiveQuestioner] = useState(null);
  const [savedSpeechSeekers, setSavedSpeechSeekers] = useState([]);
  const [questionPrec] = useState(restored?.questionPrec || configQuestionPrec || "reverse");
  const profanity = useProfanityToast();

  // Undo stack: stores snapshots of state before each action
  const [undoStack, setUndoStack] = useState([]);

  const currentBill = docket[currentBillIdx] || null;
  const roundComplete = currentBillIdx >= docket.length;
  const getStudent = (id) => students.find(s => s.id === id);

  const captureSnapshot = () => ({
    students: JSON.parse(JSON.stringify(students)),
    mode, seekers: [...seekers], speechCounter, questionCounter,
    history: [...history], activeSpeech: activeSpeech ? { ...activeSpeech } : null,
    pendingSpeaker, affCount, negCount, speechSequence: [...speechSequence],
    docket: JSON.parse(JSON.stringify(docket)), currentBillIdx,
    speechStartTime, inQuestionPeriod,
  });

  const pushUndo = () => setUndoStack(p => [...p.slice(-20), captureSnapshot()]);

  const undo = () => {
    if (undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setUndoStack(p => p.slice(0, -1));
    setStudents(snap.students); setMode(snap.mode); setSeekers(snap.seekers);
    setSpeechCounter(snap.speechCounter); setQuestionCounter(snap.questionCounter);
    setHistory(snap.history); setActiveSpeech(snap.activeSpeech);
    setPendingSpeaker(snap.pendingSpeaker); setAffCount(snap.affCount);
    setNegCount(snap.negCount); setSpeechSequence(snap.speechSequence);
    setDocket(snap.docket); setCurrentBillIdx(snap.currentBillIdx);
    setSpeechStartTime(snap.speechStartTime); setInQuestionPeriod(snap.inQuestionPeriod || false);
    setTimerKey(k => k + 1);
  };

  // Firebase sync — debounced to batch rapid state changes
  const syncTimerRef = useRef(null);
  const syncToFirebase = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const state = {
        students, seatingSlots, docket,
        mode, seekers, speechCounter, questionCounter,
        history: history.map(h => ({ ...h, time: typeof h.time === 'object' ? h.time.getTime() : h.time })),
        activeSpeech, currentBillIdx, roundComplete: currentBillIdx >= docket.length,
        speechStartTime: speechStartTime || null,
        speechElapsed: currentSpeechElapsed.current || 0,
        affCount, negCount, speechSequence, inQuestionPeriod, questionPrec,
        poStudentId: poStudentId || null, lastSpeakerId: lastSpeakerId || null, questionBlockNum: questionBlockNum || 0,
      };
      writeRoomState(roomCode, state).catch(console.error);
    }, 150);
  }, [students, seatingSlots, docket, mode, seekers, speechCounter, questionCounter, history, activeSpeech, currentBillIdx, speechStartTime, affCount, negCount, speechSequence, inQuestionPeriod, questionPrec, roomCode, lastSpeakerId]);

  useEffect(() => { syncToFirebase(); return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); }; }, [syncToFirebase]);

  // PO heartbeat — proves this session is active (every 5 seconds)
  useEffect(() => {
    updateHeartbeat(roomCode).catch(console.error);
    const iv = setInterval(() => {
      updateHeartbeat(roomCode).catch(console.error);
    }, 30000);
    return () => clearInterval(iv);
  }, [roomCode]);

  // Subscribe to competitor intents and splits
  useEffect(() => {
    const unsub = subscribeToRoom(roomCode, (data) => {
      if (data?.competitorIntents) setCompetitorIntents(data.competitorIntents);
      if (data?.splits) setCompetitorSplits(data.splits);
      setCompetitorClaims(data?.competitorClaims || {});
      setSpectatorPresence(data?.spectatorPresence || {});
    });
    return unsub;
  }, [roomCode]);

  // Sync elapsed timer to Firebase every 5 seconds during speech (spectators interpolate locally)
  useEffect(() => {
    if (!activeSpeech) return;
    const iv = setInterval(() => {
      updateRoomElapsed(roomCode, currentSpeechElapsed.current).catch(console.error);
    }, 5000);
    return () => clearInterval(iv);
  }, [activeSpeech, roomCode]);

  // Session persistence
  useEffect(() => {
    const save = {
      students, seatingSlots, cols, frontSide, docket, roomCode, poName, roomName: roomName || "", poPin: poPin || "",
      mode, seekers, speechCounter, questionCounter, history,
      activeSpeech, pendingSpeaker, affCount, negCount, speechSequence,
      currentBillIdx, speechStartTime, inQuestionPeriod, questionPrec, lastSpeakerId, questionBlockNum,
      timerElapsed: timerStateRef.current.elapsed, timerRunning: timerStateRef.current.running,
    };
    try { sessionStorage.setItem(`parlipro-po-${roomCode}`, JSON.stringify(save)); } catch(e) {}
  });

  const toggleSeeker = (id) => { if (id === poStudentId) return; if (inQuestionPeriod && id === lastSpeakerId) return; if (activeSpeech && mode === "speech") return; if (mode === "speech" && inQuestionPeriod) return; if (mode === "question" && !inQuestionPeriod) return; setSeekers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const activeSeekers = mode === "speech" && inQuestionPeriod ? savedSpeechSeekers : seekers;
  const sortedSeekers = (() => sortPrec(activeSeekers.map(id => getStudent(id)).filter(Boolean), mode, questionPrec))();

  const getNextSpeechInfo = () => {
    if (speechSequence.length === 0) return { needsChoice: true };
    if (speechSequence.length === 1) return { side: "neg", label: "1st Negative", canOverride: false };
    const last = speechSequence[speechSequence.length - 1];
    const sug = last === "neg" ? "aff" : "neg";
    const n = sug === "aff" ? affCount + 1 : negCount + 1;
    return { side: sug, label: `${ordinal(n)} ${sug === "aff" ? "Affirmative" : "Negative"}`, canOverride: true };
  };

  const breakCycle = () => { pushUndo(); const info = getNextSpeechInfo(); if (!info.canOverride) return; setSpeechSequence(p => [...p, info.side]); };
  const recognizeSpeaker = (id) => { pushUndo(); const info = getNextSpeechInfo(); if (info.needsChoice) setPendingSpeaker(id); else startSpeech(id, info.side, info.label); };

  const startSpeech = (id, side, label) => {
    // pushUndo already called by recognizeSpeaker or choice button
    const student = getStudent(id); if (!student) return;
    const nc = speechCounter + 1; setSpeechCounter(nc);
    if (side === "aff" || side === "author" || side === "sponsor") setAffCount(c => c + 1);
    if (side === "neg") setNegCount(c => c + 1);
    setSpeechSequence(p => [...p, (side === "author" || side === "sponsor") ? "aff" : side]);
    setStudents(p => p.map(s => s.id === id ? { ...s, speeches: (s.speeches||0) + 1, speechHistory: [...(s.speechHistory||[]), nc] } : s));
    setActiveSpeech({ studentId: id, side: label, speechNumber: nc });
    setPendingSpeaker(null); setSeekers([]); setTimerKey(k => k + 1); currentSpeechElapsed.current = 0;
    setSpeechStartTime(Date.now()); setIsRestoredSpeech(false);
  };

  const startSpeechFromChoice = (id, side, label) => { pushUndo(); startSpeech(id, side, label); };

  const endSpeech = () => {
    pushUndo();
    const dur = currentSpeechElapsed.current;
    const sp = getStudent(activeSpeech.studentId);
    const side = activeSpeech.side;
    // Determine question blocks: author/sponsor/1st neg get 4, others get 2
    const is4Block = /authorship|sponsorship|1st negative/i.test(side);
    setHistory(p => [{ type: "speech", name: sp?.name, number: activeSpeech.speechNumber, side: activeSpeech.side, bill: currentBill?.name, duration: dur, time: Date.now(), questionBlocks: is4Block ? 4 : 2 }, ...p]);
    setLastSpeakerId(activeSpeech.studentId); setActiveSpeech(null); setMode("question"); setSeekers([]); setSpeechStartTime(null); setInQuestionPeriod(true); setSavedSpeechSeekers([]);
    setQuestionBlockNum(0); setActiveQuestioner(null);
  };

  const recognizeQuestioner = (id) => {
    pushUndo();
    const student = getStudent(id); if (!student) return;
    const nc = questionCounter + 1; setQuestionCounter(nc);
    setStudents(p => p.map(s => s.id === id ? { ...s, questions: (s.questions||0) + 1, questionHistory: [...(s.questionHistory||[]), nc] } : s));
    setHistory(p => [{ type: "question", name: student.name, number: nc, bill: currentBill?.name, time: Date.now() }, ...p]);
    setSeekers(p => p.filter(x => x !== id));
    // First Ask = block 1, each subsequent Ask advances to next block
    setQuestionBlockNum(n => n + 1);
    setActiveQuestioner(student.name);
    setQuestionBlockTimerKey(k => k + 1);
  };

  const removeSeeker = (id) => setSeekers(p => p.filter(x => x !== id));
  const switchToSpeechMode = () => { setMode("speech"); setSeekers([]); setActiveSpeech(null); setInQuestionPeriod(false); setSavedSpeechSeekers([]); setLastSpeakerId(null); setQuestionBlockNum(0); setActiveQuestioner(null); };

  const resolveBill = (passed) => {
    pushUndo();
    setDocket(p => p.map((b, i) => i === currentBillIdx ? { ...b, status: passed ? "passed" : "failed" } : b));
    setHistory(p => [{ type: "bill", name: currentBill?.name, status: passed ? "Passed" : "Failed", time: Date.now() }, ...p]);
    setAffCount(0); setNegCount(0); setSpeechSequence([]); setActiveSpeech(null); setPendingSpeaker(null); setSeekers([]); setMode("speech"); setSpeechStartTime(null); setInQuestionPeriod(false); setLastSpeakerId(null); setQuestionBlockNum(0); setActiveQuestioner(null);
    const nextIdx = currentBillIdx + 1;
    setCurrentBillIdx(nextIdx);
    setShowPQConfirm(false);
    if (nextIdx >= docket.length) setActiveTab("orders");
  };

  const addBillLive = () => { const n = sanitizeInput(docketBillInput.trim()); if (!n) return; if (containsProfanity(n)) { setDocketBillInput(""); profanity.trigger(); return; } setDocket(p => [...p, { id: Date.now() + Math.random(), name: n, status: null }]); setDocketBillInput(""); };
  const removeBillLive = (id) => { const idx = docket.findIndex(b => b.id === id); if (idx <= currentBillIdx) return; setDocket(p => p.filter(b => b.id !== id)); };
  const moveBillLive = (idx, dir) => { if (idx <= currentBillIdx) return; const ns = [...docket]; const [item] = ns.splice(idx, 1); ns.splice(idx + dir, 0, item); setDocket(ns); };

  const renameStudent = (id, newName) => {
    setStudents(p => p.map(s => s.id === id ? { ...s, name: newName } : s));
    setSeatingSlots(p => p.map(s => s && s.id === id ? { ...s, name: newName } : s));
  };

  const addStudentLive = (name) => {
    const qOrder = questionPrec === "random" ? Math.floor(Math.random() * 1000) : students.length;
    const newStudent = { id: Date.now() + Math.random(), name, speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: students.length, questionOrder: qOrder };
    setStudents(p => [...p, newStudent]);
    // Add to first empty seat
    setSeatingSlots(p => {
      const idx = p.findIndex(s => !s);
      if (idx >= 0) { const ns = [...p]; ns[idx] = newStudent; return ns; }
      return [...p, newStudent]; // append if no empty seats
    });
  };

  const handleCloseRoom = () => {
    clearPOHeartbeat(roomCode).catch(console.error);
    deleteRoom(roomCode).catch(console.error);
    try { sessionStorage.removeItem(`parlipro-po-${roomCode}`); sessionStorage.removeItem('parlipro-session'); } catch(e) {}
    onCloseRoom();
  };

  const nextInfo = getNextSpeechInfo();
  const displayName = roomName || `Chamber ${roomCode}`;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "column" }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <header role="banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "8px 12px" : "10px 20px", borderBottom: "1px solid #2a2520", flexWrap: "wrap", gap: 8, flexShrink: 0, position: isMobile ? "sticky" : undefined, top: isMobile ? 0 : undefined, zIndex: isMobile ? 10 : undefined, background: isMobile ? "#1a1714" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, minWidth: 0 }}>
          {!isMobile && <Brand size="small" />}
          <div style={{ borderLeft: isMobile ? "none" : "1px solid #3a3530", paddingLeft: isMobile ? 0 : 12, minWidth: 0 }}>
            {!roundComplete && currentBill && (<div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", background: "#2a2520", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{currentBillIdx + 1}/{docket.length}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentBill.name}</span></div>)}
            {roundComplete && <div style={{ fontSize: 13, color: "#5AE89A", fontFamily: "'DM Mono', monospace" }}>All bills debated</div>}
            {!isMobile && <div style={{ fontSize: 10, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>PO: {poStudentId ? (students.find(s => s.id === poStudentId)?.name || poName) : poName} · {displayName}</div>}
            {isMobile && <div style={{ fontSize: 9, color: "#6b6358", fontFamily: "'DM Mono', monospace" }}>{displayName}</div>}
          </div>
          {poStudentId && (() => { const poStudentName = students.find(s => s.id === poStudentId)?.name; return poStudentName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: isMobile ? "auto" : 8 }}>
              <div style={{ background: `linear-gradient(135deg, ${GOLD}cc, ${GOLD}99)`, borderRadius: 5, padding: "3px 8px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#1a1714" }}>{poStudentName}</span>
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: "#6b6358", textTransform: "uppercase" }}>PO</span>
              {!showReleasePOConfirm ? (
                <button onClick={() => setShowReleasePOConfirm(true)} style={{ background: "none", border: "none", color: "#6b6358", fontSize: 9, fontFamily: "'DM Mono', monospace", cursor: "pointer", textDecoration: "underline" }}>release</button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#2a2520", border: "1px solid #3a3530", borderRadius: 4, padding: "3px 6px" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#E8A0A0" }}>Release PO role?</span>
                  <button onClick={() => { setShowReleasePOConfirm(false); onReleasePO(roomCode); }} style={{ padding: "2px 6px", background: "#4A2D2D", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 3, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 600, cursor: "pointer" }}>Yes</button>
                  <button onClick={() => setShowReleasePOConfirm(false)} style={{ padding: "2px 6px", background: "#2a2520", color: "#6b6358", border: "1px solid #3a3530", borderRadius: 3, fontFamily: "'DM Mono', monospace", fontSize: 9, cursor: "pointer" }}>No</button>
                </div>
              )}
              {(() => { const claimCount = Object.keys(competitorClaims).filter(k => { const c = competitorClaims[k]; return c && c.claimedAt && (Date.now() - c.claimedAt) < STALE_MS; }).length + (poStudentId ? 1 : 0); const specCount = Object.keys(spectatorPresence).filter(k => { const s = spectatorPresence[k]; return s && s.heartbeat && (Date.now() - s.heartbeat) < STALE_MS; }).length; return (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", marginLeft: 4 }}>
                  <span style={{ color: GOLD, fontWeight: 600 }}>{claimCount}/{students.length}</span> <span style={{ color: "#9B917F" }}>comp</span> · <span style={{ color: "#7BA3BF", fontWeight: 600 }}>{specCount}</span> <span style={{ color: "#9B917F" }}>spec</span>
                </span>
              ); })()}
            </div>
          ) : null; })()}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
          <div role="tablist" aria-label="View tabs" style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530", flexShrink: 0 }}>
            {[{ key: "main", label: "Chamber" }, { key: "docket", label: "Docket" }, { key: "roster", label: "Roster" }, { key: "orders", label: "Orders" }, { key: "log", label: "Log" }].map(t => (
              <button key={t.key} role="tab" aria-selected={activeTab === t.key} onClick={() => setActiveTab(t.key)} style={{ padding: isMobile ? "6px 7px" : "6px 10px", background: activeTab === t.key ? GOLD : "transparent", color: activeTab === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 9 : 10, fontWeight: activeTab === t.key ? 600 : 400, cursor: "pointer", textTransform: "uppercase" }}>{t.label}</button>
            ))}
          </div>
          {!isMobile && <div style={{ background: "#2a2520", borderRadius: 6, padding: "5px 10px", border: "1px solid #3a3530", fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: "#9B917F" }}>CHAMBER </span>
              <span style={{ fontSize: 13, color: GOLD, fontWeight: 500, letterSpacing: "0.1em" }}>{roomCode}</span>
              <button onClick={() => copyToClipboard(roomCode)} title="Copy chamber code" style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>📋</button>
              <span style={{ fontSize: 9, color: "#6b6358", marginLeft: 4 }}>PIN </span>
              <span style={{ fontSize: 11, color: "#9B917F", letterSpacing: "0.1em" }}>{poPin}</span>
          </div>}
          {isMobile && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#9B917F", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: GOLD, fontWeight: 500, fontSize: 11, letterSpacing: "0.08em" }}>{roomCode}</span>
            <button onClick={() => copyToClipboard(roomCode)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 10, padding: 0 }}>📋</button>
            <span style={{ color: "#6b6358", marginLeft: 4 }}>PIN </span>
            <span style={{ letterSpacing: "0.08em" }}>{poPin}</span>
          </div>}
          {undoStack.length > 0 && <button onClick={undo} style={{ padding: "5px 10px", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>↩ Undo</button>}
          <button onClick={() => setShowCloseConfirm(true)} style={{ padding: "5px 10px", background: "transparent", color: "#C45A5A", border: "1px solid #6B3A3A", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>Close</button>
        </div>
      </header>

      {/* Close Chamber Confirmation */}
      {showCloseConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#231f1b", border: `1px solid ${GOLD}`, borderRadius: 12, padding: 28, maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Close Chamber?</div>
            <p style={{ fontSize: 14, color: "#E8E0D0", marginBottom: 20 }}>This will end the session for all spectators and delete the chamber. This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowCloseConfirm(false)} style={{ flex: 1, padding: "10px", background: "#2a2520", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleCloseRoom} style={{ flex: 1, padding: "10px", background: "#4A2D2D", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close Chamber</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "main" && !roundComplete ? (
        <div style={{ display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "row", flex: isMobile ? undefined : 1, overflow: isMobile ? "visible" : "hidden" }}>
          <div style={{ flex: isMobile ? undefined : 1, overflow: isMobile ? "visible" : "auto", minWidth: 0, display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "column" }}>
            <div style={{ padding: isMobile ? "12px 12px" : "20px 24px" }}>
              {!activeSpeech && (<div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1px solid #3a3530", maxWidth: 320 }}>
                {[{ key: "speech", label: `🎤 Speeches (${speechCounter})` }, { key: "question", label: `❓ Questions (${questionCounter})` }].map(t => (
                  <button key={t.key} onClick={() => {
                    if (t.key === mode) return;
                    if (t.key === "question" && mode === "speech") {
                      setSavedSpeechSeekers(seekers);
                      setSeekers([]);
                      setMode("question");
                    } else if (t.key === "speech" && mode === "question") {
                      if (inQuestionPeriod) { setMode("speech"); return; }
                      setSeekers(savedSpeechSeekers);
                      setSavedSpeechSeekers([]);
                      setMode("speech");
                    }
                  }} style={{ flex: 1, padding: "8px 0", background: mode === t.key ? GOLD : "transparent", color: mode === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: mode === t.key ? 600 : 400, cursor: "pointer", textTransform: "uppercase" }}>{t.label}</button>
                ))}
              </div>)}
              {activeSpeech && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>🎤 Speech in progress</div>}
              {!activeSpeech && mode === "question" && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#7BA3BF", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>❓ Question period</div>}
              <SeatingGrid seatingSlots={seatingSlots} cols={cols} frontSide={frontSide} students={students} seekers={mode === "speech" && inQuestionPeriod ? savedSpeechSeekers : seekers} activeSpeech={activeSpeech} mode={mode} interactive={true} onToggle={toggleSeeker} poStudentId={poStudentId} lastSpeakerId={lastSpeakerId} inQuestionPeriod={inQuestionPeriod} />
              {(() => { const competitorCount = students.filter(s => s.id !== poStudentId).length; const majority = Math.floor(competitorCount / 2) + 1; const twoThirds = Math.ceil(competitorCount * 2 / 3); return (
                <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 16 : 24, marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 9 : 10, color: "#6b6358" }}>
                  <span>Members: <span style={{ color: "#9B917F", fontWeight: 600 }}>{competitorCount}</span></span>
                  <span>Majority: <span style={{ color: GOLD, fontWeight: 600 }}>{majority}</span></span>
                  <span>2/3: <span style={{ color: "#7BA3BF", fontWeight: 600 }}>{twoThirds}</span></span>
                </div>
              ); })()}
            </div>
            <div style={{ padding: isMobile ? "0 12px 12px" : "0 24px 20px", flexShrink: 0 }}>
              {pendingSpeaker && (() => { const ps = getStudent(pendingSpeaker); return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #3a3530", padding: isMobile ? "12px" : "16px 20px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, flexWrap: "wrap" }}><div><div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600 }}>{ps?.name}</div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", marginTop: 3, textTransform: "uppercase" }}>First speech — select type</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[{ key: "author", label: "Authorship", bg: "#2D3B4A" }, { key: "sponsor", label: "Sponsorship", bg: "#3B2D4A" }].map(o => (<button key={o.key} onClick={() => startSpeechFromChoice(pendingSpeaker, o.key, o.label)} style={{ padding: isMobile ? "8px 12px" : "10px 16px", background: o.bg, color: "#E8E0D0", border: "1px solid #3a3530", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: "pointer" }}>{o.label}</button>))}</div><button onClick={() => { pushUndo(); setPendingSpeaker(null); }} style={{ background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 6, padding: "6px 14px", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button></div>); })()}
              {activeSpeech && !pendingSpeaker && (() => { const sp = getStudent(activeSpeech.studentId), col = COLORS[(sp?.initialOrder||0) % COLORS.length]; return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #5AE89A44", padding: isMobile ? "12px" : "14px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}><div style={{ background: `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", border: "2px solid #5AE89A" }}><div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{sp?.name}</div></div><div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 10 : 12, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>{activeSpeech.side}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6b6358", marginTop: 2 }}>Speech #{activeSpeech.speechNumber}</div></div></div><SpeechTimer key={timerKey} isRestore={isRestoredSpeech} savedElapsed={restoredTimerElapsed} savedRunning={restoredTimerRunning} onTick={e => { currentSpeechElapsed.current = e; }} onStateChange={(e, r) => { timerStateRef.current = { elapsed: e, running: r }; try { const d = sessionStorage.getItem(`parlipro-po-${roomCode}`); if (d) { const s = JSON.parse(d); s.timerElapsed = e; s.timerRunning = r; sessionStorage.setItem(`parlipro-po-${roomCode}`, JSON.stringify(s)); } } catch(err) {} }} /><button aria-label="End speech and start questions" onClick={endSpeech} style={{ padding: isMobile ? "8px 14px" : "8px 18px", background: "linear-gradient(135deg, #4A2D2D, #3A1E1E)", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", marginLeft: isMobile ? 0 : "auto" }}>End Speech → Questions</button></div>); })()}
              {!activeSpeech && !pendingSpeaker && mode === "question" && inQuestionPeriod && (() => { const lastSpeech = history.find(h => h.type === "speech"); const totalBlocks = lastSpeech?.questionBlocks || (/authorship|sponsorship|1st negative/i.test(lastSpeech?.side || "") ? 4 : 2); const currentBlock = Math.min(questionBlockNum, totalBlocks); const blocksExhausted = currentBlock >= totalBlocks; return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #7BA3BF44", padding: isMobile ? "12px" : "14px 20px", marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: activeQuestioner ? 10 : 0 }}>
                  <div>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#7BA3BF", textTransform: "uppercase", fontWeight: 600 }}>❓ Questioning{currentBlock > 0 ? ` — Block ${currentBlock}/${totalBlocks}` : ""}</span>
                    {lastSpeech && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", marginTop: 2 }}>{lastSpeech.side} · Speech #{lastSpeech.number}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {Array.from({ length: totalBlocks }, (_, i) => (
                        <div key={i} style={{ width: isMobile ? 16 : 20, height: 6, borderRadius: 3, background: i < currentBlock ? "#7BA3BF" : "#3a3530" }} />
                      ))}
                    </div>
                    <button onClick={() => { pushUndo(); switchToSpeechMode(); }} style={{ padding: "6px 18px", background: `linear-gradient(135deg, ${GOLD}, #C49632)`, color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Next Speech →</button>
                  </div>
                </div>
                {activeQuestioner && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 12 : 14, color: "#E8E0D0", fontWeight: 600 }}>{activeQuestioner}</div>
                    <QuestionBlockTimer key={questionBlockTimerKey} timerKey={questionBlockTimerKey} />
                  </div>
                )}
                {!activeQuestioner && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4a4540", fontStyle: "italic", marginTop: 6 }}>{blocksExhausted ? "All question blocks used" : "Select a questioner from the queue to begin"}</div>}
              </div>); })()}
              {!activeSpeech && !pendingSpeaker && mode === "speech" && activeSeekers.length === 0 && (<div style={{ padding: "8px 0", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4a4540", fontStyle: "italic" }}>{nextInfo.needsChoice ? "Recognize a speaker to begin the first speech" : `Next: ${nextInfo.label}`}</div>)}
            </div>
            {/* Mobile queue toggle button */}
            {isMobile && (
              <button onClick={() => setMobileShowQueue(q => !q)} style={{ margin: "0 12px 8px", padding: "10px", background: mobileShowQueue ? GOLD : "#2a2520", color: mobileShowQueue ? "#1a1714" : (mode === "speech" ? GOLD : "#7BA3BF"), border: `1px solid ${mobileShowQueue ? GOLD : "#3a3530"}`, borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {mobileShowQueue ? "▼ Hide Queue" : `▲ ${mode === "speech" ? "Speech" : "Question"} Queue (${activeSeekers.length})`}
              </button>
            )}
          </div>
          {/* RIGHT QUEUE - desktop always visible, mobile toggled */}
          {(!isMobile || mobileShowQueue) && (
          <div style={{ width: isMobile ? "100%" : 250, borderLeft: isMobile ? "none" : "1px solid #2a2520", borderTop: isMobile ? "1px solid #2a2520" : "none", padding: isMobile ? "12px" : "16px 14px", display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "auto", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: mode === "speech" ? GOLD : "#7BA3BF", letterSpacing: "0.1em", textTransform: "uppercase" }}>{mode === "speech" ? "Speech" : "Question"} Queue</span>
              {activeSeekers.length > 0 && !activeSpeech && <button onClick={() => setSeekers([])} style={{ background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 4, padding: "2px 8px", fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>Clear</button>}
            </div>
            {mode === "speech" && !activeSpeech && activeSeekers.length === 0 && !showPQConfirm && (<div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {!nextInfo.needsChoice && nextInfo.canOverride && (<><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", textTransform: "uppercase" }}>Up next: {nextInfo.label}</div><button onClick={breakCycle} style={{ width: "100%", padding: "8px 0", background: "transparent", color: "#C45A5A", border: "1px solid #6B3A3A", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase" }}>⚡ Break Cycle → {nextInfo.side === "aff" ? "Neg" : "Aff"}</button></>)}
              {speechSequence.length > 0 && <button onClick={() => setShowPQConfirm(true)} style={{ width: "100%", padding: "8px 0", background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase" }}>📜 Move to Previous Question</button>}
            </div>)}
            {showPQConfirm && (<div style={{ background: "#2a2520", borderRadius: 8, border: `1px solid ${GOLD}`, padding: 16, marginBottom: 12 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>Vote: {currentBill?.name}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => resolveBill(true)} style={{ flex: 1, padding: "10px 0", background: "#2D4A3E", color: "#5AE89A", border: "1px solid #3A6B4E", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>✓ Passed</button>
                <button onClick={() => resolveBill(false)} style={{ flex: 1, padding: "10px 0", background: "#4A2D2D", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>✗ Failed</button>
              </div>
              <button onClick={() => setShowPQConfirm(false)} style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 6, padding: "6px 0", fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>Cancel</button>
            </div>)}
            {sortedSeekers.length > 0 && (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedSeekers.map((s, idx) => { const isTop = idx === 0; return (<div key={s.id}>{isTop && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: mode === "speech" ? GOLD : "#7BA3BF", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>▶ Highest Precedence</div>}<div style={{ display: "flex", alignItems: "center", gap: 8, background: isTop ? `linear-gradient(135deg, ${GOLD}33, #C4963222)` : "#2a2520", border: isTop ? `1px solid ${mode === "speech" ? GOLD : "#7BA3BF"}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 10px" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: isTop ? GOLD : "#6b6358", width: 16, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div><div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 2 }}>🎤{s.speeches||0} ❓{s.questions||0}</div></div><div style={{ display: "flex", gap: 4, flexShrink: 0 }}>{isTop && !activeSpeech && mode === "speech" && !inQuestionPeriod && <button onClick={() => recognizeSpeaker(s.id)} style={{ padding: "4px 8px", background: GOLD, color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }} aria-label="Recognize speaker">Recognize</button>}{isTop && !activeSpeech && mode === "question" && inQuestionPeriod && <button onClick={() => recognizeQuestioner(s.id)} style={{ padding: "4px 8px", background: "#7BA3BF", color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }} aria-label="Recognize questioner">Ask</button>}<button aria-label={"Remove " + s.name + " from queue"} onClick={() => removeSeeker(s.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}>×</button></div></div></div>); })}
            </div>)}
            {sortedSeekers.length === 0 && !showPQConfirm && !(mode === "speech" && !activeSpeech && activeSeekers.length === 0) && (<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4540", fontStyle: "italic", fontSize: 13, textAlign: "center", padding: 20 }}>{activeSpeech ? "Speech in progress" : mode === "question" ? "Tap students for question queue" : "Select seekers"}</div>)}
          </div>
          )}
        </div>
      ) : activeTab === "main" && roundComplete ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#5AE89A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>All legislation debated</div>
            <button onClick={() => setActiveTab("orders")} style={{ padding: "10px 24px", background: GOLD, color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View Orders of the Day</button>
          </div>
        </div>
      ) : activeTab === "orders" ? (
        <OrdersTab docket={docket} history={history} students={students} currentBillIdx={currentBillIdx} roundComplete={roundComplete} poName={poName} roomName={roomName} poStudentId={poStudentId} />
      ) : activeTab === "docket" ? (
        <DocketTab docket={docket} currentBillIdx={currentBillIdx} roundComplete={roundComplete} editable={true} onAdd={addBillLive} onRemove={removeBillLive} onMove={moveBillLive} billInput={docketBillInput} setBillInput={setDocketBillInput} inputRef={docketInputRef} splits={competitorSplits} students={students} poStudentId={poStudentId} />
      ) : activeTab === "roster" ? (
        <RosterTab students={students} onRename={renameStudent} onAdd={addStudentLive} />
      ) : (
        <LogTab history={history} />
      )}
      {activeTab === "main" && !roundComplete && (
        <div style={{ position: "sticky", bottom: 0, background: "#1e1b17", borderTop: "1px solid #2a2520", zIndex: 10 }}>
          <button onClick={() => setShowPrec(p => !p)} style={{ width: "100%", padding: isMobile ? "6px 12px" : "8px 20px", background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase" }}>Precedence</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>{showPrec ? "▼" : "▲"}</span>
          </button>
          {showPrec && (<div style={{ padding: isMobile ? "0 12px 8px" : "0 20px 10px", maxHeight: isMobile ? "35vh" : "30vh", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 10 : 20 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Speech Precedence</div>
              {sortPrec(students.filter(s => s.id !== poStudentId), "speech", questionPrec).map((s, idx) => { const intent = competitorIntents[fbSafe(s.id)] || {}; const hasIntent = intent.speech; return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", background: hasIntent ? `${GOLD}15` : "transparent", borderRadius: 3, border: hasIntent ? `1px solid ${GOLD}33` : "1px solid transparent", marginBottom: 1 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: idx === 0 ? GOLD : "#6b6358", width: 14, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: hasIntent ? 600 : 400, color: hasIntent ? GOLD : idx === 0 ? GOLD : "#9B917F", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                  {hasIntent && <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />}
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", flexShrink: 0 }}>{s.speeches||0}</span>
                </div>
              ); })}
            </div>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#7BA3BF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Question Precedence</div>
              {sortPrec(students.filter(s => s.id !== poStudentId), "question", questionPrec).map((s, idx) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", marginBottom: 1 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: idx === 0 ? "#7BA3BF" : "#6b6358", width: 14, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                  <span style={{ fontSize: isMobile ? 10 : 11, color: idx === 0 ? "#7BA3BF" : "#9B917F", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", flexShrink: 0 }}>{s.questions||0}</span>
                </div>
              ))}
            </div>
          </div>
          </div>)}
        </div>
      )}
      {profanity.Toast}
    </div>
  );
}

// ═══ SPECTATOR VIEW ═══
function SpectatorView({ roomCode, competitorId, competitorName, onClaimPO, onSelectName, createdPin, onDismissPin, onGoHome }) {
  const [state, setState] = useState(null);
  const [activeTab, setActiveTab] = useState("main");
  const [disconnected, setDisconnected] = useState(false);
  const isMobile = useIsMobile();
  const [mobileShowQueue, setMobileShowQueue] = useState(true);
  const [wantSpeech, setWantSpeech] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [showSwitchPicker, setShowSwitchPicker] = useState(false);
  const [showPrec, setShowPrec] = useState(!isMobile);
  const [expandedSplitBill, setExpandedSplitBill] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const isCompetitor = !!competitorId;
  const prevSpeechRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeToRoom(roomCode, (data) => {
      if (data && data.students) { setState(data); setDisconnected(false); }
      else setDisconnected(true);
    });
    return unsub;
  }, [roomCode]);

  // Competitor: claim name heartbeat
  useEffect(() => {
    if (!isCompetitor || disconnected) return;
    claimCompetitorName(roomCode, competitorId).catch(console.error);
    const iv = setInterval(() => {
      claimCompetitorName(roomCode, competitorId).catch(console.error);
    }, 30000);
    return () => {
      clearInterval(iv);
      if (!disconnected) releaseCompetitorName(roomCode, competitorId).catch(console.error);
    };
  }, [roomCode, competitorId, isCompetitor, disconnected]);

  // Competitor: sync intents to Firebase
  useEffect(() => {
    if (isCompetitor && state && !disconnected) updateCompetitorIntent(roomCode, competitorId, "speech", wantSpeech).catch(console.error);
  }, [wantSpeech, roomCode, competitorId, isCompetitor, state, disconnected]);

  // Spectator presence heartbeat (non-competitors only)
  const [spectatorId] = useState(() => getAuthUidSync() || "spec_" + Math.random().toString(36).slice(2, 8));
  useEffect(() => {
    if (isCompetitor || disconnected) return;
    claimSpectatorPresence(roomCode, spectatorId).catch(console.error);
    const iv = setInterval(() => {
      claimSpectatorPresence(roomCode, spectatorId).catch(console.error);
    }, 30000);
    return () => {
      clearInterval(iv);
      if (!disconnected) releaseSpectatorPresence(roomCode, spectatorId).catch(console.error);
    };
  }, [roomCode, spectatorId, isCompetitor, disconnected]);
  // Reset all speech intents when a new speaker is recognized
  useEffect(() => {
    if (!state) return;
    const currentSpeaker = state.activeSpeech?.studentId || null;
    if (currentSpeaker && currentSpeaker !== prevSpeechRef.current) {
      setWantSpeech(false);
    }
    prevSpeechRef.current = currentSpeaker;
  }, [state?.activeSpeech?.studentId]);



  // Competitor: handle split changes
  const handleSplitChange = (billId, side) => {
    if (isCompetitor) updateCompetitorSplit(roomCode, competitorId, billId, side || null).catch(console.error);
  };

  // PO claim
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLockUntil, setPinLockUntil] = useState(0);
  const handleClaimPO = () => {
    if (!state) return;
    if (Date.now() < pinLockUntil) { setPinError(`Too many attempts. Wait ${Math.ceil((pinLockUntil - Date.now()) / 1000)}s.`); return; }
    if (!state.poPin) { setPinError("No PO PIN set for this room."); return; }
    if (state.poHeartbeat && (Date.now() - (state.poHeartbeat.ts || state.poHeartbeat)) < STALE_MS) {
      setPinError("A PO is currently active in this room.");
      return;
    }
    if (state.poPin === pin) {
      setPinAttempts(0);
      if (isCompetitor) releaseCompetitorName(roomCode, competitorId).catch(console.error);
      onClaimPO(roomCode, state, competitorId);
    } else {
      const newAttempts = pinAttempts + 1;
      setPinAttempts(newAttempts);
      if (newAttempts >= 5) {
        setPinLockUntil(Date.now() + 30000);
        setPinError("Too many attempts. Locked for 30s.");
      } else {
        setPinError(`Incorrect PIN. ${5 - newAttempts} attempts left.`);
      }
      setPin("");
    }
  };


  if (!state || disconnected) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href={FONTS_LINK} rel="stylesheet" />
        <div style={{ textAlign: "center" }}>
          <Brand size="large" />
          <div style={{ marginTop: 20, fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#9B917F" }}>
            {disconnected ? "Chamber not found or has ended." : "Connecting to chamber..."}
          </div>
          {disconnected && onGoHome && (
            <button onClick={onGoHome} style={{ marginTop: 20, padding: "10px 24px", background: `linear-gradient(135deg, ${GOLD}, #C49632)`, color: "#1a1714", border: "none", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "0.08em" }}>Return Home</button>
          )}
        </div>
      </div>
    );
  }

  const { students: rawStudents = [], seatingSlots = [], cols = 4, frontSide = "bottom", docket = [], poName = "", roomName = "", mode = "speech", seekers = [], speechCounter = 0, questionCounter = 0, history = [], activeSpeech = null, currentBillIdx = 0, speechStartTime = null, questionPrec = "reverse", competitorIntents = {}, splits = {}, affCount = 0, negCount = 0, speechSequence = [], poStudentId: statePoStudentId = null } = state;
  const students = rawStudents.map(s => ({ ...s, speeches: s.speeches||0, questions: s.questions||0, speechHistory: s.speechHistory||[], questionHistory: s.questionHistory||[] }));
  const getStudent = (id) => students.find(s => s.id === id);
  const roundComplete = docket.length > 0 && docket.every(b => b.status);
  const currentBill = docket[currentBillIdx];
  const displayName = roomName || `Chamber ${roomCode}`;
  const sortedSeekers = sortPrec((seekers || []).map(id => getStudent(id)).filter(Boolean), mode, questionPrec);
  const activeSeekers = sortedSeekers;
  const hasSpeech = !!activeSpeech;

  // Figure out what the next speech would be
  const getNextSpeechLabel = () => {
    if (roundComplete) return null;
    const seq = speechSequence || [];
    const last = seq[seq.length - 1];
    if (seq.length === 0) return "1st Speech";
    if (last === "author" || last === "sponsor") return "1st Affirmative";
    const side = last === "neg" ? "aff" : "neg";
    const count = (side === "aff" ? (affCount || 0) : (negCount || 0)) + 1;
    const ordinal = count === 1 ? "1st" : count === 2 ? "2nd" : count === 3 ? "3rd" : count + "th";
    return `${ordinal} ${side === "aff" ? "Affirmative" : "Negative"}`;
  };

  const getSplitTotals = (billId) => {
    let aff = 0, neg = 0;
    Object.entries(splits).forEach(([safeId, studentSplits]) => {
      if (statePoStudentId && safeId === fbSafe(statePoStudentId)) return;
      const s = studentSplits[fbSafe(billId)];
      if (s === "aff") aff++;
      else if (s === "neg") neg++;
      else if (s === "both") { aff++; neg++; }
    });
    return (aff > 0 || neg > 0) ? { aff, neg } : null;
  };
  const getSplitNames = (billId) => {
    const affNames = [], negNames = [];
    Object.entries(splits).forEach(([safeId, studentSplits]) => {
      if (statePoStudentId && safeId === fbSafe(statePoStudentId)) return;
      const side = studentSplits[fbSafe(billId)];
      const student = students.find(s => fbSafe(s.id) === safeId);
      const name = student ? student.name : safeId;
      if (side === "aff") affNames.push(name);
      else if (side === "neg") negNames.push(name);
      else if (side === "both") { affNames.push(name); negNames.push(name); }
    });
    return { aff: affNames.sort((a, b) => a.localeCompare(b)), neg: negNames.sort((a, b) => a.localeCompare(b)) };
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "column" }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "8px 12px" : "10px 20px", borderBottom: "1px solid #2a2520", flexWrap: "wrap", gap: 8, flexShrink: 0, position: isMobile ? "sticky" : undefined, top: isMobile ? 0 : undefined, zIndex: isMobile ? 10 : undefined, background: isMobile ? "#1a1714" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, minWidth: 0, flex: isMobile ? 1 : undefined }}>
          {!isMobile && <Brand size="small" />}
          <div style={{ borderLeft: isMobile ? "none" : "1px solid #3a3530", paddingLeft: isMobile ? 0 : 12, minWidth: 0 }}>
            {!roundComplete && currentBill && (<div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", background: "#2a2520", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{currentBillIdx + 1}/{docket.length}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentBill.name}</span></div>)}
            {roundComplete && <div style={{ fontSize: 13, color: "#5AE89A", fontFamily: "'DM Mono', monospace" }}>All bills debated</div>}
            {!isMobile && <div style={{ fontSize: 10, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>{statePoStudentId ? `PO: ${students.find(s => s.id === statePoStudentId)?.name || poName} · ` : poName ? `PO: ${poName} · ` : ""}{displayName}</div>}
            {isMobile && <div style={{ fontSize: 9, color: "#6b6358", fontFamily: "'DM Mono', monospace" }}>{displayName}</div>}
          </div>
          {isCompetitor && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <div style={{ background: `linear-gradient(135deg, ${GOLD}cc, ${GOLD}99)`, borderRadius: 5, padding: "3px 8px" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#1a1714" }}>{competitorName}</span>
              </div>
              {!showSwitchPicker ? (
                <button onClick={() => setShowSwitchPicker(true)} style={{ background: "none", border: "none", color: "#6b6358", fontSize: 9, fontFamily: "'DM Mono', monospace", cursor: "pointer", textDecoration: "underline" }}>switch</button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <select onChange={e => { if (e.target.value) { const s = students.find(st => String(st.id) === e.target.value); if (s && onSelectName) { releaseCompetitorName(roomCode, competitorId).catch(console.error); onSelectName(roomCode, s.id, s.name); } } setShowSwitchPicker(false); }} defaultValue="" style={{ padding: "3px 6px", background: "#1e1b17", color: "#E8E0D0", border: `1px solid ${GOLD}`, borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer", maxWidth: 140 }}>
                    <option value="" disabled>Switch to...</option>
                    {students.filter(s => s.id !== statePoStudentId && String(s.id) !== String(competitorId)).map(s => {
                      const claim = (state?.competitorClaims || {})[fbSafe(s.id)];
                      const taken = (claim && claim.claimedAt && (Date.now() - claim.claimedAt) < STALE_MS) || s.id === statePoStudentId;
                      return <option key={s.id} value={s.id} disabled={taken}>{s.name}{taken ? " (taken)" : ""}</option>;
                    })}
                  </select>
                  <button onClick={() => setShowSwitchPicker(false)} style={{ background: "none", border: "none", color: "#6b6358", fontSize: 12, cursor: "pointer" }}>×</button>
                </div>
              )}
              {statePoStudentId ? (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358" }}>PO: <span style={{ color: GOLD }}>{students.find(s => s.id === statePoStudentId)?.name || "Active"}</span></span>
              ) : !showPinEntry ? (
                <button onClick={() => setShowPinEntry(true)} style={{ padding: "3px 8px", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, cursor: "pointer" }}>Claim PO</button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={e => e.key === "Enter" && pin.length === 4 && handleClaimPO()} placeholder="PIN" maxLength={4} style={{ width: 56, background: "#1e1b17", color: "#E8E0D0", border: pinError ? "1px solid #C45A5A" : "1px solid #3a3530", borderRadius: 4, padding: "3px 6px", fontFamily: "'DM Mono', monospace", fontSize: 11, textAlign: "center", letterSpacing: "0.15em" }} />
                  <button onClick={handleClaimPO} disabled={pin.length !== 4} style={{ padding: "3px 8px", background: pin.length === 4 ? GOLD : "#3a3530", color: pin.length === 4 ? "#1a1714" : "#6b6358", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 600, cursor: pin.length === 4 ? "pointer" : "not-allowed" }}>Go</button>
                  <button onClick={() => { setShowPinEntry(false); setPin(""); setPinError(""); }} style={{ background: "none", border: "none", color: "#6b6358", fontSize: 12, cursor: "pointer" }}>×</button>
                </div>
              )}
            </div>
          )}
          {!isCompetitor && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              {statePoStudentId && (() => { const poSt = getStudent(statePoStudentId); return poSt ? (
                <><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358" }}>PO:</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: GOLD }}>{poSt.name}</span></>
              ) : null; })()}
              {showNamePicker ? (
                <div style={{ position: "relative" }}>
                  <select onChange={e => { if (e.target.value) { const s = students.find(st => String(st.id) === e.target.value); if (s && onSelectName) { onSelectName(roomCode, s.id, s.name); } } setShowNamePicker(false); }} defaultValue="" style={{ padding: "3px 6px", background: "#1e1b17", color: "#E8E0D0", border: `1px solid ${GOLD}`, borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer", maxWidth: 140 }}>
                    <option value="" disabled>Select name...</option>
                    {students.filter(s => s.id !== statePoStudentId).map(s => {
                      const claim = (state?.competitorClaims || {})[fbSafe(s.id)];
                      const taken = (claim && claim.claimedAt && (Date.now() - claim.claimedAt) < STALE_MS) || s.id === statePoStudentId;
                      return <option key={s.id} value={s.id} disabled={taken}>{s.name}{taken ? " (taken)" : ""}</option>;
                    })}
                  </select>
                  <button onClick={() => setShowNamePicker(false)} style={{ background: "none", border: "none", color: "#6b6358", fontSize: 12, cursor: "pointer", marginLeft: 2 }}>×</button>
                </div>
              ) : (
                <button onClick={() => setShowNamePicker(true)} style={{ padding: "3px 8px", background: `linear-gradient(135deg, ${GOLD}cc, ${GOLD}99)`, color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 600, cursor: "pointer" }}>Select Name</button>
              )}
            </div>
          )}
          {(() => { const cc = state?.competitorClaims || {}; const sp = state?.spectatorPresence || {}; const claimCount = Object.keys(cc).filter(k => { const c = cc[k]; return c && c.claimedAt && (Date.now() - c.claimedAt) < STALE_MS; }).length + (statePoStudentId ? 1 : 0); const specCount = Object.keys(sp).filter(k => { const s = sp[k]; return s && s.heartbeat && (Date.now() - s.heartbeat) < STALE_MS; }).length; return (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", marginLeft: 4 }}>
              <span style={{ color: GOLD, fontWeight: 600 }}>{claimCount}/{students.length}</span> <span style={{ color: "#9B917F" }}>comp</span> · <span style={{ color: "#7BA3BF", fontWeight: 600 }}>{specCount}</span> <span style={{ color: "#9B917F" }}>spec</span>
            </span>
          ); })()}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
          <div role="tablist" style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530", flexShrink: 0 }}>
            {[{ key: "main", label: "Chamber" }, { key: "docket", label: isCompetitor ? "Splits" : "Docket" }, { key: "orders", label: "Orders" }, { key: "log", label: "Log" }].map(t => (
              <button key={t.key} role="tab" aria-selected={activeTab === t.key} onClick={() => setActiveTab(t.key)} style={{ padding: isMobile ? "6px 8px" : "6px 12px", background: activeTab === t.key ? GOLD : "transparent", color: activeTab === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 9 : 10, fontWeight: activeTab === t.key ? 600 : 400, cursor: "pointer", textTransform: "uppercase" }}>{t.label}</button>
            ))}
          </div>
          {!isMobile && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#9B917F", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: GOLD, fontWeight: 500, fontSize: 11, letterSpacing: "0.08em" }}>{roomCode}</span>
            <button onClick={() => copyToClipboard(roomCode)} title="Copy chamber code" style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 10, padding: 0 }}>📋</button>
          </div>}
          {isMobile && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#9B917F", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: GOLD, fontWeight: 500, fontSize: 11, letterSpacing: "0.08em" }}>{roomCode}</span>
            <button onClick={() => copyToClipboard(roomCode)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 10, padding: 0 }}>📋</button>
          </div>}
        </div>
      </header>

      {createdPin && (
        <div style={{ background: `linear-gradient(135deg, ${GOLD}22, ${GOLD}11)`, border: `1px solid ${GOLD}44`, borderRadius: 0, padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#E8E0D0" }}>
            Chamber created! Share code <span style={{ color: GOLD, fontWeight: 700, fontSize: 14, letterSpacing: "0.12em" }}>{roomCode}</span>
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#E8E0D0" }}>
            PO PIN: <span style={{ color: GOLD, fontWeight: 700, fontSize: 14, letterSpacing: "0.12em" }}>{createdPin}</span>
          </div>
          <button onClick={onDismissPin} style={{ background: "none", border: "1px solid #6b6358", borderRadius: 4, color: "#9B917F", fontFamily: "'DM Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}

      {activeTab === "main" && !roundComplete ? (
        <div style={{ display: isMobile ? "block" : "flex", flex: 1, overflow: isMobile ? undefined : "hidden" }}>
          <div style={{ flex: 1, padding: isMobile ? 12 : 20, overflow: isMobile ? undefined : "auto" }}>
            {/* Current speaker / status */}
            {activeSpeech && (() => { const sp = getStudent(activeSpeech.studentId); if (!sp) return null; const col = COLORS[(sp.initialOrder||0) % COLORS.length]; return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #5AE89A44", padding: isMobile ? "12px" : "14px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap", marginBottom: 16 }}><div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}><div style={{ background: `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", border: "2px solid #5AE89A" }}><div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{sp.name}</div></div><div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 10 : 12, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>{activeSpeech.side}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6b6358", marginTop: 2 }}>Speech #{activeSpeech.speechNumber}</div></div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 11 : 13, color: "#5AE89A", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 12 }}>Speech in Progress</div></div></div>); })()}

            {!activeSpeech && mode === "question" && (() => { const lastSp = state?.lastSpeakerId ? getStudent(state.lastSpeakerId) : null; const col = lastSp ? COLORS[(lastSp.initialOrder||0) % COLORS.length] : null; const lastSpeech = (history || []).find(h => h.type === "speech"); return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #7BA3BF44", padding: isMobile ? "12px" : "14px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap", marginBottom: 16 }}>{lastSp && <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}><div style={{ background: `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", border: "2px solid #7BA3BF" }}><div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{lastSp.name}</div></div><div>{lastSpeech && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 10 : 12, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>{lastSpeech.side}</div>}{lastSpeech && <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 2 }}>Speech #{lastSpeech.number} — {fmtTime(lastSpeech.duration || 0)}</div>}</div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 11 : 13, color: "#7BA3BF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginLeft: 12 }}>Questioning Period</div></div>}</div>); })()}

            {!activeSpeech && mode === "speech" && !roundComplete && (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #3a3530", padding: "12px 20px", marginBottom: 16 }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", textTransform: "uppercase" }}>Awaiting speakers</span></div>)}


            {/* Seating Chart */}
            <SeatingGrid students={students} seatingSlots={seatingSlots} cols={cols} frontSide={frontSide} interactive={false} locked={true} seekers={seekers} activeSpeech={activeSpeech} isMobile={isMobile} poStudentId={statePoStudentId} lastSpeakerId={state?.lastSpeakerId} inQuestionPeriod={state?.inQuestionPeriod} />
              {(() => { const competitorCount = students.filter(s => s.id !== statePoStudentId).length; const majority = Math.floor(competitorCount / 2) + 1; const twoThirds = Math.ceil(competitorCount * 2 / 3); return (
                <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 16 : 24, marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 9 : 10, color: "#6b6358" }}>
                  <span>Members: <span style={{ color: "#9B917F", fontWeight: 600 }}>{competitorCount}</span></span>
                  <span>Majority: <span style={{ color: GOLD, fontWeight: 600 }}>{majority}</span></span>
                  <span>2/3: <span style={{ color: "#7BA3BF", fontWeight: 600 }}>{twoThirds}</span></span>
                </div>
              ); })()}

            {/* Competitor: indicate interest in next speech */}
            {isCompetitor && !roundComplete && mode === "speech" && (() => {
              const nextLabel = getNextSpeechLabel();
              return (
                <div style={{ marginTop: 12, background: "#2a2520", borderRadius: 8, border: wantSpeech ? `1px solid ${GOLD}` : "1px solid #3a3530", padding: "10px 14px" }}>
                  {nextLabel && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", marginBottom: 6 }}>Next speech: <span style={{ color: GOLD }}>{nextLabel}</span></div>}
                  <button onClick={() => setWantSpeech(w => !w)} style={{ width: "100%", padding: "10px 0", background: wantSpeech ? `linear-gradient(135deg, ${GOLD}, #C49632)` : "transparent", color: wantSpeech ? "#1a1714" : GOLD, border: wantSpeech ? "none" : `1px solid ${GOLD}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>{wantSpeech ? "Indicated Interest" : "Indicate Interest in Next Speech"}</button>
                </div>
              );
            })()}
          </div>

          {/* Queue panel */}
          {isMobile && (
              <button onClick={() => setMobileShowQueue(q => !q)} style={{ margin: "0 12px 8px", padding: "10px", background: mobileShowQueue ? GOLD : "#2a2520", color: mobileShowQueue ? "#1a1714" : (mode === "speech" ? GOLD : "#7BA3BF"), border: `1px solid ${mobileShowQueue ? GOLD : "#3a3530"}`, borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {mobileShowQueue ? `Hide Queue` : `${mode === "speech" ? "Speech" : "Question"} Queue (${activeSeekers.length})`}
              </button>
          )}
          {(!isMobile || mobileShowQueue) && (
          <div style={{ width: isMobile ? "100%" : 280, borderLeft: isMobile ? "none" : "1px solid #2a2520", padding: isMobile ? "0 12px 12px" : "16px 14px", overflow: isMobile ? undefined : "auto", flexShrink: 0 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: mode === "speech" ? GOLD : "#7BA3BF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{mode === "speech" ? "Speech" : "Question"} Queue</div>
            {activeSeekers.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedSeekers.map((s, idx) => { const isTop = idx === 0; return (<div key={s.id}>{isTop && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>Highest Precedence</div>}<div style={{ display: "flex", alignItems: "center", gap: 8, background: isTop ? `linear-gradient(135deg, ${GOLD}33, #C4963222)` : "#2a2520", border: isTop ? `1px solid ${GOLD}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 10px" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: isTop ? GOLD : "#6b6358", width: 16, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div><div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 2 }}>🎤{s.speeches||0} ❓{s.questions||0}</div></div></div></div>); })}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4540", fontStyle: "italic", fontSize: 13, textAlign: "center", padding: 20 }}>{activeSpeech ? "Speech in progress" : "Awaiting speakers"}</div>
            )}
          </div>
          )}
        </div>
      ) : activeTab === "main" && roundComplete ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#5AE89A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>All legislation debated</div><button onClick={() => setActiveTab("orders")} style={{ padding: "10px 24px", background: GOLD, color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View Orders of the Day</button></div></div>
      ) : activeTab === "docket" ? (
        isCompetitor ? (
          <div style={{ padding: isMobile ? 16 : 32, maxWidth: 700, margin: "0 auto", minWidth: isMobile ? undefined : 480 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>My Splits</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {docket.map((b, i) => {
                const mySplit = (splits[fbSafe(competitorId)] || {})[fbSafe(b.id)] || "";
                const totals = getSplitTotals(b.id);
                const isPast = !!b.status;
                return (
                  <div key={b.id || i} style={{ padding: isMobile ? "16px" : "20px", background: "#2a2520", borderRadius: 10, border: i === currentBillIdx && !roundComplete ? `2px solid ${GOLD}` : "1px solid #3a3530", opacity: isPast ? 0.5 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isPast ? 0 : 14 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#6b6358", fontWeight: 600 }}>{i + 1}.</span>
                      <span style={{ flex: 1, fontSize: isMobile ? 16 : 18, fontWeight: 600 }}>{b.name}</span>
                      {b.status && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span>}
                    </div>
                    {!isPast && (
                      <>
                        <div style={{ display: "flex", gap: 10, minWidth: 280 }}>
                          {["aff", "neg", "both"].map(opt => (
                            <button key={opt} onClick={() => handleSplitChange(b.id, mySplit === opt ? "" : opt)} style={{ flex: 1, padding: isMobile ? "16px 12px" : "18px 16px", background: mySplit === opt ? (opt === "aff" ? "#2D4A3E" : opt === "neg" ? "#4A2D2D" : "#3A3A2D") : "#1e1b17", color: mySplit === opt ? (opt === "aff" ? "#5AE89A" : opt === "neg" ? "#E8A0A0" : GOLD) : "#6b6358", border: mySplit === opt ? `2px solid ${opt === "aff" ? "#3A6B4E" : opt === "neg" ? "#6B3A3A" : GOLD + "66"}` : "1px solid #3a3530", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 14 : 15, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}>{opt === "both" ? "Both" : opt === "aff" ? "Aff" : "Neg"}</button>
                          ))}
                        </div>
                        {totals && <button onClick={() => setExpandedSplitBill(expandedSplitBill === b.id ? null : b.id)} style={{ marginTop: 10, width: "100%", padding: "6px 0", background: "transparent", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#9B917F", cursor: "pointer", textAlign: "center" }}>Chamber: <span style={{ color: "#5AE89A", fontWeight: 600 }}>{totals.aff} Aff</span> / <span style={{ color: "#E8A0A0", fontWeight: 600 }}>{totals.neg} Neg</span> <span style={{ fontSize: 9, color: "#6b6358" }}>{expandedSplitBill === b.id ? "▲" : "▼"}</span></button>}
                        {expandedSplitBill === b.id && (() => { const names = getSplitNames(b.id); return (
                          <div style={{ marginTop: 8, padding: "10px 14px", background: "#1e1b17", borderRadius: 6, border: "1px solid #3a3530", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            <div>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#5AE89A", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Affirmative ({names.aff.length})</div>
                              {names.aff.length > 0 ? names.aff.map((n, i) => <div key={i} style={{ fontSize: 12, color: "#E8E0D0", padding: "2px 0" }}>{n}</div>) : <div style={{ fontSize: 11, color: "#4a4540", fontStyle: "italic" }}>None</div>}
                            </div>
                            <div>
                              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#C45A5A", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Negative ({names.neg.length})</div>
                              {names.neg.length > 0 ? names.neg.map((n, i) => <div key={i} style={{ fontSize: 12, color: "#E8E0D0", padding: "2px 0" }}>{n}</div>) : <div style={{ fontSize: 11, color: "#4a4540", fontStyle: "italic" }}>None</div>}
                            </div>
                          </div>
                        ); })()}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <DocketTab docket={docket} currentBillIdx={currentBillIdx} roundComplete={roundComplete} editable={false} splits={splits} students={students} poStudentId={statePoStudentId} />
        )
      ) : activeTab === "orders" ? (
        <OrdersTab docket={docket} history={history} students={students} currentBillIdx={currentBillIdx} roundComplete={roundComplete} poName={poName} roomName={roomName} poStudentId={statePoStudentId} />
      ) : (
        <LogTab history={history} />
      )}
      {activeTab === "main" && !roundComplete && (
        <div style={{ position: "sticky", bottom: 0, background: "#1e1b17", borderTop: "1px solid #2a2520", zIndex: 10 }}>
          <button onClick={() => setShowPrec(p => !p)} style={{ width: "100%", padding: isMobile ? "6px 12px" : "8px 20px", background: "transparent", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase" }}>Precedence</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>{showPrec ? "▼" : "▲"}</span>
          </button>
          {showPrec && (<div style={{ padding: isMobile ? "0 12px 8px" : "0 20px 10px", maxHeight: isMobile ? "35vh" : "30vh", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 10 : 20 }}>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Speech Precedence</div>
              {sortPrec(students.filter(s => s.id !== statePoStudentId), "speech", questionPrec).map((s, idx) => { const intent = competitorIntents[fbSafe(s.id)] || {}; const hasIntent = intent.speech; return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", background: hasIntent ? `${GOLD}15` : "transparent", borderRadius: 3, border: hasIntent ? `1px solid ${GOLD}33` : "1px solid transparent", marginBottom: 1 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: idx === 0 ? GOLD : "#6b6358", width: 14, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: hasIntent ? 600 : 400, color: hasIntent ? GOLD : idx === 0 ? GOLD : "#9B917F", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}{isCompetitor && s.id === competitorId ? " ★" : ""}</span>
                  {hasIntent && <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, flexShrink: 0 }} />}
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", flexShrink: 0 }}>{s.speeches||0}</span>
                </div>
              ); })}
            </div>
            <div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#7BA3BF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Question Precedence</div>
              {sortPrec(students.filter(s => s.id !== statePoStudentId), "question", questionPrec).map((s, idx) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", marginBottom: 1 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: idx === 0 ? "#7BA3BF" : "#6b6358", width: 14, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                  <span style={{ fontSize: isMobile ? 10 : 11, color: idx === 0 ? "#7BA3BF" : "#9B917F", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}{isCompetitor && s.id === competitorId ? " ★" : ""}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", flexShrink: 0 }}>{s.questions||0}</span>
                </div>
              ))}
            </div>
          </div>
          </div>)}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("landing");
  const [config, setConfig] = useState(null);
  const [spectatorCode, setSpectatorCode] = useState(null);
  const [competitorInfo, setCompetitorInfo] = useState(null);
  const [createdRoomPin, setCreatedRoomPin] = useState(null);
  const isMobile = useIsMobile();

  // Global animations
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@keyframes profanityFadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    *:focus-visible { outline: 2px solid #D4A843 !important; outline-offset: 2px; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Restore PO session on refresh
  useEffect(() => {
    // Clean up any rooms older than 24 hours
    cleanupStaleRooms();

    try {
      const saved = sessionStorage.getItem('parlipro-session');
      if (saved) {
        const { view: v, roomCode, spectatorCode: sc, competitorInfo: ci } = JSON.parse(saved);
        if (v === "active" && roomCode) {
          const poData = sessionStorage.getItem(`parlipro-po-${roomCode}`);
          if (poData) {
            const parsed = JSON.parse(poData);
            setConfig(parsed);
            setView("active");
            return;
          }
        }
        if (v === "spectator" && sc) {
          setSpectatorCode(sc);
          setView("spectator");
          return;
        }
        if (v === "competitor" && ci) {
          setCompetitorInfo(ci);
          setView("competitor");
          return;
        }
      }
    } catch(e) {}
  }, []);

  // Save current view to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('parlipro-session', JSON.stringify({
        view, roomCode: config?.roomCode || null, spectatorCode, competitorInfo
      }));
    } catch(e) {}
  }, [view, config, spectatorCode]);

  const handleCloseRoom = () => { setView("landing"); setConfig(null); };
  const handleReleasePO = (roomCode) => {
    // Get PO's student info before clearing
    const poId = config?.poStudentId;
    const poStudent = poId ? (config?.students || []).find(s => String(s.id) === String(poId)) : null;
    // Clear poStudentId and poHeartbeat in Firebase
    writeRoomState(roomCode, { poStudentId: null, poHeartbeat: null }).catch(console.error);
    try { sessionStorage.removeItem(`parlipro-po-${roomCode}`); sessionStorage.removeItem('parlipro-session'); } catch(e) {}
    setConfig(null);
    if (poStudent) {
      // Go back to competitor mode as their name
      setCompetitorInfo({ roomCode, studentId: poStudent.id, studentName: poStudent.name });
      setSpectatorCode(null);
      setView("competitor");
    } else {
      setSpectatorCode(roomCode);
      setView("spectator");
    }
  };

  const handleRejoinPO = (roomCode, firebaseData, claimingStudentId) => {
    // Rebuild config from Firebase data
    const cfg = {
      students: (firebaseData.students || []).map(s => ({ ...s, speeches: s.speeches||0, questions: s.questions||0, speechHistory: s.speechHistory||[], questionHistory: s.questionHistory||[], initialOrder: s.initialOrder||0 })),
      seatingSlots: (firebaseData.seatingSlots || []).map(s => s ? ({ ...s, speeches: s.speeches||0, questions: s.questions||0, speechHistory: s.speechHistory||[], questionHistory: s.questionHistory||[], initialOrder: s.initialOrder||0 }) : null),
      cols: firebaseData.cols || 4,
      rows: firebaseData.rows || 4,
      docket: firebaseData.docket || [],
      frontSide: firebaseData.frontSide || "bottom",
      roomCode: firebaseData.roomCode || roomCode,
      poName: firebaseData.poName || "",
      roomName: firebaseData.roomName || "",
      poPin: firebaseData.poPin || "",
      poStudentId: claimingStudentId || firebaseData.poStudentId || null,
    };
    // Also save to session so ActiveRound can restore internal state
    try {
      const sessionData = {
        ...cfg,
        mode: firebaseData.mode || "speech",
        seekers: firebaseData.seekers || [],
        speechCounter: firebaseData.speechCounter || 0,
        questionCounter: firebaseData.questionCounter || 0,
        history: firebaseData.history || [],
        activeSpeech: firebaseData.activeSpeech || null,
        pendingSpeaker: null,
        affCount: firebaseData.affCount || 0,
        negCount: firebaseData.negCount || 0,
        speechSequence: firebaseData.speechSequence || [],
        currentBillIdx: firebaseData.currentBillIdx || 0,
        speechStartTime: firebaseData.speechStartTime || null,
      };
      sessionStorage.setItem(`parlipro-po-${roomCode}`, JSON.stringify(sessionData));
    } catch(e) {}
    setConfig(cfg);
    setView("active");
  };

  const handleSelectName = (code, studentId, studentName) => { setCompetitorInfo({ roomCode: code, studentId, studentName }); setSpectatorCode(null); setView("competitor"); };
  const handleSetupStart = (cfg) => {
    const initialState = {
      students: cfg.students, seatingSlots: cfg.seatingSlots, cols: cfg.cols, frontSide: cfg.frontSide,
      docket: cfg.docket, roomCode: cfg.roomCode, poName: "", roomName: cfg.roomName || "", poPin: cfg.poPin,
      mode: "speech", seekers: [], speechCounter: 0, questionCounter: 0, history: [], activeSpeech: null,
      currentBillIdx: 0, speechStartTime: null, affCount: 0, negCount: 0, speechSequence: [],
      inQuestionPeriod: false, questionPrec: cfg.questionPrec, poStudentId: null, roundComplete: false,
    };
    createRoom(cfg.roomCode, initialState).then(() => {
      setCreatedRoomPin(cfg.poPin);
      setSpectatorCode(cfg.roomCode);
      setView("spectator");
    }).catch(err => { console.error("Failed to create chamber:", err); });
  };

  if (view === "landing") return <LandingPage onCreateRoom={() => setView("setup")} onJoinRoom={(code) => { setSpectatorCode(code); setView("spectator"); }} onJoinCompetitor={(code, studentId, studentName) => { setCompetitorInfo({ roomCode: code, studentId, studentName }); setView("competitor"); }} onRejoinPO={handleRejoinPO} />;
  if (view === "setup") return <SetupPhase onStart={handleSetupStart} />;
  if (view === "active" && config) return <ActiveRound config={config} onCloseRoom={handleCloseRoom} onReleasePO={handleReleasePO} />;
  if (view === "competitor" && competitorInfo) return <SpectatorView roomCode={competitorInfo.roomCode} competitorId={competitorInfo.studentId} competitorName={competitorInfo.studentName} onClaimPO={handleRejoinPO} onSelectName={handleSelectName} onGoHome={() => { setCompetitorInfo(null); setSpectatorCode(null); setView("landing"); }} />;
  if (view === "spectator" && spectatorCode) return <SpectatorView roomCode={spectatorCode} onClaimPO={handleRejoinPO} onSelectName={handleSelectName} createdPin={createdRoomPin} onDismissPin={() => setCreatedRoomPin(null)} onGoHome={() => { setSpectatorCode(null); setView("landing"); }} />;
  return null;
}
