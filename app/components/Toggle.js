"use client";

const TEAL = "#2fb8a0";

/**
 * Shared pill toggle switch used across the site in place of checkboxes.
 *
 * Props:
 *   on        — boolean, current state
 *   onClick   — click handler (toggles state)
 *   onLabel   — text shown to the right when ON  (optional)
 *   offLabel  — text shown to the right when OFF (optional)
 *   disabled  — optional
 */
export default function Toggle({ on, onClick, onLabel, offLabel, disabled = false }) {
  const hasLabel = onLabel != null || offLabel != null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        role="switch"
        aria-checked={on}
        style={{
          width: 42,
          height: 24,
          borderRadius: 12,
          border: "none",
          background: on ? TEAL : "#23272d",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: on ? "#06100e" : "#5e6066",
            transition: "left .15s",
          }}
        />
      </button>
      {hasLabel && (
        <span style={{ fontSize: 13, color: "#868d96" }}>{on ? onLabel : offLabel}</span>
      )}
    </div>
  );
}
