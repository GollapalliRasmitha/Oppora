# Oppora backend

Django 5.2 + Django REST Framework on Python 3.14, PostgreSQL 16. Google sign-in, read-only Gmail sync and the AI pipeline (Gemini free tier) are in; Stage 9 adds Celery + Redis. See `../PROMPT.md` and `../CLAUDE.md`.

## Setup (Windows, Git Bash or PowerShell)

```bash
# from the repo root
cp .env.example .env              # then set DJANGO_SECRET_KEY and TOKEN_ENCRYPTION_KEY (start-oppora.ps1 does this)
docker compose up -d              # Postgres + Redis
cd backend
py -3.14 -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo   # needs Node + `npm install` in /frontend
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

Then run `npm run dev` in `/frontend` and open http://localhost:3000, or just use `start-oppora.ps1` from the repo root. Next.js proxies `/api/*` to Django. Without Google credentials, *Sign in with Google* opens the seeded demo account; with them (see `../docs/google-cloud-setup.md`) it's real Google sign-in.

The seed's dates are relative to the day you load it, so re-run `seed_demo` to refresh the demo on another day. Options: `--date YYYY-MM-DD`, `--tz Asia/Kolkata`, `--email someone@example.com`.

## Checks

```bash
.venv/Scripts/ruff check . && .venv/Scripts/ruff format --check .
.venv/Scripts/python manage.py makemigrations --check --dry-run
.venv/Scripts/python -m pytest
```

## Layout

```
config/          settings (all secrets from env), urls (/api/*), JSON 404/500
core/            api.py (pagination, error shape, GmailAccessError), clock.py (user's "today"),
                 data.py (per-user snapshots), seed.py + management/commands/seed_demo.py,
                 views.py (dashboard, insights, sync, assistant),
                 domain/ (pure logic ported from the frontend: dates, match, stats, insights, calendar, assistant)
accounts/        User (email login), UserPreference, GmailConnection (+ encrypted tokens, sync state); google.py (OAuth + PKCE)
mail/            Email, EmailClassification, ProcessedMessage (queue); content, prefilter, gmail client, pipeline, sync
opportunities/   Opportunity, Deadline, Application, SavedItem, Interview; opportunities, deadlines, calendar, applications, saved
notifications/   Notification (derived, upserted by key); /api/notifications/
ai/              AI provider interface (gemini, openai, fake), rate limiter + daily budget, schema, extraction + validation
tests/           pytest (offline): seed targets, isolation, auth/CSRF, endpoints, domain parity, pipeline, Google OAuth
```

## API

All endpoints need a session (401 otherwise), and unsafe methods need `X-CSRFToken`. Errors always look like `{"error": {"code", "message", "fields"?}}`. Lists are paginated (`?page=`, `?page_size=` ≤ 200) and every queryset is filtered by `request.user`.

| Endpoint | |
|---|---|
| `GET /api/auth/csrf/` | sets the CSRF cookie |
| `GET /api/auth/google/login/`, `GET …/callback/` | Google sign-in (redirects); `?next=&intent=signin\|connect` |
| `POST /api/auth/dev-login/` | demo sign-in (DEBUG and no Google credentials only) |
| `POST /api/auth/logout/` | |
| `GET, PATCH /api/auth/me/` | profile; interests/skills changes re-explain matches |
| `DELETE /api/auth/me/data/` | delete everything Oppora stored |
| `GET /api/auth/gmail/`, `POST …/connect/`, `POST …/disconnect/` | Gmail connection |
| `GET, PATCH /api/preferences/` | nested merge |
| `GET /api/emails/`, `GET, PATCH /api/emails/<id>/`, `POST …/extract/` | `?category=&opportunity=&archived=&read=&q=` |
| `GET /api/opportunities/`, `GET, PATCH …/<id>/` | `?type=&priority=&status=&saved=&dismissed=&q=&ordering=` |
| `GET /api/deadlines/`, `GET /api/deadlines/calendar/` | `?start=&end=&kind=` |
| `GET, POST /api/applications/` | POST upserts `{opportunityId, status}` |
| `GET, POST, DELETE /api/saved/` | `{opportunityId}` or `{emailId}` |
| `GET /api/notifications/`, `POST …/<id>/read/`, `POST …/clear/` | |
| `GET /api/insights/?range=7\|30`, `GET /api/insights/dashboard/` | |
| `GET, POST /api/sync/` | POST starts a background scan; 409 `gmail_access` when Gmail isn't connected; GET includes `queued` |
| `POST /api/assistant/` | `{question, opportunityId?}` |

"Today" comes from the browser's `X-Timezone` header, falling back to the user's profile zone.
