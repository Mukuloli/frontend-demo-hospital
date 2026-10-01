"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { googleSignIn, restoreGoogleSignIn } from "@/lib/firebase";

type Doctor = { id: string; name: string };
type Connection = { connected: boolean; oauth_configured: boolean; google_email?: string };

export default function Admin() {
  const [token, setToken] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(idToken: string) {
    setBusy(true); setError("");
    try {
      const config = await api<{ doctors: Doctor[] }>("/config");
      const rows = await Promise.all(config.doctors.map(async doctor => [doctor.id,
        await api<Connection>(`/host/google/status?doctor_id=${encodeURIComponent(doctor.id)}`, idToken)] as const));
      setToken(idToken); setDoctors(config.doctors); setConnections(Object.fromEntries(rows));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => { void restoreGoogleSignIn().then(user => { if (user) void load(user.token); }).catch(() => {}); }, []);

  async function signIn() {
    setBusy(true); setError("");
    try { const user = await googleSignIn(); await load(user.token); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function connect(id: string) {
    setBusy(true); setError("");
    try {
      const data = await api<{ authorization_url: string }>(`/host/google/connect?doctor_id=${encodeURIComponent(id)}`, token);
      window.location.assign(data.authorization_url);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return <main style={{ maxWidth: 800, margin: "48px auto", padding: 24 }}>
    <a href="/">Back to booking page</a>
    <h1>Clinic Calendar invitations</h1>
    <p>Patients do not sign in. Sign in here with the allowlisted clinic admin account, then connect the clinic Google Calendar once. Confirmed bookings remain in Firebase and Google emails each patient a Calendar RSVP invitation.</p>
    {!token && <button className="start-button" disabled={busy} onClick={() => void signIn()}>{busy ? "Connecting…" : "Sign in as clinic admin"}</button>}
    {error && <p role="alert">{error}</p>}
    {doctors.map(doctor => <section className="host-setup" key={doctor.id}>
      <div><h2>{doctor.name}</h2><p>{connections[doctor.id]?.connected ? `Connected: ${connections[doctor.id].google_email}` : "Google Calendar is not connected."}</p></div>
      <button disabled={busy || !connections[doctor.id]?.oauth_configured} onClick={() => void connect(doctor.id)}>
        {connections[doctor.id]?.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
      </button>
    </section>)}
  </main>;
}
