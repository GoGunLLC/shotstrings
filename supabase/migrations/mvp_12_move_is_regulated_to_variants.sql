-- mvp_12_move_is_regulated_to_variants
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-06-21.
--
-- Move is_regulated from airgun_models (the product line) to airgun_variants.
-- A model such as the Huben GK1 ships both regulated and unregulated variants,
-- so regulator-presence is a per-variant capability, not a model-wide flag.
-- (This is the catalog capability — distinct from shot_strings.ran_regulated,
-- which records whether a given test run was regulated.)

alter table public.airgun_variants
  add column if not exists is_regulated boolean not null default false;

-- Backfill each variant from its parent model's existing flag.
update public.airgun_variants v
  set is_regulated = m.is_regulated
  from public.airgun_models m
  where v.model_id = m.id;

alter table public.airgun_models
  drop column if exists is_regulated;
