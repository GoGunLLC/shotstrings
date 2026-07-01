"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteNav, { GoogleMark } from "../components/SiteNav";
import { getSupabaseClient } from "../lib/supabase";
import { getMyDashboard, getMyProfile, setMyUsername } from "../lib/catalog";

const TEAL = "#2fb8a0";

const STATUS_STYLE = {
  approved: { color: "#2fb8a0", bg: "rgba(47,184,160,0.1)", border: "rgba(47,184,160,0.4)", label: "Approved" },
  pending: { color: "#e0a93f", bg: "rgba(224,169,63,0.1)", border: "rgba(224,169,63,0.4)", label: "Pending review" },
  rejected: { color: "#e24b4a", bg: "rgba(226,75,74,0.1)", border: "rgba(226,75,74,0.4)", label: "Rejected" },
};

export default function DashboardPage() {
  const [session, setSession] = useState(undefined);
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      getMyDashboard(session.user.id).then(setData);
      getMyProfile().then(setProfile);
    }
  }, [session]);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SiteNav active="dashboard" />
        <div className="mono" style={{ padding: 60, color: "#5e7170", fontSize: 13 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SiteNav active="dashboard" />
        <div style={{ display: "flex", justifyContent: "center", padding: "90px 20px" }}>
          <div
            style={{
              width: 380,
              background: "#0e1013",
              border: "1px solid #23272d",
              borderRadius: 8,
              padding: 32,
              textAlign: "center",
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Sign in to view your dashboard</h2>
            <p style={{ color: "#868d96", fontSize: 14.5, lineHeight: 1.6, margin: "10px 0 20px" }}>
              Your dashboard shows the videos and shot strings you've submitted, with their review
              status.
            </p>
            <button
              onClick={() =>
                getSupabaseClient().auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.href },
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                width: "100%",
                background: "#fff",
                color: "#1f2328",
                border: "none",
                borderRadius: 4,
                padding: "11px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <GoogleMark />
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totals = data?.totals || { strings: 0, approved: 0, pending: 0 };

  return (
    <div style={{ minHeight: "100vh" }}>
      <SiteNav active="dashboard" />
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "44px 24px 90px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: TEAL, marginBottom: 8 }}>
              CREATOR DASHBOARD
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1 }}>
              Your submissions
            </h1>
          </div>
          <Link href="/submit" style={primaryBtn}>
            + Submit a string
          </Link>
        </div>

        {/* Handle editor */}
        <HandleEditor
          profile={profile}
          onSaved={(username) => setProfile((p) => ({ ...(p || {}), username }))}
        />

        {/* Stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 34 }}>
          <Stat label="Total strings" value={totals.strings} />
          <Stat label="Approved" value={totals.approved} accent={TEAL} />
          <Stat label="Pending" value={totals.pending} accent="#e0a93f" />
        </div>

        {!data && (
          <div className="mono" style={{ color: "#5e7170", fontSize: 13 }}>
            Loading your submissions…
          </div>
        )}

        {data && data.videos.length === 0 && (
          <div
            style={{
              border: "1px dashed #23272d",
              borderRadius: 8,
              padding: 44,
              textAlign: "center",
            }}
          >
            <p style={{ color: "#868d96", fontSize: 14, marginBottom: 16 }}>
              You haven't submitted any shot strings yet.
            </p>
            <Link href="/submit" style={primaryBtn}>
              Submit your first string
            </Link>
          </div>
        )}

        {data &&
          data.videos.map((v) => (
            <div
              key={v.id}
              style={{
                border: "1px solid #181b1f",
                borderRadius: 8,
                marginBottom: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  background: "#0b0d10",
                  borderBottom: "1px solid #181b1f",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 540,
                    }}
                  >
                    {v.title || "Untitled video"}
                  </div>
                  {v.youtube_url && (
                    <a
                      href={v.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mono"
                      style={{ fontSize: 12, color: "#5e7170", textDecoration: "none" }}
                    >
                      {v.youtube_url} ↗
                    </a>
                  )}
                </div>
                <span className="mono" style={{ fontSize: 12, color: "#5e7170", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                  {v.strings.length} STRING{v.strings.length === 1 ? "" : "S"}
                </span>
              </div>

              {v.strings.map((s) => {
                const st = STATUS_STYLE[s.status] || STATUS_STYLE.pending;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "13px 18px",
                      borderTop: "1px solid #141619",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                        {[s.brand, s.model].filter(Boolean).join(" ") || "Unknown gun"}
                        {s.variantName ? ` · ${s.variantName}` : ""}{" "}
                        <span className="mono" style={{ color: TEAL, fontSize: 13 }}>
                          {s.caliber}
                        </span>
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: "#5e7170", marginTop: 3 }}>
                        {s.projectile} · {s.grains} gr · {s.shotCount} shots
                      </div>
                    </div>
                    <span
                      className="mono"
                      style={{
                        fontSize: 12,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: st.color,
                        background: st.bg,
                        border: `1px solid ${st.border}`,
                        borderRadius: 3,
                        padding: "4px 9px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}

// Handle editor — the name shown next to every submission ("by {handle}").
// Seeded from the account's auto-generated handle; the DB enforces format +
// uniqueness, so we just surface whatever message it returns.
function HandleEditor({ profile, onSaved }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind: "ok" | "err", text }

  // Seed the input once the profile loads.
  useEffect(() => {
    if (profile && profile.username != null) setValue(profile.username);
  }, [profile?.username]);

  if (!profile) return null;

  const current = profile.username || "";
  const clean = value.trim();
  const dirty = clean.toLowerCase() !== current.toLowerCase();

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await setMyUsername(clean);
    setBusy(false);
    if (res.error) {
      setMsg({ kind: "err", text: res.error });
      return;
    }
    setValue(res.username);
    setMsg({ kind: "ok", text: "Handle saved." });
    onSaved?.(res.username);
  }

  return (
    <div
      style={{
        background: "#0e1013",
        border: "1px solid #181b1f",
        borderRadius: 8,
        padding: "18px 20px",
        marginBottom: 34,
      }}
    >
      <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#5e7170", textTransform: "uppercase" }}>
        Your handle
      </div>
      <p style={{ color: "#868d96", fontSize: 13, lineHeight: 1.55, margin: "6px 0 12px" }}>
        Shown next to every shot string you submit. Letters, numbers, and hyphens; must be unique.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="mono" style={{ color: "#5e7170", fontSize: 15 }}>@</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && clean && !busy) save();
          }}
          placeholder="your-handle"
          className="mono"
          style={{
            background: "#0b0d10",
            border: "1px solid #23272d",
            borderRadius: 4,
            color: "#e6e7e9",
            fontSize: 14,
            padding: "9px 11px",
            outline: "none",
            width: 240,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={save}
          disabled={busy || !dirty || !clean}
          style={{
            background: dirty && clean ? TEAL : "#1a1d21",
            color: dirty && clean ? "#06100e" : "#5e7170",
            border: "none",
            borderRadius: 4,
            padding: "9px 16px",
            fontSize: 14,
            fontWeight: 800,
            cursor: busy || !dirty || !clean ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {msg && (
        <div
          className="mono"
          style={{
            marginTop: 10,
            fontSize: 12.5,
            color: msg.kind === "ok" ? TEAL : "#e24b4a",
          }}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: "#0e1013", border: "1px solid #181b1f", borderRadius: 8, padding: "18px 20px" }}>
      <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#5e7170", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, color: accent || "#e6e7e9" }}>{value}</div>
    </div>
  );
}

const primaryBtn = {
  background: TEAL,
  color: "#06100e",
  border: "none",
  borderRadius: 4,
  padding: "11px 18px",
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 0.3,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
  display: "inline-block",
  whiteSpace: "nowrap",
};
