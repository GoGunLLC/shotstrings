"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { GoogleMark } from "./SiteNav";

const TEAL = "#2fb8a0";

// Global feedback / feature-request widget. Lives on every page via the root
// layout. A floating bottom-right button opens a modal; submitting requires a
// signed-in (Google) account, writes to public.feedback (RLS-guarded), then
// fires the `feedback-notify` edge function to email matt@gogun.co.
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const cardRef = useRef(null);

  // Own the auth session so the widget works independently of any page.
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Allow other components to open the modal without the floating launcher —
  // e.g. on mobile the FAB is hidden and the hamburger menu fires this event.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("ss:open-feedback", onOpen);
    return () => window.removeEventListener("ss:open-feedback", onOpen);
  }, []);

  function signInWithGoogle() {
    // Preserve intent: land back on the same page so the user can finish the
    // feedback they came to leave.
    getSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
  }

  async function submit() {
    const text = message.trim();
    if (!text) {
      setError("Please enter a suggestion before submitting.");
      return;
    }
    if (!session) {
      setError("Please sign in first.");
      return;
    }
    setBusy(true);
    setError("");

    const supabase = getSupabaseClient();
    const row = {
      user_id: session.user.id,
      user_email: session.user.email || null,
      message: text,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };

    const { data, error: insErr } = await supabase
      .from("feedback")
      .insert(row)
      .select("id")
      .single();

    if (insErr) {
      setBusy(false);
      setError("Something went wrong saving your feedback. Please try again.");
      return;
    }

    // Fire the email notification. The submission is already saved, so we don't
    // block the thank-you on this — just log if it fails.
    try {
      await supabase.functions.invoke("feedback-notify", { body: { id: data.id } });
    } catch (e) {
      console.error("feedback-notify failed", e);
    }

    setBusy(false);
    setDone(true);
    setMessage("");
  }

  function closeAndReset() {
    setOpen(false);
    // Reset the thank-you a beat after the modal closes so it doesn't flash.
    setTimeout(() => {
      setDone(false);
      setError("");
    }, 250);
  }

  return (
    <>
      {/* Floating launcher — present on every page */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback or a suggestion"
        className="mono feedback-fab"
        style={{
          position: "fixed",
          right: 22,
          // Sits 22px off the bottom by default, but lifts above any full-width
          // sticky bottom bar (e.g. the home page's compare/Display-graph bar),
          // which publishes its height via --ss-bottombar while visible.
          bottom: "calc(22px + var(--ss-bottombar, 0px))",
          transition: "bottom .18s ease",
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: TEAL,
          color: "#06100e",
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 1,
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 10px 30px rgba(0,0,0,.45), 0 0 0 1px rgba(47,184,160,.4)",
        }}
      >
        <ChatIcon />
        Feedback
      </button>

      {open && (
        <div
          onMouseDown={(e) => {
            if (cardRef.current && !cardRef.current.contains(e.target)) closeAndReset();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(4,6,8,.66)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
            style={{
              width: "100%",
              maxWidth: 460,
              background: "#0e1013",
              border: "1px solid #23272d",
              borderRadius: 12,
              boxShadow: "0 30px 80px rgba(0,0,0,.6)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                padding: "20px 22px 0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: TEAL,
                    boxShadow: "0 0 7px 1px rgba(47,184,160,.85)",
                  }}
                />
                <span
                  className="mono"
                  style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "#e6e7e9" }}
                >
                  {done ? "Thank you" : "Tell us what to build"}
                </span>
              </div>
              <button
                onClick={closeAndReset}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#7b8089",
                  fontSize: 20,
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 2,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "14px 22px 22px" }}>
              {done ? (
                <div>
                  <p style={{ color: "#cdd2d8", fontSize: 14, lineHeight: 1.55, margin: "4px 0 0" }}>
                    Got it — thank you for helping shape ShotStrings. Your suggestion has been sent
                    straight to the team. We read every one.
                  </p>
                  <button
                    onClick={closeAndReset}
                    style={{
                      marginTop: 20,
                      background: TEAL,
                      color: "#06100e",
                      border: "none",
                      borderRadius: 6,
                      padding: "10px 16px",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p style={{ color: "#aeb4bc", fontSize: 14, lineHeight: 1.55, margin: "4px 0 16px" }}>
                    ShotStrings is brand new and we&apos;re shipping features all the time. We&apos;d
                    love to hear what you want to see — a feature, a fix, or anything that would make
                    the site more useful for you.
                  </p>

                  {session === undefined ? (
                    <div style={{ color: "#5e7170", fontSize: 14 }} className="mono">
                      Loading…
                    </div>
                  ) : !session ? (
                    <div
                      style={{
                        background: "#0b0d10",
                        border: "1px solid #1d2127",
                        borderRadius: 8,
                        padding: "16px",
                      }}
                    >
                      <div style={{ color: "#cdd2d8", fontSize: 14.5, lineHeight: 1.5, marginBottom: 14 }}>
                        Sign in with your Google account to send a suggestion. It takes a second and
                        lets us follow up if we have questions.
                      </div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={signInWithGoogle}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 9,
                            background: "#131314",
                            color: "#e3e3e3",
                            border: "1px solid #8e918f",
                            borderRadius: 4,
                            padding: "9px 15px",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          <GoogleMark />
                          Sign in with Google
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="What would you like to see on ShotStrings?"
                        rows={5}
                        maxLength={5000}
                        autoFocus
                        style={{
                          width: "100%",
                          background: "#0b0d10",
                          border: "1px solid #23272d",
                          borderRadius: 6,
                          color: "#e6e7e9",
                          fontSize: 14,
                          lineHeight: 1.5,
                          padding: "11px 12px",
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                        }}
                      />
                      <div
                        className="mono"
                        style={{ fontSize: 12, color: "#5e7170", marginTop: 8, display: "flex", justifyContent: "space-between" }}
                      >
                        <span>Sending as {session.user.email}</span>
                        <span>{message.length}/5000</span>
                      </div>

                      {error && (
                        <div style={{ color: "#e0734f", fontSize: 13.5, marginTop: 10 }}>{error}</div>
                      )}

                      <button
                        onClick={submit}
                        disabled={busy}
                        style={{
                          marginTop: 16,
                          width: "100%",
                          background: busy ? "#1f3d38" : TEAL,
                          color: "#06100e",
                          border: "none",
                          borderRadius: 6,
                          padding: "11px 16px",
                          fontSize: 14.5,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          cursor: busy ? "default" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {busy ? "Sending…" : "Send suggestion"}
                      </button>
                    </>
                  )}

                  {error && !session && (
                    <div style={{ color: "#e0734f", fontSize: 13.5, marginTop: 10 }}>{error}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-4.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.4 3 8.38 8.38 0 0 1 21 11.5z"
        stroke="#06100e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
