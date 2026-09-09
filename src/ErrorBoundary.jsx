import React from "react";

// Catches uncaught render errors anywhere below it so a crash mid-round
// doesn't blank the PO's whole screen. PO round state is persisted to
// sessionStorage on every change (see ActiveRound's session-persistence
// effect in App.jsx), so a reload after a crash restores the in-progress
// round rather than losing it.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ParliPro crashed:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #1a1714 0%, #231f1b 50%, #1a1714 100%)", color: "#E8E0D0", fontFamily: "Georgia, serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#D4A843", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>Something went wrong</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20, color: "#9B917F" }}>
            ParliPro hit an unexpected error. Your round data is saved locally — reloading should restore it.
          </p>
          <button onClick={() => window.location.reload()} style={{ padding: "12px 28px", background: "linear-gradient(135deg, #D4A843, #C49632)", color: "#1a1714", border: "none", borderRadius: 8, fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
