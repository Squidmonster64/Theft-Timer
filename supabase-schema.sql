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

-- Fragments: run this same script again safely after updating the app.
create table if not exists public.fragments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fragment_code text not null check (char_length(fragment_code) between 1 and 30),
  title text not null default 'Untitled fragment' check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 1000000),
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fragments_user_created_idx
  on public.fragments (user_id, created_at desc);

alter table public.fragments enable row level security;

drop policy if exists "Users read own fragments" on public.fragments;
create policy "Users read own fragments"
  on public.fragments for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own fragments" on public.fragments;
create policy "Users insert own fragments"
  on public.fragments for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own fragments" on public.fragments;
create policy "Users update own fragments"
  on public.fragments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own fragments" on public.fragments;
create policy "Users delete own fragments"
  on public.fragments for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.fragments to authenticated;
revoke all on public.fragments from anon;
