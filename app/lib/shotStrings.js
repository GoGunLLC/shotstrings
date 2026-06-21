import { getSupabaseClient } from "./supabase";

// Distinct line colors assigned per string for the comparison chart.
const PALETTE = [
  "#2fb8a0", "#c9a96f", "#6f9bd6", "#c77fb0",
  "#d98f3d", "#8a8f98", "#7fc7a0", "#b0a0e0",
];

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Per-shot "effective" velocity: measured reads pass through; misread/missing
// are linearly interpolated from the nearest measured neighbors. Endpoint gaps
// (no measured neighbor on one side) stay null — we don't extrapolate (§4.4).
function effectiveVelocities(shotsSorted) {
  const xs = shotsSorted.map((s) => s.shot_number);
  const ys = shotsSorted.map((s) =>
    s.velocity_status === "measured" && s.velocity_fps != null
      ? Number(s.velocity_fps)
      : null
  );
  const out = ys.slice();
  for (let i = 0; i < ys.length; i++) {
    if (out[i] != null) continue;
    let p = i - 1;
    while (p >= 0 && ys[p] == null) p--;
    let q = i + 1;
    while (q < ys.length && ys[q] == null) q++;
    if (p >= 0 && q < ys.length) {
      const t = (xs[i] - xs[p]) / (xs[q] - xs[p]);
      out[i] = ys[p] + t * (ys[q] - ys[p]);
    } else {
      out[i] = null; // endpoint gap — leave unestimated
    }
  }
  return out;
}

function mapRow(row, index) {
  const shots = (row.shots || [])
    .slice()
    .sort((a, b) => a.shot_number - b.shot_number);
  const grains = Number(row.projectile_weight_grains);

  // Measured-only stats (estimates excluded from spread).
  const measured = shots
    .filter((s) => s.velocity_status === "measured" && s.velocity_fps != null)
    .map((s) => Number(s.velocity_fps));
  const mv = measured.length ? Math.round(mean(measured)) : 0;
  const sd = measured.length
    ? Math.sqrt(mean(measured.map((v) => (v - mv) ** 2)))
    : 0;
  const es = measured.length
    ? Math.max(...measured) - Math.min(...measured)
    : 0;

  // Chart series use the effective (interpolated) curve so it stays continuous.
  const eff = effectiveVelocities(shots);
  const vels = eff.map((v) => (v == null ? null : Math.round(v)));
  const fpe = eff.map((v) => (v == null ? null : (v * v * grains) / 450240));
  const devs = eff.map((v) => (v == null ? null : Math.round(v - mv)));
  const fpeVals = fpe.filter((x) => x != null);

  const cal = row.caliber?.name ?? "";
  const startPsi = row.pressures?.[0]?.start_pressure_psi;

  return {
    id: row.id,
    brand: row.variant?.model?.brand?.name ?? "",
    model: row.variant?.model?.name ?? "",
    cal,
    calDisp: "·" + cal.replace(".", ""),
    fill: startPsi ? `${Math.round(Number(startPsi) / 14.5038)} bar` : "PCP",
    color: PALETTE[index % PALETTE.length],
    shots: shots.length,
    vels,
    fpe,
    devs,
    mv,
    sd: sd.toFixed(1),
    es,
    afpe: fpeVals.length ? mean(fpeVals).toFixed(1) : "0",
    projectile: row.projectile?.name ?? null,
    grains,
    estimatedCount: shots.length - measured.length,
    price: "—",
  };
}

export async function getShotStrings() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("shot_strings")
    .select(
      `id,
       projectile_weight_grains,
       caliber:calibers ( name ),
       variant:airgun_variants (
         barrel_length_in,
         model:airgun_models ( name, brand:brands ( name ) )
       ),
       projectile:projectiles ( name ),
       shots ( shot_number, velocity_fps, velocity_status ),
       pressures:shot_string_tank_pressures ( start_pressure_psi, end_pressure_psi )`
    )
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getShotStrings failed:", error.message);
    return { guns: [], byId: {} };
  }

  const guns = (data || []).map(mapRow);
  const byId = Object.fromEntries(guns.map((g) => [g.id, g]));
  return { guns, byId };
}
