-- mvp_09_catalog_insert_no_self_approve
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-06-21.
--
-- Tightens the catalog INSERT policies so only admins can self-approve.
-- Previously the INSERT policies checked only `created_by = auth.uid()`, which
-- let any authenticated user insert a row with status = 'approved', bypassing
-- the suggest-new moderation flow. Now non-admins may only insert 'pending'
-- rows; admins may insert at any status (used by the admin quick-add panel).

-- brands
drop policy if exists brands_insert on public.brands;
create policy brands_insert on public.brands
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending'::catalog_status or public.is_admin()));

-- airgun_models
drop policy if exists airgun_models_insert on public.airgun_models;
create policy airgun_models_insert on public.airgun_models
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending'::catalog_status or public.is_admin()));

-- airgun_variants
drop policy if exists airgun_variants_insert on public.airgun_variants;
create policy airgun_variants_insert on public.airgun_variants
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending'::catalog_status or public.is_admin()));

-- projectiles
drop policy if exists projectiles_insert on public.projectiles;
create policy projectiles_insert on public.projectiles
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending'::catalog_status or public.is_admin()));

-- moderators
drop policy if exists moderators_insert on public.moderators;
create policy moderators_insert on public.moderators
  for insert to authenticated
  with check (created_by = auth.uid() and (status = 'pending'::catalog_status or public.is_admin()));
