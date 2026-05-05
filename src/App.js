import { useState, useEffect, useRef, useCallback } from "react";
import mqtt from "mqtt";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

// ─── CONFIG ─────────────────────────────────────────────────────
const HIVEMQ_HOST   = "7c2109aa6dd4423da6ebd1ac01f3a2da.s1.eu.hivemq.cloud";
const HIVEMQ_PORT   = 8884;
const MQTT_USER     = "Waleed";
const MQTT_PASS     = "Qwerty911";
const TOPIC_STATUS  = "sanitizer/status";
const TOPIC_COMMAND = "sanitizer/command";
const LOW_THRESHOLD = 10;

// ─── FORMSPREE CONFIG ────────────────────────────────────────────
const FORMSPREE_URL = "https://formspree.io/f/xlgzeqzv";
const ALERT_EMAIL   = "1waleedawan@gmail.com"; // ← change to your email

// ─── COLORS ─────────────────────────────────────────────────────
const C = {
  bg:      "#0a0e17",
  surface: "#111827",
  surface2:"#1a2235",
  border:  "#1e2d45",
  accent:  "#00e5ff",
  purple:  "#7c3aed",
  green:   "#00e676",
  yellow:  "#ffd600",
  red:     "#ff1744",
  muted:   "#64748b",
  text:    "#e2e8f0",
};

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; font-family: 'Syne', sans-serif; color: ${C.text}; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.35} }
  @keyframes slideIn   { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
  @keyframes warnPulse { 0%,100%{border-color:rgba(255,23,68,0.3)} 50%{border-color:rgba(255,23,68,0.8)} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes dispense  { 0%{background:${C.surface}} 50%{background:rgba(0,229,255,0.08)} 100%{background:${C.surface}} }
  .stat-card:hover { transform:translateY(-2px); border-color:rgba(0,229,255,0.25) !important; }
  .btn:hover  { filter:brightness(1.12); transform:translateY(-1px); }
  .btn:active { transform:translateY(0) scale(0.98); }
  .log-item   { animation:slideIn 0.3s ease; }
  .dispensing { animation:dispense 0.6s ease; }
  .grid-bg {
    background-image: linear-gradient(rgba(0,229,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.025) 1px,transparent 1px);
    background-size:40px 40px; position:fixed; inset:0; pointer-events:none; z-index:0;
  }
  @media(max-width:1024px){ .main-grid{grid-template-columns:1fr !important;} .stats-grid{grid-template-columns:repeat(2,1fr) !important;} }
  @media(max-width:640px) { .stats-grid{grid-template-columns:1fr 1fr !important;} .bottom-grid{grid-template-columns:1fr !important;} .header-title{font-size:18px !important;} .container{padding:14px !important;} .stat-value{font-size:26px !important;} }
  @media(max-width:400px) { .stats-grid{grid-template-columns:1fr !important;} }
`;

// ─── GAUGE ───────────────────────────────────────────────────────
function Gauge({ pct, remaining, capacity }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = 283 - (283 * clamped / 100);
  const color = clamped > 30 ? C.green : clamped > 10 ? C.yellow : C.red;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"8px 0 4px" }}>
      <div style={{ position:"relative", width:200, height:115 }}>
        <svg viewBox="0 0 220 130" width="100%" height="100%">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={C.red}/>
              <stop offset="50%"  stopColor={C.yellow}/>
              <stop offset="100%" stopColor={C.green}/>
            </linearGradient>
          </defs>
          <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke={C.border} strokeWidth="18" strokeLinecap="round"/>
          <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="url(#gaugeGrad)" strokeWidth="18" strokeLinecap="round"
            strokeDasharray="283" strokeDashoffset={offset} style={{ transition:"stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}/>
        </svg>
        <div style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", textAlign:"center", whiteSpace:"nowrap" }}>
          <div style={{ fontSize:38, fontWeight:800, fontFamily:"'Space Mono',monospace", color, lineHeight:1, transition:"color 0.5s" }}>{clamped}%</div>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:2, fontFamily:"'Space Mono',monospace", marginTop:2 }}>CAPACITY</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:32, marginTop:12 }}>
        {[["Remaining", remaining, C.accent], ["Capacity", capacity, C.muted]].map(([lbl, val, clr]) => (
          <div key={lbl} style={{ textAlign:"center" }}>
            <div style={{ fontSize:24, fontWeight:700, fontFamily:"'Space Mono',monospace", color:clr }}>{val ?? "—"}</div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:1.5, textTransform:"uppercase", fontFamily:"'Space Mono',monospace" }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  const c = color || C.accent;
  return (
    <div className="stat-card" style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"18px 20px", position:"relative", overflow:"hidden", transition:"transform 0.2s, border-color 0.2s" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${c},transparent)`, opacity:0.7 }}/>
      <div style={{ fontSize:10, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:8 }}>{label}</div>
      <div className="stat-value" style={{ fontSize:32, fontWeight:800, fontFamily:"'Space Mono',monospace", color:c, lineHeight:1, marginBottom:4, transition:"color 0.4s" }}>{value ?? "—"}</div>
      <div style={{ fontSize:12, color:C.muted }}>{sub}</div>
    </div>
  );
}

// ─── LOG ITEM ────────────────────────────────────────────────────
function LogItem({ time, msg, color }) {
  return (
    <div className="log-item" style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", background:C.surface2, borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:11 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:color, boxShadow:`0 0 5px ${color}`, flexShrink:0 }}/>
      <span style={{ color:C.muted, flexShrink:0 }}>{time}</span>
      <span style={{ color:C.text, flex:1, wordBreak:"break-word" }}>{msg}</span>
    </div>
  );
}

// ─── EMAIL ALERT via Formspree ───────────────────────────────────
async function sendEmailAlert(remaining, totalAllTime) {
  try {
    const res = await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:   ALERT_EMAIL,
        subject: "⚠️ SaniTrack — Low Sanitizer Alert",
        message: `Your sanitizer dispenser is running low!\n\n` +
                 `Remaining pumps : ${remaining}\n` +
                 `Alert threshold : ${LOW_THRESHOLD}\n` +
                 `All-time total  : ${totalAllTime}\n` +
                 `Time            : ${new Date().toLocaleString()}\n\n` +
                 `Please refill the sanitizer container as soon as possible.`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [connected,     setConnected]     = useState(false);
  const [state,         setState]         = useState({ pumpCount:0, totalAllTime:0, remaining:100, capacity:100, lastDispensed:"Never", lowWarning:false });
  const [logs,          setLogs]          = useState([{ time:"--:--:--", msg:"Waiting for connection...", color:C.muted }]);
  const [usageHistory,  setUsageHistory]  = useState([]);
  const [capacityInput, setCapacityInput] = useState(100);
  const [aiText,        setAiText]        = useState("Connect to device to receive AI insights...");
  const [aiLoading,     setAiLoading]     = useState(false);
  const [emailSent,     setEmailSent]     = useState(false);
  const [notifStatus,   setNotifStatus]   = useState(null);
  const [dispensing,    setDispensing]    = useState(false);
  const [deviceOnline,  setDeviceOnline]  = useState(true);
  const clientRef    = useRef(null);
  const lastCountRef = useRef(0);
  const lastSeenRef  = useRef(Date.now());
  const alertSentRef = useRef(false);
  const inputFocusedRef = useRef(false);

  const addLog = useCallback((msg, color = C.muted) => {
    const time = new Date().toTimeString().substr(0, 8);
    setLogs(prev => [{ time, msg, color }, ...prev.slice(0, 29)]);
  }, []);

  const getAIAnalysis = useCallback(async (data) => {
    setAiLoading(true);
    setAiText("Analyzing usage data...");
    const d = data || state;
    const prompt = `You are an AI assistant for a smart hand sanitizer dispenser. Analyze this data and respond in exactly 3 bullet points using the • symbol:
- Pumps used this fill: ${d.pumpCount}
- Remaining: ${d.remaining} / ${d.capacity}
- All-time total: ${d.totalAllTime}
- Last dispensed: ${d.lastDispensed}
- Low warning: ${d.lowWarning}
Cover: current status, refill prediction, usage insight. Max 15 words per bullet.`;
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{ role:"user", content:prompt }] }),
      });
      const result = await response.json();
      setAiText(result.content?.[0]?.text || "Unable to get analysis.");
    } catch { setAiText("AI analysis unavailable."); }
    setAiLoading(false);
  }, [state]);

  // ─── MQTT ──────────────────────────────────────────────────────
  useEffect(() => {
    const clientId = "dashboard-" + Math.random().toString(16).substr(2, 8);
    const c = mqtt.connect(`wss://${HIVEMQ_HOST}:${HIVEMQ_PORT}/mqtt`, {
      clientId, username:MQTT_USER, password:MQTT_PASS, clean:true, reconnectPeriod:3000,
    });
    clientRef.current = c;

    c.on("connect", () => {
      setConnected(true);
      addLog("Connected to HiveMQ broker", C.green);
      c.subscribe(TOPIC_STATUS);
    });

    c.on("message", async (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        const isNew = data.pumpCount > lastCountRef.current;
        lastCountRef.current = data.pumpCount;
        setState(data);

        // Only update input if user isn't currently typing/focusing on it
        if (!inputFocusedRef.current) {
          setCapacityInput(data.capacity);
        }
        setDeviceOnline(true);
        lastSeenRef.current = Date.now();

        if (isNew) {
          setDispensing(true);
          setTimeout(() => setDispensing(false), 600);
          addLog(`Hand detected — pump #${data.pumpCount} activated`, C.accent);
          const label = new Date().toTimeString().substr(0, 5);
          setUsageHistory(prev => [...prev.slice(-9), { label, count:data.pumpCount }]);

          // ── Low sanitizer → send email once ──
          if (data.remaining <= LOW_THRESHOLD && !alertSentRef.current) {
            alertSentRef.current = true;
            addLog(`⚠ Only ${data.remaining} pumps left! Sending email...`, C.yellow);
            const ok = await sendEmailAlert(data.remaining, data.totalAllTime);
            setEmailSent(true);
            setNotifStatus(ok ? "sent" : "failed");
            addLog(
              ok ? "✓ Email alert sent via Formspree!" : "✗ Email failed — check Formspree setup",
              ok ? C.green : C.red
            );
          }

          // Reset alert flag when container refilled
          if (data.remaining > LOW_THRESHOLD) {
            alertSentRef.current = false;
            setEmailSent(false);
            setNotifStatus(null);
          }

          if (data.lowWarning) addLog("⚠ Low sanitizer warning active!", C.red);
          getAIAnalysis(data);
        }
      } catch(e) { console.error(e); }
    });

    c.on("disconnect", () => { setConnected(false); addLog("Disconnected from broker", C.red); });
    c.on("error",      () => { setConnected(false); addLog("Connection error", C.red); });

    // Heartbeat check every 5 seconds
    const interval = setInterval(() => {
      const secondsSinceLastMessage = (Date.now() - lastSeenRef.current) / 1000;
      if (secondsSinceLastMessage > 30) {
        setDeviceOnline(false);
      }
    }, 5000);

    return () => {
      c.end();
      clearInterval(interval);
    };
  }, [addLog, getAIAnalysis]);

  const publish = (payload) => {
    if (!clientRef.current?.connected) { addLog("Not connected to broker", C.red); return; }
    clientRef.current.publish(TOPIC_COMMAND, JSON.stringify(payload));
  };

  const resetCounter = () => {
    publish({ command:"reset" });
    alertSentRef.current = false;
    setEmailSent(false);
    setNotifStatus(null);
    addLog("Reset command sent — container refilled ✓", C.purple);
  };

  const updateCapacity = () => {
    const cap = parseInt(capacityInput);
    if (!cap || cap < 1) { addLog("Invalid capacity value", C.red); return; }
    publish({ capacity:cap });
    addLog(`Capacity updated to ${cap} pumps`, C.purple);
  };

  const pct = state.capacity > 0 ? Math.round((state.remaining / state.capacity) * 100) : 0;
  const remainColor = pct > 30 ? C.green : pct > 10 ? C.yellow : C.red;
  const chartData = usageHistory.map((h, i) => ({ time:h.label, pumps:i+1 }));

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{ background:C.bg, minHeight:"100vh" }}>
        <div className="grid-bg"/>
        <div className="container" style={{ maxWidth:1200, margin:"0 auto", padding:24, position:"relative", zIndex:1 }}>

          {/* HEADER */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:28, paddingBottom:20, borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:44, height:44, background:`linear-gradient(135deg,${C.accent},${C.purple})`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🧴</div>
              <div>
                <div className="header-title" style={{ fontSize:24, fontWeight:800, letterSpacing:-0.5, background:`linear-gradient(90deg,${C.accent},${C.purple})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>SaniTrack</div>
                <div style={{ fontSize:10, color:C.muted, fontFamily:"'Space Mono',monospace", letterSpacing:2, textTransform:"uppercase" }}>IoT Sanitizer Monitor</div>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
              {notifStatus && (
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:100, fontSize:12, fontFamily:"'Space Mono',monospace", animation:"fadeIn 0.3s ease",
                  background: notifStatus==="sent" ? "rgba(0,230,118,0.1)" : "rgba(255,23,68,0.1)",
                  border:`1px solid ${notifStatus==="sent" ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)"}`,
                  color: notifStatus==="sent" ? C.green : C.red,
                }}>
                  {notifStatus==="sent" ? "✓ Email sent" : "✗ Email failed"}
                </div>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:100, border:`1px solid ${connected ? "rgba(0,230,118,0.3)" : C.border}`, fontFamily:"'Space Mono',monospace", fontSize:12, background:C.surface }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:connected ? C.green : C.muted, boxShadow:connected ? `0 0 8px ${C.green}` : "none", animation:connected ? "pulse 2s infinite" : "none" }}/>
                Broker: {connected ? "Live" : "Offline"}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:100, border:`1px solid ${deviceOnline ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)"}`, fontFamily:"'Space Mono',monospace", fontSize:12, background:C.surface }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:deviceOnline ? C.green : C.red, boxShadow:deviceOnline ? `0 0 8px ${C.green}` : `0 0 8px ${C.red}`, animation:deviceOnline ? "none" : "pulse 1.5s infinite" }}/>
                Device: {deviceOnline ? "Online" : "Powered Off"}
              </div>
            </div>
          </div>

          {/* OFFLINE BANNER */}
          {!deviceOnline && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 20px", background:"rgba(255,23,68,0.08)", border:"1px solid rgba(255,23,68,0.3)", borderRadius:12, marginBottom:20, fontSize:14, fontWeight:600, color:C.red, animation:"warnPulse 2s infinite", flexWrap:"wrap" }}>
              <span style={{ fontSize:18 }}>📡</span>
              <span>DEVICE OFFLINE — No data received in the last 30 seconds. Check if the ESP32 is powered on.</span>
            </div>
          )}

          {/* WARNING BANNER */}
          {state.lowWarning && (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 20px", background:"rgba(255,23,68,0.08)", border:"1px solid rgba(255,23,68,0.3)", borderRadius:12, marginBottom:20, fontSize:14, fontWeight:600, color:C.red, animation:"warnPulse 2s infinite", flexWrap:"wrap" }}>
              <span style={{ fontSize:18 }}>⚠️</span>
              <span>LOW SANITIZER — Only {state.remaining} pumps remaining! Please refill soon.</span>
              {emailSent && <span style={{ fontSize:12, color:C.yellow, fontFamily:"'Space Mono',monospace" }}>• Email alert sent</span>}
            </div>
          )}

          {/* STATS */}
          <div className="stats-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
            <StatCard label="Used This Fill"  value={state.pumpCount}    sub="pump activations"  color={C.accent}    />
            <StatCard label="Remaining"       value={state.remaining}    sub="pumps left"         color={remainColor} />
            <StatCard label="All-Time Total"  value={state.totalAllTime} sub="total activations"  color={C.purple}    />
            <StatCard label="Last Dispensed"
              value={<span style={{ fontSize:13, display:"block", paddingTop:6, lineHeight:1.4 }}>
                {state.lastDispensed === "Never" ? "Never" : (state.lastDispensed?.split(" ")[1] || state.lastDispensed)}
              </span>}
              sub="timestamp" color={C.accent}
            />
          </div>

          {/* MAIN GRID */}
          <div className="main-grid" style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:18, marginBottom:18 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
              {/* Gauge */}
              <div className={dispensing ? "dispensing" : ""} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
                <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:16 }}>📊 Sanitizer Level</div>
                <Gauge pct={pct} remaining={state.remaining} capacity={state.capacity}/>
              </div>
              {/* Chart */}
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
                <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:16 }}>📈 Usage History (Last 10)</div>
                <div style={{ height:180 }}>
                  {chartData.length === 0 ? (
                    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontFamily:"'Space Mono',monospace", fontSize:12 }}>Waiting for pump activations...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top:5, right:10, left:-20, bottom:5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                        <XAxis dataKey="time" tick={{ fill:C.muted, fontSize:10, fontFamily:"'Space Mono',monospace" }}/>
                        <YAxis tick={{ fill:C.muted, fontSize:10, fontFamily:"'Space Mono',monospace" }}/>
                        <Tooltip contentStyle={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, fontFamily:"'Space Mono',monospace", fontSize:12, color:C.text }}/>
                        <Bar dataKey="pumps" fill={C.accent} fillOpacity={0.75} radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* AI Panel */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24, display:"flex", flexDirection:"column" }}>
              <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:16 }}>🤖 AI Analysis</div>
              <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, padding:16, fontSize:13, lineHeight:1.8, color:C.text, flex:1, minHeight:160, marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, letterSpacing:2, textTransform:"uppercase", color:C.purple, fontFamily:"'Space Mono',monospace", marginBottom:12 }}>
                  <div style={{ width:6, height:6, background:C.purple, borderRadius:"50%", boxShadow:`0 0 6px ${C.purple}` }}/>
                  Claude AI
                </div>
                {aiLoading ? (
                  <div style={{ color:C.muted, display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:14, height:14, border:`2px solid ${C.purple}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
                    Analyzing...
                  </div>
                ) : (
                  <span style={{ color:aiText.includes("Connect") ? C.muted : C.text, whiteSpace:"pre-line" }}>{aiText}</span>
                )}
              </div>
              <button className="btn" onClick={() => getAIAnalysis()} style={{ padding:"11px 16px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surface2, color:C.text, fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:600, cursor:"pointer", transition:"all 0.2s", width:"100%" }}>
                🔄 Refresh Analysis
              </button>
            </div>
          </div>

          {/* BOTTOM GRID */}
          <div className="bottom-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
            {/* Controls */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
              <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:18 }}>⚙️ Controls</div>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div>
                  <div style={{ fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:6 }}>Container Capacity (pumps)</div>
                  <input type="number" value={capacityInput} onChange={e => setCapacityInput(e.target.value)}
                    style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", color:C.text, fontFamily:"'Space Mono',monospace", fontSize:14, outline:"none", transition:"border-color 0.2s" }}
                    onFocus={e => {
                      e.target.style.borderColor = C.accent;
                      inputFocusedRef.current = true;
                    }}
                    onBlur={e  => {
                      e.target.style.borderColor = C.border;
                      inputFocusedRef.current = false;
                    }}
                  />
                </div>
                <button className="btn" onClick={updateCapacity} style={{ padding:"12px 16px", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.accent},#0099bb)`, color:"#000", fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.2s" }}>
                  💾 Update Capacity
                </button>
                <button className="btn" onClick={resetCounter} style={{ padding:"12px 16px", borderRadius:10, border:"none", background:`linear-gradient(135deg,${C.purple},#5b21b6)`, color:"#fff", fontFamily:"'Syne',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.2s" }}>
                  🔄 Reset After Refill
                </button>

                {/* Email status box */}
                <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:6 }}>Email Alert</div>
                  <div style={{ fontSize:12, fontFamily:"'Space Mono',monospace", color:C.green }}>✓ Formspree configured</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Triggers at ≤ {LOW_THRESHOLD} pumps remaining</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>To: {ALERT_EMAIL}</div>
                </div>
              </div>
            </div>

            {/* Log */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:24 }}>
              <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:C.muted, fontFamily:"'Space Mono',monospace", marginBottom:16 }}>📋 Event Log</div>
              <div style={{ display:"flex", flexDirection:"column", gap:7, maxHeight:240, overflowY:"auto" }}>
                {logs.map((log, i) => <LogItem key={i} time={log.time} msg={log.msg} color={log.color}/>)}
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div style={{ textAlign:"center", marginTop:28, paddingTop:20, borderTop:`1px solid ${C.border}`, fontSize:11, color:C.muted, fontFamily:"'Space Mono',monospace", letterSpacing:1 }}>
            SANITRACK v2.0 • ESP32 + HiveMQ + Claude AI + Formspree • IoT Project
          </div>

        </div>
      </div>
    </>
  );
}
