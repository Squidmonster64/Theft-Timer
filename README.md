# Theft Timer / Stolen Minutes — Supabase edition

This build keeps an offline local cache and synchronises completed activities to a private Supabase table after email magic-link sign-in.

## 1. Create/configure the Supabase project

1. Open the project in Supabase.
2. Open **SQL Editor**.
3. Paste and run `supabase-schema.sql`.
4. Open **Authentication → URL Configuration**.
5. Set **Site URL** to `https://theft-timer-production.up.railway.app`.
6. Add the same address under **Redirect URLs**.

## 2. Add browser-safe project credentials

Open **Project Settings → API** and copy:

- Project URL
- Publishable key (or legacy `anon` key)

Edit `config.js`. Never use the `service_role` key in this app.

## 3. Push update

```bash
cd ~/Downloads/Theft-Timer
# Copy this bundle's files into the repository first
git add .
git commit -m "Add secure Supabase cloud sync"
git push
```

Railway will redeploy automatically.

## 4. First login

1. Open the Railway URL.
2. Enter your email.
3. Press **Email login link**.
4. Open the Supabase email link.
5. Press **Sync now**.

Existing local records are uploaded on the first sync.

## Storage model

- Supabase is the durable cloud record.
- Local Storage is retained as an offline cache.
- Row Level Security permits each authenticated user to access only their own records.
- JSON and CSV exports remain available.
