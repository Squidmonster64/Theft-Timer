# Stolen Minutes + Fragments

One installable PWA with two tools:

- **Stolen Minutes** — time activity sessions.
- **Fragments** — type, paste, or dictate text using the Apple keyboard microphone.

Both use the same Supabase login and project, with separate `activities` and `fragments` tables. Both retain a local offline cache.

## Deploy update

1. In Supabase, open **SQL Editor**.
2. Run the complete `supabase-schema.sql` file. It is safe to run again and adds the `fragments` table and Row Level Security policies.
3. Copy this folder over the existing Theft-Timer repository.
4. Commit and push to GitHub. Railway should redeploy automatically.
5. On iPhone, fully close and reopen the installed PWA. If the old interface remains, remove it from the Home Screen and add it again from Safari.

## Supabase configuration

`config.js` already contains the configured project URL and publishable key. Never place a Supabase service-role key in this app.

## Fragment reader/editor

Saved fragments are tappable and open in a full reader/editor. You can edit title, body and tags; copy the body; export one fragment; search all fragments; or delete with confirmation.

## Analysis export

Use **Export Analysis JSON** to create a structured file containing fragments and timer records for use in another ChatGPT conversation or analysis tool. See `ANALYSIS-ACCESS.md` for integration options and security constraints.

## Diabetes tab

Version 5 adds a local-first Diabetes companion tab to the existing app. It supports:

- rapid natural-language review for glucose, meals and medication
- manual health event entry
- editable/deletable health timeline
- persistent personal food memory with aliases, usual portions and carbohydrate estimates
- JSON and CSV health exports
- private Supabase sync through `health_events` and `foods`

Before deploying this version, run the complete `supabase-schema.sql` in the Supabase SQL Editor. The script is idempotent and preserves the existing `activities` and `fragments` tables.

This is a record-keeping tool, not medical advice or a substitute for clinical care.
