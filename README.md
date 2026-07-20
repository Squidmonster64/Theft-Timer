# Stolen Minutes + Fragments + Diabetes

A compact offline-first PWA deployed as static files on Railway and synchronized to Supabase.

## Diabetes interface

The Diabetes tab is deliberately reduced to three large speech buttons:

- **Glucose** — speak a reading such as “6.8 before breakfast.” The event time is the instant the button was pressed.
- **Food** — speak a meal such as “two eggs and toast.” Personal food memory is searched first, followed by a small built-in common-food carbohydrate reference. Unknown foods are saved and marked for review.
- **Event** — speak an event and its time, such as “I had a hypo at 3am.” The time is interpreted from the transcription rather than the device clock.

Every record is written to localStorage and IndexedDB before cloud synchronization is attempted. Offline deletions use local tombstones so deleted health records and food memories do not return on a later sync.

## Personal food memory

Foods can be edited or deleted. Deleting a food memory leaves historical meal records unchanged.

Carbohydrate values are estimates and can be corrected in the food-memory editor. They are not medical advice or a substitute for checking product labels and clinician guidance.

## Storage protection

The app checks browser storage usage with the Storage Manager API. When storage is near its available quota, or a local write fails, it displays an **Export recommended** warning with a direct JSON export button.

## Supabase setup

Run the complete `supabase-schema.sql` in the Supabase SQL Editor. It is idempotent and can be run again after an earlier version.

The schema creates:

- `activities`
- `fragments`
- `health_events`
- `foods`
- `health_event_feed` private view
- `health_daily_summary` private view
- `food_memory_summary` private view

All base tables use authenticated per-user Row Level Security.

## External analysis

See:

- `ANALYSIS-ACCESS.md`
- `analysis-queries.sql`

The database can be inspected through Supabase Table Editor and SQL Editor, or queried by an authenticated external notebook, spreadsheet integration, BI tool, REST client, GraphQL client, or Supabase client library.

Never place the Supabase secret/service-role key in the PWA or a public repository.

## Local testing

```bash
npm install
npm start
```

The server defaults to port 3000 locally and uses Railway's `PORT` value in deployment.

## Deployment

Commit all project files to the GitHub repository and deploy the selected branch through Railway. The service worker uses network-first updates for same-origin app files to reduce stale-PWA problems.
