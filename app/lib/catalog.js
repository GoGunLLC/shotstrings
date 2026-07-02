import { getSupabaseClient } from "./supabase";

// ---------------------------------------------------------------------------
// Unit conversions. Storage units are the canonical ones from architecture §2;
// the form lets users enter in their preferred unit and we normalize on submit.
// ---------------------------------------------------------------------------
export const toC = (f) => ((Number(f) - 32) * 5) / 9; // °F -> °C
export const toFt = (m) => Number(m) * 3.28084; //  m  -> ft
export const psiFromBar = (bar) => Number(bar) * 14.5038; // bar -> psi
export const inFromCm = (cm) => Number(cm) / 2.54; //  cm -> in (1 in = 2.54 cm)
// Inverse directions — used to display a canonical stored value in the unit the
// user has toggled to (admin edit forms hold the canonical value in state).
export const barFromPsi = (psi) => Number(psi) / 14.5038; // psi -> bar
export const cmFromIn = (inches) => Number(inches) * 2.54; //  in -> cm
export const fFromC = (c) => (Number(c) * 9) / 5 + 32; // °C -> °F
export const mFromFt = (ft) => Number(ft) / 3.28084; //  ft -> m

// ---------------------------------------------------------------------------
// Tank roles. Physically there are only two things worth distinguishing: the
// bottle you fill (reservoir) and, on a regulated gun, the lower-pressure tank
// downstream of the regulator (working). The legacy "main" value was just the
// single-tank naming for the high-pressure bottle, so it maps to reservoir.
// Role is a display label only — it feeds no calculation (volume math in
// shotStrings.js sums every tank's volume_cc regardless of role).
// ---------------------------------------------------------------------------
export const TANK_ROLE_LABELS = {
  reservoir: "Reservoir (fill bottle)",
  working: "Regulated tank (working pressure)",
  main: "Reservoir (fill bottle)", // legacy value, shown as a reservoir
};

// Friendly label for a stored role value (falls back gracefully).
export const tankRoleLabel = (role) =>
  TANK_ROLE_LABELS[role] || TANK_ROLE_LABELS.reservoir;

// Short label for inline display, e.g. `${tankRoleShort(role)} tank`.
const TANK_ROLE_SHORT = { reservoir: "Reservoir", working: "Regulated", main: "Reservoir" };
export const tankRoleShort = (role) => TANK_ROLE_SHORT[role] || "Reservoir";

// Which roles a user may pick, given whether the gun is regulated. Unregulated
// guns only have a reservoir; the regulated (working) tank is offered only when
// the Regulated toggle is on.
export const tankRoleOptions = (isRegulated) =>
  isRegulated
    ? [
        { value: "reservoir", label: TANK_ROLE_LABELS.reservoir },
        { value: "working", label: TANK_ROLE_LABELS.working },
      ]
    : [{ value: "reservoir", label: TANK_ROLE_LABELS.reservoir }];

// ---------------------------------------------------------------------------
// YouTube URL parsing — pull the 11-char video id out of any common URL shape.
// ---------------------------------------------------------------------------
export function parseYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/, // watch?v=
    /youtu\.be\/([A-Za-z0-9_-]{11})/, // short link
    /\/shorts\/([A-Za-z0-9_-]{11})/, // shorts
    /\/embed\/([A-Za-z0-9_-]{11})/, // embed
    /\/live\/([A-Za-z0-9_-]{11})/, // live
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  // Bare id pasted on its own.
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

// Best-effort metadata lookup via YouTube oEmbed (CORS-friendly, no key needed).
// oEmbed returns the video `title` plus `author_name` (the channel name shown
// on the "Watch at {channel}" card label) — we cache both at submission so the
// feed never has to hit YouTube at render time.
async function fetchVideoMeta(youtubeUrl) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        youtubeUrl
      )}`
    );
    if (!res.ok) return { title: null, channelTitle: null };
    const data = await res.json();
    return { title: data.title || null, channelTitle: data.author_name || null };
  } catch {
    return { title: null, channelTitle: null };
  }
}

// ---------------------------------------------------------------------------
// Catalog — everything the submit form needs to populate its selects. Only
// approved rows are returned (enforced by RLS; the filters here are belt-and-
// suspenders so the UI never shows a pending suggestion).
// ---------------------------------------------------------------------------
export async function getCatalog() {
  const supabase = getSupabaseClient();

  const [brands, models, variants, projectiles, moderators, calibers] =
    await Promise.all([
      supabase.from("brands").select("id, name").eq("status", "approved").order("name"),
      supabase
        .from("airgun_models")
        .select("id, name, brand_id, power_plant")
        .eq("status", "approved")
        .order("name"),
      supabase
        .from("airgun_variants")
        .select(
          `id, model_id, caliber_id, name, barrel_length_in, reg_pressure_psi, is_regulated,
           caliber:calibers ( id, name ),
           tanks:airgun_tanks ( id, role, position, volume_cc, rated_pressure_psi )`
        )
        .eq("status", "approved"),
      supabase
        .from("projectiles")
        .select("id, name, type, caliber_id, weight_grains, brand:brands ( name )")
        .eq("status", "approved")
        .order("name"),
      supabase
        .from("moderators")
        .select("id, name, brand:brands ( name )")
        .eq("status", "approved")
        .order("name"),
      supabase.from("calibers").select("id, name, nominal_mm").order("nominal_mm"),
    ]);

  const firstErr = [brands, models, variants, projectiles, moderators, calibers].find(
    (r) => r.error
  );
  if (firstErr) {
    console.error("getCatalog failed:", firstErr.error.message);
  }

  return {
    brands: brands.data || [],
    models: models.data || [],
    variants: variants.data || [],
    projectiles: projectiles.data || [],
    moderators: moderators.data || [],
    calibers: calibers.data || [],
  };
}

// ---------------------------------------------------------------------------
// Submit a shot string. Writes video (find-or-create) -> shot_string -> shots
// -> per-tank pressures. Not a single DB transaction (client-side), so on a
// mid-way failure we surface the error and stop; the string row won't exist
// without its shots because the string insert is what gates the rest.
// ---------------------------------------------------------------------------
export async function submitShotString(form) {
  const supabase = getSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to submit." };

  // 1. Video — dedupe on youtube_video_id, reuse if it already exists.
  const videoId = parseYouTubeId(form.youtubeUrl);
  if (!videoId) return { error: "That doesn't look like a valid YouTube link." };

  let video;
  const existing = await supabase
    .from("videos")
    .select("id")
    .eq("youtube_video_id", videoId)
    .maybeSingle();

  if (existing.data) {
    video = existing.data;
  } else {
    const { title, channelTitle } = await fetchVideoMeta(form.youtubeUrl);
    const ins = await supabase
      .from("videos")
      .insert({
        submitted_by: user.id,
        youtube_url: form.youtubeUrl,
        youtube_video_id: videoId,
        title,
        channel_title: channelTitle,
      })
      .select("id")
      .single();
    if (ins.error) return { error: `Couldn't save the video: ${ins.error.message}` };
    video = ins.data;
  }

  // 2. Shot string. caliber + weight are snapshots (architecture §3.2).
  const ss = await supabase
    .from("shot_strings")
    .insert({
      submitted_by: user.id,
      video_id: video.id,
      airgun_variant_id: form.variantId,
      moderator_id: form.moderatorId || null,
      projectile_id: form.projectileId || null,
      caliber_id: form.caliberId,
      projectile_weight_grains: form.weightGrains,
      ran_regulated: form.ranRegulated,
      reg_setpoint_psi: form.ranRegulated ? form.regSetpointPsi ?? null : null,
      temperature_c: form.temperatureC ?? null,
      altitude_ft: form.altitudeFt ?? null,
      chrono_distance_in: form.chronoDistanceIn ?? null,
      // status defaults to 'pending' — moderation gate.
    })
    .select("id")
    .single();
  if (ss.error) return { error: `Couldn't save the string: ${ss.error.message}` };

  const stringId = ss.data.id;

  // 3. Shots — batch insert. velocity is null unless measured (DB CHECK).
  const shotRows = form.shots.map((s, i) => ({
    shot_string_id: stringId,
    shot_number: i + 1,
    velocity_status: s.status,
    velocity_fps: s.status === "measured" ? s.velocity : null,
  }));
  if (shotRows.length) {
    const shotsIns = await supabase.from("shots").insert(shotRows);
    if (shotsIns.error)
      return { error: `Saved the string but shots failed: ${shotsIns.error.message}`, stringId };
  }

  // 4. Per-tank start/end pressures.
  const pressureRows = (form.tankPressures || [])
    .filter((p) => p.startPsi != null && p.startPsi !== "")
    .map((p) => ({
      shot_string_id: stringId,
      tank_id: p.tankId,
      start_pressure_psi: p.startPsi,
      end_pressure_psi: p.endPsi ?? null,
    }));
  if (pressureRows.length) {
    const pIns = await supabase.from("shot_string_tank_pressures").insert(pressureRows);
    if (pIns.error)
      return { error: `Saved the string but tank pressures failed: ${pIns.error.message}`, stringId };
  }

  return { stringId };
}

// ---------------------------------------------------------------------------
// Dashboard — the strings the signed-in user has submitted, grouped by video.
// (Control of a video can transfer on a channel claim, but credit — and the
// "my submissions" view — keys off submitted_by; architecture §5.)
// ---------------------------------------------------------------------------
export async function getMyDashboard(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("shot_strings")
    .select(
      `id, status, created_at, approved_at, projectile_weight_grains,
       caliber:calibers ( name ),
       variant:airgun_variants (
         name, barrel_length_in,
         model:airgun_models ( name, brand:brands ( name ) )
       ),
       projectile:projectiles ( name ),
       video:videos ( id, youtube_url, youtube_video_id, title ),
       shots ( id )`
    )
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getMyDashboard failed:", error.message);
    return { videos: [], totals: { strings: 0, approved: 0, pending: 0 } };
  }

  // Group strings under their video.
  const byVideo = new Map();
  let approved = 0;
  let pending = 0;
  for (const s of data || []) {
    if (s.status === "approved") approved++;
    if (s.status === "pending") pending++;
    const v = s.video || { id: "unknown", title: "Unknown video" };
    if (!byVideo.has(v.id)) byVideo.set(v.id, { ...v, strings: [] });
    byVideo.get(v.id).strings.push({
      id: s.id,
      status: s.status,
      createdAt: s.created_at,
      brand: s.variant?.model?.brand?.name ?? "",
      model: s.variant?.model?.name ?? "",
      variantName: s.variant?.name ?? null,
      caliber: s.caliber?.name ?? "",
      projectile: s.projectile?.name ?? "Custom / unlisted",
      grains: s.projectile_weight_grains,
      shotCount: (s.shots || []).length,
    });
  }

  return {
    videos: Array.from(byVideo.values()),
    totals: { strings: (data || []).length, approved, pending },
  };
}

// ===========================================================================
// USER CATALOG CREATE (submit-form "add new" flows)
// ===========================================================================
// Users can create catalog entities they can't find. Rows insert as
// status='approved' so they're usable (and public) immediately; the DB insert
// trigger keeps reviewed_at null, which lands them in the admin review queue.

async function userInsert(table, row, select = "id, name") {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase
    .from(table)
    .insert({ ...row, status: "approved", created_by: user.id })
    .select(select)
    .single();
  return { data, error: error?.message };
}

export function createBrand({ name }) {
  return userInsert("brands", { name, slug: slugify(name) });
}

export function createModel({ brandId, name, powerPlant }) {
  return userInsert("airgun_models", {
    brand_id: brandId,
    name,
    power_plant: powerPlant,
  });
}

export function createModerator({ brandId, name }) {
  return userInsert("moderators", { brand_id: brandId, name });
}

export function createProjectile({ brandId, name, type, caliberId, weightGrains, headDiameterMm }) {
  return userInsert("projectiles", {
    brand_id: brandId,
    name,
    type,
    caliber_id: caliberId,
    weight_grains: weightGrains,
    head_diameter_mm: headDiameterMm ?? null,
  });
}

// Variant + its tank(s) in one call. Tanks are inserted after the variant; an
// RLS policy allows tank inserts on variants the user created.
export async function createVariant({ modelId, caliberId, name, barrelLengthIn, isRegulated, regPressurePsi, tanks }) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const res = await userInsert(
    "airgun_variants",
    {
      model_id: modelId,
      caliber_id: caliberId,
      name: trimmedName || null,
      barrel_length_in: barrelLengthIn ?? null,
      reg_pressure_psi: isRegulated ? regPressurePsi ?? null : null,
      is_regulated: !!isRegulated,
    },
    "id"
  );
  if (res.error) return res;

  const rows = (tanks || [])
    .filter((t) => t && (t.volumeCc || t.ratedPressurePsi))
    .map((t, i) => ({
      variant_id: res.data.id,
      role: t.role || "reservoir",
      position: t.position || i + 1,
      volume_cc: t.volumeCc ?? null,
      rated_pressure_psi: t.ratedPressurePsi ?? null,
    }));
  if (rows.length) {
    const supabase = getSupabaseClient();
    const t = await supabase.from("airgun_tanks").insert(rows);
    if (t.error) return { data: res.data, error: `Variant saved, tank(s) failed: ${t.error.message}` };
  }
  return res;
}

// ===========================================================================
// ADMIN
// ===========================================================================

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Current user's profile (used to gate admin UI). Returns null if signed out.
export async function getMyProfile() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return data || { id: user.id, username: null, is_admin: false };
}

// Set the signed-in user's public handle. Validation, slug normalization, and
// the "already taken" check all live in the set_my_username() DB function so the
// rule is enforced in one place (and atomically). Returns { username } on
// success or { error } with a human-readable message.
export async function setMyUsername(newName) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("set_my_username", { p_new: newName });
  if (error) return { error: error.message };
  return { username: data };
}

// Full submission rows for the admin review queue. `filter` is a status or
// "all". RLS already restricts this to admins (is_admin() in the SELECT policy),
// but we surface a clear error if a non-admin somehow calls it.
export async function getAllSubmissions(filter = "needs_review") {
  const supabase = getSupabaseClient();
  let q = supabase
    .from("shot_strings")
    .select(
      `id, status, created_at, approved_at, reviewed_at,
       airgun_variant_id, moderator_id, projectile_id, caliber_id,
       projectile_weight_grains, ran_regulated, reg_setpoint_psi,
       temperature_c, altitude_ft, chrono_distance_in,
       caliber:calibers ( name ),
       variant:airgun_variants (
         id, name, barrel_length_in,
         model:airgun_models ( name, brand:brands ( name ) )
       ),
       projectile:projectiles ( name ),
       submitter:profiles!shot_strings_submitted_by_fkey ( username ),
       video:videos ( id, youtube_url, title ),
       shots ( id, shot_number, velocity_fps, velocity_status ),
       tank_pressures:shot_string_tank_pressures ( tank_id, start_pressure_psi, end_pressure_psi )`
    )
    .order("created_at", { ascending: false });

  // Filters: needs_review (unreviewed, not rejected) / reviewed / rejected / all.
  if (filter === "needs_review") q = q.is("reviewed_at", null).neq("status", "rejected");
  else if (filter === "reviewed") q = q.not("reviewed_at", "is", null).neq("status", "rejected");
  else if (filter && filter !== "all") q = q.eq("status", filter);

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };

  const rows = (data || []).map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: s.created_at,
    approvedAt: s.approved_at,
    reviewedAt: s.reviewed_at,
    variantId: s.airgun_variant_id,
    moderatorId: s.moderator_id,
    projectileId: s.projectile_id,
    caliberId: s.caliber_id,
    weightGrains: s.projectile_weight_grains,
    ranRegulated: s.ran_regulated,
    regSetpointPsi: s.reg_setpoint_psi,
    temperatureC: s.temperature_c,
    altitudeFt: s.altitude_ft,
    chronoDistanceIn: s.chrono_distance_in,
    caliber: s.caliber?.name ?? "",
    brand: s.variant?.model?.brand?.name ?? "",
    model: s.variant?.model?.name ?? "",
    variantName: s.variant?.name ?? null,
    projectile: s.projectile?.name ?? "Custom / unlisted",
    submitter: s.submitter?.username ?? "—",
    video: s.video || null,
    shots: (s.shots || [])
      .slice()
      .sort((a, b) => a.shot_number - b.shot_number)
      .map((sh) => ({
        velocity: sh.velocity_fps == null ? null : Number(sh.velocity_fps),
        status: sh.velocity_status,
      })),
    // Canonical psi start/end keyed by tank_id — the edit form seeds its inputs
    // from this (missing tanks simply have no entry).
    tankPressures: Object.fromEntries(
      (s.tank_pressures || []).map((tp) => [
        tp.tank_id,
        {
          start: tp.start_pressure_psi == null ? null : Number(tp.start_pressure_psi),
          end: tp.end_pressure_psi == null ? null : Number(tp.end_pressure_psi),
        },
      ])
    ),
  }));
  return { rows };
}

// Changing a string's status is itself a review act, so the review flags are
// stamped in the same write (approve-after-reject, reject, etc.).
export async function setStringStatus(id, status) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("shot_strings")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
    .eq("id", id);
  return { error: error?.message };
}

// Mark a submission reviewed without touching its status (the common case in
// the publish-then-review flow: the data looks right, just clear the queue).
export async function markStringReviewed(id) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("shot_strings")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
    .eq("id", id);
  return { error: error?.message };
}

// ---------------------------------------------------------------------------
// Catalog review queue — user-created entities awaiting an admin look. Rows
// are already live; reviewing just confirms (or leads to a merge/edit in the
// Manage tab). Returns a flat list newest-first.
// ---------------------------------------------------------------------------
export async function getCatalogReviewQueue() {
  const supabase = getSupabaseClient();
  const [brands, models, variants, projectiles, moderators] = await Promise.all([
    supabase.from("brands").select("id, name, created_at, creator:profiles!brands_created_by_fkey ( username )").is("reviewed_at", null),
    supabase
      .from("airgun_models")
      .select("id, name, power_plant, created_at, brand:brands ( name ), creator:profiles!airgun_models_created_by_fkey ( username )")
      .is("reviewed_at", null),
    supabase
      .from("airgun_variants")
      .select(
        `id, name, barrel_length_in, is_regulated, created_at,
         model:airgun_models ( name, brand:brands ( name ) ),
         caliber:calibers ( name ),
         creator:profiles!airgun_variants_created_by_fkey ( username )`
      )
      .is("reviewed_at", null),
    supabase
      .from("projectiles")
      .select("id, name, type, weight_grains, created_at, brand:brands ( name ), caliber:calibers ( name ), creator:profiles!projectiles_created_by_fkey ( username )")
      .is("reviewed_at", null),
    supabase
      .from("moderators")
      .select("id, name, created_at, brand:brands ( name ), creator:profiles!moderators_created_by_fkey ( username )")
      .is("reviewed_at", null),
  ]);

  const firstErr = [brands, models, variants, projectiles, moderators].find((r) => r.error);
  if (firstErr) return { rows: [], error: firstErr.error.message };

  const rows = [
    ...(brands.data || []).map((r) => ({
      kind: "brand", id: r.id, createdAt: r.created_at, creator: r.creator?.username ?? "—",
      label: r.name, sub: "Brand",
    })),
    ...(models.data || []).map((r) => ({
      kind: "model", id: r.id, createdAt: r.created_at, creator: r.creator?.username ?? "—",
      label: `${r.brand?.name ? `${r.brand.name} ` : ""}${r.name}`, sub: `Model · ${r.power_plant}`,
    })),
    ...(variants.data || []).map((r) => ({
      kind: "variant", id: r.id, createdAt: r.created_at, creator: r.creator?.username ?? "—",
      label: `${r.model?.brand?.name ? `${r.model.brand.name} ` : ""}${r.model?.name ?? "?"} · ${r.caliber?.name ?? "?"}${
        r.barrel_length_in ? ` · ${r.barrel_length_in}"` : ""
      }${r.name ? ` · ${r.name}` : ""}`,
      sub: `Variant · ${r.is_regulated ? "regulated" : "unregulated"}`,
    })),
    ...(projectiles.data || []).map((r) => ({
      kind: "projectile", id: r.id, createdAt: r.created_at, creator: r.creator?.username ?? "—",
      label: `${r.brand?.name ? `${r.brand.name} ` : ""}${r.name} · ${r.weight_grains} gr`,
      sub: `Projectile · ${r.type} · ${r.caliber?.name ?? "?"}`,
    })),
    ...(moderators.data || []).map((r) => ({
      kind: "moderator", id: r.id, createdAt: r.created_at, creator: r.creator?.username ?? "—",
      label: `${r.brand?.name ? `${r.brand.name} ` : ""}${r.name}`, sub: "Suppressor",
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { rows };
}

export async function markCatalogReviewed(kind, id) {
  const table = TABLE_BY_KIND[kind];
  if (!table) return { error: `Unknown record type ${kind}.` };
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(table)
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
    .eq("id", id);
  return { error: error?.message };
}

export async function deleteString(id) {
  const supabase = getSupabaseClient();
  // shots + tank pressures cascade on the FK; the video row is left intact.
  const { error } = await supabase.from("shot_strings").delete().eq("id", id);
  return { error: error?.message };
}

// Update a submission's editable fields and replace its shots wholesale. When
// `tankPressures` is provided (array of { tankId, startPsi, endPsi } in psi), the
// string's per-tank pressure rows are replaced too — same delete-then-insert
// approach as shots. Tanks left blank (no start pressure) get no row, mirroring
// the submit form.
export async function updateStringFull(id, fields, shots, tankPressures) {
  const supabase = getSupabaseClient();

  const upd = await supabase
    .from("shot_strings")
    .update({
      airgun_variant_id: fields.variantId,
      caliber_id: fields.caliberId,
      projectile_id: fields.projectileId || null,
      projectile_weight_grains: fields.weightGrains,
      moderator_id: fields.moderatorId || null,
      ran_regulated: fields.ranRegulated,
      reg_setpoint_psi: fields.ranRegulated ? fields.regSetpointPsi ?? null : null,
      temperature_c: fields.temperatureC ?? null,
      altitude_ft: fields.altitudeFt ?? null,
      chrono_distance_in: fields.chronoDistanceIn ?? null,
    })
    .eq("id", id);
  if (upd.error) return { error: upd.error.message };

  if (Array.isArray(shots)) {
    const del = await supabase.from("shots").delete().eq("shot_string_id", id);
    if (del.error) return { error: `Fields saved, but clearing shots failed: ${del.error.message}` };
    const rows = shots.map((s, i) => ({
      shot_string_id: id,
      shot_number: i + 1,
      velocity_status: s.status,
      velocity_fps: s.status === "measured" ? s.velocity : null,
    }));
    if (rows.length) {
      const ins = await supabase.from("shots").insert(rows);
      if (ins.error) return { error: `Fields saved, but re-inserting shots failed: ${ins.error.message}` };
    }
  }

  if (Array.isArray(tankPressures)) {
    const delP = await supabase.from("shot_string_tank_pressures").delete().eq("shot_string_id", id);
    if (delP.error) return { error: `Fields saved, but clearing tank pressures failed: ${delP.error.message}` };
    const pRows = tankPressures
      .filter((p) => p.startPsi != null && p.startPsi !== "")
      .map((p) => ({
        shot_string_id: id,
        tank_id: p.tankId,
        start_pressure_psi: p.startPsi,
        end_pressure_psi: p.endPsi ?? null,
      }));
    if (pRows.length) {
      const insP = await supabase.from("shot_string_tank_pressures").insert(pRows);
      if (insP.error) return { error: `Fields saved, but re-inserting tank pressures failed: ${insP.error.message}` };
    }
  }
  return {};
}

// ---- Catalog quick-add (admin). Inserts go in pre-approved. ----
async function adminInsert(table, row, select = "id") {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase
    .from(table)
    .insert({ ...row, status: "approved", created_by: user.id })
    .select(select)
    .single();
  return { data, error: error?.message };
}

export function addBrand({ name }) {
  return adminInsert("brands", { name, slug: slugify(name) }, "id, name");
}

export function addModel({ brandId, name, powerPlant }) {
  return adminInsert(
    "airgun_models",
    { brand_id: brandId, name, power_plant: powerPlant },
    "id, name"
  );
}

// Variant insert, plus an optional tank in one go (tanks are admin-only, no
// status column — inserted separately).
export async function addVariant({ modelId, caliberId, name, barrelLengthIn, regPressurePsi, isRegulated, tank, tanks }) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const res = await adminInsert(
    "airgun_variants",
    {
      model_id: modelId,
      caliber_id: caliberId,
      name: trimmedName || null,
      barrel_length_in: barrelLengthIn ?? null,
      reg_pressure_psi: regPressurePsi ?? null,
      is_regulated: !!isRegulated,
    },
    "id"
  );
  if (res.error) return res;

  // Accept either a single `tank` (legacy) or a `tanks` array. Only rows with a
  // volume or rated pressure are worth saving; positions default in order.
  const list = Array.isArray(tanks) ? tanks : tank ? [tank] : [];
  const rows = list
    .filter((t) => t && (t.volumeCc || t.ratedPressurePsi))
    .map((t, i) => ({
      variant_id: res.data.id,
      role: t.role || "reservoir",
      position: t.position || i + 1,
      volume_cc: t.volumeCc ?? null,
      rated_pressure_psi: t.ratedPressurePsi ?? null,
    }));
  if (rows.length) {
    const supabase = getSupabaseClient();
    const t = await supabase.from("airgun_tanks").insert(rows);
    if (t.error) return { data: res.data, error: `Variant saved, tank(s) failed: ${t.error.message}` };
  }
  return res;
}

// Air tanks (admin-only, no status column — same as the tank insert in
// addVariant). A variant owns one or more; these back the Manage tab's variant
// panel. `patch` is keyed by DB column with string/empty values from the UI and
// coerced to numbers/null here.
function tankColumns(patch) {
  const out = {};
  if ("role" in patch) out.role = patch.role || "reservoir";
  if ("position" in patch)
    out.position = patch.position === "" || patch.position == null ? null : Number(patch.position);
  if ("volume_cc" in patch)
    out.volume_cc = patch.volume_cc === "" || patch.volume_cc == null ? null : Number(patch.volume_cc);
  if ("rated_pressure_psi" in patch)
    out.rated_pressure_psi =
      patch.rated_pressure_psi === "" || patch.rated_pressure_psi == null ? null : Number(patch.rated_pressure_psi);
  return out;
}

export async function addVariantTank(variantId, patch = {}) {
  const supabase = getSupabaseClient();
  const cols = tankColumns(patch);
  const { data, error } = await supabase
    .from("airgun_tanks")
    .insert({
      variant_id: variantId,
      role: cols.role || "reservoir",
      position: cols.position ?? 1,
      volume_cc: cols.volume_cc ?? null,
      rated_pressure_psi: cols.rated_pressure_psi ?? null,
    })
    .select("id, variant_id, role, position, volume_cc, rated_pressure_psi")
    .single();
  if (error) return { error: error.message };
  return { data };
}

export async function updateVariantTank(tankId, patch) {
  const supabase = getSupabaseClient();
  const cols = tankColumns(patch);
  if (Object.keys(cols).length === 0) return { error: "Nothing to update." };
  const { error } = await supabase.from("airgun_tanks").update(cols).eq("id", tankId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteVariantTank(tankId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("airgun_tanks").delete().eq("id", tankId);
  if (error) {
    // 23503 = foreign_key_violation: shot_string_tank_pressures still points here.
    if (error.code === "23503")
      return { error: "This tank has recorded shot-string pressures — remove those first." };
    return { error: error.message };
  }
  return {};
}

export function addModerator({ brandId, name }) {
  return adminInsert("moderators", { brand_id: brandId, name }, "id, name");
}

export function addProjectile({ brandId, name, type, caliberId, weightGrains, headDiameterMm }) {
  return adminInsert(
    "projectiles",
    {
      brand_id: brandId,
      name,
      type,
      caliber_id: caliberId,
      weight_grains: weightGrains,
      head_diameter_mm: headDiameterMm ?? null,
    },
    "id, name"
  );
}

// Calibers are reference data — the table has no status/created_by columns, so
// this inserts directly rather than going through adminInsert. `name` is unique.
export async function addCaliber({ name, nominalInches, nominalMm }) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase
    .from("calibers")
    .insert({
      name,
      nominal_inches: nominalInches ?? null,
      nominal_mm: nominalMm ?? null,
    })
    .select("id, name")
    .single();
  if (error) {
    // 23505 = unique_violation on the caliber name.
    if (error.code === "23505") return { error: "A caliber with that name already exists." };
    return { error: error.message };
  }
  return { data };
}

// ===========================================================================
// CATALOG MANAGE (admin) — review dependencies, merge duplicates, delete safe.
// ===========================================================================

// Tally helper: count occurrences of `key` across `rows`.
function tally(rows, key) {
  const m = new Map();
  for (const r of rows || []) {
    const k = r[key];
    if (k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// Everything the Manage tab needs: every catalog record (any status, admins
// see all via RLS) annotated with how many things point at it. Counts are
// computed client-side from a few small fetches — the catalog tables are tiny.
//
// For each record we expose:
//   deps        — direct child counts keyed by table (what blocks a delete and
//                 what moves on a merge)
//   shotStrings — how many shot strings ultimately reference this record
//                 (rolled up through variants/models where relevant)
//   blocking    — true if anything points at it (delete is unsafe)
export async function getManageData() {
  const supabase = getSupabaseClient();

  const [brands, models, variants, projectiles, moderators, calibers, tanks, strings] =
    await Promise.all([
      supabase.from("brands").select("id, name, slug, status").order("name"),
      supabase.from("airgun_models").select("id, name, brand_id, power_plant, status").order("name"),
      supabase
        .from("airgun_variants")
        .select("id, model_id, caliber_id, name, barrel_length_in, reg_pressure_psi, is_regulated, status")
        .order("id"),
      supabase
        .from("projectiles")
        .select("id, name, type, brand_id, caliber_id, weight_grains, head_diameter_mm, status")
        .order("name"),
      supabase.from("moderators").select("id, name, brand_id, status").order("name"),
      supabase.from("calibers").select("id, name, nominal_inches, nominal_mm").order("name"),
      supabase.from("airgun_tanks").select("id, variant_id, role, position, volume_cc, rated_pressure_psi"),
      supabase
        .from("shot_strings")
        .select("id, airgun_variant_id, projectile_id, moderator_id, caliber_id"),
    ]);

  const firstErr = [
    brands, models, variants, projectiles, moderators, calibers, tanks, strings,
  ].find((r) => r.error);
  if (firstErr) return { error: firstErr.error.message };

  const B = brands.data || [];
  const M = models.data || [];
  const V = variants.data || [];
  const P = projectiles.data || [];
  const MOD = moderators.data || [];
  const C = calibers.data || [];
  const T = tanks.data || [];
  const S = strings.data || [];

  // Direct child tallies.
  const modelsByBrand = tally(M, "brand_id");
  const projByBrand = tally(P, "brand_id");
  const modByBrand = tally(MOD, "brand_id");
  const variantsByModel = tally(V, "model_id");
  const variantsByCaliber = tally(V, "caliber_id");
  const projByCaliber = tally(P, "caliber_id");
  const tanksByVariant = tally(T, "variant_id");

  // Full tank rows per variant, ordered by position (1 = highest pressure), so
  // the Manage tab's variant panel can edit each tank's volume/role/pressure.
  const tankListByVariant = new Map();
  for (const t of T) {
    const arr = tankListByVariant.get(t.variant_id) || [];
    arr.push(t);
    tankListByVariant.set(t.variant_id, arr);
  }
  for (const arr of tankListByVariant.values()) {
    arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
  }
  const ssByVariant = tally(S, "airgun_variant_id");
  const ssByProjectile = tally(S, "projectile_id");
  const ssByModerator = tally(S, "moderator_id");
  const ssByCaliber = tally(S, "caliber_id");

  // Roll shot strings up to model and brand through the variant chain.
  const variantToModel = new Map(V.map((v) => [v.id, v.model_id]));
  const modelToBrand = new Map(M.map((m) => [m.id, m.brand_id]));
  const ssByModel = new Map();
  const ssByBrand = new Map();
  for (const s of S) {
    const modelId = variantToModel.get(s.airgun_variant_id);
    if (modelId != null) {
      ssByModel.set(modelId, (ssByModel.get(modelId) || 0) + 1);
      const brandId = modelToBrand.get(modelId);
      if (brandId != null) ssByBrand.set(brandId, (ssByBrand.get(brandId) || 0) + 1);
    }
  }

  const n = (map, id) => map.get(id) || 0;

  const decoratedBrands = B.map((b) => {
    const deps = {
      models: n(modelsByBrand, b.id),
      projectiles: n(projByBrand, b.id),
      moderators: n(modByBrand, b.id),
    };
    return {
      ...b,
      kind: "brand",
      mergeable: true,
      renamable: true,
      label: b.name,
      sub: b.slug,
      deps,
      shotStrings: n(ssByBrand, b.id),
      blocking: deps.models + deps.projectiles + deps.moderators > 0,
    };
  });

  const brandName = new Map(B.map((b) => [b.id, b.name]));
  const caliberName = new Map(C.map((c) => [c.id, c.name]));
  const modelName = new Map(M.map((m) => [m.id, m.name]));

  const decoratedModels = M.map((m) => {
    const deps = { variants: n(variantsByModel, m.id) };
    return {
      ...m,
      kind: "model",
      mergeable: true,
      renamable: true,
      label: m.name,
      sub: brandName.get(m.brand_id) || "—",
      deps,
      shotStrings: n(ssByModel, m.id),
      blocking: deps.variants > 0,
    };
  });

  const decoratedVariants = V.map((v) => {
    const deps = { tanks: n(tanksByVariant, v.id), shotStrings: n(ssByVariant, v.id) };
    return {
      ...v,
      kind: "variant",
      mergeable: true, // admin_merge_variant moves the source's tanks onto the target too (mvp_14)
      renamable: false, // name is optional; edit it via the details panel, not the rename flow
      label: `${modelName.get(v.model_id) || "?"} · ${caliberName.get(v.caliber_id) || "?"}${
        v.barrel_length_in ? ` · ${v.barrel_length_in}"` : ""
      }${v.name ? ` · ${v.name}` : ""}`,
      sub: null,
      tanks: tankListByVariant.get(v.id) || [],
      deps,
      shotStrings: n(ssByVariant, v.id),
      blocking: deps.tanks + deps.shotStrings > 0,
    };
  });

  const decoratedProjectiles = P.map((p) => {
    const deps = { shotStrings: n(ssByProjectile, p.id) };
    return {
      ...p,
      kind: "projectile",
      mergeable: true,
      renamable: true,
      label: `${p.name} · ${p.weight_grains} gr`,
      sub: [brandName.get(p.brand_id), caliberName.get(p.caliber_id)].filter(Boolean).join(" · "),
      deps,
      shotStrings: deps.shotStrings,
      blocking: deps.shotStrings > 0,
    };
  });

  const decoratedModerators = MOD.map((m) => {
    const deps = { shotStrings: n(ssByModerator, m.id) };
    return {
      ...m,
      kind: "moderator",
      mergeable: true,
      renamable: true,
      label: m.name,
      sub: brandName.get(m.brand_id) || "—",
      deps,
      shotStrings: deps.shotStrings,
      blocking: deps.shotStrings > 0,
    };
  });

  const decoratedCalibers = C.map((c) => {
    const deps = {
      variants: n(variantsByCaliber, c.id),
      projectiles: n(projByCaliber, c.id),
      shotStrings: n(ssByCaliber, c.id),
    };
    return {
      ...c,
      kind: "caliber",
      mergeable: false, // reference data — delete only when nothing uses it
      renamable: true,
      label: c.name,
      sub: null,
      deps,
      shotStrings: deps.shotStrings,
      blocking: deps.variants + deps.projectiles + deps.shotStrings > 0,
    };
  });

  return {
    brands: decoratedBrands,
    models: decoratedModels,
    variants: decoratedVariants,
    projectiles: decoratedProjectiles,
    moderators: decoratedModerators,
    calibers: decoratedCalibers,
  };
}

// Table name per record kind — used by the safe-delete helper.
const TABLE_BY_KIND = {
  brand: "brands",
  model: "airgun_models",
  variant: "airgun_variants",
  projectile: "projectiles",
  moderator: "moderators",
  caliber: "calibers",
};

// Rename a catalog record's display name. Variants have no name of their own
// (their label is composed from model/caliber/barrel), so they aren't renamable.
// For brands we also regenerate the slug to keep it in step with the name.
const RENAME_TABLE_BY_KIND = {
  brand: "brands",
  model: "airgun_models",
  projectile: "projectiles",
  moderator: "moderators",
  caliber: "calibers",
};

export async function renameCatalogRecord(kind, id, newName) {
  const table = RENAME_TABLE_BY_KIND[kind];
  if (!table) return { error: `Rename isn't supported for ${kind}.` };

  const name = String(newName ?? "").trim();
  if (!name) return { error: "Name can't be empty." };

  const supabase = getSupabaseClient();
  const patch = { name };
  if (kind === "brand") patch.slug = slugify(name);

  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) {
    // 23505 = unique_violation (caliber name, or brand slug).
    if (error.code === "23505") {
      return {
        error:
          kind === "brand"
            ? "Another brand already maps to that name (slug clash) — pick a different name."
            : "Another record already uses that name.",
      };
    }
    return { error: error.message };
  }
  return {};
}

// Editable columns per record kind. Anything not listed here can't be patched
// from the Manage tab (e.g. status, ids, slug — slug is derived from name).
const EDIT_COLUMNS = {
  brand: ["name"],
  model: ["name", "power_plant", "brand_id"],
  variant: ["model_id", "caliber_id", "name", "barrel_length_in", "is_regulated", "reg_pressure_psi"],
  projectile: ["name", "type", "brand_id", "caliber_id", "weight_grains", "head_diameter_mm"],
  moderator: ["name", "brand_id"],
  caliber: ["name", "nominal_inches", "nominal_mm"],
};

// Update an existing catalog record's editable fields. `patchIn` is keyed by DB
// column name; only whitelisted columns for the kind are applied. For brands the
// slug is regenerated from the name to stay in step (same as rename).
export async function updateCatalogRecord(kind, id, patchIn) {
  const allowed = EDIT_COLUMNS[kind];
  const table = TABLE_BY_KIND[kind];
  if (!allowed || !table) return { error: `Editing isn't supported for ${kind}.` };

  const patch = {};
  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(patchIn, col)) patch[col] = patchIn[col];
  }

  if ("name" in patch) {
    const nm = String(patch.name ?? "").trim();
    // Variant names are optional — clearing the field stores null. Every other
    // kind's name is NOT NULL, so an empty value is an error there.
    if (!nm) {
      if (kind === "variant") patch.name = null;
      else return { error: "Name can't be empty." };
    } else {
      patch.name = nm;
      if (kind === "brand") patch.slug = slugify(nm);
    }
  }

  if (Object.keys(patch).length === 0) return { error: "Nothing to update." };

  const supabase = getSupabaseClient();
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) {
    // 23505 = unique_violation (caliber name, or brand slug clash).
    if (error.code === "23505") {
      return {
        error:
          kind === "brand"
            ? "Another brand already maps to that name (slug clash) — pick a different name."
            : "Another record already uses that name.",
      };
    }
    // 23503 = foreign_key_violation (e.g. a bad brand/model/caliber reference).
    if (error.code === "23503") return { error: "That reference doesn't exist." };
    return { error: error.message };
  }
  return {};
}

// Merge `sourceId` into `targetId` via the atomic admin_merge_* function.
// Returns { data: <counts moved>, error }.
const MERGE_FN_BY_KIND = {
  brand: "admin_merge_brand",
  model: "admin_merge_model",
  variant: "admin_merge_variant",
  projectile: "admin_merge_projectile",
  moderator: "admin_merge_moderator",
};

export async function mergeCatalogRecord(kind, sourceId, targetId) {
  const fn = MERGE_FN_BY_KIND[kind];
  if (!fn) return { error: `Merge isn't supported for ${kind}.` };
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc(fn, {
    p_source: Number(sourceId),
    p_target: Number(targetId),
  });
  return { data, error: error?.message };
}

// Delete a catalog record. The FK constraints are NO ACTION, so the database
// refuses to delete anything still referenced — this only ever succeeds when
// the record is truly unused. The UI also gates the button on a zero
// dependency count, so this is a second line of defense.
export async function deleteCatalogRecord(kind, id) {
  const table = TABLE_BY_KIND[kind];
  if (!table) return { error: `Unknown record type ${kind}.` };
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation: something still points at this row.
    if (error.code === "23503") {
      return { error: "Still referenced by other records — reassign or merge first." };
    }
    return { error: error.message };
  }
  return {};
}
