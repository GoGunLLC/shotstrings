-- mvp_11_feedback_table
-- Applied to Supabase project kvjobezpudugjjjcokee on 2026-06-21.
--
-- Site feedback / feature-request submissions from authenticated users.
-- RLS: any signed-in user may insert their own row; only admins may read.
-- No update/delete policies => those are denied for non-service roles.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  user_email text,
  message text not null,
  page_url text,
  user_agent text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Signed-in users can submit feedback, but only attributed to themselves.
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (user_id = auth.uid() and char_length(message) between 1 and 5000);

-- Only admins can read submissions (e.g. the admin console).
drop policy if exists feedback_select_admin on public.feedback;
create policy feedback_select_admin on public.feedback
  for select to authenticated
  using (public.is_admin());

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
