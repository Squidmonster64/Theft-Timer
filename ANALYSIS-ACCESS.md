# External analysis access

The health data is stored in Supabase Postgres and remains protected by the existing user-based Row Level Security policies.

## Fastest inspection

Open the Supabase project, then use:

- **Table Editor** for individual records in `health_events` and `foods`.
- **SQL Editor** for ad-hoc analysis.
- `analysis-queries.sql` for ready-made queries.

The updated schema also creates three private views:

- `health_event_feed` — flattened event records, including carbohydrate totals and interpreted speech time.
- `health_daily_summary` — daily glucose and carbohydrate aggregates in `Australia/Perth` time.
- `food_memory_summary` — personal food memory and usage counts.

## External tools

Authenticated tools can query the views through the Supabase REST API, GraphQL API, Supabase JavaScript/Python clients, or a direct Postgres connection. Suitable tools include a private notebook, spreadsheet script, Metabase, Power BI, or a custom analysis service.

Use a signed-in user's JWT when the tool should see only that user's rows. A backend service may use the secret/service-role key for controlled administration, but that key must stay on a secure server and must never be placed in the PWA, Safari, a public repository, or a spreadsheet shared with others.

## Interpretation layer

For automated interpretation, create a server-side Supabase Edge Function or Railway endpoint that:

1. Authenticates the user.
2. Queries `health_event_feed` or `health_daily_summary`.
3. Calculates trends and flags.
4. Optionally sends a minimal, consented dataset to an analysis model.
5. Returns an explanation to the PWA without exposing database secrets.

Automated summaries should be treated as informational. They are not a replacement for a glucose meter, clinician, or emergency advice.
