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

-- Diabetes companion events
create table if not exists public.health_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('glucose','meal','medication','exercise','note')),
  occurred_at timestamptz not null,
  value_numeric numeric,
  unit text,
  context text,
  notes text,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists health_events_user_occurred_idx on public.health_events(user_id, occurred_at desc);
alter table public.health_events enable row level security;
drop policy if exists "Users read own health events" on public.health_events;
create policy "Users read own health events" on public.health_events for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Users insert own health events" on public.health_events;
create policy "Users insert own health events" on public.health_events for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "Users update own health events" on public.health_events;
create policy "Users update own health events" on public.health_events for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "Users delete own health events" on public.health_events;
create policy "Users delete own health events" on public.health_events for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.health_events to authenticated;
revoke all on public.health_events from anon;

-- Private persistent personal food memory
create table if not exists public.foods (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null check (char_length(canonical_name) between 1 and 300),
  aliases text[] not null default '{}',
  preferred_portion text,
  carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists foods_user_name_idx on public.foods(user_id, lower(canonical_name));
alter table public.foods enable row level security;
drop policy if exists "Users read own foods" on public.foods;
create policy "Users read own foods" on public.foods for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "Users insert own foods" on public.foods;
create policy "Users insert own foods" on public.foods for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "Users update own foods" on public.foods;
create policy "Users update own foods" on public.foods for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "Users delete own foods" on public.foods;
create policy "Users delete own foods" on public.foods for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.foods to authenticated;
revoke all on public.foods from anon;

-- Version 2: spoken Event records and private analysis views.
-- Safe to run again after the earlier schema.
alter table public.health_events
  drop constraint if exists health_events_event_type_check;

alter table public.health_events
  add constraint health_events_event_type_check
  check (event_type in ('glucose','meal','event','medication','exercise','note'));

-- A flattened private feed for SQL, REST, spreadsheets, notebooks and dashboards.
create or replace view public.health_event_feed
with (security_invoker = true)
as
select
  id,
  user_id,
  occurred_at,
  event_type,
  value_numeric,
  unit,
  context,
  notes,
  case
    when jsonb_typeof(details -> 'totalCarbs') = 'number'
      then (details ->> 'totalCarbs')::numeric
    else null
  end as total_carbs_g,
  details ->> 'carbohydrateStatus' as carbohydrate_status,
  details ->> 'timestampSource' as timestamp_source,
  details ->> 'interpretedTimePhrase' as interpreted_time_phrase,
  details,
  updated_at,
  created_at
from public.health_events;

-- Daily summaries use the owner's current home timezone.
create or replace view public.health_daily_summary
with (security_invoker = true)
as
select
  user_id,
  (occurred_at at time zone 'Australia/Perth')::date as local_day,
  count(*) as record_count,
  count(*) filter (where event_type = 'glucose') as glucose_readings,
  round(avg(value_numeric) filter (where event_type = 'glucose'), 2) as average_glucose_mmol_l,
  min(value_numeric) filter (where event_type = 'glucose') as minimum_glucose_mmol_l,
  max(value_numeric) filter (where event_type = 'glucose') as maximum_glucose_mmol_l,
  count(*) filter (where event_type = 'meal') as food_records,
  round(sum(
    case
      when event_type = 'meal' and jsonb_typeof(details -> 'totalCarbs') = 'number'
        then (details ->> 'totalCarbs')::numeric
      else 0
    end
  ), 1) as estimated_carbohydrate_g,
  count(*) filter (where event_type = 'event') as event_records
from public.health_events
group by user_id, (occurred_at at time zone 'Australia/Perth')::date;

create or replace view public.food_memory_summary
with (security_invoker = true)
as
select
  id,
  user_id,
  canonical_name,
  aliases,
  preferred_portion,
  carbs_g,
  usage_count,
  last_used_at,
  updated_at
from public.foods;

grant select on public.health_event_feed to authenticated;
grant select on public.health_daily_summary to authenticated;
grant select on public.food_memory_summary to authenticated;
revoke all on public.health_event_feed from anon;
revoke all on public.health_daily_summary from anon;
revoke all on public.food_memory_summary from anon;
