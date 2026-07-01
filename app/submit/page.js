"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SiteNav, { GoogleMark } from "../components/SiteNav";
import ShotsEditor from "../components/ShotsEditor";
import Toggle from "../components/Toggle";
import { getSupabaseClient } from "../lib/supabase";
import {
  getCatalog,
  submitShotString,
  parseYouTubeId,
  toC,
  toFt,
  psiFromBar,
  inFromCm,
  tankRoleShort,
} from "../lib/catalog";

const TEAL = "#2fb8a0";

const fieldStyle = {
  background: "#0e1013",
  border: "1px solid #23272d",
  borderRadius: 4,
  color: "#e6e7e9",
  fontSize: 13,
  padding: "10px 12px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

export default function SubmitPage() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [catalog, setCatalog] = useState(null);

  // Form state
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [projChoice, setProjChoice] = useState(""); // "" | id | "custom"
  const [customWeight, setCustomWeight] = useState("");
  const [moderatorId, setModeratorId] = useState("");
  const [ranRegulated, setRanRegulated] = useState(false);
  const [regSetpoint, setRegSetpoint] = useState("");
  const [temp, setTemp] = useState("");
  const [tempUnit, setTempUnit] = useState("F");
  const [altitude, setAltitude] = useState("");
  const [altUnit, setAltUnit] = useState("ft");
  const [chronoDist, setChronoDist] = useState("");
  const [chronoDistUnit, setChronoDistUnit] = useState("in");
  const [regUnit, setRegUnit] = useState("psi");
  const [pressUnit, setPressUnit] = useState("psi");
  const [tankPress, setTankPress] = useState({}); // { [tankId]: {start, end} }
  const [sharedPress, setSharedPress] = useState({ start: "", end: "" }); // unregulated: one pressure for all connected tanks
  const [shots, setShots] = useState([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) getCatalog().then(setCatalog);
  }, [session]);

  const models = useMemo(
    () => (catalog?.models || []).filter((m) => String(m.brand_id) === String(brandId)),
    [catalog, brandId]
  );
  const variants = useMemo(
    () => (catalog?.variants || []).filter((v) => String(v.model_id) === String(modelId)),
    [catalog, modelId]
  );
  const variant = useMemo(
    () => (catalog?.variants || []).find((v) => String(v.id) === String(variantId)) || null,
    [catalog, variantId]
  );
  const caliberId = variant?.caliber_id ?? null;
  const caliberName = variant?.caliber?.name ?? "";

  const projectiles = useMemo(
    () =>
      (catalog?.projectiles || []).filter(
        (p) => caliberId == null || String(p.caliber_id) === String(caliberId)
      ),
    [catalog, caliberId]
  );
  const selectedProj = useMemo(
    () => projectiles.find((p) => String(p.id) === String(projChoice)) || null,
    [projectiles, projChoice]
  );

  const tanks = useMemo(
    () => (variant?.tanks || []).slice().sort((a, b) => a.position - b.position),
    [variant]
  );

  // An unregulated gun's tanks are pneumatically connected, so they all sit at
  // one pressure — collect a single start/end instead of a pair per tank.
  const collapsePressure = !!variant && !variant.is_regulated;

  // Auto-select the variant when a model has only one — no reason to make the
  // user pick from a list of one. (onModel already clears downstream state.)
  useEffect(() => {
    if (modelId && !variantId && variants.length === 1) {
      setVariantId(String(variants[0].id));
    }
  }, [modelId, variantId, variants]);

  // Reset downstream selects when an upstream one changes.
  function onBrand(v) {
    setBrandId(v);
    setModelId("");
    setVariantId("");
    setProjChoice("");
    setTankPress({});
    setSharedPress({ start: "", end: "" });
  }
  function onModel(v) {
    setModelId(v);
    setVariantId("");
    setProjChoice("");
    setTankPress({});
    setSharedPress({ start: "", end: "" });
  }
  function onVariant(v) {
    setVariantId(v);
    setProjChoice("");
    setTankPress({});
    setSharedPress({ start: "", end: "" });
  }

  function setTank(tankId, patch) {
    setTankPress((prev) => ({ ...prev, [tankId]: { ...prev[tankId], ...patch } }));
  }

  // ---- Auth gate (matches the logged-out flow we designed) ----
  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SiteNav active="submit" />
        <div className="mono" style={{ padding: 60, color: "#5e7170", fontSize: 12 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SiteNav active="submit" />
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
            <div
              style={{
                width: 44,
                height: 44,
                margin: "0 auto 14px",
                borderRadius: "50%",
                background: "rgba(47,184,160,0.1)",
                border: `1px solid ${TEAL}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ fill: "none", stroke: TEAL, strokeWidth: 2 }}>
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
              Sign in to submit your string
            </h2>
            <p style={{ color: "#868d96", fontSize: 13.5, lineHeight: 1.6, margin: "10px 0 20px" }}>
              You'll come straight back to the submission form after signing in. This also creates
              your creator dashboard.
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
                background: "#131314",
                color: "#e3e3e3",
                border: "1px solid #8e918f",
                borderRadius: 4,
                padding: "11px 14px",
                fontSize: 13,
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

  // ---- Success state ----
  if (doneId) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SiteNav active="submit" />
        <div style={{ display: "flex", justifyContent: "center", padding: "90px 20px" }}>
          <div style={{ width: 460, textAlign: "center" }}>
            <div
              style={{
                width: 52,
                height: 52,
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: "rgba(47,184,160,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" style={{ fill: "none", stroke: TEAL, strokeWidth: 2.4 }}>
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6 }}>String submitted</h2>
            <p style={{ color: "#868d96", fontSize: 14, lineHeight: 1.6, margin: "12px 0 24px" }}>
              Thanks — it's now <strong style={{ color: "#e0a93f" }}>pending review</strong>. Approved
              strings appear publicly on the index. You can track its status on your dashboard.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/dashboard" style={primaryBtn}>
                Go to dashboard
              </Link>
              <button
                onClick={() => {
                  setDoneId(null);
                  setYoutubeUrl("");
                  setShots([]);
                  setProjChoice("");
                  setTankPress({});
                }}
                style={ghostBtn}
              >
                Submit another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Submit handler ----
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!parseYouTubeId(youtubeUrl)) return setError("Enter a valid YouTube video link.");
    if (!variantId) return setError("Select the gun (brand → model → variant).");

    const weightGrains =
      projChoice === "custom"
        ? Number(customWeight)
        : selectedProj
        ? Number(selectedProj.weight_grains)
        : NaN;
    if (!weightGrains || weightGrains <= 0)
      return setError("Enter the projectile weight in grains.");

    if (!shots.length) return setError("Add at least one shot.");
    const badMeasured = shots.some(
      (s) => s.status === "measured" && (s.velocity == null || !Number.isFinite(s.velocity))
    );
    if (badMeasured)
      return setError("Every 'measured' shot needs a velocity (or mark it 'no read').");

    // Convert entry units -> canonical storage units.
    const temperatureC =
      temp === "" ? null : tempUnit === "F" ? toC(temp) : Number(temp);
    const altitudeFt =
      altitude === "" ? null : altUnit === "m" ? toFt(altitude) : Number(altitude);
    const toPsi = (v) => (v == null || v === "" ? null : pressUnit === "bar" ? psiFromBar(v) : Number(v));

    // Unregulated guns share one pressure across every connected tank; regulated
    // guns keep a separate start/end per tank.
    const tankPressures = tanks.map((t) => ({
      tankId: t.id,
      startPsi: toPsi(collapsePressure ? sharedPress.start : tankPress[t.id]?.start),
      endPsi: toPsi(collapsePressure ? sharedPress.end : tankPress[t.id]?.end),
    }));

    setBusy(true);
    const res = await submitShotString({
      youtubeUrl,
      variantId: Number(variantId),
      caliberId,
      weightGrains,
      projectileId: projChoice === "custom" ? null : selectedProj ? Number(selectedProj.id) : null,
      moderatorId: moderatorId ? Number(moderatorId) : null,
      ranRegulated,
      regSetpointPsi:
        ranRegulated && regSetpoint !== ""
          ? regUnit === "bar"
            ? psiFromBar(regSetpoint)
            : Number(regSetpoint)
          : null,
      temperatureC,
      altitudeFt,
      chronoDistanceIn:
        chronoDist === "" ? null : chronoDistUnit === "cm" ? inFromCm(chronoDist) : Number(chronoDist),
      tankPressures,
      shots,
    });
    setBusy(false);

    if (res.error) return setError(res.error);
    setDoneId(res.stringId);
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <SiteNav active="submit" />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "44px 24px 90px" }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: TEAL, marginBottom: 8 }}>
          NEW SUBMISSION
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1 }}>
          Submit a shot string
        </h1>
        <p style={{ color: "#868d96", fontSize: 14, lineHeight: 1.6, margin: "12px 0 0", maxWidth: 560 }}>
          Link the video, pick the gun and projectile, then enter the per-shot velocities. We compute
          energy, spread and air efficiency from this. Submissions are reviewed before they appear.
        </p>

        <form onSubmit={handleSubmit} className="submit-form" style={{ marginTop: 34 }}>
          {/* 1. Video */}
          <Section n="01" title="Source video" hint="Where the shot string was filmed">
            <Field label="YouTube URL" required>
              <input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="mono"
                style={fieldStyle}
              />
            </Field>
          </Section>

          {/* 2. Gun */}
          <Section n="02" title="The gun" hint="Choose from the catalog">
            <Row>
              <Field label="Brand" required>
                <select value={brandId} onChange={(e) => onBrand(e.target.value)} style={fieldStyle}>
                  <option value="">Select brand…</option>
                  {(catalog?.brands || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Model" required>
                <select
                  value={modelId}
                  onChange={(e) => onModel(e.target.value)}
                  disabled={!brandId}
                  style={fieldStyle}
                >
                  <option value="">{brandId ? "Select model…" : "Pick a brand first"}</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>
            <Field
              label="Variant"
              required
              hint="Caliber + barrel + bottle. One model can have several."
            >
              <select
                value={variantId}
                onChange={(e) => onVariant(e.target.value)}
                disabled={!modelId}
                style={fieldStyle}
              >
                <option value="">{modelId ? "Select variant…" : "Pick a model first"}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.caliber?.name}
                    {v.barrel_length_in ? ` · ${v.barrel_length_in}" barrel` : ""}
                    {v.name ? ` · ${v.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Suppressor / moderator" hint="Optional">
              <select value={moderatorId} onChange={(e) => setModeratorId(e.target.value)} style={fieldStyle}>
                <option value="">None</option>
                {(catalog?.moderators || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.brand?.name ? `${m.brand.name} ${m.name}` : m.name}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          {/* 3. Projectile */}
          <Section n="03" title="Projectile" hint={caliberName ? `Caliber locked to ${caliberName}` : "Select the gun first"}>
            <Field label="Pellet / slug" required>
              <select
                value={projChoice}
                onChange={(e) => setProjChoice(e.target.value)}
                disabled={!variantId}
                style={fieldStyle}
              >
                <option value="">{variantId ? "Select projectile…" : "Pick the variant first"}</option>
                {projectiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.brand?.name ? `${p.brand.name} ${p.name}` : p.name} · {p.weight_grains} gr ({p.type})
                  </option>
                ))}
                {variantId && <option value="custom">Custom / unlisted…</option>}
              </select>
            </Field>
            {projChoice === "custom" && (
              <Field label="Projectile weight (grains)" required hint="We snapshot this onto the string so the energy math never drifts.">
                <input
                  type="number"
                  inputMode="decimal"
                  value={customWeight}
                  onChange={(e) => setCustomWeight(e.target.value)}
                  placeholder="e.g. 25.4"
                  className="mono"
                  style={fieldStyle}
                />
              </Field>
            )}
            {selectedProj && (
              <p className="mono" style={{ fontSize: 11, color: "#5e7170", marginTop: 2 }}>
                SNAPSHOT · {selectedProj.weight_grains} GR · {caliberName}
              </p>
            )}
          </Section>

          {/* 4. Conditions */}
          <Section n="04" title="Conditions" hint="All optional, but they sharpen comparisons">
            <Row>
              <Field label="Temperature">
                <UnitInput
                  value={temp}
                  onChange={setTemp}
                  unit={tempUnit}
                  onUnit={setTempUnit}
                  units={["F", "C"]}
                  placeholder="68"
                />
              </Field>
              <Field label="Altitude">
                <UnitInput
                  value={altitude}
                  onChange={setAltitude}
                  unit={altUnit}
                  onUnit={setAltUnit}
                  units={["ft", "m"]}
                  placeholder="800"
                />
              </Field>
            </Row>
            <Row>
              <Field label="Chrono distance from muzzle" hint="How far the chrono sat">
                <UnitInput
                  value={chronoDist}
                  onChange={setChronoDist}
                  unit={chronoDistUnit}
                  onUnit={setChronoDistUnit}
                  units={["in", "cm"]}
                  placeholder="e.g. 12"
                />
              </Field>
              <Field label="Regulated?">
                <div style={{ display: "flex", alignItems: "center", height: 40 }}>
                  <Toggle
                    on={ranRegulated}
                    onClick={() => setRanRegulated((v) => !v)}
                    onLabel="Ran regulated"
                    offLabel="Unregulated"
                  />
                </div>
              </Field>
            </Row>
            {ranRegulated && (
              <Field label="Regulator setpoint" hint="Governs consistency — not the energy calc">
                <UnitInput
                  value={regSetpoint}
                  onChange={setRegSetpoint}
                  unit={regUnit}
                  onUnit={setRegUnit}
                  units={["psi", "bar"]}
                  placeholder="e.g. 1700"
                />
              </Field>
            )}
          </Section>

          {/* 5. Tank pressures */}
          <Section
            n="05"
            title="Fill pressure"
            hint={
              tanks.length > 1
                ? collapsePressure
                  ? "Tanks are connected — one start and end pressure for all of them"
                  : "This gun has multiple tanks — enter each (needed for air efficiency)"
                : "Start and end pressure across the string"
            }
          >
            {!variantId && (
              <p className="mono" style={{ fontSize: 11, color: "#5e7170" }}>
                SELECT THE GUN TO SEE ITS TANK(S)
              </p>
            )}
            {variantId && tanks.length === 0 && (
              <p className="mono" style={{ fontSize: 11, color: "#5e7170" }}>
                NO TANK DATA IN CATALOG FOR THIS VARIANT
              </p>
            )}
            {tanks.length > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <SmallToggle value={pressUnit} onChange={setPressUnit} options={["psi", "bar"]} />
                </div>
                {collapsePressure ? (
                  <div style={{ marginBottom: 12 }}>
                    {tanks.length > 1 && (
                      <div
                        className="mono"
                        style={{ fontSize: 11, letterSpacing: 1, color: "#7b8089", marginBottom: 6, textTransform: "uppercase" }}
                      >
                        {tanks.length} connected tanks
                        {tanks.some((t) => t.volume_cc)
                          ? ` · ${tanks.map((t) => (t.volume_cc ? `${t.volume_cc} cc` : "—")).join(" + ")}`
                          : ""}
                      </div>
                    )}
                    <Row>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={sharedPress.start}
                        onChange={(e) => setSharedPress((p) => ({ ...p, start: e.target.value }))}
                        placeholder={`Start (${pressUnit})`}
                        className="mono"
                        style={fieldStyle}
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        value={sharedPress.end}
                        onChange={(e) => setSharedPress((p) => ({ ...p, end: e.target.value }))}
                        placeholder={`End (${pressUnit}) — optional`}
                        className="mono"
                        style={fieldStyle}
                      />
                    </Row>
                  </div>
                ) : (
                  tanks.map((t) => (
                    <div key={t.id} style={{ marginBottom: 12 }}>
                      {tanks.length > 1 && (
                        <div
                          className="mono"
                          style={{ fontSize: 11, letterSpacing: 1, color: "#7b8089", marginBottom: 6, textTransform: "uppercase" }}
                        >
                          {tankRoleShort(t.role)} tank{t.volume_cc ? ` · ${t.volume_cc} cc` : ""}
                        </div>
                      )}
                      <Row>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={tankPress[t.id]?.start ?? ""}
                          onChange={(e) => setTank(t.id, { start: e.target.value })}
                          placeholder={`Start (${pressUnit})`}
                          className="mono"
                          style={fieldStyle}
                        />
                        <input
                          type="number"
                          inputMode="decimal"
                          value={tankPress[t.id]?.end ?? ""}
                          onChange={(e) => setTank(t.id, { end: e.target.value })}
                          placeholder={`End (${pressUnit}) — optional`}
                          className="mono"
                          style={fieldStyle}
                        />
                      </Row>
                    </div>
                  ))
                )}
              </>
            )}
          </Section>

          {/* 6. Shots */}
          <Section n="06" title="The shots" hint="Velocities in order — keep unread shots in place">
            <ShotsEditor shots={shots} onChange={setShots} simpleStatus />
          </Section>

          {error && (
            <div
              style={{
                background: "rgba(226,75,74,0.08)",
                border: "1px solid rgba(226,75,74,0.4)",
                color: "#f0a0a0",
                borderRadius: 4,
                padding: "11px 14px",
                fontSize: 13,
                marginBottom: 18,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Submitting…" : "Submit for review"}
            </button>
            <span className="mono" style={{ fontSize: 11, color: "#5e7170", letterSpacing: 0.5 }}>
              REVIEWED BEFORE GOING PUBLIC
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function Section({ n, title, hint, children }) {
  return (
    <div
      className="form-section"
      style={{
        borderTop: "1px solid #181b1f",
        padding: "26px 0",
      }}
    >
      <div>
        <div className="mono" style={{ fontSize: 11, color: TEAL, letterSpacing: 1 }}>
          {n}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{title}</div>
        {hint && (
          <div style={{ fontSize: 11.5, color: "#5e7170", marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        className="mono"
        style={{
          display: "block",
          fontSize: 11,
          letterSpacing: 1,
          color: "#7b8089",
          textTransform: "uppercase",
          marginBottom: 7,
        }}
      >
        {label}
        {required && <span style={{ color: TEAL }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "#5e7170", marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function Row({ children }) {
  return <div className="form-row">{children}</div>;
}

function UnitInput({ value, onChange, unit, onUnit, units, placeholder }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mono"
        style={{ ...fieldStyle, flex: 1 }}
      />
      <SmallToggle value={unit} onChange={onUnit} options={units} />
    </div>
  );
}

function SmallToggle({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "flex",
        border: "1px solid #23272d",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className="mono"
          style={{
            background: value === o ? TEAL : "transparent",
            color: value === o ? "#06100e" : "#7b8089",
            border: "none",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const primaryBtn = {
  background: TEAL,
  color: "#06100e",
  border: "none",
  borderRadius: 4,
  padding: "12px 22px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.3,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
  display: "inline-block",
};

const ghostBtn = {
  background: "transparent",
  color: "#cdd2d8",
  border: "1px solid #23272d",
  borderRadius: 4,
  padding: "12px 22px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
