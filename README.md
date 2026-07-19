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
