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
      supabase.from("airgun_models").select("id, name, brand_id, status").order("name"),
      supabase
        .from("airgun_variants")
        .select("id, model_id, caliber_id, barrel_length_in, status")
        .order("id"),
      supabase
        .from("projectiles")
        .select("id, name, brand_id, caliber_id, weight_grains, status")
        .order("name"),
      supabase.from("moderators").select("id, name, brand_id, status").order("name"),
      supabase.from("calibers").select("id, name").order("name"),
      supabase.from("airgun_tanks").select("id, variant_id"),
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
      mergeable: false, // tanks + per-tank pressures make merge ambiguous (v2)
      renamable: false, // no name of its own — label is composed from model/caliber/barrel
      label: `${modelName.get(v.model_id) || "?"} · ${caliberName.get(v.caliber_id) || "?"}${
        v.barrel_length_in ? ` · ${v.barrel_length_in}"` : ""
      }`,
      sub: null,
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

// Merge `sourceId` into `targetId` via the atomic admin_merge_* function.
// Returns { data: <counts moved>, error }.
const MERGE_FN_BY_KIND = {
  brand: "admin_merge_brand",
  model: "admin_merge_model",
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
