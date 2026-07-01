"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteNav from "../components/SiteNav";
import ShotsEditor from "../components/ShotsEditor";
import ManageCatalog from "../components/ManageCatalog";
import Toggle from "../components/Toggle";
import {
  getMyProfile,
  getCatalog,
  getAllSubmissions,
  setStringStatus,
  deleteString,
  updateStringFull,
  addBrand,
  addModel,
  addVariant,
  addModerator,
  addProjectile,
  addCaliber,
  tankRoleOptions,
  tankRoleShort,
  psiFromBar,
  barFromPsi,
  inFromCm,
  cmFromIn,
  toC,
  fFromC,
  toFt,
  mFromFt,
} from "../lib/catalog";

const TEAL = "#2fb8a0";
const AMBER = "#e0a93f";

// Toggle option sets for UnitField. First entry is the canonical storage unit
// (identity conversion); `to` maps entered value -> canonical, `from` maps the
// canonical stored value -> the displayed unit.
const PRESSURE_UNITS = [
  { key: "psi", to: (n) => Number(n), from: (n) => Number(n) },
  { key: "bar", to: (n) => psiFromBar(n), from: (n) => barFromPsi(n) },
];
const DISTANCE_UNITS = [
  { key: "in", to: (n) => Number(n), from: (n) => Number(n) },
  { key: "cm", to: (n) => inFromCm(n), from: (n) => cmFromIn(n) },
];
const TEMP_UNITS = [
  { key: "C", to: (n) => Number(n), from: (n) => Number(n) },
  { key: "F", to: (n) => toC(n), from: (n) => fFromC(n) },
];
const ALTITUDE_UNITS = [
  { key: "ft", to: (n) => Number(n), from: (n) => Number(n) },
  { key: "m", to: (n) => toFt(n), from: (n) => mFromFt(n) },
];
const roundN = (n) => Math.round(n * 100) / 100;

const field = {
  background: "#0e1013",
  border: "1px solid #23272d",
  borderRadius: 4,
  color: "#e6e7e9",
  fontSize: 14,
  padding: "9px 11px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

const STATUS_STYLE = {
  approved: { color: TEAL, bg: "rgba(47,184,160,0.1)", border: "rgba(47,184,160,0.4)", label: "Approved" },
  pending: { color: AMBER, bg: "rgba(224,169,63,0.1)", border: "rgba(224,169,63,0.4)", label: "Pending" },
  rejected: { color: "#e24b4a", bg: "rgba(226,75,74,0.1)", border: "rgba(226,75,74,0.4)", label: "Rejected" },
};

export default function AdminPage() {
  const [profile, setProfile] = useState(undefined); // undefined=loading, null=signed out
  const [tab, setTab] = useState("review");
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    getMyProfile().then((p) => setProfile(p));
  }, []);

  useEffect(() => {
    if (profile?.is_admin) getCatalog().then(setCatalog);
  }, [profile]);

  function reloadCatalog() {
    getCatalog().then(setCatalog);
  }

  if (profile === undefined) {
    return (
      <Shell>
        <div className="mono" style={{ color: "#5e7170", fontSize: 13 }}>
          Loading…
        </div>
      </Shell>
    );
  }

  if (!profile || !profile.is_admin) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8 }}>Admins only</h1>
          <p style={{ color: "#868d96", fontSize: 14, marginTop: 10 }}>
            This area is restricted. {profile ? "Your account isn't an admin." : "Sign in with an admin account."}
          </p>
          <Link href="/" style={{ color: TEAL, fontSize: 14, marginTop: 16, display: "inline-block" }}>
            ← Back to the index
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="mono" style={{ fontSize: 12, letterSpacing: 2, color: AMBER, marginBottom: 8 }}>
            ADMIN CONSOLE
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1 }}>Moderation</h1>
        </div>
        <div style={{ display: "flex", border: "1px solid #23272d", borderRadius: 5, overflow: "hidden" }}>
          {[
            ["review", "Review submissions"],
            ["catalog", "Quick-add catalog"],
            ["manage", "Manage catalog"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="mono"
              style={{
                background: tab === k ? AMBER : "transparent",
                color: tab === k ? "#100c02" : "#7b8089",
                border: "none",
                padding: "9px 16px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.5,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "review" ? (
        <ReviewQueue catalog={catalog} />
      ) : tab === "catalog" ? (
        <CatalogAdmin catalog={catalog} onChanged={reloadCatalog} />
      ) : (
        <ManageCatalog />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      <SiteNav active="admin" />
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "44px 24px 100px" }}>{children}</div>
    </div>
  );
}

// ===========================================================================
// REVIEW QUEUE
// ===========================================================================
function ReviewQueue({ catalog }) {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");

  function load() {
    setRows(null);
    getAllSubmissions(filter).then((r) => setRows(r.rows || []));
  }
  useEffect(load, [filter]);

  async function act(id, fn, okMsg) {
    setMsg("");
    const { error } = await fn();
    if (error) return setMsg(error);
    setMsg(okMsg);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {["pending", "approved", "rejected", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="mono"
            style={{
              background: filter === f ? "#1a1d22" : "transparent",
              color: filter === f ? "#e6e7e9" : "#7b8089",
              border: "1px solid #23272d",
              borderRadius: 4,
              padding: "7px 13px",
              fontSize: 12,
              letterSpacing: 0.5,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mono" style={{ fontSize: 12, color: TEAL, marginBottom: 14 }}>
          {msg}
        </div>
      )}

      {rows === null && <div className="mono" style={{ color: "#5e7170", fontSize: 13 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ border: "1px dashed #23272d", borderRadius: 8, padding: 40, textAlign: "center", color: "#868d96", fontSize: 14 }}>
          Nothing here.
        </div>
      )}

      {rows &&
        rows.map((r) => {
          const st = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
          const open = editing === r.id;
          return (
            <div key={r.id} style={{ border: "1px solid #181b1f", borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "#0b0d10" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {[r.brand, r.model].filter(Boolean).join(" ") || "Unknown gun"}
                    {r.variantName ? ` · ${r.variantName}` : ""}{" "}
                    <span className="mono" style={{ color: TEAL, fontSize: 13 }}>{r.caliber}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: "#5e7170", marginTop: 3 }}>
                    {r.projectile} · {r.weightGrains} gr · {r.shots.length} shots · by {r.submitter}
                    {r.video?.youtube_url ? (
                      <>
                        {" · "}
                        <a href={r.video.youtube_url} target="_blank" rel="noreferrer" style={{ color: "#6f9bd6", textDecoration: "none" }}>
                          video ↗
                        </a>
                      </>
                    ) : null}
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

              <div style={{ display: "flex", gap: 8, padding: "11px 18px", borderTop: "1px solid #141619", flexWrap: "wrap" }}>
                {r.status !== "approved" && (
                  <ActBtn color={TEAL} onClick={() => act(r.id, () => setStringStatus(r.id, "approved"), "Approved.")}>
                    Approve
                  </ActBtn>
                )}
                {r.status !== "rejected" && (
                  <ActBtn color="#e24b4a" onClick={() => act(r.id, () => setStringStatus(r.id, "rejected"), "Rejected.")}>
                    Reject
                  </ActBtn>
                )}
                <ActBtn color="#7b8089" onClick={() => setEditing(open ? null : r.id)}>
                  {open ? "Close editor" : "Edit"}
                </ActBtn>
                <ActBtn
                  color="#7b8089"
                  onClick={() => {
                    if (confirm("Delete this submission and its shots? This can't be undone.")) {
                      act(r.id, () => deleteString(r.id), "Deleted.");
                    }
                  }}
                >
                  Delete
                </ActBtn>
              </div>

              {open && (
                <EditSubmission
                  row={r}
                  catalog={catalog}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setMsg("Saved.");
                    load();
                  }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

function ActBtn({ color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="mono"
      style={{
        background: "transparent",
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "6px 13px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

// ---- Full inline editor (conditions, gun, projectile, shots) ----
function EditSubmission({ row, catalog, onCancel, onSaved }) {
  const variantsAll = catalog?.variants || [];
  const startVariant = variantsAll.find((v) => String(v.id) === String(row.variantId)) || null;
  const startModel = (catalog?.models || []).find((m) => String(m.id) === String(startVariant?.model_id)) || null;

  const [brandId, setBrandId] = useState(startModel?.brand_id ? String(startModel.brand_id) : "");
  const [modelId, setModelId] = useState(startVariant?.model_id ? String(startVariant.model_id) : "");
  const [variantId, setVariantId] = useState(row.variantId ? String(row.variantId) : "");
  const [projChoice, setProjChoice] = useState(row.projectileId ? String(row.projectileId) : "custom");
  const [customWeight, setCustomWeight] = useState(row.projectileId ? "" : String(row.weightGrains ?? ""));
  const [moderatorId, setModeratorId] = useState(row.moderatorId ? String(row.moderatorId) : "");
  const [temp, setTemp] = useState(row.temperatureC ?? "");
  const [alt, setAlt] = useState(row.altitudeFt ?? "");
  const [chrono, setChrono] = useState(row.chronoDistanceIn ?? "");
  const [reg, setReg] = useState(!!row.ranRegulated);
  const [setpoint, setSetpoint] = useState(row.regSetpointPsi ?? "");
  const [shots, setShots] = useState(row.shots);
  // Per-tank start/end fill pressure, keyed by tank_id. Values are canonical psi
  // (UnitField speaks psi); seeded from the submission's stored pressures.
  const [tankPress, setTankPress] = useState(() => {
    const init = {};
    for (const [tid, v] of Object.entries(row.tankPressures || {})) {
      init[tid] = { start: v.start ?? "", end: v.end ?? "" };
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function setTank(tankId, patch) {
    setTankPress((prev) => ({ ...prev, [tankId]: { ...prev[tankId], ...patch } }));
  }

  const models = useMemo(
    () => (catalog?.models || []).filter((m) => String(m.brand_id) === String(brandId)),
    [catalog, brandId]
  );
  const variants = useMemo(
    () => variantsAll.filter((v) => String(v.model_id) === String(modelId)),
    [variantsAll, modelId]
  );
  const variant = useMemo(() => variantsAll.find((v) => String(v.id) === String(variantId)) || null, [variantsAll, variantId]);
  const caliberId = variant?.caliber_id ?? row.caliberId;
  const tanks = useMemo(
    () => (variant?.tanks || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [variant]
  );
  const projectiles = useMemo(
    () => (catalog?.projectiles || []).filter((p) => caliberId == null || String(p.caliber_id) === String(caliberId)),
    [catalog, caliberId]
  );
  const selectedProj = projectiles.find((p) => String(p.id) === String(projChoice)) || null;

  async function save() {
    setErr("");
    if (!variantId) return setErr("Pick a variant.");
    const weight = projChoice === "custom" ? Number(customWeight) : selectedProj ? Number(selectedProj.weight_grains) : NaN;
    if (!weight || weight <= 0) return setErr("Projectile weight is required.");
    const bad = shots.some((s) => s.status === "measured" && (s.velocity == null || !Number.isFinite(s.velocity)));
    if (bad) return setErr("Measured shots need a velocity.");

    // UnitField already stores canonical psi, so values pass through directly.
    const tankPressures = tanks.map((t) => ({
      tankId: t.id,
      startPsi: tankPress[t.id]?.start === "" || tankPress[t.id]?.start == null ? null : Number(tankPress[t.id].start),
      endPsi: tankPress[t.id]?.end === "" || tankPress[t.id]?.end == null ? null : Number(tankPress[t.id].end),
    }));

    setBusy(true);
    const { error } = await updateStringFull(
      row.id,
      {
        variantId: Number(variantId),
        caliberId,
        projectileId: projChoice === "custom" ? null : Number(selectedProj.id),
        weightGrains: weight,
        moderatorId: moderatorId ? Number(moderatorId) : null,
        ranRegulated: reg,
        regSetpointPsi: reg && setpoint !== "" ? Number(setpoint) : null,
        temperatureC: temp === "" ? null : Number(temp),
        altitudeFt: alt === "" ? null : Number(alt),
        chronoDistanceIn: chrono === "" ? null : Number(chrono),
      },
      shots,
      tankPressures
    );
    setBusy(false);
    if (error) return setErr(error);
    onSaved();
  }

  return (
    <div style={{ padding: "18px", borderTop: "1px solid #141619", background: "#080a0c" }}>
      <Grid>
        <L label="Brand">
          <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(""); setVariantId(""); }} style={field}>
            <option value="">—</option>
            {(catalog?.brands || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </L>
        <L label="Model">
          <select value={modelId} onChange={(e) => { setModelId(e.target.value); setVariantId(""); }} disabled={!brandId} style={field}>
            <option value="">—</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </L>
        <L label="Variant">
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!modelId} style={field}>
            <option value="">—</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.caliber?.name}{v.barrel_length_in ? ` · ${v.barrel_length_in}"` : ""}{v.name ? ` · ${v.name}` : ""}</option>
            ))}
          </select>
        </L>
      </Grid>
      <Grid>
        <L label="Projectile">
          <select value={projChoice} onChange={(e) => setProjChoice(e.target.value)} style={field}>
            {projectiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.weight_grains} gr</option>
            ))}
            <option value="custom">Custom / unlisted…</option>
          </select>
        </L>
        {projChoice === "custom" ? (
          <L label="Weight (grains)">
            <input type="number" value={customWeight} onChange={(e) => setCustomWeight(e.target.value)} style={field} />
          </L>
        ) : (
          <L label="Suppressor">
            <select value={moderatorId} onChange={(e) => setModeratorId(e.target.value)} style={field}>
              <option value="">None</option>
              {(catalog?.moderators || []).map((m) => (
                <option key={m.id} value={m.id}>{m.brand?.name ? `${m.brand.name} ${m.name}` : m.name}</option>
              ))}
            </select>
          </L>
        )}
        {projChoice === "custom" && (
          <L label="Suppressor">
            <select value={moderatorId} onChange={(e) => setModeratorId(e.target.value)} style={field}>
              <option value="">None</option>
              {(catalog?.moderators || []).map((m) => (
                <option key={m.id} value={m.id}>{m.brand?.name ? `${m.brand.name} ${m.name}` : m.name}</option>
              ))}
            </select>
          </L>
        )}
      </Grid>
      <Grid>
        <L label="Temp"><UnitField value={temp} onChange={setTemp} units={TEMP_UNITS} /></L>
        <L label="Altitude"><UnitField value={alt} onChange={setAlt} units={ALTITUDE_UNITS} /></L>
        <L label="Chrono dist"><UnitField value={chrono} onChange={setChrono} units={DISTANCE_UNITS} /></L>
      </Grid>
      <Grid>
        <L label="Regulated">
          <div style={{ display: "flex", alignItems: "center", height: 38 }}>
            <Toggle
              on={reg}
              onClick={() => setReg((v) => !v)}
              onLabel="Ran regulated"
              offLabel="Unregulated"
            />
          </div>
        </L>
        {reg && <L label="Reg setpoint"><UnitField value={setpoint} onChange={setSetpoint} units={PRESSURE_UNITS} /></L>}
      </Grid>

      <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#7b8089", textTransform: "uppercase", margin: "8px 0 8px" }}>
        Fill pressure
      </div>
      {!variantId ? (
        <div className="mono" style={{ fontSize: 12, color: "#5e7170", marginBottom: 8 }}>SELECT A VARIANT TO SEE ITS TANK(S)</div>
      ) : tanks.length === 0 ? (
        <div className="mono" style={{ fontSize: 12, color: "#5e7170", marginBottom: 8 }}>NO TANK DATA IN CATALOG FOR THIS VARIANT</div>
      ) : (
        tanks.map((t) => (
          <div key={t.id} style={{ marginBottom: 4 }}>
            {tanks.length > 1 && (
              <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#7b8089", textTransform: "uppercase", margin: "4px 0 6px" }}>
                {tankRoleShort(t.role)} tank{t.volume_cc ? ` · ${t.volume_cc} cc` : ""}
              </div>
            )}
            <Grid>
              <L label="Start pressure">
                <UnitField value={tankPress[t.id]?.start ?? ""} onChange={(v) => setTank(t.id, { start: v })} units={PRESSURE_UNITS} />
              </L>
              <L label="End pressure">
                <UnitField value={tankPress[t.id]?.end ?? ""} onChange={(v) => setTank(t.id, { end: v })} units={PRESSURE_UNITS} />
              </L>
            </Grid>
          </div>
        ))
      )}

      <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#7b8089", textTransform: "uppercase", margin: "8px 0 8px" }}>
        Shots
      </div>
      <ShotsEditor shots={shots} onChange={setShots} />

      {err && <div style={{ color: "#f0a0a0", fontSize: 13.5, marginTop: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={save} disabled={busy} style={{ background: TEAL, color: "#06100e", border: "none", borderRadius: 4, padding: "10px 18px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button onClick={onCancel} style={{ background: "transparent", color: "#cdd2d8", border: "1px solid #23272d", borderRadius: 4, padding: "10px 18px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// CATALOG QUICK-ADD
// ===========================================================================
function CatalogAdmin({ catalog, onChanged }) {
  if (!catalog) return <div className="mono" style={{ color: "#5e7170", fontSize: 13 }}>Loading catalog…</div>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ color: "#868d96", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
        Entries you add here are saved <strong style={{ color: TEAL }}>approved</strong> and appear in the
        submission form immediately.
      </p>
      <CaliberForm onChanged={onChanged} />
      <BrandForm onChanged={onChanged} />
      <ModelForm catalog={catalog} onChanged={onChanged} />
      <VariantForm catalog={catalog} onChanged={onChanged} />
      <ModeratorForm catalog={catalog} onChanged={onChanged} />
      <ProjectileForm catalog={catalog} onChanged={onChanged} />
    </div>
  );
}

function CaliberForm({ onChanged }) {
  const [name, setName] = useState("");
  const [inches, setInches] = useState("");
  const [mm, setMm] = useState("");
  const { busy, msg, run } = useAdder(addCaliber);
  return (
    <Card title="Caliber">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            run(
              {
                name: name.trim(),
                nominalInches: inches === "" ? null : Number(inches),
                nominalMm: mm === "" ? null : Number(mm),
              },
              () => { setName(""); setInches(""); setMm(""); }
            ).then(onChanged);
        }}
      >
        <Grid>
          <L label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. .35" style={field} /></L>
          <L label="Nominal (in)"><input type="number" step="any" value={inches} onChange={(e) => setInches(e.target.value)} placeholder="optional, e.g. 0.35" style={field} /></L>
          <L label="Nominal (mm)"><input type="number" step="any" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="optional, e.g. 9.0" style={field} /></L>
        </Grid>
        <div style={{ marginTop: 6 }}><SaveBtn busy={busy} /><Status msg={msg} /></div>
      </form>
    </Card>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #181b1f", borderRadius: 8, padding: "18px 20px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function useAdder(fn) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}
  async function run(args, reset) {
    setBusy(true);
    setMsg(null);
    const { error } = await fn(args);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error });
    setMsg({ ok: true, text: "Added." });
    reset && reset();
  }
  return { busy, msg, run };
}

function Status({ msg }) {
  if (!msg) return null;
  return (
    <span className="mono" style={{ fontSize: 12, marginLeft: 12, color: msg.ok ? TEAL : "#f0a0a0" }}>
      {msg.text}
    </span>
  );
}

function SaveBtn({ busy, label = "Add" }) {
  return (
    <button type="submit" disabled={busy} style={{ background: TEAL, color: "#06100e", border: "none", borderRadius: 4, padding: "9px 18px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
      {busy ? "Saving…" : label}
    </button>
  );
}

function BrandForm({ onChanged }) {
  const [name, setName] = useState("");
  const { busy, msg, run } = useAdder(addBrand);
  return (
    <Card title="Brand">
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) run({ name: name.trim() }, () => setName("")).then(onChanged); }}
        style={{ display: "flex", alignItems: "center", gap: 12 }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FX Airguns" style={{ ...field, maxWidth: 300 }} />
        <SaveBtn busy={busy} />
        <Status msg={msg} />
      </form>
    </Card>
  );
}

function ModelForm({ catalog, onChanged }) {
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [pp, setPp] = useState("pcp");
  const { busy, msg, run } = useAdder(addModel);
  return (
    <Card title="Model">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (brandId && name.trim())
            run({ brandId: Number(brandId), name: name.trim(), powerPlant: pp }, () => { setName(""); }).then(onChanged);
        }}
      >
        <Grid>
          <L label="Brand">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={field}>
              <option value="">Select brand…</option>
              {catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </L>
          <L label="Model name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Impact M3" style={field} /></L>
        </Grid>
        <Grid>
          <L label="Power plant">
            <select value={pp} onChange={(e) => setPp(e.target.value)} style={field}>
              {["pcp", "spring", "gas_ram", "co2", "multi_pump"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </L>
        </Grid>
        <div style={{ marginTop: 6 }}><SaveBtn busy={busy} /><Status msg={msg} /></div>
      </form>
    </Card>
  );
}

const emptyTank = () => ({ vol: "", role: "reservoir", rated: "" });

function VariantForm({ catalog, onChanged }) {
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [caliberId, setCaliberId] = useState("");
  const [name, setName] = useState("");
  const [barrel, setBarrel] = useState("");
  const [reg, setReg] = useState(false);
  const [regPsi, setRegPsi] = useState("");
  const [tanks, setTanks] = useState([emptyTank()]);
  const { busy, msg, run } = useAdder(addVariant);
  const models = catalog.models.filter((m) => String(m.brand_id) === String(brandId));

  const setTank = (i, patch) => setTanks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const addTankRow = () => setTanks((ts) => [...ts, emptyTank()]);
  const removeTankRow = (i) => setTanks((ts) => (ts.length > 1 ? ts.filter((_, j) => j !== i) : ts));

  return (
    <Card title="Variant (caliber + barrel + bottle)">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (modelId && caliberId)
            run(
              {
                modelId: Number(modelId),
                caliberId: Number(caliberId),
                name: name.trim() || null,
                barrelLengthIn: barrel === "" ? null : Number(barrel),
                isRegulated: reg,
                regPressurePsi: reg && regPsi !== "" ? Number(regPsi) : null,
                tanks: tanks.map((t, i) => ({
                  volumeCc: t.vol === "" ? null : Number(t.vol),
                  role: t.role,
                  ratedPressurePsi: t.rated === "" ? null : Number(t.rated),
                  position: i + 1,
                })),
              },
              () => { setName(""); setBarrel(""); setReg(false); setRegPsi(""); setTanks([emptyTank()]); }
            ).then(onChanged);
        }}
      >
        <Grid>
          <L label="Brand">
            <select value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(""); }} style={field}>
              <option value="">Select brand…</option>
              {catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </L>
          <L label="Model">
            <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!brandId} style={field}>
              <option value="">Select model…</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </L>
          <L label="Caliber">
            <select value={caliberId} onChange={(e) => setCaliberId(e.target.value)} style={field}>
              <option value="">Select…</option>
              {catalog.calibers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </L>
        </Grid>
        <Grid>
          <L label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder='optional, e.g. "Sniper"' style={field} /></L>
          <L label="Barrel length"><UnitField value={barrel} onChange={setBarrel} units={DISTANCE_UNITS} placeholder="optional" /></L>
          <L label="Regulated">
            <div style={{ display: "flex", alignItems: "center", height: 38 }}>
              <Toggle
                on={reg}
                onClick={() => {
                  const next = !reg;
                  setReg(next);
                  if (!next) {
                    setRegPsi("");
                    setTanks((ts) => ts.map((t) => (t.role === "working" ? { ...t, role: "reservoir" } : t)));
                  }
                }}
                onLabel="Regulated"
                offLabel="Unregulated"
              />
            </div>
          </L>
          <L label="Reg pressure">
            <div style={{ visibility: reg ? "visible" : "hidden" }}>
              <UnitField value={regPsi} onChange={setRegPsi} units={PRESSURE_UNITS} placeholder="optional" />
            </div>
          </L>
        </Grid>
        <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#5e7170", textTransform: "uppercase", margin: "4px 0 10px" }}>
          Tanks (volume needed for air-efficiency math)
        </div>
        {tanks.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <L label="Volume (cc)"><input type="number" value={t.vol} onChange={(e) => setTank(i, { vol: e.target.value })} placeholder="optional" style={field} /></L>
              <L label="Role">
                <select value={t.role} onChange={(e) => setTank(i, { role: e.target.value })} disabled={!reg} style={field}>
                  {tankRoleOptions(reg).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </L>
              <L label="Rated pressure"><UnitField value={t.rated} onChange={(v) => setTank(i, { rated: v })} units={PRESSURE_UNITS} placeholder="optional" /></L>
            </div>
            <button
              type="button"
              onClick={() => removeTankRow(i)}
              disabled={tanks.length === 1}
              title={tanks.length === 1 ? "At least one tank" : "Remove tank"}
              style={{ background: "none", border: "1px solid #2a2f36", borderRadius: 4, color: tanks.length === 1 ? "#3a3f46" : "#c98a8a", height: 38, padding: "0 12px", fontSize: 13, cursor: tanks.length === 1 ? "not-allowed" : "pointer", flexShrink: 0 }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addTankRow}
          className="mono"
          style={{ background: "none", border: "1px dashed #2a2f36", borderRadius: 4, color: TEAL, padding: "8px 14px", fontSize: 13, cursor: "pointer", marginBottom: 6 }}
        >
          + Add tank
        </button>
        <div style={{ marginTop: 6 }}><SaveBtn busy={busy} label="Add variant" /><Status msg={msg} /></div>
      </form>
    </Card>
  );
}

function ModeratorForm({ catalog, onChanged }) {
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const { busy, msg, run } = useAdder(addModerator);
  return (
    <Card title="Suppressor / moderator">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (brandId && name.trim()) run({ brandId: Number(brandId), name: name.trim() }, () => setName("")).then(onChanged);
        }}
      >
        <Grid>
          <L label="Brand">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={field}>
              <option value="">Select brand…</option>
              {catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </L>
          <L label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 0dB Tracer" style={field} /></L>
        </Grid>
        <div style={{ marginTop: 6 }}><SaveBtn busy={busy} /><Status msg={msg} /></div>
      </form>
    </Card>
  );
}

function ProjectileForm({ catalog, onChanged }) {
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("pellet");
  const [caliberId, setCaliberId] = useState("");
  const [weight, setWeight] = useState("");
  const [head, setHead] = useState("");
  const { busy, msg, run } = useAdder(addProjectile);
  return (
    <Card title="Pellet / slug">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (brandId && name.trim() && caliberId && weight !== "")
            run(
              { brandId: Number(brandId), name: name.trim(), type, caliberId: Number(caliberId), weightGrains: Number(weight), headDiameterMm: head === "" ? null : Number(head) },
              () => { setName(""); setWeight(""); setHead(""); }
            ).then(onChanged);
        }}
      >
        <Grid>
          <L label="Brand">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={field}>
              <option value="">Select brand…</option>
              {catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </L>
          <L label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hades" style={field} /></L>
          <L label="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} style={field}>
              {["pellet", "slug", "round_ball"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </L>
        </Grid>
        <Grid>
          <L label="Caliber">
            <select value={caliberId} onChange={(e) => setCaliberId(e.target.value)} style={field}>
              <option value="">Select…</option>
              {catalog.calibers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </L>
          <L label="Weight (grains)"><input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 25.4" style={field} /></L>
          <L label="Head dia (mm)"><input type="number" value={head} onChange={(e) => setHead(e.target.value)} placeholder="optional" style={field} /></L>
        </Grid>
        <div style={{ marginTop: 6 }}><SaveBtn busy={busy} /><Status msg={msg} /></div>
      </form>
    </Card>
  );
}

// ---- shared layout bits ----
function Grid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>{children}</div>;
}
// Numeric input with a unit toggle. `value`/`onChange` always speak the
// canonical storage unit (psi, in); the toggle only affects what the user types
// and sees. A local draft string keeps decimal entry from being mangled by the
// round-trip through the canonical value.
function UnitField({ value, onChange, units, placeholder }) {
  const [unit, setUnit] = useState(units[0].key);
  const [draft, setDraft] = useState(undefined);
  // Drop the typing buffer when the value is cleared from outside (e.g. the form
  // resets after a successful save) so the field doesn't keep showing stale text.
  useEffect(() => {
    if (value === "" || value == null) setDraft(undefined);
  }, [value]);
  const opt = units.find((u) => u.key === unit) || units[0];
  const shown =
    draft !== undefined
      ? draft
      : value === "" || value == null
      ? ""
      : String(roundN(opt.from(value)));

  function onType(text) {
    setDraft(text);
    onChange(text === "" ? "" : roundN(opt.to(Number(text))));
  }
  function switchUnit(k) {
    setDraft(undefined); // re-derive the shown value in the new unit
    setUnit(k);
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        type="number"
        inputMode="decimal"
        value={shown}
        onChange={(e) => onType(e.target.value)}
        placeholder={placeholder}
        style={{ ...field, flex: 1 }}
      />
      <div style={{ display: "flex", border: "1px solid #23272d", borderRadius: 4, overflow: "hidden" }}>
        {units.map((u) => (
          <button
            key={u.key}
            type="button"
            onClick={() => switchUnit(u.key)}
            className="mono"
            style={{
              background: unit === u.key ? TEAL : "transparent",
              color: unit === u.key ? "#06100e" : "#7b8089",
              border: "none",
              padding: "0 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {u.key}
          </button>
        ))}
      </div>
    </div>
  );
}

function L({ label, children }) {
  return (
    <div>
      <label className="mono" style={{ display: "block", fontSize: 12, letterSpacing: 1, color: "#7b8089", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
