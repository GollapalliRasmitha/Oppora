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
7. opens two windows: **Oppora backend** (Django, port 8000) and **Oppora frontend** (Next.js, port 3000)
8. opens <http://localhost:3000> in your browser

It's safe to run again: anything already running is left alone. `-ExecutionPolicy Bypass` applies only to this one run. It doesn't change your system's PowerShell settings.

### Refresh the demo data
The demo account's dates are relative to the day the data was loaded. To reload it for today:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1 -RefreshDemo
```

This replaces the demo account's data only (`rasmitha@example.com`). Your real Google account isn't touched. Add `-NoBrowser` to either command to skip opening the browser.

### Stop
Close the *Oppora backend* and *Oppora frontend* windows. To stop the database too:

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
