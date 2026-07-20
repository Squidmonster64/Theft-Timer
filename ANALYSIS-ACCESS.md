# Analysis access design

## Recommended now: explicit portable export

Use **Export Analysis JSON**. It creates one structured file containing the signed-in user's locally available:

- fragments, including IDs, titles, bodies, tags and timestamps
- timer activities, including labels, start/end times and durations
- schema version and export timestamp

Upload that JSON file to another ChatGPT conversation, NotebookLM, a local script, or another analysis program. This is the safest first stage because access is deliberate, reviewable and revocable: no external tool receives permanent database credentials.

## Useful analyses

- recurring themes and repeated concerns
- changes in mood, priorities or language over time
- links between fragments and where time was spent
- unfinished ideas and repeated intentions
- topic clusters and emerging projects
- weekly/monthly summaries
- contradictions, decisions and changes of mind
- suggested tags and titles

## Later option: a separate private analysis PWA

Build a second PWA using the same Supabase Auth project. It should sign the user in normally and read only rows permitted by existing Row Level Security. Do not embed a Supabase service-role key in any browser app.

Recommended architecture:

1. User signs in with Supabase magic link.
2. Existing RLS limits reads to `auth.uid() = user_id`.
3. The analysis PWA reads `fragments` and `activities` with the user's session token.
4. Pattern analysis either runs locally in the browser or sends selected records to a secured server endpoint after explicit consent.
5. Store generated analyses in a separate `analyses` table linked to the same user ID.

## Automated AI interpretation

For automated summaries, use a server-side endpoint or Supabase Edge Function. It can:

- accept a date range and selected fragments
- call an AI model using a server-held API key
- return structured findings
- optionally save the result in an `analyses` table

Never place an OpenAI API key or Supabase service-role key in `index.html`, `config.js`, or any client-side PWA file.

## Direct database access for trusted scripts

A personal Python or Node script can sign in as the user and query through RLS. For unattended server jobs, use a tightly controlled backend with secrets stored in environment variables. Prefer scoped user access rather than service-role access wherever possible.
