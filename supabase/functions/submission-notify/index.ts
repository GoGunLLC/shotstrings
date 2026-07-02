import { createClient } from "jsr:@supabase/supabase-js@2";

// submission-notify
// Fired by an AFTER INSERT database trigger (via pg_net) on every moderatable
// table: shot_strings, brands, airgun_models, airgun_variants, projectiles,
// moderators. It emails the site admin a summary of the new row plus a deep
// link straight to that item in the /admin moderation console.
//
// Because it's called by the database (not a signed-in user), JWT verification
// is disabled for this function; instead the trigger sends a shared secret in
// the `x-webhook-secret` header. The expected value lives in Vault and is read
// back here via the service-role-only RPC `submission_notify_secret()`, so the
// secret never needs to exist as a repo value or a function env var.
//
// Required secret: RESEND_API_KEY
// Optional secrets: SUBMISSION_TO / FEEDBACK_TO (default matt@gogun.co),
//                   FEEDBACK_FROM (reused as the sender),
//                   SITE_URL (default https://shotstrings.com)

const TO =
  Deno.env.get("SUBMISSION_TO") ?? Deno.env.get("FEEDBACK_TO") ?? "matt@gogun.co";
const FROM =
  Deno.env.get("FEEDBACK_FROM") ?? "ShotStrings <onboarding@resend.dev>";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://shotstrings.com").replace(/\/+$/, "");

// table -> { deep-link kind used by /admin?focus=, human noun }
const CFG: Record<string, { kind: string; noun: string }> = {
  shot_strings: { kind: "shot_string", noun: "shot string" },
  brands: { kind: "brand", noun: "brand" },
  airgun_models: { kind: "model", noun: "model" },
  airgun_variants: { kind: "variant", noun: "variant" },
  projectiles: { kind: "projectile", noun: "projectile" },
  moderators: { kind: "moderator", noun: "suppressor" },
};

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const admin = createClient(supabaseUrl, serviceKey);

    // Shared-secret gate: the DB trigger sends `x-webhook-secret`; the expected
    // value is read from Vault. If a secret is configured it MUST match.
    const got = req.headers.get("x-webhook-secret") ?? "";
    const expected =
      Deno.env.get("NOTIFY_WEBHOOK_SECRET") ??
      (await admin.rpc("submission_notify_secret").then((r) => r.data as string | null).catch(() => null));
    if (expected && got !== expected) return json({ error: "forbidden" }, 403);

    const payload = await req.json().catch(() => ({}));
    // Accept both our trigger shape and Supabase's native webhook shape.
    const table: string = payload.table ?? payload.table_name ?? "";
    const record = payload.record ?? payload.new ?? payload.NEW ?? {};
    const cfg = CFG[table];
    if (!cfg) return json({ ok: true, ignored: true, table });

    const id = record.id;
    if (!id) return json({ error: "missing record id" }, 400);

    // Best-effort helpers to turn ids into readable names. Any failure just
    // falls back to the raw value — the email must never block on enrichment.
    const nameOf = async (tbl: string, rid: unknown, col = "name") => {
      if (!rid) return null;
      try {
        const { data } = await admin.from(tbl).select(col).eq("id", rid).maybeSingle();
        return (data as Record<string, unknown> | null)?.[col] ?? null;
      } catch {
        return null;
      }
    };
    const profileName = async (uid: unknown) => (await nameOf("profiles", uid, "username")) ?? "a user";

    // Build the per-type summary rows.
    const rows: [string, string][] = [];
    let heading = `New ${cfg.noun}`;

    if (table === "shot_strings") {
      const [caliber, projectile, submitter] = await Promise.all([
        nameOf("calibers", record.caliber_id),
        record.projectile_id ? nameOf("projectiles", record.projectile_id) : Promise.resolve(null),
        profileName(record.submitted_by),
      ]);
      // Variant -> model -> brand (one embedded read; single FK each).
      let gun = "";
      try {
        const { data: v } = await admin
          .from("airgun_variants")
          .select("name, model:airgun_models ( name, brand:brands ( name ) )")
          .eq("id", record.airgun_variant_id)
          .maybeSingle();
        const brand = v?.model?.brand?.name ?? "";
        const model = v?.model?.name ?? "";
        gun = [brand, model].filter(Boolean).join(" ") + (v?.name ? ` · ${v.name}` : "");
      } catch {
        gun = String(record.airgun_variant_id ?? "");
      }
      let shotCount = "";
      try {
        const { count } = await admin
          .from("shots")
          .select("id", { count: "exact", head: true })
          .eq("shot_string_id", id);
        shotCount = count != null ? String(count) : "";
      } catch { /* ignore */ }

      heading = "New shot string submitted";
      rows.push(["Gun", gun || "—"]);
      rows.push(["Caliber", String(caliber ?? "—")]);
      rows.push([
        "Projectile",
        `${projectile ?? "Custom / unlisted"}${record.projectile_weight_grains ? ` · ${record.projectile_weight_grains} gr` : ""}`,
      ]);
      if (shotCount) rows.push(["Shots", shotCount]);
      rows.push(["Regulated", record.ran_regulated ? "yes" : "no"]);
      rows.push(["Status", String(record.status ?? "pending")]);
      rows.push(["Submitted by", String(submitter)]);
    } else {
      const creator = await profileName(record.created_by);
      if (table === "brands") {
        heading = "New brand added";
        rows.push(["Brand", String(record.name ?? "—")]);
      } else if (table === "airgun_models") {
        heading = "New model added";
        const brand = await nameOf("brands", record.brand_id);
        rows.push(["Model", `${brand ? `${brand} ` : ""}${record.name ?? "—"}`]);
        if (record.power_plant) rows.push(["Power plant", String(record.power_plant)]);
      } else if (table === "airgun_variants") {
        heading = "New variant added";
        let label = "";
        try {
          const { data: m } = await admin
            .from("airgun_models")
            .select("name, brand:brands ( name )")
            .eq("id", record.model_id)
            .maybeSingle();
          label = `${m?.brand?.name ? `${m.brand.name} ` : ""}${m?.name ?? "?"}`;
        } catch { /* ignore */ }
        const caliber = await nameOf("calibers", record.caliber_id);
        rows.push(["Variant", `${label}${record.name ? ` · ${record.name}` : ""}`]);
        rows.push(["Caliber", String(caliber ?? "—")]);
        rows.push(["Regulated", record.is_regulated ? "yes" : "no"]);
      } else if (table === "projectiles") {
        heading = "New projectile added";
        const [brand, caliber] = await Promise.all([
          nameOf("brands", record.brand_id),
          nameOf("calibers", record.caliber_id),
        ]);
        rows.push([
          "Projectile",
          `${brand ? `${brand} ` : ""}${record.name ?? "—"}${record.weight_grains ? ` · ${record.weight_grains} gr` : ""}`,
        ]);
        rows.push(["Type", String(record.type ?? "—")]);
        rows.push(["Caliber", String(caliber ?? "—")]);
      } else if (table === "moderators") {
        heading = "New suppressor added";
        const brand = await nameOf("brands", record.brand_id);
        rows.push(["Suppressor", `${brand ? `${brand} ` : ""}${record.name ?? "—"}`]);
      }
      rows.push(["Added by", String(creator)]);
    }

    const link = `${SITE_URL}/admin?focus=${cfg.kind}:${id}`;

    if (!resendKey) {
      return json({ ok: true, emailed: false, reason: "RESEND_API_KEY not set", link });
    }

    const subject = `${heading} — ShotStrings`;
    const rowsHtml = rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:3px 14px 3px 0;color:#888;white-space:nowrap">${esc(k)}</td><td style="color:#111">${esc(v)}</td></tr>`
      )
      .join("");

    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">
        <h2 style="margin:0 0 14px">${esc(heading)}</h2>
        <table style="font-size:14px;border-collapse:collapse;margin:0 0 20px">${rowsHtml}</table>
        <a href="${esc(link)}"
           style="display:inline-block;background:#e0a93f;color:#100c02;font-weight:700;
                  text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px">
          Review in moderation console →
        </a>
        <p style="font-size:12px;color:#999;margin:16px 0 0">
          Or open: <a href="${esc(link)}" style="color:#6f9bd6">${esc(link)}</a>
        </p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ ok: true, emailed: false, reason: detail }, 200);
    }
    return json({ ok: true, emailed: true, table, link });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
