-- Run these in Supabase SQL Editor while signed in as the project owner.

-- Most recent records
select *
from public.health_event_feed
order by occurred_at desc
limit 100;

-- Daily glucose and carbohydrate summary
select *
from public.health_daily_summary
order by local_day desc
limit 90;

-- Readings below 4.0 mmol/L
select occurred_at, value_numeric, context, notes
from public.health_event_feed
where event_type = 'glucose'
  and value_numeric < 4.0
order by occurred_at desc;

-- Readings above 10.0 mmol/L
select occurred_at, value_numeric, context, notes
from public.health_event_feed
where event_type = 'glucose'
  and value_numeric > 10.0
order by occurred_at desc;

-- Events mentioning hypo
select occurred_at, notes, interpreted_time_phrase
from public.health_event_feed
where event_type = 'event'
  and notes ilike '%hypo%'
order by occurred_at desc;

-- Foods used most often
select canonical_name, preferred_portion, carbs_g, usage_count, last_used_at
from public.food_memory_summary
order by usage_count desc, canonical_name;

-- Seven-day glucose summary
select
  count(*) as readings,
  round(avg(value_numeric), 2) as average_mmol_l,
  min(value_numeric) as minimum_mmol_l,
  max(value_numeric) as maximum_mmol_l
from public.health_event_feed
where event_type = 'glucose'
  and occurred_at >= now() - interval '7 days';
