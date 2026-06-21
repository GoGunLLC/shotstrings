import { getSupabaseClient } from "./supabase";

// ---------------------------------------------------------------------------
// Unit conversions. Storage units are the canonical ones from architecture §2;
// the form lets users enter in their preferred unit and we normalize on submit.
// ---------------------------------------------------------------------------
export const toC = (f) => ((Number(f) - 32) * 5) / 9; // °F -> °C
export const toFt = (m) => Number(m) * 3.28084; //  m  -> ft
export const psiFromBar = (bar) => Number(bar) * 14.5038; // bar -> psi

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

// Best-effort title lookup via YouTube oEmbed (CORS-friendly, no key needed).
async function fetchVideoTitle(youtubeUrl) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        youtubeUrl
      )}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch {
    return null;
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
        .select("id, name, brand_id, power_plant, is_regulated")
        .eq("status", "approved")
        .order("name"),
      supabase
        .from("airgun_variants")
        .select(
          `id, model_id, caliber_id, barrel_length_in, reg_pressure_psi,
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
    const title = await fetchVideoTitle(form.youtubeUrl);
    const ins = await supabase
      .from("videos")
      .insert({
        submitted_by: user.id,
        youtube_url: form.youtubeUrl,
        youtube_video_id: videoId,
        title,
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
         barrel_length_in,
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

// Full submission rows for the admin review queue. `filter` is a status or
// "all". RLS already restricts this to admins (is_admin() in the SELECT policy),
// but we surface a clear error if a non-admin somehow calls it.
export async function getAllSubmissions(filter = "pending") {
  const supabase = getSupabaseClient();
  let q = supabase
    .from("shot_strings")
    .select(
      `id, status, created_at, approved_at,
       airgun_variant_id, moderator_id, projectile_id, caliber_id,
       projectile_weight_grains, ran_regulated, reg_setpoint_psi,
       temperature_c, altitude_ft, chrono_distance_in,
       caliber:calibers ( name ),
       variant:airgun_variants (
         id, barrel_length_in,
         model:airgun_models ( name, brand:brands ( name ) )
       ),
       projectile:projectiles ( name ),
       submitter:profiles!shot_strings_submitted_by_fkey ( username ),
       video:videos ( id, youtube_url, title ),
       shots ( id, shot_number, velocity_fps, velocity_status )`
    )
    .order("created_at", { ascending: false });

  if (filter && filter !== "all") q = q.eq("status", filter);

  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };

  const rows = (data || []).map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: s.created_at,
    approvedAt: s.approved_at,
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
  }));
  return { rows };
}

export async function setStringStatus(id, status) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("shot_strings").update({ status }).eq("id", id);
  return { error: error?.message };
}

export async function deleteString(id) {
  const supabase = getSupabaseClient();
  // shots + tank pressures cascade on the FK; the video row is left intact.
  const { error } = await supabase.from("shot_strings").delete().eq("id", id);
  return { error: error?.message };
}

// Update a submission's editable fields and replace its shots wholesale.
export async function updateStringFull(id, fields, shots) {
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

export function addModel({ brandId, name, powerPlant, isRegulated }) {
  return adminInsert(
    "airgun_models",
    { brand_id: brandId, name, power_plant: powerPlant, is_regulated: !!isRegulated },
    "id, name"
  );
}

// Variant insert, plus an optional tank in one go (tanks are admin-only, no
// status column — inserted separately).
export async function addVariant({ modelId, caliberId, barrelLengthIn, regPressurePsi, tank }) {
  const res = await adminInsert(
    "airgun_variants",
    {
      model_id: modelId,
      caliber_id: caliberId,
      barrel_length_in: barrelLengthIn ?? null,
      reg_pressure_psi: regPressurePsi ?? null,
    },
    "id"
  );
  if (res.error) return res;

  if (tank && (tank.volumeCc || tank.ratedPressurePsi)) {
    const supabase = getSupabaseClient();
    const t = await supabase.from("airgun_tanks").insert({
      variant_id: res.data.id,
      role: tank.role || "reservoir",
      position: tank.position || 1,
      volume_cc: tank.volumeCc ?? null,
      rated_pressure_psi: tank.ratedPressurePsi ?? null,
    });
    if (t.error) return { data: res.data, error: `Variant saved, tank failed: ${t.error.message}` };
  }
  return res;
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
