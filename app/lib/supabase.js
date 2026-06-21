import { createClient } from "@supabase/supabase-js";

// The publishable key is designed to be exposed in client code — security is
// enforced by RLS, not key secrecy. Env vars take precedence (set them in the
// host for clean config); the fallbacks keep production working without them.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://kvjobezpudugjjjcokee.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_q_43z0awElWHqHdZHob0Rg_dQ07Z13j";

// Singleton browser/client.
let client;

export function getSupabaseClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}
