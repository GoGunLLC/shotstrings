"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "../lib/supabase";

const TEAL = "#2fb8a0";

// Shared top navigation used across every page. Owns the auth session so each
// page doesn't re-implement it. `active` highlights the current section.
export default function SiteNav({ active }) {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Look up admin flag whenever the signed-in user changes.
  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    let alive = true;
    getSupabaseClient()
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setIsAdmin(!!data?.is_admin);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  // Close the account menu on any outside click.
  useEffect(() => {
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function signInWithGoogle() {
    // Deep-link back to wherever the user currently is so intent is preserved
    // (architecture/flow: click Submit while logged out -> sign in -> land on
    // the form, not a generic page).
    getSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
  }

  function signOut() {
    getSupabaseClient().auth.signOut();
    setMenuOpen(false);
  }

  const linkStyle = (key) => ({
    cursor: "pointer",
    color: active === key ? "#e6e7e9" : "#7b8089",
    textDecoration: "none",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 40px",
        borderBottom: "1px solid #181b1f",
      }}
    >
      <Link
        href="/"
        style={{ flex: "1 1 0", display: "flex", alignItems: "center", gap: 13, textDecoration: "none", color: "inherit" }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: TEAL,
            boxShadow: "0 0 7px 1px rgba(47,184,160,.85), inset 0 0 2px rgba(255,255,255,.5)",
          }}
        />
        <div style={{ fontWeight: 800, letterSpacing: 5, fontSize: 14 }}>SHOTSTRINGS</div>
      </Link>

      <div
        className="mono"
        style={{
          flex: "0 0 auto",
          display: "flex",
          justifyContent: "center",
          gap: 28,
          fontSize: 13,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        <Link href="/" style={linkStyle("index")}>
          Index
        </Link>
        <Link href="/submit" style={linkStyle("submit")}>
          Submit
        </Link>
        {session && (
          <Link href="/dashboard" style={linkStyle("dashboard")}>
            Dashboard
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" style={{ ...linkStyle("admin"), color: active === "admin" ? "#e0a93f" : "#c9923a" }}>
            Admin
          </Link>
        )}
        <Link href="/about" style={linkStyle("about")}>
          About
        </Link>
      </div>

      <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
        {session ? (
          <div style={{ position: "relative" }} ref={menuRef}>
            <div
              onClick={() => setMenuOpen((o) => !o)}
              title={session.user.email}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: TEAL,
                color: "#06100e",
                fontSize: 12,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {(session.user.email || "?").charAt(0)}
            </div>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 36,
                  minWidth: 190,
                  background: "#0e1013",
                  border: "1px solid #23272d",
                  borderRadius: 6,
                  overflow: "hidden",
                  zIndex: 30,
                  boxShadow: "0 18px 40px rgba(0,0,0,.5)",
                }}
              >
                <div
                  className="mono"
                  style={{
                    padding: "11px 14px",
                    fontSize: 10,
                    color: "#5e7170",
                    borderBottom: "1px solid #181b1f",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {session.user.email}
                </div>
                <MenuLink href="/submit" label="Submit a string" />
                <MenuLink href="/dashboard" label="Creator dashboard" />
                {isAdmin && <MenuLink href="/admin" label="Admin console" />}
                <div
                  onClick={signOut}
                  className="mono"
                  style={{
                    padding: "11px 14px",
                    fontSize: 11,
                    letterSpacing: 0.5,
                    color: "#7b8089",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    borderTop: "1px solid #181b1f",
                  }}
                >
                  Sign out
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={signInWithGoogle}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "#fff",
              color: "#1f2328",
              border: "none",
              borderRadius: 4,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <GoogleMark />
            Sign in with Google
          </button>
        )}
      </div>
    </div>
  );
}

function MenuLink({ href, label }) {
  return (
    <Link
      href={href}
      className="mono"
      style={{
        display: "block",
        padding: "11px 14px",
        fontSize: 11,
        letterSpacing: 0.5,
        color: "#cdd2d8",
        textDecoration: "none",
        textTransform: "uppercase",
      }}
    >
      {label}
    </Link>
  );
}

export function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
