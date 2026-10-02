"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowRight, CalendarDays, Check, ChevronDown, Clock3, Globe2, HeartPulse, Headphones, Mic, PhoneOff, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { api } from "@/lib/api";
import { googleSignIn, restoreGoogleSignIn, signOutGoogle } from "@/lib/firebase";
import type { Recognition } from "@/lib/speech";

const LiveCall = dynamic(() => import("@/components/live-call"), { ssr: false });
const ChatPanel = dynamic(() => import("@/components/chat-panel"), { ssr: false });
type Config = { auth_mode: string; livekit_configured: boolean; voice_pipeline: string; booking_mode: "local_demo" | "firestore" | "firestore_calendar"; calendar_invitations_enabled: boolean; clinic_timezone: string; doctors: { id: string }[] };
type Appointment = { id: string; doctor_id: string; start: string; reason: string; status: string; client_name?: string; phone_number?: string; client_email?: string; calendar_html_link?: string; calendar_invitation_status?: string };
type Slot = { start: string; end: string; label: string };
type Credentials = { server_url: string; token: string };
const prompts = ["Book a cleaning", "Tomorrow", "First", "Confirm", "My appointments", "Reschedule my appointment", "Cancel my appointment"];
const browserVoiceTestEnabled = process.env.NEXT_PUBLIC_ENABLE_BROWSER_VOICE_TEST === "true";

export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [mode, setMode] = useState<"demo" | "livekit">(browserVoiceTestEnabled ? "demo" : "livekit");
  const [language, setLanguage] = useState("en-US");
  const [token, setToken] = useState("");
  const [name, setName] = useState("Guest");
  const [email, setEmail] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("Ready when you are");
  const [error, setError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [testPanel, setTestPanel] = useState(false);
  const [availSlots, setAvailSlots] = useState<Slot[]>([]);
  const [availDate, setAvailDate] = useState("");
  const [availLoading, setAvailLoading] = useState(false);
  const session = useRef<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const activeRef = useRef(false);
  const tokenRef = useRef("");
  const languageRef = useRef(language);
  const turnBusy = useRef(false);
  const listenRef = useRef<() => void>(() => {});

  useEffect(() => { languageRef.current = language; }, [language]);
  const connectApi = useCallback(async () => {
    try {
      const next = await api<Config>("/config");
      setConfig(next);
      if (next.auth_mode === "firebase") {
        localStorage.removeItem("noor-guest-token");
        localStorage.removeItem("noor-demo-token");
        const restored = await restoreGoogleSignIn();
        if (restored) {
          const patient = await api<{ uid: string; name: string; email: string }>("/me", restored.token);
          tokenRef.current = restored.token;
          setToken(restored.token);
          setName(patient.name);
          setEmail(patient.email);
          const data = await api<{ appointments: Appointment[] }>("/appointments", restored.token);
          setAppointments(data.appointments);
        } else {
          tokenRef.current = "";
          setToken("");
          setAppointments([]);
        }
      } else {
        const tokenKey = next.auth_mode === "guest" ? "noor-guest-token" : "noor-demo-token";
        const saved = localStorage.getItem(tokenKey);
        if (saved) {
          try {
            const patient = await api<{ name: string; email: string }>("/me", saved);
            tokenRef.current = saved;
            setToken(saved);
            setName(patient.name);
            setEmail(patient.email || "");
            const data = await api<{ appointments: Appointment[] }>("/appointments", saved);
            setAppointments(data.appointments);
          } catch { localStorage.removeItem(tokenKey); tokenRef.current = ""; setToken(""); }
        }
      }
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void connectApi(); }, [connectApi]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => () => {
    activeRef.current = false;
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const refreshAppointments = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const data = await api<{ appointments: Appointment[] }>("/appointments", tokenRef.current);
      setAppointments(data.appointments);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!active || mode !== "livekit") return;
    const timer = setInterval(() => void refreshAppointments(), 8000);
    return () => clearInterval(timer);
  }, [active, mode, refreshAppointments]);

  const speak = useCallback((text: string) => {
    if (!activeRef.current) return;
    if (!("speechSynthesis" in window)) {
      setStatus("Speech playback unavailable. Please contact reception.");
      return;
    }
    recognition.current?.abort();
    recognition.current = null;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // The credential-free test engine replies in English; LiveKit responds in the patient's language.
    utterance.lang = "en-US";
    utterance.rate = 0.97;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith("en") && /Google|Microsoft.*Natural|Samantha/.test(v.name));
    if (voice) utterance.voice = voice;
    setStatus("Noor is speaking");
    utterance.onend = () => { if (activeRef.current) listenRef.current(); };
    utterance.onerror = event => {
      if (event.error !== "interrupted" && event.error !== "canceled") setStatus("Tap the microphone to continue");
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const sendTurn = useCallback(async (text: string) => {
    if (!session.current || !activeRef.current || turnBusy.current) return;
    turnBusy.current = true;
    setProcessing(true);
    recognition.current?.abort();
    recognition.current = null;
    window.speechSynthesis?.cancel();
    const currentSession = session.current;
    setStatus("Finding your next step");
    try {
      const response = await api<{ message: string }>(`/voice/sessions/${currentSession}/turn`, tokenRef.current, { transcript: text });
      if (session.current !== currentSession || !activeRef.current) return;
      await refreshAppointments();
      if (session.current === currentSession && activeRef.current) speak(response.message);
    } catch (e) { setError((e as Error).message); setStatus("Tap the microphone to retry"); }
    finally { turnBusy.current = false; setProcessing(false); }
  }, [speak, refreshAppointments]);

  const listen = useCallback(() => {
    if (!activeRef.current || turnBusy.current) return;
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus("Browser speech unavailable");
      setError("Use Chrome or Edge for the browser voice test, or use LiveKit mode. Test prompts below can still exercise the Python booking flow.");
      setTestPanel(true);
      return;
    }
    recognition.current?.abort();
    const recognizer = new Constructor();
    recognizer.lang = languageRef.current;
    recognizer.continuous = false;
    recognizer.interimResults = false;
    let heard = false;
    recognizer.onresult = event => {
      heard = true;
      const text = event.results[0][0].transcript;
      void sendTurn(text);
    };
    recognizer.onerror = event => {
      if (event.error === "aborted") return;
      setStatus("Tap the microphone to try again");
      if (event.error !== "no-speech") setError(event.error === "not-allowed" ? "Allow microphone access in your browser to start speaking." : `Speech recognition: ${event.error}. Check your connection and retry.`);
    };
    recognizer.onend = () => {
      if (!heard && activeRef.current && recognition.current === recognizer) setStatus("Tap the microphone to speak");
    };
    recognition.current = recognizer;
    try { recognizer.start(); setStatus("Listening to you"); }
    catch { setStatus("Tap the microphone to try again"); }
  }, [sendTurn]);
  useEffect(() => { listenRef.current = listen; }, [listen]);

  const authenticate = async () => {
    if (tokenRef.current) return tokenRef.current;
    const cfg = config || await api<Config>("/config");
    setConfig(cfg);
    if (cfg.auth_mode === "firebase") {
      const identity = await googleSignIn();
      const patient = await api<{ name: string; email: string }>("/me", identity.token);
      tokenRef.current = identity.token;
      setToken(identity.token);
      setName(patient.name);
      setEmail(patient.email);
      const data = await api<{ appointments: Appointment[] }>("/appointments", identity.token);
      setAppointments(data.appointments);
      return identity.token;
    }
    const guest = cfg.auth_mode === "guest";
    const created = await api<{ token: string; patient: { name: string } }>(guest ? "/auth/guest" : "/auth/demo", undefined, guest ? {} : { name: "Demo patient" });
    const identity = { token: created.token, name: created.patient.name };
    localStorage.setItem(guest ? "noor-guest-token" : "noor-demo-token", identity.token);
    tokenRef.current = identity.token;
    setToken(identity.token);
    setName(identity.name);
    return identity.token;
  };

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const authToken = await authenticate();
      const created = await api<{ session_id: string; message: string }>("/voice/sessions", authToken, {});
      session.current = created.session_id;
      setSeconds(0);
      if (mode === "livekit") {
        const connection = await api<Credentials>(`/voice/sessions/${created.session_id}/livekit`, authToken, {});
        setCredentials(connection);
        setStatus("Connecting to Noor");
      }
      activeRef.current = true;
      setActive(true);
      if (mode === "demo") {
        speak(created.message);
      }
    } catch (e) {
      session.current = null;
      setError((e as Error).message);
      setStatus("Ready when you are");
    } finally { setBusy(false); }
  };

  const end = useCallback(async () => {
    const ended = session.current;
    session.current = null;
    activeRef.current = false;
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    setActive(false);
    setCredentials(null);
    setStatus("Your conversation has ended");
    if (ended) {
      try { await api(`/voice/sessions/${ended}/end`, tokenRef.current, {}); }
      catch (e) { setError((e as Error).message); }
      await refreshAppointments();
    }
  }, [refreshAppointments]);

  const switchAccount = async () => {
    setBusy(true);
    setError("");
    try {
    await signOutGoogle();
    tokenRef.current = "";
    setToken("");
    setEmail("");
    setName("Guest");
    setAppointments([]);
    localStorage.removeItem("noor-guest-token");
    localStorage.removeItem("noor-demo-token");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const liveStatus = useCallback((state: string) => {
    const labels: Record<string, string> = { listening: "Listening to you", speaking: "Noor is speaking", thinking: "Finding your next step", connecting: "Connecting to Noor", initializing: "Noor is getting ready" };
    setStatus(labels[state] || state);
  }, []);
  const liveError = useCallback((message: string) => setError(message), []);
  const talking = status === "Noor is speaking" || status === "Listening to you";
  const duration = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const realBooking = config?.booking_mode === "firestore" || config?.booking_mode === "firestore_calendar";

  return <div className="site-shell">
    <header className="header">
      <a href="/" className="brand" aria-label="Noor home"><span className="brand-mark"><HeartPulse size={23} strokeWidth={1.5} /></span>noor<span className="brand-dot">.</span></a>
      <nav aria-label="Main navigation"><a className="nav-active" href="#assistant">Voice assistant</a><a href="#appointments">My appointments</a></nav>
      <div className="header-right"><span className="demo-tag"><span /> {realBooking ? "Appointment assistant" : "Voice demo"}</span>{email && !active && <button className="text-button" disabled={busy} onClick={() => void switchAccount()}>Switch account</button>}<span className="avatar" title={email || name}>{(name || email || "G")[0].toUpperCase()}</span></div>
    </header>

    <main>
      <section className="intro">
        <div><div className="eyebrow"><span className="small-line" /> A LITTLE LESS ADMIN. A LITTLE MORE CARE.</div>
          <h1>Good care starts with<br />a <em>conversation.</em></h1>
          <p>Meet Noor, your dental appointment assistant.<br className="desktop-break" /> Just speak. We’ll take care of the next step.</p>
        </div>
        <div className="intro-note"><span className="note-icon"><Sparkles size={22} strokeWidth={1.5} /></span><p>A familiar voice.<br />A simpler way to book.</p><span className="note-scribble">Made around you</span></div>
      </section>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => { setError(""); if (!config) void connectApi(); }} aria-label="Dismiss error or retry connection"><X size={18} /></button></div>}


      <section className="workspace" id="assistant">
        <article className="voice-card">
          <div className="card-topline"><div className="assistant-label"><span className="online-dot" /> YOUR VOICE CONCIERGE</div><span className="private-label"><ShieldCheck size={14} /> {active ? duration : "You’re in control"}</span></div>
          <div className="orb-area"><div className={`orb-halo ${talking ? "moving" : ""}`}><div className="orb"><div className="orb-glint" /><span className="orb-wave">{[16, 28, 39, 25, 18].map((h, i) => <i key={i} style={{ height: h, animationDelay: `${i * 0.13}s` }} />)}</span></div></div></div>
          <h2>{active ? "We’re all ears." : "Hi, I’m Noor."}</h2>
          <p className="assistant-subtitle">{active ? "Take your time. I’m here to help." : "Your next appointment is a conversation away."}</p>
          <div className={`voice-status ${active ? "is-active" : ""}`} aria-live="polite"><span />{status}</div>

          {active && mode === "livekit" && credentials ? <LiveCall credentials={credentials} onEnd={() => void end()} onError={liveError} onStatus={liveStatus} /> :
            <div className="primary-controls">{active ? <><button className="mic-control" disabled={processing} onClick={() => { window.speechSynthesis?.cancel(); listen(); }} aria-label="Speak to Noor"><Mic size={24} /></button><button className="end-button" onClick={() => void end()}><PhoneOff size={17} /> End session</button></> :
              <button className="start-button" onClick={() => void start()} disabled={busy}><Mic size={19} />{busy ? "Getting ready…" : config?.auth_mode === "firebase" && !token ? "Continue with Google" : "Start a conversation"}<ArrowRight size={17} /></button>}</div>}
          <p className="mic-note"><Headphones size={13} /> {active ? "Headphones make the conversation even clearer" : "Allow your microphone when prompted"}</p>
          <div className="card-settings">{browserVoiceTestEnabled ? <><label><Globe2 size={14} /><select aria-label="Speech recognition language" value={language} onChange={e => setLanguage(e.target.value)} disabled={active}><option value="en-US">English</option><option value="hi-IN">Hindi / Hinglish</option><option value="ar-AE">Arabic</option></select><ChevronDown size={12} /></label>
            <label><Volume2 size={14} /><select aria-label="Voice connection mode" value={mode} onChange={e => setMode(e.target.value as "demo" | "livekit")} disabled={active}><option value="demo">Browser voice test</option><option value="livekit">LiveKit AI voice</option></select><ChevronDown size={12} /></label></> : <><label><Globe2 size={14} />Auto language</label><label><Volume2 size={14} />LiveKit AI voice</label></>}
          </div>
        </article>

        <aside className="guide-card"><div className="eyebrow">A CALMER WAY TO CARE</div><h2>Less back and forth.<br />More <em>peace of mind.</em></h2><p className="guide-intro">One conversation, from finding a time to making it yours.</p>
          <div className="guide-step"><span className="step-icon"><Mic size={19} strokeWidth={1.6} /></span><div><h3>Tell us what you need</h3><p>A checkup, a cleaning, or a change of plans. Start anywhere.</p></div></div>
          <div className="guide-step"><span className="step-icon"><CalendarDays size={19} strokeWidth={1.6} /></span><div><h3>Find a time that fits</h3><p>{realBooking ? "Find an available appointment with our clinic team." : "Explore available demo slots with our dental care team."}</p></div></div>
          <div className="guide-step"><span className="step-icon"><Check size={19} strokeWidth={1.6} /></span><div><h3>You have the final say</h3><p>We’ll read the details back. Nothing is booked until you confirm.</p></div></div>
          <div className="try-saying"><span>TRY SAYING</span><p>“I’d like to book a cleaning <br />for tomorrow.”</p><span className="quote-icon">”</span></div>
          <div className="demo-explainer"><span className="demo-pill">{realBooking ? (config?.calendar_invitations_enabled ? "CALENDAR INVITE" : "FIREBASE BOOKING") : "TEST CLINIC"}</span><p>{realBooking ? "Just your name, phone number, date and time. Calendar invitations are sent automatically." : "This is a local test booking; no actual calendar event or email was sent."}</p></div>
        </aside>
      </section>

      <section>
        {browserVoiceTestEnabled && <div className="test-prompts"><button className="test-toggle" onClick={() => setTestPanel(s => !s)}>Test prompts</button>{testPanel && prompts.map(p => <button key={p} disabled={!active || processing || mode !== "demo"} onClick={() => void sendTurn(p)}>{p}</button>)}</div>}
        {token && config && config.doctors.length > 0 && <article className="availability-card">
          <div className="section-heading"><h2>Available slots</h2></div>
          <div className="avail-dates">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(); d.setDate(d.getDate() + i + 1);
              const iso = d.toLocaleDateString("sv"); // YYYY-MM-DD
              const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: config.clinic_timezone });
              return <button key={iso} className={`avail-date-btn ${availDate === iso ? "selected" : ""}`} disabled={availLoading} onClick={async () => {
                setAvailDate(iso); setAvailLoading(true); setAvailSlots([]);
                try {
                  const data = await api<{ slots: Slot[] }>(`/availability?doctor_id=${config.doctors[0].id}&date=${iso}`, tokenRef.current);
                  setAvailSlots(data.slots);
                } catch { setAvailSlots([]); }
                finally { setAvailLoading(false); }
              }}>{label}</button>;
            })}
          </div>
          {availLoading && <p className="avail-loading">Loading slots…</p>}
          {!availLoading && availDate && (availSlots.length ? <div className="avail-slots">
            {availSlots.map(s => <span key={s.start} className="avail-slot"><Clock3 size={13} /> {s.label}</span>)}
          </div> : <p className="avail-empty">No available slots on this date.</p>)}
        </article>}

        <article className="appointments-card" id="appointments"><div className="section-heading"><h2>My appointments</h2><button className="text-button" onClick={() => void refreshAppointments()} disabled={!token}>Refresh <ArrowDown size={12} /></button></div>
          {appointments.length ? <div className="appointment-list">{appointments.map(a => <div className="appointment" key={a.id}><span className="appointment-icon"><CalendarDays size={19} /></span><div><h3>{a.reason}</h3><p>{a.client_name || "Clinic appointment"}{a.phone_number ? ` · ${a.phone_number}` : ""}</p><span>{new Intl.DateTimeFormat("en-GB", { timeZone: config?.clinic_timezone || "Asia/Dubai", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(a.start))} · Dubai</span>{a.calendar_html_link && <a className="calendar-link" href={a.calendar_html_link} target="_blank" rel="noreferrer">Open Google Calendar event</a>}{a.calendar_invitation_status === "failed" && <span>Calendar invitation could not be sent.</span>}</div><span className="booking-check"><Check size={13} /></span></div>)}</div> : <div className="appointments-empty"><span className="calendar-outline"><CalendarDays size={26} strokeWidth={1.2} /></span><h3>A little space for your next visit.</h3><p>{token ? (realBooking ? "Your confirmed appointments will appear here on this browser." : "Your confirmed demo appointments will appear here.") : "Start a conversation to see and arrange your appointments."}</p></div>}
          <div className="timezone-note"><Clock3 size={13} /> All appointment times are in Dubai (GMT+4)</div>
        </article>
      </section>
      <footer><span className="footer-brand">noor.</span><p>A little more human. A little less hassle.</p><span><span className={`footer-dot ${config ? "connected" : ""}`} />{config ? (realBooking ? "Appointment care · Dubai" : "Local voice demo · Dubai") : "Connecting to Python service"}</span></footer>
    </main>
    {token && <ChatPanel token={token} />}
  </div>;
}
