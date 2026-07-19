-- Run this once in Supabase: SQL Editor -> New query -> Run

create table if not exists public.activities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity text not null check (char_length(activity) between 1 and 500),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists activities_user_started_idx
  on public.activities (user_id, started_at desc);

alter table public.activities enable row level security;

drop policy if exists "Users read own activities" on public.activities;
create policy "Users read own activities"
  on public.activities for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own activities" on public.activities;
create policy "Users insert own activities"
  on public.activities for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own activities" on public.activities;
create policy "Users update own activities"
  on public.activities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own activities" on public.activities;
create policy "Users delete own activities"
  on public.activities for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.activities to authenticated;
revoke all on public.activities from anon;
