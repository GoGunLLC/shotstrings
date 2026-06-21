"use client";

import { useState } from "react";

const TEAL = "#2fb8a0";
const STATUSES = [
  { key: "measured", label: "Measured" },
  { key: "misread", label: "Misread" },
  { key: "missing", label: "Missing" },
];

const fieldBase = {
  background: "#0e1013",
  border: "1px solid #23272d",
  borderRadius: 4,
  color: "#e6e7e9",
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
  fontFamily: "var(--font-mono), 'Space Mono', monospace",
};

// Editable shot grid with bulk paste. `shots` is an array of
// { velocity:number|null, status:'measured'|'misread'|'missing' }.
// Misread/missing rows are kept (they preserve shot order & count) but carry no
// velocity — the chrono simply didn't read them (architecture §3.2 / §4.4).
export default function ShotsEditor({ shots, onChange }) {
  const [paste, setPaste] = useState("");

  function applyPaste() {
    const tokens = paste
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const rows = tokens.map((t) => {
      const n = Number(t);
      if (Number.isFinite(n) && t !== "" && !/[a-z]/i.test(t)) {
        return { velocity: n, status: "measured" };
      }
      // x / - / miss / na -> a fired-but-unread shot.
      return { velocity: null, status: "missing" };
    });
    if (rows.length) onChange(rows);
    setPaste("");
  }

  function updateRow(i, patch) {
    const next = shots.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  }
  function setStatus(i, status) {
    updateRow(i, status === "measured" ? { status } : { status, velocity: null });
  }
  function addRow() {
    onChange([...shots, { velocity: null, status: "measured" }]);
  }
  function removeRow(i) {
    onChange(shots.filter((_, idx) => idx !== i));
  }

  const measured = shots.filter((s) => s.status === "measured" && s.velocity != null).length;
  const estimated = shots.length - measured;

  return (
    <div>
      {/* Bulk paste */}
      <div style={{ marginBottom: 14 }}>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"Paste velocities from your chrono — one per line or separated by spaces/commas.\n918  921  x  925  930  ...   (use x for a shot the chrono didn't read)"}
          rows={3}
          style={{ ...fieldBase, width: "100%", resize: "vertical", lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <button type="button" onClick={applyPaste} style={pasteBtn}>
            Load pasted shots
          </button>
          <span className="mono" style={{ fontSize: 10, color: "#5e7170", letterSpacing: 0.5 }}>
            REPLACES THE GRID BELOW
          </span>
        </div>
      </div>

      {shots.length > 0 && (
        <div
          style={{
            border: "1px solid #181b1f",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            className="mono"
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr 150px 40px",
              gap: 10,
              padding: "9px 12px",
              background: "#0b0d10",
              fontSize: 9.5,
              letterSpacing: 1,
              color: "#5e7170",
              textTransform: "uppercase",
            }}
          >
            <span>#</span>
            <span>Velocity (fps)</span>
            <span>Status</span>
            <span />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {shots.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr 150px 40px",
                  gap: 10,
                  alignItems: "center",
                  padding: "6px 12px",
                  borderTop: "1px solid #141619",
                }}
              >
                <span className="mono" style={{ fontSize: 12, color: "#7b8089" }}>
                  {i + 1}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={s.velocity ?? ""}
                  disabled={s.status !== "measured"}
                  onChange={(e) =>
                    updateRow(i, {
                      velocity: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder={s.status === "measured" ? "—" : "no read"}
                  style={{
                    ...fieldBase,
                    width: "100%",
                    padding: "6px 9px",
                    opacity: s.status === "measured" ? 1 : 0.45,
                  }}
                />
                <select
                  value={s.status}
                  onChange={(e) => setStatus(i, e.target.value)}
                  style={{ ...fieldBase, width: "100%", padding: "6px 9px", cursor: "pointer" }}
                >
                  {STATUSES.map((st) => (
                    <option key={st.key} value={st.key}>
                      {st.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  title="Remove shot"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#5e6066",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <button type="button" onClick={addRow} style={pasteBtn}>
          + Add shot
        </button>
        {shots.length > 0 && (
          <span className="mono" style={{ fontSize: 10, color: "#5e7170", letterSpacing: 0.5 }}>
            {shots.length} SHOTS · {measured} MEASURED
            {estimated ? ` · ${estimated} UNREAD` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

const pasteBtn = {
  background: "rgba(47,184,160,0.08)",
  border: `1px solid ${TEAL}`,
  color: TEAL,
  borderRadius: 4,
  padding: "7px 13px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  cursor: "pointer",
  fontFamily: "var(--font-mono), 'Space Mono', monospace",
  textTransform: "uppercase",
};
