"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TEAL = "#2fb8a0";

const linkStyle = { color: "#7b8089", textDecoration: "none" };

// Site-wide footer. Mounted once in the root layout; hides itself on the
// embed view so iframes stay chrome-free.
export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname && pathname.startsWith("/embed")) return null;

  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: "1px solid #181b1f",
        // Extra bottom room so the row clears the fixed FeedbackWidget pill
        // (bottom:22 in FeedbackWidget.js) — otherwise it covers Privacy/Terms.
        padding: "26px 40px 72px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: TEAL,
            boxShadow: "0 0 6px 1px rgba(47,184,160,.7)",
          }}
        />
        <span className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#5e7170" }}>
          © {year} GoGun LLC
        </span>
      </div>

      <nav
        className="mono"
        style={{
          display: "flex",
          gap: 22,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: "uppercase",
          flexWrap: "wrap",
        }}
      >
        <Link href="/about" style={linkStyle}>About</Link>
        <Link href="/submit" style={linkStyle}>Submit</Link>
        <Link href="/privacy" style={linkStyle}>Privacy</Link>
        <Link href="/terms" style={linkStyle}>Terms</Link>
      </nav>
    </footer>
  );
}
