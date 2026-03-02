import { useState, useRef, useEffect } from "react";

const generateCode = () => { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join(""); };
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const COLORS = ["#2D4A3E", "#3B2D4A", "#4A2D2D", "#2D3B4A", "#4A3B2D", "#2D4A44", "#3E2D4A", "#4A2D3B", "#2D424A", "#44402D", "#3A2D4A", "#2D4A36", "#4A2D44", "#2D3E4A", "#4A362D", "#2D4A4A", "#422D4A", "#4A2D36", "#2D454A", "#4A422D"];
const sortPrec = (s, type) => { const k = type === "speech" ? "speeches" : "questions", h = type === "speech" ? "speechHistory" : "questionHistory"; return [...s].sort((a, b) => { if (a[k] !== b[k]) return a[k] - b[k]; const aL = a[h].length ? a[h][a[h].length - 1] : -1, bL = b[h].length ? b[h][b[h].length - 1] : -1; if (aL !== bL) return aL - bL; return a.initialOrder - b.initialOrder; }); };
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function SpeechTimer({ onTick }) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (running) ref.current = setInterval(() => setElapsed(p => p + 1), 1000); else clearInterval(ref.current); return () => clearInterval(ref.current); }, [running]);
  useEffect(() => { if (onTick) onTick(elapsed); }, [elapsed]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 38, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: elapsed > 180 ? "#C45A5A" : "#E8E0D0", letterSpacing: "0.05em", lineHeight: 1 }}>{fmtTime(elapsed)}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setRunning(r => !r)} style={{ padding: "6px 18px", background: running ? "#4A2D2D" : "#2D4A3E", color: running ? "#E8A0A0" : "#A0E8C0", border: running ? "1px solid #6B3A3A" : "1px solid #3A6B4E", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer", minWidth: 72 }}>{running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}</button>
        <button onClick={() => { setRunning(false); setElapsed(0); }} style={{ padding: "6px 12px", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 12, cursor: "pointer" }}>Reset</button>
      </div>
    </div>
  );
}

// ─── BRAND ───
const Brand = ({ size = "large" }) => (
  <div style={{ textAlign: size === "large" ? "center" : "left" }}>
    <div style={{ fontSize: size === "large" ? 11 : 9, fontFamily: "'DM Mono', monospace", color: "#D4A843", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: size === "large" ? 4 : 0 }}>
      ParliPro
    </div>
    {size === "large" && <h1 style={{ fontSize: 34, fontWeight: 300, margin: 0, color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif" }}>Precedence Tracker</h1>}
  </div>
);

// ─── SETUP ───
function SetupPhase({ onStart }) {
  const [poName, setPoName] = useState("");
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
  const nameRef = useRef(null);
  const billRef = useRef(null);

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

  const is = { width: "100%", padding: "10px 14px", background: "#2a2520", border: "1px solid #3a3530", borderRadius: 6, color: "#E8E0D0", fontSize: 14, fontFamily: "'Newsreader', Georgia, serif", outline: "none", boxSizing: "border-box" };
  const ls = { display: "block", fontSize: 11, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" };
  const check = (d) => <span style={{ fontSize: 10, marginLeft: 4, color: d ? "#5AE89A" : "#6b6358" }}>{d ? "✓" : "○"}</span>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a1714 0%, #231f1b 50%, #1a1714 100%)", color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", padding: "0 16px 40px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,600;6..72,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <header style={{ textAlign: "center", padding: "40px 0 20px" }}>
        <Brand size="large" />
        <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 10, background: "#2a2520", borderRadius: 8, padding: "8px 20px", border: "1px solid #3a3530" }}>
          <span style={{ fontSize: 11, color: "#9B917F", fontFamily: "'DM Mono', monospace" }}>ROOM</span>
          <span style={{ fontSize: 22, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#D4A843", letterSpacing: "0.15em" }}>{roomCode}</span>
        </div>
      </header>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* PO Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={ls}>Presiding Officer Name {check(hasPO)}</label>
          <input value={poName} onChange={e => setPoName(e.target.value)} placeholder="Your name" style={is} />
        </div>

        <div style={{ display: "flex", marginBottom: 24, borderRadius: 8, overflow: "hidden", border: "1px solid #3a3530" }}>
          {[{ key: "roster", label: "Roster", done: hasRoster }, { key: "seating", label: "Seating", done: hasSeating }, { key: "docket", label: "Docket", done: hasDocket }].map(t => (
            <button key={t.key} onClick={() => setStep(t.key)} style={{ flex: 1, padding: "11px 0", background: step === t.key ? "#D4A843" : "transparent", color: step === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: step === t.key ? 600 : 400, cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>{t.label}{check(t.done)}</button>
          ))}
        </div>

        {step === "roster" && (<>
          <div style={{ marginBottom: 16 }}>
            <label style={ls}>Add Students ({students.length})</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={nameRef} value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudent()} placeholder="Name, then Enter" style={{ ...is, width: "auto", flex: 1 }} />
              <button onClick={addStudent} style={{ padding: "10px 20px", background: "#D4A843", color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
            </div>
          </div>
          {students.length > 1 && <button onClick={randomize} style={{ padding: "7px 16px", background: "transparent", color: "#D4A843", border: "1px solid #D4A843", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer", marginBottom: 16 }}>↻ Randomize Order</button>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {students.map((s, idx) => (
              <div key={s.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={e => handleDragOver(e, idx)} onDragEnd={() => setDragIdx(null)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "grab" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6358", width: 22, textAlign: "right" }}>{idx + 1}.</span>
                <div style={{ flex: 1, background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}cc, ${COLORS[idx % COLORS.length]}99)`, borderRadius: 7, padding: "9px 14px", fontSize: 14, fontWeight: 600, border: dragIdx === idx ? "2px solid #D4A843" : "2px solid transparent" }}>{s.name}</div>
                <button onClick={() => removeStudent(s.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>×</button>
              </div>
            ))}
          </div>
          {students.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b6358", fontStyle: "italic" }}>Add students in initial precedence order, or add then randomize.</div>}
        </>)}

        {step === "seating" && (<>
          {students.length < 2 ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b6358", fontStyle: "italic" }}>Add at least 2 students in the Roster tab first.</div> : (<>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div><label style={ls}>Columns</label><select value={cols} onChange={e => setCols(Number(e.target.value))} style={{ ...is, width: 70, padding: "8px 10px" }}>{[3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={ls}>Rows</label><select value={rows} onChange={e => setRows(Number(e.target.value))} style={{ ...is, width: 70, padding: "8px 10px" }}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label style={ls}>Front</label><div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530" }}>{[{ k: "top", a: "▲" }, { k: "bottom", a: "▼" }, { k: "left", a: "◀" }, { k: "right", a: "▶" }].map(o => (<button key={o.k} onClick={() => setFrontSide(o.k)} style={{ padding: "7px 10px", background: frontSide === o.k ? "#D4A843" : "transparent", color: frontSide === o.k ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: frontSide === o.k ? 600 : 400, cursor: "pointer" }}>{o.a}</button>))}</div></div>
            </div>
            <p style={{ fontSize: 12, color: "#9B917F", fontStyle: "italic", marginBottom: 12 }}>Drag to rearrange.</p>
            {frontSide === "top" && <div style={{ textAlign: "center", padding: "6px 0 10px", color: "#D4A843", fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderBottom: "1px solid #3a3530", marginBottom: 12 }}>▲ Front / PO</div>}
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {frontSide === "left" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "10px 6px", color: "#D4A843", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderRight: "1px solid #3a3530", marginRight: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>◀ Front / PO</div>}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, maxWidth: 520, margin: "0 auto", flex: 1 }}>
                {seatingSlots.map((student, idx) => (
                  <div key={student ? `s-${student.id}` : `e-${idx}`} draggable={!!student} onDragStart={() => student && setSeatDrag(idx)} onDragOver={e => handleSeatDragOver(e, idx)} onDragEnd={() => setSeatDrag(null)} style={{ minHeight: 50, borderRadius: 7, border: student ? "none" : "2px dashed #3a3530", display: "flex", alignItems: "center", justifyContent: "center", cursor: student ? "grab" : "default" }}>
                    {student ? <div style={{ width: "100%", background: `linear-gradient(135deg, ${COLORS[student.initialOrder % COLORS.length]}cc, ${COLORS[student.initialOrder % COLORS.length]}99)`, borderRadius: 7, padding: "10px 8px", fontSize: 13, fontWeight: 600, textAlign: "center", border: seatDrag === idx ? "2px solid #D4A843" : "2px solid transparent", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: seatDrag === idx ? 0.7 : 1 }}>{student.name}</div> : <span style={{ color: "#3a3530", fontSize: 11 }}>—</span>}
                  </div>
                ))}
              </div>
              {frontSide === "right" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "10px 6px", color: "#D4A843", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderLeft: "1px solid #3a3530", marginLeft: 10, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(180deg)" }}>◀ Front / PO</div>}
            </div>
            {frontSide === "bottom" && <div style={{ textAlign: "center", padding: "10px 0 6px", color: "#D4A843", fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderTop: "1px solid #3a3530", marginTop: 12 }}>▼ Front / PO</div>}
          </>)}
        </>)}

        {step === "docket" && (<>
          <div style={{ marginBottom: 16 }}>
            <label style={ls}>Add Legislation ({docket.length})</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={billRef} value={billInput} onChange={e => setBillInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addBill()} placeholder="Bill name, then Enter" style={{ ...is, width: "auto", flex: 1 }} />
              <button onClick={addBill} style={{ padding: "10px 20px", background: "#D4A843", color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
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

        <button disabled={!canStart} onClick={() => onStart({ students: seatingSlots.filter(Boolean), seatingSlots, cols, rows, docket, frontSide, roomCode, poName: poName.trim() })} style={{ width: "100%", marginTop: 28, padding: "16px 0", background: canStart ? "linear-gradient(135deg, #D4A843, #C49632)" : "#3a3530", color: canStart ? "#1a1714" : "#6b6358", border: "none", borderRadius: 8, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: canStart ? "pointer" : "not-allowed", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {canStart ? "Begin Round →" : `Complete setup (${[!hasPO && "PO Name", !hasRoster && "Roster", !hasSeating && "Seating", !hasDocket && "Docket"].filter(Boolean).join(", ")})`}
        </button>
      </div>
    </div>
  );
}

// ─── ACTIVE ROUND ───
function ActiveRound({ config }) {
  const { students: initStudents, seatingSlots: initSlots, cols, frontSide, docket: initDocket, roomCode, poName } = config;
  const [students, setStudents] = useState(initStudents);
  const [seatingSlots] = useState(initSlots);
  const [mode, setMode] = useState("speech");
  const [seekers, setSeekers] = useState([]);
  const [speechCounter, setSpeechCounter] = useState(0);
  const [questionCounter, setQuestionCounter] = useState(0);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("main");
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [pendingSpeaker, setPendingSpeaker] = useState(null);
  const [affCount, setAffCount] = useState(0);
  const [negCount, setNegCount] = useState(0);
  const [speechSequence, setSpeechSequence] = useState([]);
  const [timerKey, setTimerKey] = useState(0);
  const [docket, setDocket] = useState(initDocket);
  const [currentBillIdx, setCurrentBillIdx] = useState(0);
  const [showPQConfirm, setShowPQConfirm] = useState(false);
  const currentSpeechElapsed = useRef(0);

  // Docket editing from main screen
  const [docketBillInput, setDocketBillInput] = useState("");
  const docketInputRef = useRef(null);
  const addBillLive = () => { const n = docketBillInput.trim(); if (!n) return; setDocket(p => [...p, { id: Date.now() + Math.random(), name: n, status: null }]); setDocketBillInput(""); docketInputRef.current?.focus(); };
  const removeBillLive = (id) => { const idx = docket.findIndex(b => b.id === id); if (idx < currentBillIdx) return; if (idx === currentBillIdx && activeSpeech) return; setDocket(p => p.filter(b => b.id !== id)); };
  const moveBillLive = (idx, dir) => { if (idx < currentBillIdx || idx + dir < currentBillIdx) return; const ns = [...docket]; const [item] = ns.splice(idx, 1); ns.splice(idx + dir, 0, item); setDocket(ns); };

  const currentBill = docket[currentBillIdx] || null;
  const roundComplete = currentBillIdx >= docket.length;
  const getStudent = (id) => students.find(s => s.id === id);

  const toggleSeeker = (id) => { if (activeSpeech && mode === "speech") return; setSeekers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };
  const sortedSeekers = (() => sortPrec(seekers.map(id => getStudent(id)).filter(Boolean), mode))();

  const getNextSpeechInfo = () => {
    if (speechSequence.length === 0) return { needsChoice: true };
    if (speechSequence.length === 1) return { side: "neg", label: "1st Negative", canOverride: false };
    const last = speechSequence[speechSequence.length - 1];
    const sug = last === "neg" ? "aff" : "neg";
    const n = sug === "aff" ? affCount + 1 : negCount + 1;
    return { side: sug, label: `${ordinal(n)} ${sug === "aff" ? "Affirmative" : "Negative"}`, canOverride: true };
  };

  const breakCycle = () => { const info = getNextSpeechInfo(); if (!info.canOverride) return; setSpeechSequence(p => [...p, info.side]); };
  const recognizeSpeaker = (id) => { const info = getNextSpeechInfo(); if (info.needsChoice) setPendingSpeaker(id); else startSpeech(id, info.side, info.label); };

  const startSpeech = (id, side, label) => {
    const student = getStudent(id); if (!student) return;
    const nc = speechCounter + 1; setSpeechCounter(nc);
    if (side === "aff" || side === "author" || side === "sponsor") setAffCount(c => c + 1);
    if (side === "neg") setNegCount(c => c + 1);
    setSpeechSequence(p => [...p, (side === "author" || side === "sponsor") ? "aff" : side]);
    setStudents(p => p.map(s => s.id === id ? { ...s, speeches: s.speeches + 1, speechHistory: [...s.speechHistory, nc] } : s));
    setActiveSpeech({ studentId: id, side: label, speechNumber: nc });
    setPendingSpeaker(null); setSeekers([]); setTimerKey(k => k + 1); currentSpeechElapsed.current = 0;
  };

  const endSpeech = () => {
    const dur = currentSpeechElapsed.current;
    const sp = getStudent(activeSpeech.studentId);
    setHistory(p => [{ type: "speech", name: sp?.name, number: activeSpeech.speechNumber, side: activeSpeech.side, bill: currentBill?.name, duration: dur, time: new Date() }, ...p]);
    setActiveSpeech(null); setMode("question"); setSeekers([]);
  };

  const recognizeQuestioner = (id) => {
    const student = getStudent(id); if (!student) return;
    const nc = questionCounter + 1; setQuestionCounter(nc);
    setStudents(p => p.map(s => s.id === id ? { ...s, questions: s.questions + 1, questionHistory: [...s.questionHistory, nc] } : s));
    setHistory(p => [{ type: "question", name: student.name, number: nc, bill: currentBill?.name, time: new Date() }, ...p]);
    setSeekers(p => p.filter(x => x !== id));
  };

  const removeSeeker = (id) => setSeekers(p => p.filter(x => x !== id));
  const undoLast = () => {
    if (!history.length) return; const last = history[0];
    setStudents(p => p.map(s => { if (s.name !== last.name) return s; if (last.type === "speech") { const h = [...s.speechHistory]; h.pop(); return { ...s, speeches: s.speeches - 1, speechHistory: h }; } const h = [...s.questionHistory]; h.pop(); return { ...s, questions: s.questions - 1, questionHistory: h }; }));
    if (last.type === "speech") { setSpeechCounter(c => c - 1); const ls = speechSequence[speechSequence.length - 1]; if (ls === "aff") setAffCount(c => c - 1); if (ls === "neg") setNegCount(c => c - 1); setSpeechSequence(p => p.slice(0, -1)); } else setQuestionCounter(c => c - 1);
    setHistory(p => p.slice(1));
  };
  const switchToSpeechMode = () => { setMode("speech"); setSeekers([]); setActiveSpeech(null); };
  const resolveBill = (passed) => {
    setDocket(p => p.map((b, i) => i === currentBillIdx ? { ...b, status: passed ? "passed" : "failed" } : b));
    setHistory(p => [{ type: "bill", name: currentBill?.name, status: passed ? "Passed" : "Failed", time: new Date() }, ...p]);
    setAffCount(0); setNegCount(0); setSpeechSequence([]); setActiveSpeech(null); setPendingSpeaker(null); setSeekers([]); setMode("speech");
    const nextIdx = currentBillIdx + 1;
    setCurrentBillIdx(nextIdx);
    setShowPQConfirm(false);
    // If that was the last bill, switch to orders tab
    if (nextIdx >= docket.length) setActiveTab("orders");
  };

  const nextInfo = getNextSpeechInfo();
  const totalSpeeches = history.filter(h => h.type === "speech").length;
  const totalQuestions = history.filter(h => h.type === "question").length;
  const totalSpeechTime = history.filter(h => h.type === "speech").reduce((a, h) => a + (h.duration || 0), 0);
  const billsDebated = docket.filter(b => b.status).length;
  const billsPassed = docket.filter(b => b.status === "passed").length;
  const billsFailed = docket.filter(b => b.status === "failed").length;
  const studentStats = [...students].sort((a, b) => b.speeches - a.speeches);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a1714 0%, #231f1b 50%, #1a1714 100%)", color: "#E8E0D0", fontFamily: "'Newsreader', Georgia, serif", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,600;6..72,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid #2a2520", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Brand size="small" />
          <div style={{ borderLeft: "1px solid #3a3530", paddingLeft: 12 }}>
            {!roundComplete && currentBill && (
              <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", background: "#2a2520", borderRadius: 4, padding: "2px 6px" }}>{currentBillIdx + 1}/{docket.length}</span>
                {currentBill.name}
              </div>
            )}
            {roundComplete && <div style={{ fontSize: 13, color: "#5AE89A", fontFamily: "'DM Mono', monospace" }}>All bills debated</div>}
            <div style={{ fontSize: 11, color: "#9B917F", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>PO: {poName}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid #3a3530" }}>
            {[{ key: "main", label: "Chamber" }, { key: "docket", label: "Docket" }, { key: "orders", label: "Orders" }, { key: "log", label: "Log" }].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: "6px 12px", background: activeTab === t.key ? "#D4A843" : "transparent", color: activeTab === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: activeTab === t.key ? 600 : 400, cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase" }}>{t.label}</button>
            ))}
          </div>
          <div style={{ background: "#2a2520", borderRadius: 6, padding: "5px 10px", border: "1px solid #3a3530", fontFamily: "'DM Mono', monospace" }}>
            <span style={{ fontSize: 9, color: "#9B917F" }}>ROOM </span>
            <span style={{ fontSize: 13, color: "#D4A843", fontWeight: 500, letterSpacing: "0.1em" }}>{roomCode}</span>
          </div>
          {history.length > 0 && !activeSpeech && activeTab === "main" && <button onClick={undoLast} style={{ padding: "5px 10px", background: "transparent", color: "#9B917F", border: "1px solid #3a3530", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>↩ Undo</button>}
        </div>
      </header>

      {activeTab === "main" && !roundComplete ? (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "auto", minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px" }}>
              {!activeSpeech && (<div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1px solid #3a3530", maxWidth: 320 }}>
                {[{ key: "speech", label: `🎤 Speeches (${speechCounter})` }, { key: "question", label: `❓ Questions (${questionCounter})` }].map(t => (
                  <button key={t.key} onClick={() => { setMode(t.key); if (t.key === "speech") setSeekers([]); }} style={{ flex: 1, padding: "8px 0", background: mode === t.key ? "#D4A843" : "transparent", color: mode === t.key ? "#1a1a1a" : "#9B917F", border: "none", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: mode === t.key ? 600 : 400, cursor: "pointer", textTransform: "uppercase" }}>{t.label}</button>
                ))}
              </div>)}
              {activeSpeech && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>🎤 Speech in progress</div>}
              {!activeSpeech && mode === "question" && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#7BA3BF", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>❓ Question period</div>}

              {frontSide === "top" && <div style={{ textAlign: "center", padding: "4px 0 8px", color: "#D4A843", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderBottom: "1px solid #2a2520", marginBottom: 8 }}>▲ Front / PO</div>}
              <div style={{ display: "flex", alignItems: "stretch" }}>
                {frontSide === "left" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "8px 5px", color: "#D4A843", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderRight: "1px solid #2a2520", marginRight: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>◀ PO</div>}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7, maxWidth: cols * 125, flex: 1 }}>
                  {seatingSlots.map((student, idx) => {
                    if (!student) return <div key={idx} style={{ minHeight: 52, borderRadius: 7, border: "2px dashed #2a2520" }} />;
                    const s = getStudent(student.id); if (!s) return null;
                    const isSk = seekers.includes(s.id), isSp = activeSpeech?.studentId === s.id, col = COLORS[s.initialOrder % COLORS.length], locked = !!activeSpeech && mode === "speech";
                    return (<div key={idx} onClick={() => !locked && toggleSeeker(s.id)} style={{ background: isSp ? "linear-gradient(135deg, #2D4A3E, #1E3A2E)" : isSk ? "linear-gradient(135deg, #D4A843, #C49632)" : `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 7, padding: "9px 7px 7px", cursor: locked ? "default" : "pointer", textAlign: "center", border: isSp ? "2px solid #5AE89A" : isSk ? "2px solid #F0D78C" : "2px solid transparent", transition: "all 0.15s ease", color: isSk ? "#1a1714" : "#E8E0D0", position: "relative", userSelect: "none", opacity: locked && !isSp ? 0.5 : 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>{s.name}</div>
                      <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", opacity: 0.75, display: "flex", justifyContent: "center", gap: 6 }}><span>🎤{s.speeches}</span><span>❓{s.questions}</span></div>
                      {isSk && !isSp && <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "#F0D78C", border: "2px solid #1a1714" }} />}
                      {isSp && <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "#5AE89A", border: "2px solid #1a1714" }} />}
                    </div>);
                  })}
                </div>
                {frontSide === "right" && <div style={{ writingMode: "vertical-lr", textAlign: "center", padding: "8px 5px", color: "#D4A843", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", borderLeft: "1px solid #2a2520", marginLeft: 8, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(180deg)" }}>◀ PO</div>}
              </div>
              {frontSide === "bottom" && <div style={{ textAlign: "center", padding: "8px 0 4px", color: "#D4A843", fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", borderTop: "1px solid #2a2520", marginTop: 8 }}>▼ Front / PO</div>}
            </div>
            <div style={{ padding: "0 20px 16px", flexShrink: 0 }}>
              {pendingSpeaker && (() => { const ps = getStudent(pendingSpeaker); return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #3a3530", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}><div><div style={{ fontSize: 16, fontWeight: 600 }}>{ps?.name}</div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", marginTop: 3, letterSpacing: "0.1em", textTransform: "uppercase" }}>First speech — select type</div></div><div style={{ display: "flex", gap: 8 }}>{[{ key: "author", label: "Authorship", bg: "#2D3B4A" }, { key: "sponsor", label: "Sponsorship", bg: "#3B2D4A" }, { key: "aff", label: "1st Affirmative", bg: "#2D4A3E" }].map(o => (<button key={o.key} onClick={() => startSpeech(pendingSpeaker, o.key, o.key === "aff" ? "1st Affirmative" : o.label)} style={{ padding: "10px 16px", background: o.bg, color: "#E8E0D0", border: "1px solid #3a3530", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.label}</button>))}</div><button onClick={() => setPendingSpeaker(null)} style={{ background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 6, padding: "6px 14px", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>Cancel</button></div>); })()}
              {activeSpeech && !pendingSpeaker && (() => { const sp = getStudent(activeSpeech.studentId), col = COLORS[sp?.initialOrder % COLORS.length]; return (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #5AE89A44", padding: "14px 20px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ background: `linear-gradient(135deg, ${col}cc, ${col}99)`, borderRadius: 8, padding: "8px 16px", border: "2px solid #5AE89A" }}><div style={{ fontSize: 17, fontWeight: 600 }}>{sp?.name}</div></div><div><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#D4A843", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{activeSpeech.side}</div><div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6b6358", marginTop: 2 }}>Speech #{activeSpeech.speechNumber}</div></div></div><SpeechTimer key={timerKey} onTick={e => { currentSpeechElapsed.current = e; }} /><button onClick={endSpeech} style={{ padding: "8px 18px", background: "linear-gradient(135deg, #4A2D2D, #3A1E1E)", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase", marginLeft: "auto" }}>End Speech → Questions</button></div>); })()}
              {!activeSpeech && !pendingSpeaker && mode === "question" && (<div style={{ background: "#1e1b17", borderRadius: 10, border: "1px solid #7BA3BF44", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#7BA3BF", letterSpacing: "0.08em", textTransform: "uppercase" }}>❓ Question Period</span><button onClick={switchToSpeechMode} style={{ padding: "8px 18px", background: "linear-gradient(135deg, #D4A843, #C49632)", color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Next Speech →</button></div>)}
              {!activeSpeech && !pendingSpeaker && mode === "speech" && seekers.length === 0 && (<div style={{ padding: "8px 0", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#4a4540", fontStyle: "italic" }}>{nextInfo.needsChoice ? "Recognize a speaker to begin the first speech" : `Next: ${nextInfo.label}`}</div>)}
            </div>
          </div>

          {/* RIGHT QUEUE */}
          <div style={{ width: 250, borderLeft: "1px solid #2a2520", padding: "16px 14px", display: "flex", flexDirection: "column", overflow: "auto", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: mode === "speech" ? "#D4A843" : "#7BA3BF", letterSpacing: "0.1em", textTransform: "uppercase" }}>{mode === "speech" ? "Speech" : "Question"} Queue</span>
              {seekers.length > 0 && !activeSpeech && <button onClick={() => setSeekers([])} style={{ background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 4, padding: "2px 8px", fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>Clear</button>}
            </div>
            {mode === "speech" && !activeSpeech && seekers.length === 0 && !showPQConfirm && (<div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {!nextInfo.needsChoice && nextInfo.canOverride && (<><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", letterSpacing: "0.08em", textTransform: "uppercase" }}>Up next: {nextInfo.label}</div><button onClick={breakCycle} style={{ width: "100%", padding: "8px 0", background: "transparent", color: "#C45A5A", border: "1px solid #6B3A3A", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase" }}>⚡ Break Cycle → {nextInfo.side === "aff" ? "Neg" : "Aff"}</button></>)}
              {speechSequence.length > 0 && <button onClick={() => setShowPQConfirm(true)} style={{ width: "100%", padding: "8px 0", background: "transparent", color: "#D4A843", border: "1px solid #D4A843", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase" }}>📜 Move to Previous Question</button>}
            </div>)}
            {showPQConfirm && (<div style={{ background: "#2a2520", borderRadius: 8, border: "1px solid #D4A843", padding: 16, marginBottom: 12 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D4A843", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>Vote: {currentBill?.name}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => resolveBill(true)} style={{ flex: 1, padding: "10px 0", background: "#2D4A3E", color: "#5AE89A", border: "1px solid #3A6B4E", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>✓ Passed</button>
                <button onClick={() => resolveBill(false)} style={{ flex: 1, padding: "10px 0", background: "#4A2D2D", color: "#E8A0A0", border: "1px solid #6B3A3A", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>✗ Failed</button>
              </div>
              <button onClick={() => setShowPQConfirm(false)} style={{ width: "100%", marginTop: 8, background: "none", border: "1px solid #3a3530", color: "#6b6358", borderRadius: 6, padding: "6px 0", fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: "pointer" }}>Cancel</button>
            </div>)}
            {sortedSeekers.length > 0 && (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedSeekers.map((s, idx) => { const isTop = idx === 0; return (<div key={s.id}>{isTop && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: mode === "speech" ? "#D4A843" : "#7BA3BF", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>▶ Highest Precedence</div>}<div style={{ display: "flex", alignItems: "center", gap: 8, background: isTop ? (mode === "speech" ? "linear-gradient(135deg, #D4A84333, #C4963222)" : "linear-gradient(135deg, #7BA3BF22, #5A8AAA22)") : "#2a2520", border: isTop ? `1px solid ${mode === "speech" ? "#D4A843" : "#7BA3BF"}` : "1px solid #3a3530", borderRadius: 7, padding: "9px 10px" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: isTop ? (mode === "speech" ? "#D4A843" : "#7BA3BF") : "#6b6358", width: 16, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div><div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 2 }}>🎤{s.speeches} ❓{s.questions}</div></div><div style={{ display: "flex", gap: 4, flexShrink: 0 }}>{isTop && !activeSpeech && mode === "speech" && <button onClick={() => recognizeSpeaker(s.id)} style={{ padding: "4px 8px", background: "#D4A843", color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Recognize</button>}{isTop && !activeSpeech && mode === "question" && <button onClick={() => recognizeQuestioner(s.id)} style={{ padding: "4px 8px", background: "#7BA3BF", color: "#1a1714", border: "none", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Ask</button>}<button onClick={() => removeSeeker(s.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}>×</button></div></div></div>); })}
            </div>)}
            {sortedSeekers.length === 0 && !showPQConfirm && !(mode === "speech" && !activeSpeech && seekers.length === 0) && (<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4540", fontStyle: "italic", fontSize: 13, textAlign: "center", padding: 20 }}>{activeSpeech ? "Speech in progress" : mode === "question" ? "Tap students for question queue" : "Select seekers"}</div>)}
            {seekers.length === 0 && !activeSpeech && !showPQConfirm && (<div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid #2a2520" }}><div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#6b6358", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Full {mode} Precedence</div>{sortPrec(students, mode).map((s, idx) => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, color: idx === 0 ? "#D4A843" : "#6b6358" }}><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, width: 16, textAlign: "right" }}>{idx + 1}</span><span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>{mode === "speech" ? s.speeches : s.questions}</span></div>))}</div>)}
          </div>
        </div>
      ) : activeTab === "main" && roundComplete ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#5AE89A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>All legislation debated</div>
            <div style={{ fontSize: 18, fontWeight: 300, marginBottom: 16 }}>Check the Orders or Log tabs for the full round summary.</div>
            <button onClick={() => setActiveTab("orders")} style={{ padding: "10px 24px", background: "#D4A843", color: "#1a1714", border: "none", borderRadius: 7, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View Orders of the Day</button>
          </div>
        </div>
      ) : activeTab === "orders" ? (
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D4A843", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 20 }}>Orders of the Day</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[{ l: "Speeches", v: totalSpeeches, c: "#D4A843" }, { l: "Questions", v: totalQuestions, c: "#7BA3BF" }, { l: "Speech Time", v: fmtTime(totalSpeechTime), c: "#E8E0D0" }].map(c => (
                <div key={c.l} style={{ background: "#2a2520", borderRadius: 8, padding: 16, border: "1px solid #3a3530", textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 600, color: c.c, fontFamily: "'DM Mono', monospace" }}>{c.v}</div>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#9B917F", marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>{c.l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Docket — {billsDebated}/{docket.length} debated ({billsPassed} passed, {billsFailed} failed)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
              {docket.map((b, i) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#2a2520", borderRadius: 7, border: i === currentBillIdx && !roundComplete ? "1px solid #D4A843" : "1px solid #3a3530" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: b.status ? "#E8E0D0" : i === currentBillIdx ? "#E8E0D0" : "#6b6358" }}>{b.name}</span>
                  {b.status ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span> : i === currentBillIdx && !roundComplete ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#D4A843" }}>IN DEBATE</span> : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#4a4540" }}>Pending</span>}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Student Activity</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {studentStats.map((s, idx) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#2a2520", borderRadius: 6, border: "1px solid #3a3530" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358", width: 18, textAlign: "right" }}>{idx + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#D4A843" }}>🎤 {s.speeches}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#7BA3BF" }}>❓ {s.questions}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : activeTab === "docket" ? (
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <div style={{ maxWidth: 500, margin: "0 auto" }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#D4A843", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>Edit Docket</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input ref={docketInputRef} value={docketBillInput} onChange={e => setDocketBillInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addBillLive()} placeholder="Add bill..." style={{ flex: 1, padding: "10px 14px", background: "#2a2520", border: "1px solid #3a3530", borderRadius: 6, color: "#E8E0D0", fontSize: 14, fontFamily: "'Newsreader', Georgia, serif", outline: "none", boxSizing: "border-box" }} />
              <button onClick={addBillLive} style={{ padding: "10px 20px", background: "#D4A843", color: "#1a1a1a", border: "none", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {docket.map((b, idx) => {
                const isPast = idx < currentBillIdx;
                const isCurrent = idx === currentBillIdx && !roundComplete;
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: isPast ? 0.5 : 1 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#6b6358", width: 22, textAlign: "right" }}>{idx + 1}.</span>
                    <div style={{ flex: 1, background: "#2a2520", border: isCurrent ? "1px solid #D4A843" : "1px solid #3a3530", borderRadius: 7, padding: "9px 14px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      {b.name}
                      {b.status && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: b.status === "passed" ? "#5AE89A" : "#C45A5A", textTransform: "uppercase" }}>{b.status}</span>}
                      {isCurrent && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "#D4A843" }}>CURRENT</span>}
                    </div>
                    {!isPast && !isCurrent && (<>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {idx > currentBillIdx + (roundComplete ? 0 : 1) && <button onClick={() => moveBillLive(idx, -1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▲</button>}
                        {idx < docket.length - 1 && <button onClick={() => moveBillLive(idx, 1)} style={{ background: "none", border: "none", color: "#9B917F", cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>▼</button>}
                      </div>
                      <button onClick={() => removeBillLive(b.id)} style={{ background: "none", border: "none", color: "#6b6358", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}>×</button>
                    </>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, padding: "20px 24px", maxWidth: 600, margin: "0 auto", overflow: "auto" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#9B917F", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Round Activity Log</div>
          {history.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "#6b6358", fontStyle: "italic" }}>No activity yet.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {history.map((entry, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#2a2520", borderRadius: 6, borderLeft: `3px solid ${entry.type === "speech" ? "#D4A843" : entry.type === "question" ? "#7BA3BF" : "#5AE89A"}` }}>
                  <span style={{ fontSize: 16 }}>{entry.type === "speech" ? "🎤" : entry.type === "question" ? "❓" : "📜"}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    <strong>{entry.name}</strong>
                    {entry.side && <span style={{ color: "#D4A843", fontSize: 12 }}> — {entry.side}</span>}
                    {entry.status && <span style={{ color: entry.status === "Passed" ? "#5AE89A" : "#C45A5A", fontSize: 12, fontWeight: 600 }}> — {entry.status}</span>}
                    {entry.bill && entry.type !== "bill" && <span style={{ color: "#6b6358", fontSize: 11 }}> · {entry.bill}</span>}
                    {entry.type === "speech" && entry.duration != null && <span style={{ color: "#9B917F", fontSize: 11 }}> · {fmtTime(entry.duration)}</span>}
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#6b6358" }}>{entry.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CongressionalDebateTracker() {
  const [config, setConfig] = useState(null);
  if (!config) return <SetupPhase onStart={setConfig} />;
  return <ActiveRound config={config} />;
}
