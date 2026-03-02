import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════
   CLARA SETTINGS — STYLE TAB v3
   Now with Chat Background + Chat Text customization
   ═══════════════════════════════════════════════════════ */

const LAYOUTS = [
  {
    id: "classic",
    name: "Classic Bubble",
    desc: "Floating bubble in the corner",
    icon: (color, active) => (
      <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
        <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? "#f0f0f8" : "#f5f5f5"} stroke={active ? color : "#ddd"} strokeWidth="1" />
        <rect x="8" y="8" width="22" height="3" rx="1.5" fill="#ddd" />
        <rect x="8" y="14" width="30" height="2" rx="1" fill="#e8e8e8" />
        <rect x="8" y="18" width="20" height="2" rx="1" fill="#e8e8e8" />
        <circle cx="44" cy="32" r="6" fill={active ? color : "#ccc"} />
        <path d="M41.5 32h5M44 29.5v5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "command_bar",
    name: "Command Bar",
    desc: "Centered search overlay",
    icon: (color, active) => (
      <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
        <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? "#f0f0f8" : "#f5f5f5"} stroke={active ? color : "#ddd"} strokeWidth="1" />
        <rect x="10" y="16" width="36" height="12" rx="6" fill={active ? `${color}18` : "#e8e8e8"} stroke={active ? color : "#ddd"} strokeWidth="1" />
        <circle cx="17" cy="22" r="2.5" fill={active ? color : "#ccc"} />
        <rect x="22" y="20.5" width="16" height="3" rx="1.5" fill={active ? "#bbb" : "#ddd"} />
      </svg>
    ),
  },
  {
    id: "terminal",
    name: "Terminal",
    desc: "CLI status bar at the bottom",
    icon: (color, active) => (
      <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
        <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? "#f0f0f8" : "#f5f5f5"} stroke={active ? color : "#ddd"} strokeWidth="1" />
        <rect x="8" y="8" width="22" height="3" rx="1.5" fill="#ddd" />
        <rect x="8" y="14" width="30" height="2" rx="1" fill="#e8e8e8" />
        <rect x="2" y="30" width="52" height="8" rx="0 0 4 4" fill={active ? "#0a0f14" : "#2a2a2a"} />
        <rect x="8" y="33" width="3" height="2" rx="1" fill={active ? color : "#666"} />
        <rect x="14" y="33" width="18" height="2" rx="1" fill="#555" />
      </svg>
    ),
  },
  {
    id: "side_whisper",
    name: "Side Whisper",
    desc: "Slim edge panel",
    icon: (color, active) => (
      <svg width="56" height="44" viewBox="0 0 56 44" fill="none">
        <rect x="2" y="2" width="52" height="36" rx="4" fill={active ? "#f0f0f8" : "#f5f5f5"} stroke={active ? color : "#ddd"} strokeWidth="1" />
        <rect x="8" y="8" width="22" height="3" rx="1.5" fill="#ddd" />
        <rect x="8" y="14" width="26" height="2" rx="1" fill="#e8e8e8" />
        <rect x="50" y="2" width="4" height="36" rx="0 4 4 0" fill={active ? color : "#ccc"} />
        <circle cx="52" cy="20" r="1.2" fill="#fff" />
      </svg>
    ),
  },
];

const ACCENT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#0B1A2E", "#000000",
];

const BG_PRESETS = [
  { color: "#ffffff", label: "White" },
  { color: "#e5e7eb", label: "Grey" },
  { color: "#0B1A2E", label: "Navy" },
  { color: "#000000", label: "Black" },
];

// Utility: is a color "dark"?
function isDark(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/* ─────────────────────────────────────────────
   PREVIEW: Classic
   ───────────────────────────────────────────── */
function ClassicPreview({ s }) {
  const dark = isDark(s.chatBg);
  const msgTextColor = dark ? "#e0e0e0" : "#333";
  const inputBg = dark ? "rgba(255,255,255,0.06)" : "#f5f5f5";
  const inputBorder = dark ? "rgba(255,255,255,0.08)" : "#e5e7eb";
  const userBubble = dark ? "rgba(255,255,255,0.08)" : "#f3f4f6";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: s.chatBg, borderRadius: 12, overflow: "hidden", border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#e5e7eb"}` }}>
      <div style={{ background: s.primaryColor, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700 }}>{s.avatarText}</div>
        <span style={{ color: s.headerText, fontSize: 14, fontWeight: 600 }}>{s.displayName}</span>
      </div>
      <div style={{ flex: 1, padding: "14px 14px 8px", overflowY: "auto" }}>
        {/* Bot message */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: s.primaryColor, opacity: 0.2, flexShrink: 0 }} />
          <div style={{ background: s.primaryColor, borderRadius: "14px 14px 14px 4px", padding: "10px 14px", maxWidth: "80%" }}>
            <span style={{ color: s.headerText, fontSize: 13, lineHeight: 1.5, display: "block" }}>{s.welcomeMessage}</span>
          </div>
        </div>
        {/* User message */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div style={{ background: userBubble, borderRadius: "14px 14px 4px 14px", padding: "10px 14px" }}>
            <span style={{ color: msgTextColor, fontSize: 13 }}>What services do you offer?</span>
          </div>
        </div>
        {/* Bot reply */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: s.primaryColor, opacity: 0.2, flexShrink: 0 }} />
          <div style={{ background: s.primaryColor, borderRadius: "14px 14px 14px 4px", padding: "10px 14px", maxWidth: "80%" }}>
            <span style={{ color: s.headerText, fontSize: 13, lineHeight: 1.5, display: "block" }}>I'd be happy to help! We offer a range of services tailored to your needs.</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${dark ? "rgba(255,255,255,0.06)" : "#f0f0f0"}` }}>
        <div style={{ background: inputBg, borderRadius: 24, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${inputBorder}` }}>
          <span style={{ color: dark ? "#666" : "#9ca3af", fontSize: 13 }}>Type your message...</span>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.primaryColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={s.headerText} strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", paddingBottom: 8 }}>
        <span style={{ fontSize: 11, color: dark ? "#444" : "#ccc" }}>Powered by Clara</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PREVIEW: Command Bar
   ───────────────────────────────────────────── */
function CommandBarPreview({ s }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const dark = isDark(s.chatBg);
  const chipBorder = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const chipText = dark ? "#888" : "#666";
  const inputFieldBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const placeholderColor = dark ? "#555" : "#999";

  useEffect(() => {
    if (open) return;
    const text = s.triggerText || "Ask about our services →";
    let i = 0; setTyped("");
    const t = setInterval(() => { setTyped(text.slice(0, i + 1)); i++; if (i >= text.length) clearInterval(t); }, 40);
    return () => clearInterval(t);
  }, [open, s.triggerText]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0d0d0d", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "20px 16px", opacity: open ? 0.06 : 0.5, filter: open ? "blur(6px)" : "none", transition: "all 0.3s" }}>
        <div style={{ width: 70, height: 8, background: "#222", borderRadius: 4, marginBottom: 14 }} />
        <div style={{ width: "65%", height: 11, background: "#1a1a1a", borderRadius: 6, marginBottom: 7 }} />
        <div style={{ width: "45%", height: 11, background: "#1a1a1a", borderRadius: 6 }} />
      </div>

      {!open && (
        <div onClick={() => setOpen(true)} style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          width: "82%", padding: "9px 14px",
          background: "rgba(255,255,255,0.05)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12,
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          animation: "fadeIn 0.4s ease",
        }}>
          <div style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.primaryColor }} />
            <div style={{ position: "absolute", inset: -3, borderRadius: "50%", background: s.primaryColor, opacity: 0.3, animation: "ping 2s infinite" }} />
          </div>
          <span style={{ color: "#777", fontSize: 11, flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
            {typed}<span style={{ display: "inline-block", width: 1.5, height: 12, background: s.primaryColor, marginLeft: 1, verticalAlign: "text-bottom", animation: "blink 1s step-end infinite" }} />
          </span>
          <span style={{ padding: "2px 6px", background: "rgba(255,255,255,0.06)", borderRadius: 4, fontSize: 9, color: "#444", fontFamily: "monospace" }}>⌘K</span>
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "88%", background: s.chatBg, backdropFilter: "blur(30px)",
            border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, borderRadius: 16, overflow: "hidden",
            boxShadow: `0 0 50px ${s.primaryColor}10, 0 20px 50px rgba(0,0,0,0.4)`,
            animation: "scaleIn 0.2s ease",
          }}>
            <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.primaryColor, boxShadow: `0 0 8px ${s.primaryColor}` }} />
              <span style={{ color: s.primaryColor, fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", fontFamily: "monospace" }}>{s.displayName}</span>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ background: s.primaryColor, borderRadius: 10, padding: "8px 12px", marginBottom: 8, display: "inline-block" }}>
                <span style={{ color: s.headerText, fontSize: 11, lineHeight: 1.5 }}>{s.welcomeMessage}</span>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {["Pricing", "Developers", "How it works"].map((t, i) => (
                  <span key={i} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${chipBorder}`, color: chipText, fontSize: 10 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ padding: "8px 14px 10px", borderTop: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
              <div style={{ background: inputFieldBg, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: placeholderColor, fontSize: 11 }}>Ask anything...</span>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: s.primaryColor, display: "flex", alignItems: "center", justifyContent: "center", color: s.headerText, fontSize: 11, fontWeight: 700 }}>↑</div>
              </div>
            </div>
            <div style={{ textAlign: "center", padding: "0 0 8px" }}>
              <span style={{ fontSize: 9, color: dark ? "#333" : "#ccc" }}>Powered by Clara</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PREVIEW: Terminal
   ───────────────────────────────────────────── */
function TerminalPreview({ s }) {
  const [open, setOpen] = useState(false);
  const [statusText, setStatusText] = useState("");
  const dark = isDark(s.chatBg);

  useEffect(() => {
    if (open) return;
    const text = (s.statusMessages || "12 engineers matched your timezone").split("\n")[0];
    let i = 0; setStatusText("");
    const t = setInterval(() => { setStatusText(text.slice(0, i + 1)); i++; if (i >= text.length) clearInterval(t); }, 30);
    return () => clearInterval(t);
  }, [open, s.statusMessages]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0B1A2E", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "20px 16px", opacity: open ? 0.06 : 0.5, filter: open ? "blur(6px)" : "none", transition: "all 0.3s" }}>
        <div style={{ width: 70, height: 8, background: "#15253a", borderRadius: 4, marginBottom: 14 }} />
        <div style={{ width: "65%", height: 11, background: "#0f1f30", borderRadius: 6, marginBottom: 7 }} />
        <div style={{ width: "45%", height: 11, background: "#0f1f30", borderRadius: 6 }} />
      </div>

      {!open && (
        <div onClick={() => setOpen(true)} style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "8px 12px", background: "rgba(10,15,20,0.9)",
          borderTop: `1px solid ${s.primaryColor}20`,
          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
          fontFamily: "monospace", animation: "fadeIn 0.4s ease",
        }}>
          <span style={{ color: s.primaryColor, fontSize: 8 }}>◆</span>
          <span style={{ fontSize: 10, flex: 1 }}>
            <span style={{ color: s.primaryColor }}>{s.displayName.toLowerCase()}</span>
            <span style={{ color: "#334", margin: "0 4px" }}>→</span>
            <span style={{ color: "#667" }}>{statusText}</span>
          </span>
          <span style={{ fontSize: 8, color: "#334", flexShrink: 0 }}>click to chat</span>
        </div>
      )}

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "90%", background: s.chatBg, borderRadius: 12,
            border: `1px solid ${dark ? `${s.primaryColor}15` : "rgba(0,0,0,0.06)"}`, overflow: "hidden",
            boxShadow: `0 0 50px ${s.primaryColor}08, 0 20px 50px rgba(0,0,0,0.4)`,
            animation: "scaleIn 0.2s ease",
          }}>
            <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", background: dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` }}>
              <div style={{ display: "flex", gap: 5 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840" }} />
              </div>
              <span style={{ fontSize: 9, color: dark ? "#445" : "#999", fontFamily: "monospace" }}>{s.displayName.toLowerCase()}</span>
              <div style={{ width: 36 }} />
            </div>
            <div style={{ padding: "10px 12px", fontFamily: "monospace" }}>
              <div style={{ color: dark ? "#445" : "#999", fontSize: 9, marginBottom: 6 }}>{s.displayName.toLowerCase()} v1.0</div>
              <div style={{ borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, margin: "4px 0 8px" }} />
              <div style={{ marginBottom: 3 }}>
                <span style={{ color: s.primaryColor, fontSize: 10 }}>→ </span>
                <span style={{ color: dark ? "#ddd" : "#333", fontSize: 10 }}>/pricing</span>
              </div>
              <div style={{ color: dark ? "#778" : "#666", paddingLeft: 14, fontSize: 10, lineHeight: 1.7, marginBottom: 6 }}>
                Flat monthly fee per dev:<br />&nbsp;&nbsp;junior&nbsp;&nbsp;$2,500/mo<br />&nbsp;&nbsp;senior&nbsp;&nbsp;$5,000/mo
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["/pricing", "/stack", "/hire"].map((cmd, i) => (
                  <span key={i} style={{ padding: "3px 7px", borderRadius: 4, border: `1px solid ${s.primaryColor}22`, fontSize: 9, fontFamily: "monospace" }}>
                    <span style={{ color: s.primaryColor }}>{cmd}</span>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"}`, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: s.primaryColor, fontSize: 10, fontFamily: "monospace" }}>→</span>
              <span style={{ color: dark ? "#555" : "#aaa", fontSize: 10, fontFamily: "monospace" }}>ask anything...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PREVIEW: Side Whisper
   ───────────────────────────────────────────── */
function SideWhisperPreview({ s }) {
  const [open, setOpen] = useState(false);
  const dark = isDark(s.chatBg);
  const mutedText = dark ? "#8b9bb4" : "#666";
  const chipBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const inputBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#f0f0ec", borderRadius: 12, overflow: "hidden", display: "flex" }}>
      <div style={{ flex: 1, padding: "20px 16px", transition: "margin-right 0.4s ease", marginRight: open ? "48%" : 0 }}>
        <div style={{ width: 70, height: 8, background: "#ddd", borderRadius: 4, marginBottom: 14 }} />
        <div style={{ width: "65%", height: 11, background: "#ccc", borderRadius: 6, marginBottom: 7 }} />
        <div style={{ width: "45%", height: 11, background: "#ccc", borderRadius: 6, marginBottom: 18 }} />
        <div style={{ width: "85%", height: 6, background: "#e0e0e0", borderRadius: 3, marginBottom: 5 }} />
        <div style={{ width: "70%", height: 6, background: "#e0e0e0", borderRadius: 3 }} />
      </div>

      <div onClick={() => !open && setOpen(true)} style={{
        position: "absolute", right: 0, top: 0, bottom: 0,
        width: open ? "48%" : 6,
        background: open ? s.chatBg : s.primaryColor,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: open ? "default" : "pointer", overflow: "hidden",
        borderTopLeftRadius: open ? 0 : 10, borderBottomLeftRadius: open ? 0 : 10,
        borderLeft: open ? `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` : "none",
      }}>
        {!open && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "glow2 2s ease infinite" }} />
          </div>
        )}
        {open && (
          <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ color: dark ? "#fff" : "#0B1A2E", fontSize: 13, fontWeight: 700 }}>{s.displayName}</div>
                <div style={{ color: s.primaryColor, fontSize: 9, marginTop: 1 }}>AI Assistant</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: "none", color: dark ? "#667" : "#999", fontSize: 10, padding: "3px 7px", borderRadius: 5, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 8, padding: "8px 10px", borderLeft: `3px solid ${s.primaryColor}`, marginBottom: 10 }}>
                <span style={{ color: mutedText, fontSize: 10, lineHeight: 1.5, display: "block" }}>{s.welcomeMessage}</span>
              </div>
              {["Pricing →", "Developers →", "Book a call →"].map((t, i) => (
                <div key={i} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${chipBorder}`, color: mutedText, fontSize: 10, marginBottom: 5 }}>{t}</div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`, paddingTop: 8 }}>
              <div style={{ background: inputBg, borderRadius: 8, padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: dark ? "#555" : "#aaa", fontSize: 10 }}>Type a message...</span>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: s.primaryColor, display: "flex", alignItems: "center", justifyContent: "center", color: s.headerText, fontSize: 9, fontWeight: 700 }}>↑</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────── */
function Divider() {
  return <div style={{ height: 1, background: "#E5E7EB", margin: "24px 0" }} />;
}
function FieldLabel({ label, hint }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: "#0B1A2E", display: "block" }}>{label}</label>
      {hint && <p style={{ fontSize: 12, color: "#6B7280", margin: "3px 0 0" }}>{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */
export default function SettingsStyleTab() {
  const [selectedLayout, setSelectedLayout] = useState("classic");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [headerText, setHeaderText] = useState("#ffffff");
  const [chatBg, setChatBg] = useState("#ffffff");
  const [bubbleColor, setBubbleColor] = useState("#000000");
  const [displayName, setDisplayName] = useState("Clara");
  const [welcomeMessage] = useState("Hi! How can I help you today?");
  const [bubblePosition, setBubblePosition] = useState("right");
  const [triggerText, setTriggerText] = useState("Ask about our services →");
  const [statusMessages, setStatusMessages] = useState("12 engineers matched your timezone\navg. time to shortlist: 7 days");
  const [activeTab, setActiveTab] = useState("Style");
  const [hasChanges, setHasChanges] = useState(false);

  const set = (fn) => (val) => { fn(val); setHasChanges(true); };

  const tabs = ["Content", "Style", "AI", "API Keys", "Embed"];
  const isContextual = selectedLayout !== "classic";

  const previewSettings = {
    primaryColor, headerText, chatBg, bubbleColor, displayName, welcomeMessage,
    avatarText: displayName.charAt(0).toUpperCase(),
    triggerText, statusMessages,
  };

  const renderPreview = () => {
    const p = previewSettings;
    switch (selectedLayout) {
      case "classic": return <ClassicPreview s={p} />;
      case "command_bar": return <CommandBarPreview s={p} />;
      case "terminal": return <TerminalPreview s={p} />;
      case "side_whisper": return <SideWhisperPreview s={p} />;
      default: return <ClassicPreview s={p} />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif", background: "#F5F7FA" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* SIDEBAR */}
      <div style={{ width: 240, background: "#0B1A2E", padding: "20px 0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 28px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #1A8A7A, #0B1A2E)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1A8A7A" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8E62E" strokeWidth="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" /><path d="M8 12c0-2.2 1.8-4 4-4" /></svg>
          </div>
          <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>Clara</span>
        </div>
        {[
          { icon: "▦", label: "Dashboard" }, { icon: "📄", label: "Knowledge Base" },
          { icon: "⚑", label: "Flagged Questions" }, { icon: "☐", label: "Sessions" },
          { icon: "▶", label: "Chat Playground" }, { icon: "⚙", label: "Settings", active: true },
        ].map((item, i) => (
          <div key={i} style={{
            padding: "11px 20px", display: "flex", alignItems: "center", gap: 12,
            background: item.active ? "rgba(184,230,46,0.06)" : "transparent",
            color: item.active ? "#B8E62E" : "#8b9bb4",
            fontSize: 14, fontWeight: item.active ? 600 : 400, cursor: "pointer",
            borderLeft: item.active ? "3px solid #B8E62E" : "3px solid transparent",
          }}>
            <span style={{ fontSize: 15, width: 22, textAlign: "center", opacity: 0.8 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "18px 28px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0, borderBottom: "1px solid #E5E7EB", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0B1A2E", margin: 0 }}>Settings</h1>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>Configure your chatbot</p>
            </div>
            {hasChanges && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#f97316", fontSize: 13, fontWeight: 500 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f97316" }} /> Unsaved changes
              </span>
            )}
          </div>
          <button style={{ padding: "10px 22px", borderRadius: 10, background: "#0B1A2E", color: "#B8E62E", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Sans', sans-serif" }}>
            💾 Save Changes
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: "14px 28px 0", display: "flex", gap: 4, flexShrink: 0, background: "#fff" }}>
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "9px 20px", borderRadius: 10,
              background: activeTab === tab ? "#0B1A2E" : "transparent",
              color: activeTab === tab ? "#fff" : "#555",
              border: activeTab === tab ? "none" : "1px solid #e0e0e0",
              fontWeight: activeTab === tab ? 600 : 400, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Split: Form + Preview */}
        <div style={{ flex: 1, display: "flex", gap: 20, padding: "20px 28px", overflow: "hidden" }}>

          {/* FORM */}
          <div style={{ flex: isContextual ? "0 0 48%" : "0 0 56%", transition: "flex 0.4s ease", overflowY: "auto", paddingRight: 4 }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: "24px", border: "1px solid #E5E7EB" }}>

              {/* WIDGET LAYOUT */}
              <FieldLabel label="Widget Layout" hint="Choose how the chatbot appears on your website" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {LAYOUTS.map((layout) => {
                  const active = selectedLayout === layout.id;
                  return (
                    <button key={layout.id} onClick={() => { setSelectedLayout(layout.id); setHasChanges(true); if (layout.id !== "classic" && chatBg === "#ffffff") setChatBg("#1a1a2e"); if (layout.id === "classic" && isDark(chatBg)) setChatBg("#ffffff"); }} style={{
                      padding: "12px 10px 10px", borderRadius: 12,
                      border: active ? `2px solid ${primaryColor}` : "2px solid #E5E7EB",
                      background: active ? `${primaryColor}06` : "#fff",
                      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                      transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif",
                    }}>
                      {layout.icon(primaryColor, active)}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: active ? "#0B1A2E" : "#666" }}>{layout.name}</div>
                        <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>{layout.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Divider />

              {/* PRIMARY COLOR */}
              <FieldLabel label="Primary Color" hint="Used for header, buttons, and accent elements" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {ACCENT_COLORS.map((c) => (
                  <button key={c} onClick={() => set(setPrimaryColor)(c)} style={{
                    width: 30, height: 30, borderRadius: 8, background: c, border: "none", cursor: "pointer",
                    outline: primaryColor === c ? "2px solid #0B1A2E" : "2px solid transparent",
                    outlineOffset: 2, transition: "all 0.15s",
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: primaryColor, border: "1px solid #E5E7EB" }} />
                <input value={primaryColor} onChange={(e) => set(setPrimaryColor)(e.target.value)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 14, fontFamily: "monospace", width: 110, outline: "none" }} />
              </div>

              {/* HEADER TEXT COLOR */}
              <div style={{ marginTop: 20 }}>
                <FieldLabel label="Header Text Color" hint="Text color on the primary-colored header and message bubbles" />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {["#ffffff", "#000000", "#0B1A2E", "#f0f0f0"].map((c) => (
                    <button key={c} onClick={() => set(setHeaderText)(c)} style={{
                      width: 30, height: 30, borderRadius: 8, background: c, border: "1px solid #ddd", cursor: "pointer",
                      outline: headerText === c ? "2px solid #0B1A2E" : "2px solid transparent", outlineOffset: 2,
                    }} />
                  ))}
                  <input value={headerText} onChange={(e) => set(setHeaderText)(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, fontFamily: "monospace", width: 90, outline: "none" }} />
                </div>
              </div>

              {/* CHAT BACKGROUND */}
              <div style={{ marginTop: 20 }}>
                <FieldLabel label="Chat Background" hint="Background color of the chat panel" />
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  {BG_PRESETS.map((p) => (
                    <div key={p.color} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <button onClick={() => set(setChatBg)(p.color)} style={{
                        width: 36, height: 36, borderRadius: 10, background: p.color, border: `1px solid ${isDark(p.color) ? "rgba(255,255,255,0.15)" : "#ddd"}`, cursor: "pointer",
                        outline: chatBg === p.color ? "2px solid #0B1A2E" : "2px solid transparent", outlineOffset: 2,
                      }} />
                      <span style={{ fontSize: 10, color: chatBg === p.color ? "#0B1A2E" : "#999", fontWeight: chatBg === p.color ? 600 : 400 }}>{p.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: chatBg, border: `1px solid ${isDark(chatBg) ? "rgba(255,255,255,0.15)" : "#E5E7EB"}` }} />
                  <input value={chatBg} onChange={(e) => set(setChatBg)(e.target.value)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 14, fontFamily: "monospace", width: 110, outline: "none" }} />
                  <span style={{ fontSize: 11, color: "#999" }}>{BG_PRESETS.find(p => p.color === chatBg)?.label || "Custom"}</span>
                </div>
              </div>

              {/* DISPLAY NAME */}
              <div style={{ marginTop: 20 }}>
                <FieldLabel label="Display Name" hint="Shown in the chat header and trigger" />
                <input value={displayName} onChange={(e) => set(setDisplayName)(e.target.value)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
              </div>

              <Divider />

              {/* LAYOUT-SPECIFIC */}
              {selectedLayout === "classic" && (
                <>
                  <FieldLabel label="Bubble Color" hint="Color of the floating chat bubble button" />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: bubbleColor, border: "1px solid #E5E7EB" }} />
                    <input value={bubbleColor} onChange={(e) => set(setBubbleColor)(e.target.value)} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 14, fontFamily: "monospace", width: 110, outline: "none" }} />
                  </div>
                </>
              )}

              {selectedLayout === "command_bar" && (
                <>
                  <FieldLabel label="Trigger Text" hint="Typewriter text shown before users click to open" />
                  <input value={triggerText} onChange={(e) => set(setTriggerText)(e.target.value)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
                </>
              )}

              {selectedLayout === "terminal" && (
                <>
                  <FieldLabel label="Status Messages" hint="Rotating messages in the status bar — one per line" />
                  <textarea value={statusMessages} onChange={(e) => set(setStatusMessages)(e.target.value)} rows={3} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "monospace", resize: "vertical", lineHeight: 1.6 }} />
                </>
              )}

              {selectedLayout === "side_whisper" && (
                <>
                  <FieldLabel label="Hint Messages" hint="Rotating text shown on the edge strip (one per line)" />
                  <textarea defaultValue={"React devs available now\nFrom $2,500/mo per dev\nShortlist in 5–10 days"} rows={3} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", resize: "vertical", lineHeight: 1.6 }} />
                </>
              )}

              <Divider />

              {/* AVATAR */}
              <FieldLabel label="Avatar Image" hint="Recommended: 128x128px square image" />
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#0B1A2E", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1A8A7A" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8E62E" strokeWidth="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" /><path d="M8 12c0-2.2 1.8-4 4-4" /></svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: "1px solid #E5E7EB", cursor: "pointer" }}>
                  <span>⬆</span>
                  <span style={{ fontSize: 13, color: "#333", fontWeight: 500 }}>Upload Avatar</span>
                </div>
              </div>

              {selectedLayout === "classic" && (
                <>
                  <FieldLabel label="Chat Bubble Icon" hint="Custom icon for the floating bubble" />
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#0B1A2E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 20 }}>💬</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: "1px solid #E5E7EB", cursor: "pointer" }}>
                      <span>⬆</span>
                      <span style={{ fontSize: 13, color: "#333", fontWeight: 500 }}>Upload Icon</span>
                    </div>
                  </div>
                </>
              )}

              {/* POWERED BY */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1A2E" }}>Show "Powered by Clara" badge</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Display product attribution in the widget</div>
                </div>
                <div style={{ width: 44, height: 24, borderRadius: 12, background: "#1A8A7A", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", marginLeft: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
            </div>
          </div>

          {/* PREVIEW */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#0B1A2E" }}>Preview</span>
                  {hasChanges && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#f97316", fontSize: 12 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316" }} /> Unsaved</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#aaa", padding: "3px 8px", background: "#f5f5f5", borderRadius: 6 }}>{LAYOUTS.find(l => l.id === selectedLayout)?.name}</span>
                  <button style={{ padding: "5px 12px", borderRadius: 8, background: "#f5f5f5", border: "1px solid #e0e0e0", fontSize: 11, color: "#555", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 4 }}>↗ Full Preview</button>
                </div>
              </div>
              <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden", position: "relative" }}>
                  {renderPreview()}
                </div>
              </div>
              <div style={{ padding: "8px 16px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: "#bbb" }}>💡 Click the trigger in the preview to see the interaction</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes glow2 { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}
