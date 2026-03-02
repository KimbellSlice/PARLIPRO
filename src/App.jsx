import { useState, useRef, useEffect, useCallback } from "react";
import { writeRoomState, subscribeToRoom, checkRoomExists, deleteRoom, updateRoomElapsed, getRoomOnce, updateHeartbeat, cleanupStaleRooms } from "./firebase.js";

const generateCode = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join(""); };
const generatePin = () => String(Math.floor(1000 + Math.random() * 9000));
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const COLORS = ["#2D4A3E", "#3B2D4A", "#4A2D2D", "#2D3B4A", "#4A3B2D", "#2D4A44", "#3E2D4A", "#4A2D3B", "#2D424A", "#44402D", "#3A2D4A", "#2D4A36", "#4A2D44", "#2D3E4A", "#4A362D", "#2D4A4A", "#422D4A", "#4A2D36", "#2D454A", "#4A422D"];
const sortPrec = (s, type) => { const k = type === "speech" ? "speeches" : "questions", h = type === "speech" ? "speechHistory" : "questionHistory"; return [...s].sort((a, b) => { if ((a[k]||0) !== (b[k]||0)) return (a[k]||0) - (b[k]||0); const aH = a[h] || [], bH = b[h] || []; const aL = aH.length ? aH[aH.length - 1] : -1, bL = bH.length ? bH[bH.length - 1] : -1; if (aL !== bL) return aL - bL; return (a.initialOrder||0) - (b.initialOrder||0); }); };
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,600;6..72,700&family=DM+Mono:wght@400;500&display=swap";
const BG = "linear-gradient(160deg, #1a1714 0%, #231f1b 50%, #1a1714 100%)";
const GOLD = "#D4A843";
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

const Brand = ({ size = "large" }) => (
  <div style={{ textAlign: size === "large" ? "center" : "left" }}>
    <div style={{ fontSize: size === "large" ? 11 : 9, fontFamily: "'DM Mono', monospace", color: GOLD, letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: size === "large" ? 4 : 0 }}>ParliPro</div>
    {size === "large" && <h1 style={{ fontSize: 28, fontWeight: 300, margin: 0, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif" }}>Congressional Debate<br/>Precedence Tracking</h1>}
  </div>
);

function SpeechTimer({ onTick }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);
  const isMobile = useIsMobile();
  useEffect(() => { if (running) ref.current = setInterval(() => setElapsed(p => p + 1), 1000); else clearInterval(ref.current); return () => clearInterval(ref.current); }, [running]);
  useEffect(() => { if (onTick) onTick(elapsed); }, [elapsed]);
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

function SpectatorTimer({ elapsed = 0 }) {
  return <div style={{ fontSize: 38, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: elapsed > 180 ? "#C45A5A" : "#E8E0D0", letterSpacing: "0.05em", lineHeight: 1 }}>{fmtTime(elapsed)}</div>;
}

// ═══ LANDING PAGE ═══
function LandingPage({ onCreateRoom, onJoinRoom, onRejoinPO }) {
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [checking, setChecking] = useState(false);
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pin, setPin] = useState("");
  const [pendingCode, setPendingCode] = useState("");

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a valid room code"); return; }
    setChecking(true); setJoinError("");
    checkRoomExists(code, (exists) => {
      setChecking(false);
      if (exists) onJoinRoom(code);
      else setJoinError("Room not found. Check the code and try again.");
    });
  };

  const handleRejoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a room code first"); return; }
    setChecking(true); setJoinError("");
    getRoomOnce(code, (data) => {
      setChecking(false);
      if (!data) { setJoinError("Room not found."); return; }
      if (!data.poPin) { setJoinError("This room has no PO PIN set."); return; }
      // Check if another PO session is active (heartbeat within last 15 seconds)
      if (data.poHeartbeat && (Date.now() - data.poHeartbeat) < 15000) {
        setJoinError("A PO is currently active in this room. Close that session first, or wait a few seconds if it crashed.");
        return;
      }
      setPendingCode(code);
      setShowPinEntry(true);
    });
  };

  const handlePinSubmit = () => {
    getRoomOnce(pendingCode, (data) => {
      if (data && data.poPin === pin) {
        onRejoinPO(pendingCode, data);
      } else {
        setJoinError("Incorrect PIN.");
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
          <button onClick={onCreateRoom} style={{ width: "100%", padding: "18px 0", background: `linear-gradient(135deg, ${GOLD}, #C49632)`, color: "#1a1714", border: "none", borderRadius: 10, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>Create Room (PO)</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#3a3530" }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", letterSpacing: "0.15em", textTransform: "uppercase" }}>or enter a room code</span>
            <div style={{ flex: 1, height: 1, background: "#3a3530" }} />
          </div>
          <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); setShowPinEntry(false); }} onKeyDown={e => e.key === "Enter" && handleJoin()} placeholder="ROOM CODE" maxLength={6} style={{ ...IS, textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 20, letterSpacing: "0.2em", padding: "14px" }} />

          {showPinEntry ? (
            <div style={{ background: "#2a2520", border: `1px solid ${GOLD}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Enter PO PIN to rejoin</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={e => e.key === "Enter" && pin.length === 4 && handlePinSubmit()} placeholder="4-digit PIN" maxLength={4} style={{ ...IS, flex: 1, textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 20, letterSpacing: "0.3em", padding: "12px" }} />
                <button onClick={handlePinSubmit} disabled={pin.length !== 4} style={{ padding: "12px 20px", background: pin.length === 4 ? GOLD : "#3a3530", color: pin.length === 4 ? "#1a1714" : "#6b6358", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: pin.length === 4 ? "pointer" : "not-allowed" }}>Rejoin</button>
              </div>
              <button onClick={() => { setShowPinEntry(false); setPin(""); }} style={{ marginTop: 8, background: "none", border: "none", color: "#6b6358", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleJoin} disabled={checking} style={{ flex: 1, padding: "14px 0", background: "#2a2520", color: "#E8E0D0", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: checking ? "wait" : "pointer" }}>{checking ? "..." : "Join as Spectator"}</button>
              <button onClick={handleRejoin} disabled={checking} style={{ flex: 1, padding: "14px 0", background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: checking ? "wait" : "pointer" }}>{checking ? "..." : "Rejoin as PO"}</button>
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
  const [roomCode] = useState(generateCode);
  const [poPin] = useState(generatePin);
  const nameRef = useRef(null);
  const billRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => { if (step === "seating" && !seatingDirty) setSeatingSlots(Array.from({ length: rows * cols }, (_, i) => students[i] || null)); }, [step]);
  useEffect(() => { if (step === "seating") { const ex = seatingSlots.filter(Boolean); setSeatingSlots(Array.from({ length: rows * cols }, (_, i) => ex[i] || null)); } }, [rows, cols]);

  const addStudent = () => { const n = nameInput.trim(); if (!n || students.some(s => s.name.toLowerCase() === n.toLowerCase())) return; setStudents(p => [...p, { id: Date.now() + Math.random(), name: n, speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: p.length }]); setNameInput(""); setSeatingDirty(false); nameRef.current?.focus(); };
  const removeStudent = (id) => { setStudents(p => p.filter(s => s.id !== id).map((s, i) => ({ ...s, initialOrder: i }))); setSeatingDirty(false); };
  const randomize = () => { setStudents(p => shuffle(p).map((s, i) => ({ ...s, initialOrder: i }))); setSeatingDirty(false); };
  const addBill = () => { const n = billInput.trim(); if (!n) return; setDocket(p => [...p, { id: Date.now() + Math.random(), name: n, status: null }]); setBillInput(""); billRef.current?.focus(); };
  const removeBill = (id) => setDocket(p => p.filter(b => b.id !== id));
  const moveBill = (idx, dir) => { const ns = [...docket]; const [item] = ns.splice(idx, 1); ns.splice(idx + dir, 0, item); setDocket(ns); };
  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => { e.preventDefault(); if (dragIdx === null || dragIdx === idx) return; const ns = [...students]; const [d] = ns.splice(dragIdx, 1); ns.splice(idx, 0, d); setStudents(ns.map((s, i) => ({ ...s, initialOrder: i }))); setDragIdx(idx); };
  const handleSeatDragOver = (e, tgt) => { e.preventDefault(); if (seatDrag === null || seatDrag === tgt) return; const ns = [...seatingSlots]; const item = ns[seatDrag]; ns.splice(seatDrag, 1); ns.splice(tgt, 0, item); setSeatingSlots(ns); setSeatDrag(tgt); setSeatingDirty(true); };

  const hasRoster = students.length >= 2;
  const hasDocket = docket.length >= 1;
  const hasSeating = seatingSlots.filter(Boolean).length >= 2;
  const hasPO = poName.trim().length > 0;
  const canStart = hasRoster && hasDocket && hasSeating && hasPO;
  const check = (d) => <span style={{ fontSize: 10, marginLeft: 4, color: d ? "#5AE89A" : "#6b6358" }}>{d ? "✓" : "○"}</span>;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", padding: isMobile ? "0 12px 40px" : "0 16px 40px" }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <header style={{ textAlign: "center", padding: isMobile ? "24px 0 16px" : "40px 0 20px" }}>
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
        <div style={{ marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>Save your PIN — use it to rejoin if you lose your session</div>
      </header>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={LS}>Presiding Officer {check(hasPO)}</label>
            <input value={poName} onChange={e => setPoName(e.target.value)} placeholder="Your name" style={IS} />
          </div>
          <div>
            <label style={LS}>Room Name <span style={{ color: "#4a4540", textTransform: "none" }}>(optional)</span></label>
            <input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder='e.g. "Prelims House 3"' style={IS} />
          </div>
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
              <input ref={nameRef} value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudent()} placeholder="Name, then Enter" style={{ ...IS, width: "auto", flex: 1 }} />
              <button onClick={addStudent} style={{ padding: "10px 20px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
            </div>
          </div>
          {students.length > 1 && <button onClick={randomize} style={{ padding: "7px 16px", background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", marginBottom: 16 }}>↻ Randomize Order</button>}
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
        </>)}
        {step === "seating" && (<>
          {students.length < 2 ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b6358", fontStyle: "italic" }}>Add at least 2 students in the Roster tab first.</div> : (<>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div><label style={LS}>Columns</label><select value={cols} onChange={e => setCols(Number(e.target.value))} style={{ ...IS, width: 70, padding: "8px 10px" }}>{[3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={LS}>Rows</label><select value={rows} onChange={e => setRows(Number(e.target.value))} style={{ ...IS, width: 70, padding: "8px 10px" }}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
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
              <input ref={billRef} value={billInput} onChange={e => setBillInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addBill()} placeholder="Bill name, then Enter" style={{ ...IS, width: "auto", flex: 1 }} />
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
        <button disabled={!canStart} onClick={() => onStart({ students: seatingSlots.filter(Boolean), seatingSlots, cols, rows, docket, frontSide, roomCode, poName: poName.trim(), roomName: roomName.trim(), poPin })} style={{ width: "100%", marginTop: 28, padding: "16px 0", background: canStart ? `linear-gradient(135deg, ${GOLD}, #C49632)` : "#3a3530", color: canStart ? "#1a1714" : "#6b6358", border: "none", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: canStart ? "pointer" : "not-allowed", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {canStart ? "Begin Round →" : `Complete setup (${[!hasPO && "PO Name", !hasRoster && "Roster", !hasSeating && "Seating", !hasDocket && "Docket"].filter(Boolean).join(", ")})`}
        </button>
      </div>
    </div>
  );
}

// ═══ SHARED DISPLAY COMPONENTS ═══
function SeatingGrid({ seatingSlots, cols, frontSide, students, seekers, activeSpeech, mode, interactive, onToggle }) {
  const getStudent = (id) => students.find(s => s.id === id);
  const isMobile = useIsMobile();
  return (
    <>
      {frontSide === "top" && <div style={{ textAlign: "center", padding: "4px 0 8px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderBottom: "1px solid #2a2520", marginBottom: 8 }}>▲ Front / PO</div>}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {frontSide === "left" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "8px 5px", color: GOLD, fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderRight: "1px solid #2a2520", marginRight: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>◀ PO</div>}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: isMobile ? 5 : 10, maxWidth: isMobile ? "100%" : "100%", flex: 1 }}>
          {seatingSlots.map((student, idx) => {
            if (!student) return <div key={idx} style={{ minHeight: isMobile ? 44 : 64, borderRadius: 8, border: "2px dashed #2a2520" }} />;
            const s = getStudent(student.id); if (!s) return null;
            const isSk = seekers?.includes(s.id), isSp = activeSpeech?.studentId === s.id, col = COLORS[(s.initialOrder||0) % COLORS.length], locked = !!activeSpeech && mode === "speech";
            return (<div key={idx} onClick={() => interactive && !locked && onToggle?.(s.id)} style={{ background: isSp ? "linear-gradient(135deg, #2D4A3E, #1E3A2E)" : isSk ? `linear-gradient(135deg, ${GOLD}, #C49632)` : `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 5px 5px" : "12px 10px 10px", cursor: interactive && !locked ? "pointer" : "default", textAlign: "center", border: isSp ? "2px solid #5AE89A" : isSk ? "2px solid #F0D78C" : "2px solid transparent", transition: "all 0.15s ease", color: isSk ? "#1a1714" : "#E8E0D0", position: "relative", userSelect: "none", opacity: locked && !isSp ? 0.5 : 1 }}>
              <div style={{ fontSize: isMobile ? 11 : 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: isMobile ? 1 : 4 }}>{s.name}</div>
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

function OrdersTab({ docket, history, students, currentBillIdx, roundComplete }) {
  const isMobile = useIsMobile();
  const totalSpeeches = history.filter(h => h.type === "speech").length;
  const totalQuestions = history.filter(h => h.type === "question").length;
  const totalSpeechTime = history.filter(h => h.type === "speech").reduce((a, h) => a + (h.duration || 0), 0);
  const billsPassed = docket.filter(b => b.status === "passed").length;
  const billsFailed = docket.filter(b => b.status === "failed").length;
  const billsDebated = docket.filter(b => b.status).length;
  const studentStats = [...students].sort((a, b) => (b.speeches||0) - (a.speeches||0));
  return (
    <div style={{ flex: 1, padding: isMobile ? 16 : 24, overflow: "auto" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>Orders of the Day</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[{ l: "Speeches", v: totalSpeeches, c: GOLD }, { l: "Questions", v: totalQuestions, c: "#7BA3BF" }, { l: "Speech Time", v: fmtTime(totalSpeechTime), c: "#E8E0D0" }].map(c => (
            <div key={c.l} style={{ background: "#2a2520", borderRadius: 8, padding: 16, border: "1px solid #3a3530", textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 600, color: c.c, fontFamily: "'DM Mono', monospace" }}>{c.v}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{c.l}</div></div>
          ))}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Docket — {billsDebated}/{docket.length} debated ({billsPassed} passed, {billsFailed} failed)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {docket.map((b, i) => (<div key={b.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#2a2520", borderRadius: 7, border: i === currentBillIdx && !roundComplete ? `1px solid ${GOLD}` : "1px solid #3a3530" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{i + 1}.</span><span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: b.status || i === currentBillIdx ? "#E8E0D0" : "#6b6358" }}>{b.name}</span>{b.status ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span> : i === currentBillIdx && !roundComplete ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: GOLD }}>IN DEBATE</span> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a4540" }}>Pending</span>}</div>))}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Student Activity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {studentStats.map((s, idx) => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#2a2520", borderRadius: 6, border: "1px solid #3a3530" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{idx + 1}</span><span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: GOLD }}>🎤 {s.speeches||0}</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#7BA3BF" }}>❓ {s.questions||0}</span></div>))}
        </div>
      </div>
    </div>
  );
}

function LogTab({ history }) {
  return (
    <div style={{ flex: 1, padding: "20px 24px", maxWidth: 600, margin: "0 auto", overflow: "auto" }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Round Activity Log</div>
      {history.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#6b6358", fontStyle: "italic" }}>No activity yet.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {history.map((entry, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#2a2520", borderRadius: 6, borderLeft: `3px solid ${entry.type === "speech" ? GOLD : entry.type === "question" ? "#7BA3BF" : "#5AE89A"}` }}>
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

function DocketTab({ docket, currentBillIdx, roundComplete, editable, onAdd, onRemove, onMove, billInput, setBillInput, inputRef }) {
  return (
    <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>{editable ? "Edit Docket" : "Docket"}</div>
        {editable && (<div style={{ display: "flex", gap: 8, marginBottom: 16 }}><input ref={inputRef} value={billInput} onChange={e => setBillInput(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} placeholder="Add bill..." style={{ flex: 1, ...IS }} /><button onClick={onAdd} style={{ padding: "10px 20px", background: GOLD, color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button></div>)}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docket.map((b, idx) => { const isPast = idx < currentBillIdx; const isCurrent = idx === currentBillIdx && !roundComplete; return (
            <div key={b.id || idx} style={{ display: "flex", alignItems: "center", gap: 8, opacity: isPast ? 0.5 : 1 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6358", width: 22, textAlign: "right" }}>{idx + 1}.</span>
              <div style={{ flex: 1, background: "#2a2520", border: isCurrent ? `1px solid ${GOLD}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 14px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                {b.name}{b.status && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span>}{isCurrent && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD }}>CURRENT</span>}
              </div>
              {editable && !isPast && !isCurrent && (<><div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{idx > currentBillIdx + 1 && <button onClick={() => onMove(idx, -1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▲</button>}{idx < docket.length - 1 && <button onClick={() => onMove(idx, 1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▼</button>}</div><button onClick={() => onRemove(b.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>×</button></>)}
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
  const startEdit = (s) => { setEditId(s.id); setEditName(s.name); };
  const saveEdit = () => { if (editName.trim()) { onRename(editId, editName.trim()); } setEditId(null); setEditName(""); };
  const handleAdd = () => { const n = addInput.trim(); if (!n) return; onAdd(n); setAddInput(""); };
  return (
    <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>Edit Roster</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={addInput} onChange={e => setAddInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Add new student..." style={{ flex: 1, ...IS }} />
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
    </div>
  );
}

// ═══ ACTIVE ROUND (PO) ═══
function ActiveRound({ config, onCloseRoom }) {
  const { students: initStudents, seatingSlots: initSlots, cols, frontSide, docket: initDocket, roomCode, poName, roomName, poPin } = config;

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
  const [docket, setDocket] = useState(restored?.docket || initDocket);
  const [currentBillIdx, setCurrentBillIdx] = useState(restored?.currentBillIdx || 0);
  const [showPQConfirm, setShowPQConfirm] = useState(false);
  const currentSpeechElapsed = useRef(0);
  const [docketBillInput, setDocketBillInput] = useState("");
  const docketInputRef = useRef(null);
  const [speechStartTime, setSpeechStartTime] = useState(restored?.speechStartTime || null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const isMobile = useIsMobile();
  const [mobileShowQueue, setMobileShowQueue] = useState(false);
  const [showNextSpeechConfirm, setShowNextSpeechConfirm] = useState(false);
  const [inQuestionPeriod, setInQuestionPeriod] = useState(restored?.inQuestionPeriod || false);
  const [savedSpeechSeekers, setSavedSpeechSeekers] = useState([]);

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

  // Firebase sync
  const syncToFirebase = useCallback(() => {
    const state = {
      students, seatingSlots, cols, frontSide, docket, roomCode, poName, roomName: roomName || "", poPin: poPin || "",
      mode, seekers, speechCounter, questionCounter,
      history: history.map(h => ({ ...h, time: typeof h.time === 'object' ? h.time.getTime() : h.time })),
      activeSpeech, currentBillIdx, roundComplete: currentBillIdx >= docket.length,
      speechStartTime: speechStartTime || null,
      speechElapsed: currentSpeechElapsed.current || 0,
      affCount, negCount, speechSequence, inQuestionPeriod,
    };
    writeRoomState(roomCode, state).catch(console.error);
  }, [students, seatingSlots, docket, mode, seekers, speechCounter, questionCounter, history, activeSpeech, currentBillIdx, speechStartTime, affCount, negCount, speechSequence, inQuestionPeriod, roomCode]);

  useEffect(() => { syncToFirebase(); }, [syncToFirebase]);

  // PO heartbeat — proves this session is active (every 5 seconds)
  useEffect(() => {
    updateHeartbeat(roomCode).catch(console.error);
    const iv = setInterval(() => {
      updateHeartbeat(roomCode).catch(console.error);
    }, 5000);
    return () => clearInterval(iv);
  }, [roomCode]);

  // Sync elapsed timer to Firebase every second during speech
  useEffect(() => {
    if (!activeSpeech) return;
    const iv = setInterval(() => {
      updateRoomElapsed(roomCode, currentSpeechElapsed.current).catch(console.error);
    }, 1000);
    return () => clearInterval(iv);
  }, [activeSpeech, roomCode]);

  // Session persistence
  useEffect(() => {
    const save = {
      students, seatingSlots, cols, frontSide, docket, roomCode, poName, roomName: roomName || "", poPin: poPin || "",
      mode, seekers, speechCounter, questionCounter, history,
      activeSpeech, pendingSpeaker, affCount, negCount, speechSequence,
      currentBillIdx, speechStartTime, inQuestionPeriod,
    };
    try { sessionStorage.setItem(`parlipro-po-${roomCode}`, JSON.stringify(save)); } catch(e) {}
  });

  const toggleSeeker = (id) => { if (activeSpeech && mode === "speech") return; if (mode === "speech" && inQuestionPeriod) return; if (mode === "question" && !inQuestionPeriod) return; setSeekers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const activeSeekers = mode === "speech" && inQuestionPeriod ? savedSpeechSeekers : seekers;
  const sortedSeekers = (() => sortPrec(activeSeekers.map(id => getStudent(id)).filter(Boolean), mode))();

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
    setSpeechStartTime(Date.now());
  };

  const startSpeechFromChoice = (id, side, label) => { pushUndo(); startSpeech(id, side, label); };

  const endSpeech = () => {
    pushUndo();
    const dur = currentSpeechElapsed.current;
    const sp = getStudent(activeSpeech.studentId);
    setHistory(p => [{ type: "speech", name: sp?.name, number: activeSpeech.speechNumber, side: activeSpeech.side, bill: currentBill?.name, duration: dur, time: Date.now() }, ...p]);
    setActiveSpeech(null); setMode("question"); setSeekers([]); setSpeechStartTime(null); setInQuestionPeriod(true); setSavedSpeechSeekers([]);
  };

  const recognizeQuestioner = (id) => {
    pushUndo();
    const student = getStudent(id); if (!student) return;
    const nc = questionCounter + 1; setQuestionCounter(nc);
    setStudents(p => p.map(s => s.id === id ? { ...s, questions: (s.questions||0) + 1, questionHistory: [...(s.questionHistory||[]), nc] } : s));
    setHistory(p => [{ type: "question", name: student.name, number: nc, bill: currentBill?.name, time: Date.now() }, ...p]);
    setSeekers(p => p.filter(x => x !== id));
  };

  const removeSeeker = (id) => setSeekers(p => p.filter(x => x !== id));
  const switchToSpeechMode = () => { setMode("speech"); setSeekers([]); setActiveSpeech(null); setInQuestionPeriod(false); setSavedSpeechSeekers([]); };

  const resolveBill = (passed) => {
    pushUndo();
    setDocket(p => p.map((b, i) => i === currentBillIdx ? { ...b, status: passed ? "passed" : "failed" } : b));
    setHistory(p => [{ type: "bill", name: currentBill?.name, status: passed ? "Passed" : "Failed", time: Date.now() }, ...p]);
    setAffCount(0); setNegCount(0); setSpeechSequence([]); setActiveSpeech(null); setPendingSpeaker(null); setSeekers([]); setMode("speech"); setSpeechStartTime(null); setInQuestionPeriod(false);
    const nextIdx = currentBillIdx + 1;
    setCurrentBillIdx(nextIdx);
    setShowPQConfirm(false);
    if (nextIdx >= docket.length) setActiveTab("orders");
  };

  const addBillLive = () => { const n = docketBillInput.trim(); if (!n) return; setDocket(p => [...p, { id: Date.now() + Math.random(), name: n, status: null }]); setDocketBillInput(""); };
  const removeBillLive = (id) => { const idx = docket.findIndex(b => b.id === id); if (idx <= currentBillIdx) return; setDocket(p => p.filter(b => b.id !== id)); };
  const moveBillLive = (idx, dir) => { if (idx <= currentBillIdx) return; const ns = [...docket]; const [item] = ns.splice(idx, 1); ns.splice(idx + dir, 0, item); setDocket(ns); };

  const renameStudent = (id, newName) => {
    setStudents(p => p.map(s => s.id === id ? { ...s, name: newName } : s));
    setSeatingSlots(p => p.map(s => s && s.id === id ? { ...s, name: newName } : s));
  };

  const addStudentLive = (name) => {
    const newStudent = { id: Date.now() + Math.random(), name, speeches: 0, questions: 0, speechHistory: [], questionHistory: [], initialOrder: students.length };
    setStudents(p => [...p, newStudent]);
    // Add to first empty seat
    setSeatingSlots(p => {
      const idx = p.findIndex(s => !s);
      if (idx >= 0) { const ns = [...p]; ns[idx] = newStudent; return ns; }
      return [...p, newStudent]; // append if no empty seats
    });
  };

  const handleCloseRoom = () => {
    deleteRoom(roomCode).catch(console.error);
    try { sessionStorage.removeItem(`parlipro-po-${roomCode}`); sessionStorage.removeItem('parlipro-session'); } catch(e) {}
    onCloseRoom();
  };

  const nextInfo = getNextSpeechInfo();
  const displayName = roomName || `Room ${roomCode}`;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "column" }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "8px 12px" : "10px 20px", borderBottom: "1px solid #2a2520", flexWrap: "wrap", gap: 8, flexShrink: 0, position: isMobile ? "sticky" : undefined, top: isMobile ? 0 : undefined, zIndex: isMobile ? 10 : undefined, background: isMobile ? "#1a1714" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, minWidth: 0, flex: isMobile ? 1 : undefined }}>
          {!isMobile && <Brand size="small" />}
          <div style={{ borderLeft: isMobile ? "none" : "1px solid #3a3530", paddingLeft: isMobile ? 0 : 12, minWidth: 0 }}>
            {!roundComplete && currentBill && (<div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", background: "#2a2520", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{currentBillIdx + 1}/{docket.length}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentBill.name}</span></div>)}
            {roundComplete && <div style={{ fontSize: 13, color: "#5AE89A", fontFamily: "'DM Mono', monospace" }}>All bills debated</div>}
            {!isMobile && <div style={{ fontSize: 10, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>PO: {poName} · {displayName}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530", flexShrink: 0 }}>
            {[{ key: "main", label: "Chamber" }, { key: "docket", label: "Docket" }, { key: "roster", label: "Roster" }, { key: "orders", label: "Orders" }, { key: "log", label: "Log" }].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: isMobile ? "6px 7px" : "6px 10px", background: activeTab === t.key ? GOLD : "transparent", color: activeTab === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 9 : 10, fontWeight: activeTab === t.key ? 600 : 400, cursor: "pointer", textTransform: "uppercase" }}>{t.label}</button>
            ))}
          </div>
          {!isMobile && <div style={{ background: "#2a2520", borderRadius: 6, padding: "5px 10px", border: "1px solid #3a3530", fontFamily: "'DM Mono', monospace" }}>
            <span style={{ fontSize: 9, color: "#9B917F" }}>ROOM </span>
            <span style={{ fontSize: 13, color: GOLD, fontWeight: 500, letterSpacing: "0.1em" }}>{roomCode}</span>
            <span style={{ fontSize: 9, color: "#6b6358", marginLeft: 8 }}>PIN </span>
            <span style={{ fontSize: 11, color: "#9B917F", letterSpacing: "0.1em" }}>{poPin}</span>
          </div>}
          {undoStack.length > 0 && <button onClick={undo} style={{ padding: "5px 10px", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>↩ Undo</button>}
          <button onClick={() => setShowCloseConfirm(true)} style={{ padding: "5px 10px", background: "transparent", color: "#C45A5A", border: "1px solid #6B3A3A", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>Close</button>
        </div>
      </header>

      {/* Close Room Confirmation */}
      {showCloseConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ background: "#231f1b", border: `1px solid ${GOLD}`, borderRadius: 12, padding: 28, maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: GOLD, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Close Room?</div>
            <p style={{ fontSize: 14, color: "#E8E0D0", marginBottom: 20 }}>This will end the session for all spectators and delete the room. This cannot be undone.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowCloseConfirm(false)} style={{ flex: 1, padding: "10px", background: "#2a2520", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleCloseRoom} style={{ flex: 1, padding: "10px", background: "#4A2D2D", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close Room</button>
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
              <SeatingGrid seatingSlots={seatingSlots} cols={cols} frontSide={frontSide} students={students} seekers={mode === "speech" && inQuestionPeriod ? savedSpeechSeekers : seekers} activeSpeech={activeSpeech} mode={mode} interactive={true} onToggle={toggleSeeker} />
            </div>
            <div style={{ padding: isMobile ? "0 12px 12px" : "0 24px 20px", flexShrink: 0 }}>
              {pendingSpeaker && (() => { const ps = getStudent(pendingSpeaker); return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #3a3530", padding: isMobile ? "12px" : "16px 20px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, flexWrap: "wrap" }}><div><div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600 }}>{ps?.name}</div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", marginTop: 3, textTransform: "uppercase" }}>First speech — select type</div></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[{ key: "author", label: "Authorship", bg: "#2D3B4A" }, { key: "sponsor", label: "Sponsorship", bg: "#3B2D4A" }, { key: "aff", label: "1st Affirmative", bg: "#2D4A3E" }].map(o => (<button key={o.key} onClick={() => startSpeechFromChoice(pendingSpeaker, o.key, o.key === "aff" ? "1st Affirmative" : o.label)} style={{ padding: isMobile ? "8px 12px" : "10px 16px", background: o.bg, color: "#E8E0D0", border: "1px solid #3a3530", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: "pointer" }}>{o.label}</button>))}</div><button onClick={() => { pushUndo(); setPendingSpeaker(null); }} style={{ background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 6, padding: "6px 14px", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button></div>); })()}
              {activeSpeech && !pendingSpeaker && (() => { const sp = getStudent(activeSpeech.studentId), col = COLORS[(sp?.initialOrder||0) % COLORS.length]; return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #5AE89A44", padding: isMobile ? "12px" : "14px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}><div style={{ background: `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", border: "2px solid #5AE89A" }}><div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{sp?.name}</div></div><div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 10 : 12, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>{activeSpeech.side}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6b6358", marginTop: 2 }}>Speech #{activeSpeech.speechNumber}</div></div></div><SpeechTimer key={timerKey} onTick={e => { currentSpeechElapsed.current = e; }} /><button onClick={endSpeech} style={{ padding: isMobile ? "8px 14px" : "8px 18px", background: "linear-gradient(135deg, #4A2D2D, #3A1E1E)", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", marginLeft: isMobile ? 0 : "auto" }}>End Speech → Q</button></div>); })()}
              {!activeSpeech && !pendingSpeaker && mode === "question" && inQuestionPeriod && (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #7BA3BF44", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#7BA3BF", textTransform: "uppercase" }}>❓ Question Period</span>
                <button onClick={() => { pushUndo(); switchToSpeechMode(); }} style={{ padding: "8px 18px", background: `linear-gradient(135deg, ${GOLD}, #C49632)`, color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Next Speech →</button>
              </div>)}
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
              {sortedSeekers.map((s, idx) => { const isTop = idx === 0; return (<div key={s.id}>{isTop && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: mode === "speech" ? GOLD : "#7BA3BF", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>▶ Highest Precedence</div>}<div style={{ display: "flex", alignItems: "center", gap: 8, background: isTop ? `linear-gradient(135deg, ${GOLD}33, #C4963222)` : "#2a2520", border: isTop ? `1px solid ${mode === "speech" ? GOLD : "#7BA3BF"}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 10px" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: isTop ? GOLD : "#6b6358", width: 16, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div><div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 2 }}>🎤{s.speeches||0} ❓{s.questions||0}</div></div><div style={{ display: "flex", gap: 4, flexShrink: 0 }}>{isTop && !activeSpeech && mode === "speech" && !inQuestionPeriod && <button onClick={() => recognizeSpeaker(s.id)} style={{ padding: "4px 8px", background: GOLD, color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Recognize</button>}{isTop && !activeSpeech && mode === "question" && inQuestionPeriod && <button onClick={() => recognizeQuestioner(s.id)} style={{ padding: "4px 8px", background: "#7BA3BF", color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Ask</button>}<button onClick={() => removeSeeker(s.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}>×</button></div></div></div>); })}
            </div>)}
            {sortedSeekers.length === 0 && !showPQConfirm && !(mode === "speech" && !activeSpeech && activeSeekers.length === 0) && (<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4540", fontStyle: "italic", fontSize: 13, textAlign: "center", padding: 20 }}>{activeSpeech ? "Speech in progress" : mode === "question" ? "Tap students for question queue" : "Select seekers"}</div>)}
            {activeSeekers.length === 0 && !activeSpeech && !showPQConfirm && (<div style={{ marginTop: isMobile ? 12 : "auto", paddingTop: 14, borderTop: "1px solid #2a2520" }}><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Full {mode} Precedence</div>{sortPrec(students, mode).map((s, idx) => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, color: idx === 0 ? GOLD : "#6b6358" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, width: 16, textAlign: "right" }}>{idx + 1}</span><span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{mode === "speech" ? (s.speeches||0) : (s.questions||0)}</span></div>))}</div>)}
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
        <OrdersTab docket={docket} history={history} students={students} currentBillIdx={currentBillIdx} roundComplete={roundComplete} />
      ) : activeTab === "docket" ? (
        <DocketTab docket={docket} currentBillIdx={currentBillIdx} roundComplete={roundComplete} editable={true} onAdd={addBillLive} onRemove={removeBillLive} onMove={moveBillLive} billInput={docketBillInput} setBillInput={setDocketBillInput} inputRef={docketInputRef} />
      ) : activeTab === "roster" ? (
        <RosterTab students={students} onRename={renameStudent} onAdd={addStudentLive} />
      ) : (
        <LogTab history={history} />
      )}
    </div>
  );
}

// ═══ SPECTATOR VIEW ═══
function SpectatorView({ roomCode }) {
  const [state, setState] = useState(null);
  const [activeTab, setActiveTab] = useState("main");
  const [disconnected, setDisconnected] = useState(false);
  const isMobile = useIsMobile();
  const [mobileShowQueue, setMobileShowQueue] = useState(false);

  useEffect(() => {
    const unsub = subscribeToRoom(roomCode, (data) => {
      if (data) { setState(data); setDisconnected(false); }
      else setDisconnected(true);
    });
    return unsub;
  }, [roomCode]);

  // Timer comes directly from PO via Firebase
  const elapsed = state?.activeSpeech ? (state?.speechElapsed || 0) : 0;

  if (!state) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href={FONTS_LINK} rel="stylesheet" />
        <div style={{ textAlign: "center" }}>
          <Brand size="large" />
          <div style={{ marginTop: 20, fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#9B917F" }}>
            {disconnected ? "Room not found or has ended." : "Connecting to room..."}
          </div>
        </div>
      </div>
    );
  }

  const { students: rawStudents = [], seatingSlots = [], cols = 4, frontSide = "bottom", docket = [], poName = "", roomName = "", mode = "speech", seekers = [], speechCounter = 0, questionCounter = 0, history = [], activeSpeech = null, currentBillIdx = 0, speechStartTime = null } = state;
  const students = (rawStudents || []).map(s => ({ ...s, speeches: s.speeches || 0, questions: s.questions || 0, speechHistory: s.speechHistory || [], questionHistory: s.questionHistory || [], initialOrder: s.initialOrder || 0 }));
  const roundComplete = currentBillIdx >= docket.length;
  const currentBill = docket[currentBillIdx] || null;
  const getStudent = (id) => students.find(s => s.id === id);
  const sortedSeekers = sortPrec((seekers || []).map(id => getStudent(id)).filter(Boolean), mode);
  const displayName = roomName || `Room ${roomCode}`;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "column" }}>
      <link href={FONTS_LINK} rel="stylesheet" />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "8px 12px" : "10px 20px", borderBottom: "1px solid #2a2520", flexWrap: "wrap", gap: 8, flexShrink: 0, position: isMobile ? "sticky" : undefined, top: isMobile ? 0 : undefined, zIndex: isMobile ? 10 : undefined, background: isMobile ? "#1a1714" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, minWidth: 0, flex: isMobile ? 1 : undefined }}>
          {!isMobile && <Brand size="small" />}
          <div style={{ borderLeft: isMobile ? "none" : "1px solid #3a3530", paddingLeft: isMobile ? 0 : 12, minWidth: 0 }}>
            {!roundComplete && currentBill && (<div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", background: "#2a2520", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{currentBillIdx + 1}/{docket.length}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentBill.name}</span></div>)}
            {roundComplete && <div style={{ fontSize: 13, color: "#5AE89A", fontFamily: "'DM Mono', monospace" }}>All bills debated</div>}
            {!isMobile && <div style={{ fontSize: 10, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>PO: {poName} · {displayName}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530" }}>
            {[{ key: "main", label: "Chamber" }, { key: "docket", label: "Docket" }, { key: "orders", label: "Orders" }, { key: "log", label: "Log" }].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: isMobile ? "6px 8px" : "6px 12px", background: activeTab === t.key ? GOLD : "transparent", color: activeTab === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 9 : 10, fontWeight: activeTab === t.key ? 600 : 400, cursor: "pointer", textTransform: "uppercase" }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!isMobile && <div style={{ background: "#2a2520", borderRadius: 6, padding: "5px 10px", border: "1px solid #3a3530", fontFamily: "'DM Mono', monospace" }}>
              <span style={{ fontSize: 9, color: "#9B917F" }}>ROOM </span>
              <span style={{ fontSize: 13, color: GOLD, fontWeight: 500, letterSpacing: "0.1em" }}>{roomCode}</span>
            </div>}
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", background: "#2a2520", borderRadius: 4, padding: "4px 8px", border: "1px solid #3a3530" }}>SPECTATOR</div>
          </div>
        </div>
      </header>

      {activeTab === "main" && !roundComplete ? (
        <div style={{ display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "row", flex: isMobile ? undefined : 1, overflow: isMobile ? "visible" : "hidden" }}>
          <div style={{ flex: isMobile ? undefined : 1, overflow: isMobile ? "visible" : "auto", minWidth: 0, display: isMobile ? "block" : "flex", flexDirection: isMobile ? undefined : "column" }}>
            <div style={{ padding: isMobile ? "12px 12px" : "20px 24px" }}>
              {activeSpeech && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", textTransform: "uppercase", marginBottom: 12 }}>🎤 Speech in progress</div>}
              {!activeSpeech && mode === "question" && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#7BA3BF", textTransform: "uppercase", marginBottom: 12 }}>❓ Question period</div>}
              {!activeSpeech && mode === "speech" && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", textTransform: "uppercase", marginBottom: 12 }}>🎤 Awaiting speakers</div>}
              <SeatingGrid seatingSlots={seatingSlots} cols={cols} frontSide={frontSide} students={students} seekers={seekers} activeSpeech={activeSpeech} mode={mode} interactive={false} />
            </div>
            <div style={{ padding: isMobile ? "0 12px 12px" : "0 24px 20px", flexShrink: 0 }}>
              {activeSpeech && (() => { const sp = getStudent(activeSpeech.studentId); if (!sp) return null; const col = COLORS[(sp.initialOrder||0) % COLORS.length]; return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #5AE89A44", padding: isMobile ? "12px" : "14px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 20, flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}><div style={{ background: `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", border: "2px solid #5AE89A" }}><div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 600 }}>{sp.name}</div></div><div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: isMobile ? 10 : 12, color: GOLD, textTransform: "uppercase", fontWeight: 600 }}>{activeSpeech.side}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6b6358", marginTop: 2 }}>Speech #{activeSpeech.speechNumber}</div></div></div><SpectatorTimer elapsed={elapsed} /></div>); })()}
              {!activeSpeech && mode === "question" && (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #7BA3BF44", padding: "12px 20px" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#7BA3BF", textTransform: "uppercase" }}>❓ Question Period</span></div>)}
            </div>
            {/* Mobile queue toggle */}
            {isMobile && (
              <button onClick={() => setMobileShowQueue(q => !q)} style={{ margin: "0 12px 8px", padding: "10px", background: mobileShowQueue ? GOLD : "#2a2520", color: mobileShowQueue ? "#1a1714" : (mode === "speech" ? GOLD : "#7BA3BF"), border: `1px solid ${mobileShowQueue ? GOLD : "#3a3530"}`, borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {mobileShowQueue ? "▼ Hide Queue" : `▲ ${mode === "speech" ? "Speech" : "Question"} Queue`}
              </button>
            )}
          </div>
          {(!isMobile || mobileShowQueue) && (
          <div style={{ width: isMobile ? "100%" : 250, borderLeft: isMobile ? "none" : "1px solid #2a2520", borderTop: isMobile ? "1px solid #2a2520" : "none", padding: isMobile ? "12px" : "16px 14px", display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "auto", flexShrink: 0 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: mode === "speech" ? GOLD : "#7BA3BF", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>{mode === "speech" ? "Speech" : "Question"} Queue</div>
            {sortedSeekers.length > 0 ? (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedSeekers.map((s, idx) => { const isTop = idx === 0; return (<div key={s.id}>{isTop && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: GOLD, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>▶ Highest Precedence</div>}<div style={{ display: "flex", alignItems: "center", gap: 8, background: isTop ? `linear-gradient(135deg, ${GOLD}33, #C4963222)` : "#2a2520", border: isTop ? `1px solid ${GOLD}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 10px" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: isTop ? GOLD : "#6b6358", width: 16, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div><div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 2 }}>🎤{s.speeches||0} ❓{s.questions||0}</div></div></div></div>); })}
            </div>) : (<div style={{ color: "#4a4540", fontStyle: "italic", fontSize: 13, textAlign: "center", padding: 20 }}>{activeSpeech ? "Speech in progress" : "Waiting for speakers"}</div>)}
            <div style={{ marginTop: isMobile ? 12 : "auto", paddingTop: 14, borderTop: "1px solid #2a2520" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Full {mode} Precedence</div>
              {sortPrec(students, mode).map((s, idx) => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, color: idx === 0 ? GOLD : "#6b6358" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, width: 16, textAlign: "right" }}>{idx + 1}</span><span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{mode === "speech" ? (s.speeches||0) : (s.questions||0)}</span></div>))}
            </div>
          </div>
          )}
        </div>
      ) : activeTab === "main" && roundComplete ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#5AE89A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>All legislation debated</div><button onClick={() => setActiveTab("orders")} style={{ padding: "10px 24px", background: GOLD, color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View Orders of the Day</button></div></div>
      ) : activeTab === "orders" ? (
        <OrdersTab docket={docket} history={history} students={students} currentBillIdx={currentBillIdx} roundComplete={roundComplete} />
      ) : activeTab === "docket" ? (
        <DocketTab docket={docket} currentBillIdx={currentBillIdx} roundComplete={roundComplete} editable={false} />
      ) : (
        <LogTab history={history} />
      )}
    </div>
  );
}

// ═══ ROOT ═══
export default function App() {
  const [view, setView] = useState("landing");
  const [config, setConfig] = useState(null);
  const [spectatorCode, setSpectatorCode] = useState(null);
  const isMobile = useIsMobile();

  // Force scrollability on mobile
  useEffect(() => {
    if (!isMobile) return;
    const style = document.createElement("style");
    style.textContent = `html, body, #root, #__next { height: auto !important; overflow: visible !important; }`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [isMobile]);

  // Restore PO session on refresh
  useEffect(() => {
    // Clean up any rooms older than 24 hours
    cleanupStaleRooms();

    try {
      const saved = sessionStorage.getItem('parlipro-session');
      if (saved) {
        const { view: v, roomCode, spectatorCode: sc } = JSON.parse(saved);
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
      }
    } catch(e) {}
  }, []);

  // Save current view to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('parlipro-session', JSON.stringify({
        view, roomCode: config?.roomCode || null, spectatorCode
      }));
    } catch(e) {}
  }, [view, config, spectatorCode]);

  const handleCloseRoom = () => { setView("landing"); setConfig(null); };

  const handleRejoinPO = (roomCode, firebaseData) => {
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

  if (view === "landing") return <LandingPage onCreateRoom={() => setView("setup")} onJoinRoom={(code) => { setSpectatorCode(code); setView("spectator"); }} onRejoinPO={handleRejoinPO} />;
  if (view === "setup") return <SetupPhase onStart={(cfg) => { setConfig(cfg); setView("active"); }} />;
  if (view === "active" && config) return <ActiveRound config={config} onCloseRoom={handleCloseRoom} />;
  if (view === "spectator" && spectatorCode) return <SpectatorView roomCode={spectatorCode} />;
  return null;
}
