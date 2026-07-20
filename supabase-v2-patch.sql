-- Run this after the earlier Diabetes schema. Safe to run again.

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
