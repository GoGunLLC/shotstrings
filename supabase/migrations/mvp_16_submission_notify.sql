-- mvp_16_submission_notify
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-07-01.
--
-- Emails the site admin whenever a user submits a moderatable object, with a
-- deep link to that item in the /admin console. An AFTER INSERT trigger on each
-- moderatable table asynchronously POSTs the new row to the `submission-notify`
-- edge function (via pg_net); the function formats and sends the email (Resend).
--
-- Covered tables: shot_strings, brands, airgun_models, airgun_variants,
-- projectiles, moderators — the same set that appears in the moderation queues.
--
-- Only rows that land in the review queue trigger a mail: the trigger fires
-- only when reviewed_at IS NULL. The mvp_15 BEFORE INSERT guards stamp
-- reviewed_at = now() for admin inserts, so admin/bulk imports stay silent;
-- genuine user submissions (reviewed_at null) send exactly one email each.
--
-- Config lives in Vault (not in this file), read at fire time:
--   * submission_notify_url    — the edge function endpoint
--   * submission_notify_secret — shared secret echoed in the x-webhook-secret
--                                header and checked by the function
-- If the URL secret is absent the trigger is a silent no-op, so inserts never
-- break when notifications aren't configured.

-- 1. Async HTTP from Postgres ------------------------------------------------
create extension if not exists pg_net;

-- 2. Notifier ----------------------------------------------------------------
-- SECURITY DEFINER so it can read Vault (owned by postgres). Fully guarded:
-- any failure returns NEW, so a notification problem can never block a write.
create or replace function public.notify_submission()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, net
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Only notify for rows that actually enter the moderation queue.
  if new.reviewed_at is not null then
    return new;
  end if;

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'submission_notify_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'submission_notify_secret';
  exception when others then
    return new;
  end;

  if v_url is null then
    return new; -- not configured yet; do nothing
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('table', tg_table_name, 'record', to_jsonb(new)),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-webhook-secret', coalesce(v_secret, '')
                 )
    );
  exception when others then
    return new;
  end;

  return new;
end;
$$;

-- 2b. Let the edge function verify the shared secret ------------------------
-- Exposes the Vault secret to the edge function's service-role client only, so
-- the whole secret lives in Vault (nothing in the repo, no extra env var).
create or replace function public.submission_notify_secret()
returns text
language sql
security definer
set search_path = vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'submission_notify_secret' $$;

-- Supabase auto-grants EXECUTE to anon/authenticated on new public functions,
-- so revoke from them explicitly — only the edge function's service_role client
-- (and postgres) may read the secret back.
revoke execute on function public.submission_notify_secret() from public, anon, authenticated;
grant execute on function public.submission_notify_secret() to service_role;

-- 3. Triggers ----------------------------------------------------------------
drop trigger if exists notify_submission on public.shot_strings;
create trigger notify_submission after insert on public.shot_strings
  for each row execute function public.notify_submission();

drop trigger if exists notify_submission on public.brands;
create trigger notify_submission after insert on public.brands
  for each row execute function public.notify_submission();

drop trigger if exists notify_submission on public.airgun_models;
create trigger notify_submission after insert on public.airgun_models
  for each row execute function public.notify_submission();

drop trigger if exists notify_submission on public.airgun_variants;
create trigger notify_submission after insert on public.airgun_variants
  for each row execute function public.notify_submission();

drop trigger if exists notify_submission on public.projectiles;
create trigger notify_submission after insert on public.projectiles
  for each row execute function public.notify_submission();

drop trigger if exists notify_submission on public.moderators;
create trigger notify_submission after insert on public.moderators
  for each row execute function public.notify_submission();
