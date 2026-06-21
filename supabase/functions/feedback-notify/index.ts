import { createClient } from "jsr:@supabase/supabase-js@2";

// feedback-notify
// Called by the client right after a feedback row is inserted. Verifies the
// caller (JWT enforced by the platform), confirms they own the row, then emails
// the submission to the site owner via Resend. The feedback is already saved in
// the DB, so email is best-effort: failures return an error but never lose data.
//
// Required secret: RESEND_API_KEY
// Optional secrets: FEEDBACK_TO (default matt@gogun.co),
//                   FEEDBACK_FROM (default onboarding@resend.dev sender)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TO = Deno.env.get("FEEDBACK_TO") ?? "matt@gogun.co";
// Resend lets you send from onboarding@resend.dev to your own account email
// without verifying a domain. Override with a verified sender once set up.
const FROM = Deno.env.get("FEEDBACK_FROM") ?? "ShotStrings Feedback <onboarding@resend.dev>";

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing auth" }, 401);

    // Identify the caller from their JWT.
    const userClient = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "invalid auth" }, 401);
    const uid = userData.user.id;

    const { id } = await req.json().catch(() => ({}));
    if (!id) return json({ error: "missing id" }, 400);

    // Service-role read (RLS-exempt), then confirm ownership.
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: row, error: rowErr } = await admin
      .from("feedback")
      .select("id, user_id, user_email, message, page_url, user_agent, created_at")
      .eq("id", id)
      .single();

    if (rowErr || !row) return json({ error: "not found" }, 404);
    if (row.user_id !== uid) return json({ error: "forbidden" }, 403);

    if (!resendKey) {
      // Saved, but email not configured yet. Report softly so the client can
      // still show the thank-you.
      return json({ ok: true, emailed: false, reason: "RESEND_API_KEY not set" });
    }

    const subject = `New ShotStrings feedback from ${row.user_email ?? "a user"}`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">
        <h2 style="margin:0 0 12px">New ShotStrings suggestion</h2>
        <p style="white-space:pre-wrap;margin:0 0 18px;padding:14px;background:#f5f5f5;border-radius:8px">${esc(row.message)}</p>
        <table style="font-size:13px;color:#444;border-collapse:collapse">
          <tr><td style="padding:2px 10px 2px 0;color:#888">From</td><td>${esc(row.user_email ?? "(no email)")}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#888">User ID</td><td>${esc(row.user_id)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#888">Page</td><td>${esc(row.page_url ?? "")}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#888">When</td><td>${esc(row.created_at)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#888">Agent</td><td style="color:#999">${esc(row.user_agent ?? "")}</td></tr>
        </table>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: row.user_email || undefined,
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return json({ ok: true, emailed: false, reason: detail }, 200);
    }

    return json({ ok: true, emailed: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
