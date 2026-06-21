-- mvp_10_admin_catalog_merge
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-06-20.
--
-- Adds admin-only "merge" functions for the catalog Manage tab. Each merge
-- repoints every child row from a source record onto a target record and then
-- deletes the now-empty source, all inside a single function call (one
-- transaction) so a merge can never be left half-done.
--
-- Why functions instead of client-side statements: a brand merge touches three
-- child tables plus the delete. Done from the browser one statement at a time,
-- a mid-way failure would leave a partial merge (some children moved, source
-- still present). A SECURITY DEFINER function runs atomically and re-checks
-- is_admin() server-side, so RLS can't be bypassed.
--
-- Scope: brands, models, projectiles, moderators. Variants are intentionally
-- excluded for now — their tank rows and per-tank shot pressures make a clean
-- merge ambiguous; variants/calibers get delete-when-unused only in the UI.
--
-- "Repoint only": merge does not de-duplicate same-named children. If both
-- brands have an "Impact" model you'll end up with two under the target, which
-- you can then merge at the model level.

-- ---------------------------------------------------------------------------
-- Brands: children live in airgun_models, projectiles, moderators.
-- ---------------------------------------------------------------------------
create or replace function public.admin_merge_brand(p_source bigint, p_target bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_models       int;
  v_projectiles  int;
  v_moderators   int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_source = p_target then
    raise exception 'source and target brand must differ';
  end if;
  if not exists (select 1 from brands where id = p_source) then
    raise exception 'source brand % not found', p_source;
  end if;
  if not exists (select 1 from brands where id = p_target) then
    raise exception 'target brand % not found', p_target;
  end if;

  update airgun_models set brand_id = p_target where brand_id = p_source;
  get diagnostics v_models = row_count;

  update projectiles  set brand_id = p_target where brand_id = p_source;
  get diagnostics v_projectiles = row_count;

  update moderators   set brand_id = p_target where brand_id = p_source;
  get diagnostics v_moderators = row_count;

  delete from brands where id = p_source;

  return jsonb_build_object(
    'models', v_models,
    'projectiles', v_projectiles,
    'moderators', v_moderators
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Models: children live in airgun_variants.
-- ---------------------------------------------------------------------------
create or replace function public.admin_merge_model(p_source bigint, p_target bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variants int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_source = p_target then
    raise exception 'source and target model must differ';
  end if;
  if not exists (select 1 from airgun_models where id = p_source) then
    raise exception 'source model % not found', p_source;
  end if;
  if not exists (select 1 from airgun_models where id = p_target) then
    raise exception 'target model % not found', p_target;
  end if;

  update airgun_variants set model_id = p_target where model_id = p_source;
  get diagnostics v_variants = row_count;

  delete from airgun_models where id = p_source;

  return jsonb_build_object('variants', v_variants);
end;
$$;

-- ---------------------------------------------------------------------------
-- Projectiles: referenced by shot_strings.projectile_id (nullable).
-- Note: shot_strings snapshot projectile_weight_grains at submit time, so
-- repointing projectile_id does not rewrite historical weights — intended.
-- ---------------------------------------------------------------------------
create or replace function public.admin_merge_projectile(p_source bigint, p_target bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shot_strings int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_source = p_target then
    raise exception 'source and target projectile must differ';
  end if;
  if not exists (select 1 from projectiles where id = p_source) then
    raise exception 'source projectile % not found', p_source;
  end if;
  if not exists (select 1 from projectiles where id = p_target) then
    raise exception 'target projectile % not found', p_target;
  end if;

  update shot_strings set projectile_id = p_target where projectile_id = p_source;
  get diagnostics v_shot_strings = row_count;

  delete from projectiles where id = p_source;

  return jsonb_build_object('shot_strings', v_shot_strings);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderators: referenced by shot_strings.moderator_id (nullable).
-- ---------------------------------------------------------------------------
create or replace function public.admin_merge_moderator(p_source bigint, p_target bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shot_strings int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_source = p_target then
    raise exception 'source and target moderator must differ';
  end if;
  if not exists (select 1 from moderators where id = p_source) then
    raise exception 'source moderator % not found', p_source;
  end if;
  if not exists (select 1 from moderators where id = p_target) then
    raise exception 'target moderator % not found', p_target;
  end if;

  update shot_strings set moderator_id = p_target where moderator_id = p_source;
  get diagnostics v_shot_strings = row_count;

  delete from moderators where id = p_source;

  return jsonb_build_object('shot_strings', v_shot_strings);
end;
$$;

-- Lock down execution: only authenticated users may call (admins are
-- re-checked inside each function regardless). PUBLIC and anon are revoked so
-- the public web key can't even invoke them.
revoke all on function public.admin_merge_brand(bigint, bigint)      from public;
revoke all on function public.admin_merge_model(bigint, bigint)      from public;
revoke all on function public.admin_merge_projectile(bigint, bigint) from public;
revoke all on function public.admin_merge_moderator(bigint, bigint)  from public;

grant execute on function public.admin_merge_brand(bigint, bigint)      to authenticated;
grant execute on function public.admin_merge_model(bigint, bigint)      to authenticated;
grant execute on function public.admin_merge_projectile(bigint, bigint) to authenticated;
grant execute on function public.admin_merge_moderator(bigint, bigint)  to authenticated;

revoke execute on function public.admin_merge_brand(bigint, bigint)      from anon;
revoke execute on function public.admin_merge_model(bigint, bigint)      from anon;
revoke execute on function public.admin_merge_projectile(bigint, bigint) from anon;
revoke execute on function public.admin_merge_moderator(bigint, bigint)  from anon;
