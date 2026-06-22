-- mvp_13_add_name_to_variants
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-06-21.
--
-- Add an optional marketing/edition name to airgun_variants (e.g. "Sniper",
-- "Compact"). A variant is otherwise identified only by its specs
-- (caliber + barrel length + reg pressure); this captures the manufacturer's
-- label for an edition (e.g. a "Sniper" version is really just a longer barrel).
-- Nullable — most variants won't have a distinct name.

alter table public.airgun_variants
  add column if not exists name text;
