import { createClient } from "@supabase/supabase-js";

// Singleton browser/client. Uses the publishable (anon) key — safe to expose;
// RLS limits reads to approved rows.
let client;

export function getSupabaseClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
