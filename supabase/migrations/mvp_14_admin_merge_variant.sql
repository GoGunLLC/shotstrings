-- mvp_14_admin_merge_variant
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-06-21.
--
-- Adds the variant merge that mvp_10 deliberately left out. Unlike a model
-- merge (whose only child is airgun_variants), a variant owns airgun_tanks, and
-- each shot string records per-tank pressures against a specific tank
-- (shot_string_tank_pressures.tank_id, ON DELETE restrict). So we cannot repoint
-- the strings and delete the source variant: the delete would cascade onto the
-- source's tanks (airgun_tanks.variant_id is ON DELETE cascade) and fail against
-- the pressure rows that reference them.
--
-- The merge therefore MOVES the source's tanks onto the target as well, keeping
-- every pressure reference valid, then deletes the now-childless source. As with
-- the other merges this is "repoint only" — it does not de-duplicate tanks, so
-- the target may end up holding the source's tanks alongside its own. Admins can
-- tidy those up afterward.

create or replace function public.admin_merge_variant(p_source bigint, p_target bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shot_strings int;
  v_tanks        int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_source = p_target then
    raise exception 'source and target variant must differ';
  end if;
  if not exists (select 1 from airgun_variants where id = p_source) then
    raise exception 'source variant % not found', p_source;
  end if;
  if not exists (select 1 from airgun_variants where id = p_target) then
    raise exception 'target variant % not found', p_target;
  end if;

  -- Repoint submissions onto the target variant.
  update shot_strings set airgun_variant_id = p_target where airgun_variant_id = p_source;
  get diagnostics v_shot_strings = row_count;

  -- Move the source's tanks too, so their per-string pressure rows stay valid
  -- (and aren't cascade-deleted when the source variant is removed).
  update airgun_tanks set variant_id = p_target where variant_id = p_source;
  get diagnostics v_tanks = row_count;

  delete from airgun_variants where id = p_source;

  return jsonb_build_object('shot_strings', v_shot_strings, 'tanks', v_tanks);
end;
$$;

revoke all     on function public.admin_merge_variant(bigint, bigint) from public;
grant  execute on function public.admin_merge_variant(bigint, bigint) to   authenticated;
revoke execute on function public.admin_merge_variant(bigint, bigint) from anon;
