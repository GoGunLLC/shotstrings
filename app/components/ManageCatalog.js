"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getManageData,
  mergeCatalogRecord,
  deleteCatalogRecord,
} from "../lib/catalog";

const TEAL = "#2fb8a0";
const AMBER = "#e0a93f";
const RED = "#e24b4a";

const field = {
  background: "#0e1013",
  border: "1px solid #23272d",
  borderRadius: 4,
  color: "#e6e7e9",
  fontSize: 13,
  padding: "9px 11px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

// Entity tabs in display order. `key` matches the keys returned by getManageData.
const ENTITIES = [
  ["brands", "Brands"],
  ["models", "Models"],
  ["variants", "Variants"],
  ["projectiles", "Projectiles"],
  ["moderators", "Suppressors"],
  ["calibers", "Calibers"],
];

// Human label for a dependency key.
const DEP_LABEL = {
  models: "model",
  projectiles: "projectile",
  moderators: "suppressor",
  variants: "variant",
  tanks: "tank",
  shotStrings: "shot string",
};

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// One-line summary of what points at a record.
function depSummary(rec) {
  const parts = [];
  for (const [k, v] of Object.entries(rec.deps || {})) {
    if (k === "shotStrings") continue; // shown separately as the roll-up
    if (v > 0) parts.push(plural(v, DEP_LABEL[k] || k));
  }
  if (rec.shotStrings > 0) parts.push(plural(rec.shotStrings, "shot string"));
  return parts.length ? parts.join(" · ") : "nothing linked";
}

export default function ManageCatalog() {
  const [entity, setEntity] = useState("brands");
  const [data, setData] = useState(null); // null = loading
  const [loadErr, setLoadErr] = useState("");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [msg, setMsg] = useState(null); // { ok, text }

  function load() {
    setData(null);
    setLoadErr("");
    getManageData().then((d) => {
      if (d.error) setLoadErr(d.error);
      else setData(d);
    });
  }
  useEffect(load, []);

  const records = (data && data[entity]) || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.sub && r.sub.toLowerCase().includes(q))
    );
  }, [records, query]);

  function pickEntity(k) {
    setEntity(k);
    setOpenId(null);
    setQuery("");
    setMsg(null);
  }

  return (
    <div>
      <p style={{ color: "#868d96", fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
        Review what's linked to a catalog entry before you change it. <strong style={{ color: TEAL }}>Merge</strong>{" "}
        folds a duplicate into another record (everything linked moves over);{" "}
        <strong style={{ color: TEAL }}>Delete</strong> is only available once nothing points at a record.
      </p>

      {/* entity selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {ENTITIES.map(([k, label]) => (
          <button
            key={k}
            onClick={() => pickEntity(k)}
            className="mono"
            style={{
              background: entity === k ? "#1a1d22" : "transparent",
              color: entity === k ? "#e6e7e9" : "#7b8089",
              border: "1px solid #23272d",
              borderRadius: 4,
              padding: "7px 13px",
              fontSize: 10.5,
              letterSpacing: 0.5,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {label}
            {data ? <span style={{ color: "#5e7170" }}> {data[k].length}</span> : null}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        style={{ ...field, maxWidth: 320, marginBottom: 16 }}
      />

      {msg && (
        <div className="mono" style={{ fontSize: 11, color: msg.ok ? TEAL : "#f0a0a0", marginBottom: 14 }}>
          {msg.text}
        </div>
      )}

      {loadErr && (
        <div className="mono" style={{ fontSize: 11, color: "#f0a0a0", marginBottom: 14 }}>
          Couldn't load: {loadErr}
        </div>
      )}
      {data === null && !loadErr && (
        <div className="mono" style={{ color: "#5e7170", fontSize: 12 }}>Loading…</div>
      )}

      {data &&
        filtered.map((rec) => (
          <RecordRow
            key={`${rec.kind}-${rec.id}`}
            rec={rec}
            siblings={records}
            open={openId === rec.id}
            onToggle={() => setOpenId(openId === rec.id ? null : rec.id)}
            onDone={(text) => {
              setMsg({ ok: true, text });
              setOpenId(null);
              load();
            }}
            onError={(text) => setMsg({ ok: false, text })}
          />
        ))}

      {data && filtered.length === 0 && (
        <div style={{ border: "1px dashed #23272d", borderRadius: 8, padding: 32, textAlign: "center", color: "#868d96", fontSize: 13 }}>
          Nothing here.
        </div>
      )}
    </div>
  );
}

function RecordRow({ rec, siblings, open, onToggle, onDone, onError }) {
  const [mergeTarget, setMergeTarget] = useState("");
  const [busy, setBusy] = useState(false);

  // Valid merge targets: same entity, not itself.
  const targets = useMemo(
    () => siblings.filter((s) => s.id !== rec.id),
    [siblings, rec.id]
  );

  async function doMerge() {
    if (!mergeTarget) return;
    const target = targets.find((t) => String(t.id) === String(mergeTarget));
    if (!target) return;
    if (
      !confirm(
        `Merge "${rec.label}" into "${target.label}"?\n\nEverything linked to "${rec.label}" will be reassigned to "${target.label}", and "${rec.label}" will be deleted. This can't be undone.`
      )
    )
      return;
    setBusy(true);
    const { data, error } = await mergeCatalogRecord(rec.kind, rec.id, target.id);
    setBusy(false);
    if (error) return onError(`Merge failed: ${error}`);
    const moved = data
      ? Object.entries(data)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => plural(v, DEP_LABEL[k] || k.replace(/_/g, " ")))
          .join(", ")
      : "";
    onDone(`Merged "${rec.label}" into "${target.label}".${moved ? ` Moved ${moved}.` : ""}`);
  }

  async function doDelete() {
    if (!confirm(`Delete "${rec.label}"? This can't be undone.`)) return;
    setBusy(true);
    const { error } = await deleteCatalogRecord(rec.kind, rec.id);
    setBusy(false);
    if (error) return onError(`Delete failed: ${error}`);
    onDone(`Deleted "${rec.label}".`);
  }

  const linked = depSummary(rec);
  const statusColor = rec.status === "pending" ? AMBER : rec.status === "approved" ? TEAL : "#7b8089";

  return (
    <div style={{ border: "1px solid #181b1f", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "13px 16px",
          background: open ? "#0b0d10" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e6e7e9" }}>
            {rec.label}
            {rec.sub ? <span style={{ color: "#5e7170", fontWeight: 400 }}>  ·  {rec.sub}</span> : null}
          </div>
          <div className="mono" style={{ fontSize: 11, color: rec.blocking ? "#868d96" : "#5e7170", marginTop: 3 }}>
            {linked}
          </div>
        </div>
        <span
          className="mono"
          style={{ fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", color: statusColor, whiteSpace: "nowrap" }}
        >
          {rec.status || ""}
        </span>
      </button>

      {open && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid #141619", background: "#080a0c" }}>
          {/* impact preview */}
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1, color: "#7b8089", textTransform: "uppercase", marginBottom: 8 }}>
            Impact
          </div>
          <div style={{ fontSize: 13, color: "#cdd2d8", marginBottom: 16 }}>
            {rec.blocking ? (
              <>Deleting this would orphan <strong style={{ color: AMBER }}>{linked}</strong>. Merge it into another record instead.</>
            ) : (
              <>Nothing is linked to this record — safe to delete.</>
            )}
          </div>

          {/* merge */}
          {rec.mergeable && targets.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label className="mono" style={{ display: "block", fontSize: 9.5, letterSpacing: 1, color: "#7b8089", textTransform: "uppercase", marginBottom: 6 }}>
                Merge into
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} style={{ ...field, maxWidth: 320 }}>
                  <option value="">Select a record to keep…</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                      {t.sub ? ` · ${t.sub}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={doMerge}
                  disabled={busy || !mergeTarget}
                  className="mono"
                  style={{
                    background: "transparent",
                    color: TEAL,
                    border: `1px solid ${TEAL}`,
                    borderRadius: 4,
                    padding: "6px 16px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    cursor: busy || !mergeTarget ? "default" : "pointer",
                    textTransform: "uppercase",
                    opacity: busy || !mergeTarget ? 0.45 : 1,
                  }}
                >
                  {busy ? "Working…" : "Merge"}
                </button>
              </div>
            </div>
          )}

          {/* delete */}
          <div>
            <button
              onClick={doDelete}
              disabled={busy || rec.blocking}
              className="mono"
              title={rec.blocking ? "Can't delete — things are still linked. Merge first." : ""}
              style={{
                background: "transparent",
                color: rec.blocking ? "#4a4d52" : RED,
                border: `1px solid ${rec.blocking ? "#23272d" : RED}`,
                borderRadius: 4,
                padding: "6px 16px",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: busy || rec.blocking ? "default" : "pointer",
                textTransform: "uppercase",
              }}
            >
              Delete
            </button>
            {rec.blocking && (
              <span className="mono" style={{ fontSize: 10.5, color: "#5e7170", marginLeft: 12 }}>
                Linked records must be merged or removed first.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
