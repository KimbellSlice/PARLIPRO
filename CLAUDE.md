# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ParliPro is a free, real-time parliamentary tool for NSDA/TFA Congressional Debate. A Presiding Officer (PO) runs a "chamber" (round) from one device — managing speaker precedence, speech/questioning timers, bill splits, and docket — while competitors and spectators follow along live on their own devices via a shared room code.

## Commands

```
npm run dev       # start Vite dev server (localhost:5173)
npm run build     # production build to dist/ (also runs prerendering, see below)
npm run preview   # preview the production build locally
```

There is no lint or test setup in this repo — there are no test files or linter config to run.

## Architecture

**Single-page app, almost entirely in one file.** `src/App.jsx` (~2000 lines) contains every component: the landing page, chamber setup wizard, the PO's active-round console, and the spectator/competitor view. There is no router — `App()` at the bottom of the file switches between views (`landing` / `setup` / `active` / `competitor` / `spectator`) via a single `view` state variable and renders the corresponding top-level component. When navigating this file, use the `// ═══ SECTION ═══` banner comments and grep for `^function ` to jump between components rather than reading linearly.

Key top-level components, in file order:
- `LandingPage` — create/join a chamber, claim a roster name, rejoin as PO via PIN
- `SetupPhase` — PO wizard to build the roster (with initial speech precedence), seating chart, and legislation docket before the room is created
- `SeatingGrid`, `OrdersTab`, `LogTab`, `DocketTab`, `RosterTab` — shared read/write display components reused by both the PO and spectator views
- `ActiveRound` — the PO's console once a chamber is live; owns almost all round state (speaker queue, timers, docket progression, vote counts, undo stack) and pushes it to Firebase
- `SpectatorView` — read-only-ish live view used by both spectators and competitors (competitors can additionally set bill splits and signal intent to speak)

**State model.** All round state lives in React state inside `ActiveRound`, treated as the source of truth, and is mirrored to Firebase Realtime Database on every change via a debounced `syncToFirebase` (150ms) in `writeRoomState`. Every other client (`SpectatorView` instances) subscribes read-only via `subscribeToRoom`. There is no separate backend — `src/firebase.js` is the entire data layer, talking directly to Firebase RTDB from the browser.

**Persistence/rejoin.** The PO's full round state is also mirrored into `sessionStorage` (`parlipro-po-{roomCode}`) so a page refresh can restore an in-progress round without a Firebase round-trip; `App()` checks this on mount before deciding the initial view. Competitor/spectator identity (`parlipro-session`) is restored the same way.

**Presence & concurrency control**, all in `firebase.js`:
- PO presence is a heartbeat (`poHeartbeat`, updated every 30s) plus `onDisconnect` cleanup — this is how the app knows if a PO session died and another device can claim the PIN.
- Competitor name claims (`claimCompetitorNameAtomic`, `claimCompetitorName`/`releaseCompetitorName`) prevent two devices from claiming the same roster name, gated by `STALE_MS` (45s) staleness.
- Spectator presence is tracked separately (`claimSpectatorPresence`).
- Auth is anonymous-only (`signInAnonymously`); the resulting UID is used to attribute claims/heartbeats, not for any account system.

**Docket flow.** Bills start in a `legislationPack` (the full pack entered at setup). Competitors can each submit a proposed docket (`submitDocketProposal`); `computeRecommendedDocket` in `App.jsx` scores bills by interest × affirmative/negative balance to suggest a top-5. The PO calls `adoptDocket` to lock in the official `docket` that the round actually proceeds through.

**Precedence logic.** `sortPrec` in `App.jsx` implements the actual parliamentary precedence rules: fewest speeches/questions first, then who spoke/asked longest ago, with three configurable question-precedence tiebreak modes (`reverse`, `random`, `match`) chosen at setup time and stored per-student as `questionOrder`.

**Styling.** No CSS framework — everything is inline `style={{...}}` objects using a small set of shared constants (`GOLD`, `BG`, `IS` input style, `LS` label style) defined near the top of `App.jsx`. Fonts (Newsreader, DM Mono) are loaded from Google Fonts via a `<link>` tag rendered per-page rather than in `index.html` head (except the SEO-relevant preload in `index.html` itself).

**Prerendering/SEO.** `vite.config.js` uses `vite-plugin-html-prerender` to prerender the `/` route into `dist/` at build time so crawlers see real content; `index.html` also carries hand-written meta tags, OpenGraph/Twitter tags, JSON-LD structured data, and a `<noscript>` fallback describing the app — keep these in sync if the landing page's pitch/feature list changes.

**Deployment.** Hosted on Vercel, auto-deploying from `main` on push (no CI config in-repo). See `DEPLOY.md` for the full non-technical walkthrough (GitHub → Vercel → custom domain) if relevant.

## Notable conventions

- Firebase keys can't contain `.`, so any student/bill ID used as a Firebase path segment is passed through `fbSafe()` (replaces `.` with `_`) — this exists in both `App.jsx` and `firebase.js` as separate copies, keep them in sync if changed.
- User-entered text (names, bills, room names) goes through `sanitizeInput` (strips `<>{}`, truncates to 150 chars) and `containsProfanity`/`useProfanityToast` before being accepted.
- Firebase config/API key in `src/firebase.js` is a client-side public key by design (Realtime Database security is enforced via Firebase console rules, not by hiding this key) — do not treat it as a secret to redact.
