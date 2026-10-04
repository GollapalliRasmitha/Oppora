# Deploying Oppora for free

Website on **Vercel**, API on **Render**, database on **Neon**, Redis on **Upstash**, and an hourly scheduler on **GitHub Actions**. Everything runs on free plans and none should ask for a card. **If any page asks for a card, stop: you shouldn't need one.**

```
Browser ──► Vercel (Next.js, https://<project>.vercel.app)
               │  /api/* is proxied (same origin → first-party cookies, no CORS)
               ▼
            Render (Django + gunicorn, https://<service>.onrender.com) ──► Neon (Postgres)
               ▲    scans run in the web process, in short resumable batches   └► Upstash (Redis: rate limits)
               │
GitHub Actions (hourly) ── POST /api/cron/ with CRON_SECRET
```

## How it works without a worker

Render's free plan sleeps after 15 minutes without traffic and has no background worker:

- **Scan Gmail** processes emails for up to `SYNC_BATCH_SECONDS` (480). Every email's result is saved as soon as it's done, so the server can sleep at any moment without losing work.
- **The scheduler** (`.github/workflows/scheduler.yml`, hourly) calls `POST /api/cron/`. The API answers at once, then does the following in the background:
  - refreshes the demo for today;
  - sends deadline reminders, the daily briefing and the weekly digest (late runs still send them, once);
  - checks for new mail and continues each account's queue for up to `CRON_BATCH_SECONDS` (600), shared equally between accounts.
- **The Gemini daily budget** is split equally between connected accounts (`AI_FAIR_SHARE`). A big inbox waits in the queue instead of using everyone's share.
- **Locally nothing changes:** Celery worker and beat do the same work.

## Accounts

| Service | Sign up | Free limits that matter |
|---|---|---|
| Neon | neon.tech (Sign in with GitHub) | 0.5 GB; the database pauses when idle |
| Upstash | upstash.com (GitHub) | 500,000 Redis commands a month |
| Render | render.com (GitHub) | Sleeps after 15 min idle; the first visit after that takes 30–60 s |
| Vercel | vercel.com (GitHub, Hobby plan) | Personal and non-commercial use |
| GitHub Actions | already set up | Private repo: 2,000 minutes a month; the hourly job uses about 730 |

## Steps (in this order)

1. **Neon:** create a project (region close to Render's, e.g. AWS Frankfurt or Singapore) and copy the connection string (`postgresql://…?sslmode=require`).
2. **Upstash:** create a Redis database (free, same region family) and copy the `rediss://default:…@….upstash.io:6379` URL.
3. **Secrets:** run `backend\.venv\Scripts\python backend\manage.py generate_secrets` in your own terminal. It prints `DJANGO_SECRET_KEY`, `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET`. Keep that window open and never commit the values.
4. **Render:** New → Blueprint → this repository (it reads `render.yaml`). Fill in the `sync: false` values:
   - `FRONTEND_ORIGIN` = `https://<project>.vercel.app` (choose the Vercel name now; you can edit it later)
   - `DATABASE_URL` (Neon), `REDIS_URL` (Upstash)
   - `DJANGO_SECRET_KEY`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET` (step 3)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY` (the same values as your local `.env`)

   The build installs packages and runs migrations. Check that <https://<service>.onrender.com/api/health/> shows `{"ok": true}`.
5. **Vercel:** Add New → Project → this repository. Set **Root Directory** to `frontend` and add the environment variable `BACKEND_ORIGIN` = `https://<service>.onrender.com`, then Deploy. If the project name differs from step 4, update `FRONTEND_ORIGIN` in Render.
6. **Google Cloud** → APIs & Services → Credentials → your OAuth client:
   - add the Authorized redirect URI `https://<project>.vercel.app/api/auth/google/callback`;
   - keep `http://localhost:3000/api/auth/google/callback` too (local development);
   - leave the app in **Testing**, with your test users listed under OAuth consent screen → Audience.
7. **GitHub** → repository → Settings → Secrets and variables → Actions:
   - add the **variable** `OPPORA_BACKEND_URL` = `https://<service>.onrender.com`;
   - add the **secret** `OPPORA_CRON_SECRET` = the same `CRON_SECRET`;
   - then Actions → *Oppora scheduler* → **Run workflow** once to test it.
8. **Your data (optional; saves the AI budget):** copy your local account to Neon, then reconnect Gmail once:
   ```powershell
   cd backend
   $env:TARGET_DATABASE_URL = "<Neon connection string>"   # this terminal only
   .venv\Scripts\python manage.py copy_account --email you@gmail.com        # dry run: counts only
   .venv\Scripts\python manage.py copy_account --email you@gmail.com --yes  # copy
   Remove-Item Env:TARGET_DATABASE_URL
   ```
   Then on the live site: Sign in with Google → Settings → Gmail → Reconnect. Google tokens are never copied (they're encrypted with your local key), so you reconnect once. Already-analysed emails are never sent to the AI again.

## Check it works

- The landing page loads, and **Try the demo** opens the sample account with the "read-only demo" banner. Saving or applying shows "This is a read-only demo".
- **Sign in with Google** works for a test user. A non-test user is stopped by Google's own "Access blocked" page (Oppora can't change that page); if Google sends them back, Oppora explains that sign-in is invite-only.
- **Scan Gmail** shows progress. After a batch it says "N emails queued", and the next hourly run continues.
- In Render's logs, each hourly call shows a `Scheduler run: {...}` line.

## Security notes

- Secrets live only in Render's and GitHub's settings, never in the repository. Vercel has only `BACKEND_ORIGIN`, which isn't secret.
- Production refuses to start with `DEBUG` on, a short secret key, or a missing token key, database URL or https frontend origin.
- HTTPS everywhere: HSTS, secure cookies, and redirect to https. `NUM_PROXIES=2`, because the client IP passes through Vercel and Render.
- `POST /api/cron/` checks the secret in constant time, is rate-limited, and doesn't exist without `CRON_SECRET`.
- **Gemini free tier:** Google may use the content and human reviewers may read it, and Google advises against sending personal information to the free tier. The Privacy page says so; only invite people who accept that.
