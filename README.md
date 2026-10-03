# Oppora

Your personal AI opportunity agent: Oppora reads your Gmail (read-only), finds internships, jobs, hackathons, scholarships and more, pulls out their deadlines, ranks them against your interests and helps you act on them.

- `frontend/`: Next.js 16 + TypeScript + Tailwind
- `backend/`: Django 5.2 + DRF on Python 3.14 (see [backend/README.md](backend/README.md))
- `docker-compose.yml`: Postgres 16 + Redis 7 for local development
- [docs/google-cloud-setup.md](docs/google-cloud-setup.md): Google sign-in, Gmail and Gemini setup, step by step

## Run Oppora on Windows

### One-time setup
Install these (all free):
1. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>. Start it and wait until it says *Engine running*.
2. **Node.js 20+** (LTS): <https://nodejs.org/>
3. **Python 3.14** from python.org, with the *py launcher* option ticked.

### Start everything
In PowerShell, from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1
```

The script:
1. checks Docker, Node and Python
2. creates `.env` on the first run, and fills in any missing secret keys
3. creates the Python virtual environment and installs packages (first run, or when requirements change)
4. runs `npm install` (first run, or when `package-lock.json` changes)
5. starts Postgres and Redis (`docker compose up -d --wait`)
6. applies database migrations
7. opens four windows:
   - **Oppora backend**: Django, port 8000
   - **Oppora worker**: Celery. It runs the Gmail sync and the AI in the background.
   - **Oppora beat**: Celery Beat, the scheduler. Every 10 minutes it continues queued emails (so they resume by themselves after the AI's daily limit resets); twice an hour it checks for new mail; it also creates deadline reminders (09:00) and the daily briefing (08:00), in your time zone.
   - **Oppora frontend**: Next.js, port 3000
8. opens <http://localhost:3000> in your browser

It's safe to run again: anything already running is left alone. Two exceptions: the backend is restarted when `.env` changed after it started, and the worker and beat are restarted when `.env` or backend code changed (Celery doesn't reload code by itself). `-ExecutionPolicy Bypass` applies only to this one run. It doesn't change your system's PowerShell settings.

### Refresh the demo data
The demo account's dates are relative to the day the data was loaded. To reload it for today:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1 -RefreshDemo
```

This replaces the demo account's data only (`rasmitha@example.com`). Your real Google account isn't touched. Add `-NoBrowser` to either command to skip opening the browser.

### After editing `.env`
The backend restarts by itself when you save `.env`, so new keys apply within a few seconds. To restart both servers explicitly:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1 -Restart
```

`-Restart` only stops Oppora's own servers. If another program is using port 8000 or 3000, the script stops and tells you.

### Stop
Close the *Oppora backend*, *Oppora worker*, *Oppora beat* and *Oppora frontend* windows. To stop the database too:

```powershell
docker compose stop
```

### Sign in
- **Without Google set up:** *Sign in with Google* opens the demo account (local development only).
- **With your real Gmail:** follow [docs/google-cloud-setup.md](docs/google-cloud-setup.md), put the keys in `.env`, and restart. Google sign-in then replaces the demo sign-in.

## Checks

```powershell
cd frontend; npm run check                  # lint + type-check + tests
cd ..\backend; .venv\Scripts\python -m pytest
.venv\Scripts\ruff check .
```

## Security

- **Secrets** live only in `.env`, which is never committed, and are read on the server. The frontend bundle contains no keys (checked in Stage 10), and there are no `NEXT_PUBLIC_` secrets.
- **Gmail access** is read-only (`gmail.readonly`). Oppora never sees your Google password. OAuth tokens are encrypted at rest and never sent to the browser. Disconnecting revokes access at Google.
- **Sessions** use an httpOnly, SameSite cookie, every change needs a CSRF token, and every query is limited to your own data.
- **Rate limits** apply to sign-in, starting a scan, the assistant, and everything else. **Security headers** (CSP, no framing, nosniff, no-store on the API) are set on every page.
- To rotate the token encryption key: put a new key first in `TOKEN_ENCRYPTION_KEY=<new>,<old>`, run `backend\.venv\Scripts\python backend\manage.py rotate_token_key`, then remove the old key.
