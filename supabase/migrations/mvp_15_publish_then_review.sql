-- mvp_15_publish_then_review
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-07-01.
--
-- Reworks moderation from approve-before-public to publish-then-review:
--   * Submissions and user-created catalog entries go public immediately
--     (status defaults to 'approved'); "needs review" = reviewed_at IS NULL.
--   * reviewed_at/reviewed_by added to shot_strings + the five catalog tables.
--     Existing approved rows are backfilled as reviewed.
--   * Insert triggers stop non-admins self-reviewing (and stamp approved_at);
--     admin inserts are auto-marked reviewed. A non-admin edit to a string
--     clears reviewed_at, re-queueing it.
--   * Catalog INSERT policies relaxed to `created_by = auth.uid()` (mvp_09's
--     pending-only restriction dropped — the trigger keeps rows unreviewed).
--   * airgun_tanks gains an INSERT policy for the creator of the parent
--     variant, so the submit form can create a variant with its tanks.

-- 1. Review tracking columns -------------------------------------------------
alter table public.shot_strings
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id);

alter table public.brands          add column if not exists reviewed_at timestamptz, add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.airgun_models   add column if not exists reviewed_at timestamptz, add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.airgun_variants add column if not exists reviewed_at timestamptz, add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.projectiles     add column if not exists reviewed_at timestamptz, add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.moderators      add column if not exists reviewed_at timestamptz, add column if not exists reviewed_by uuid references public.profiles(id);

-- 2. Backfill: everything already approved counts as reviewed ---------------
update public.shot_strings set reviewed_at = coalesce(approved_at, created_at, now()) where status = 'approved' and reviewed_at is null;
update public.brands          set reviewed_at = now() where status = 'approved' and reviewed_at is null;
update public.airgun_models   set reviewed_at = now() where status = 'approved' and reviewed_at is null;
update public.airgun_variants set reviewed_at = now() where status = 'approved' and reviewed_at is null;
update public.projectiles     set reviewed_at = now() where status = 'approved' and reviewed_at is null;
update public.moderators      set reviewed_at = now() where status = 'approved' and reviewed_at is null;

-- 3. New defaults: submissions/catalog rows are live on insert --------------
alter table public.shot_strings    alter column status set default 'approved';
alter table public.brands          alter column status set default 'approved';
alter table public.airgun_models   alter column status set default 'approved';
alter table public.airgun_variants alter column status set default 'approved';
alter table public.projectiles     alter column status set default 'approved';
alter table public.moderators      alter column status set default 'approved';

-- 4. shot_strings INSERT guard: stamp approved_at, keep review flags honest -
create or replace function public.guard_shot_string_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    -- Non-admins can't self-review, and can't insert rejected rows.
    new.reviewed_at := null;
    new.reviewed_by := null;
    if new.status = 'rejected' then
      raise exception 'Only admins can insert rejected strings';
    end if;
  else
    -- Admin-submitted strings are implicitly reviewed.
    if new.status = 'approved' and new.reviewed_at is null then
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;
  end if;
  if new.status = 'approved' and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists shot_strings_insert_guard on public.shot_strings;
create trigger shot_strings_insert_guard
  before insert on public.shot_strings
  for each row execute function public.guard_shot_string_insert();

-- 5. shot_strings UPDATE guard: protect status + review flags; a non-admin
--    edit to a string re-queues it for review.
create or replace function public.guard_shot_string_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only admins can change shot_string status';
  end if;
  if not public.is_admin() then
    -- Non-admins can't mark reviewed; any edit they make re-queues the string.
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 6. Catalog INSERT guard (shared): same review-flag rules -------------------
create or replace function public.guard_catalog_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    new.reviewed_at := null;
    new.reviewed_by := null;
  else
    if new.status = 'approved' and new.reviewed_at is null then
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists brands_insert_guard on public.brands;
create trigger brands_insert_guard before insert on public.brands for each row execute function public.guard_catalog_insert();
drop trigger if exists airgun_models_insert_guard on public.airgun_models;
create trigger airgun_models_insert_guard before insert on public.airgun_models for each row execute function public.guard_catalog_insert();
drop trigger if exists airgun_variants_insert_guard on public.airgun_variants;
create trigger airgun_variants_insert_guard before insert on public.airgun_variants for each row execute function public.guard_catalog_insert();
drop trigger if exists projectiles_insert_guard on public.projectiles;
create trigger projectiles_insert_guard before insert on public.projectiles for each row execute function public.guard_catalog_insert();
drop trigger if exists moderators_insert_guard on public.moderators;
create trigger moderators_insert_guard before insert on public.moderators for each row execute function public.guard_catalog_insert();

-- 7. Catalog INSERT policies: authenticated users may now insert live
--    ('approved') rows; the trigger above keeps them unreviewed. -------------
drop policy if exists brands_insert on public.brands;
create policy brands_insert on public.brands
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists airgun_models_insert on public.airgun_models;
create policy airgun_models_insert on public.airgun_models
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists airgun_variants_insert on public.airgun_variants;
create policy airgun_variants_insert on public.airgun_variants
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists projectiles_insert on public.projectiles;
create policy projectiles_insert on public.projectiles
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists moderators_insert on public.moderators;
create policy moderators_insert on public.moderators
  for insert to authenticated with check (created_by = auth.uid());

-- 8. Tanks: a user may add tanks to a variant they created --------------------
drop policy if exists airgun_tanks_insert_own_variant on public.airgun_tanks;
create policy airgun_tanks_insert_own_variant on public.airgun_tanks
  for insert to authenticated
  with check (
    exists (
      select 1 from public.airgun_variants v
      where v.id = variant_id and v.created_by = auth.uid()
    )
  );
