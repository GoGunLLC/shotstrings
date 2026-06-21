import SiteNav from "./SiteNav";

const TEAL = "#2fb8a0";

// Shared chrome for the legal pages (privacy, terms). Mirrors the About page's
// layout so these read as part of the same site.
export function LegalShell({ active, label, title, updated, children }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <SiteNav active={active} />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "64px 40px 90px" }}>
        <div
          className="mono"
          style={{
            fontSize: 13,
            letterSpacing: 2,
            color: "#5e7170",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 14,
          }}
        >
          <span style={{ width: 7, height: 7, background: TEAL, display: "inline-block" }} />
          {label}
        </div>

        <h1
          style={{
            fontSize: 46,
            lineHeight: 1.05,
            fontWeight: 800,
            letterSpacing: "-1.4px",
            margin: "0 0 14px",
          }}
        >
          {title}
        </h1>

        <div className="mono" style={{ color: "#5e7170", fontSize: 13, letterSpacing: 0.5 }}>
          Last updated {updated}
        </div>

        {children}
      </div>
    </div>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2
        style={{
          fontSize: 19,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "-.2px",
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <div style={{ color: "#868d96", fontSize: 16, lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

export function LegalList({ children }) {
  return (
    <ul style={{ margin: "12px 0 0", paddingLeft: 22, color: "#868d96", fontSize: 16, lineHeight: 1.7 }}>
      {children}
    </ul>
  );
}
