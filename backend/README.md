# Oppora backend

Django 5.2 + Django REST Framework on Python 3.14, PostgreSQL 16. Stage 8 adds Google OAuth, Gmail sync and the AI pipeline, and Stage 9 adds Celery + Redis. See `../PROMPT.md` and `../CLAUDE.md`.

## Setup (Windows, Git Bash or PowerShell)

```bash
# from the repo root
cp .env.example .env              # then set DJANGO_SECRET_KEY to a long random value
docker compose up -d              # Postgres + Redis
cd backend
py -3.14 -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo   # needs Node + `npm install` in /frontend
.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

Then run `npm run dev` in `/frontend` and open http://localhost:3000. Next.js proxies `/api/*` to Django, and in development the app signs in as the seeded demo user automatically. Google sign-in replaces that in Stage 8.

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
accounts/        User (email login), UserPreference, GmailConnection (+ sync state); auth/profile/preferences views
mail/            Email, EmailClassification; /api/emails/ (+ extract)
opportunities/   Opportunity, Deadline, Application, SavedItem, Interview; opportunities, deadlines, calendar, applications, saved
notifications/   Notification (derived, upserted by key); /api/notifications/
tests/           pytest: seed targets on 5 dates, user isolation, auth/CSRF, endpoints, domain parity
```

## API

All endpoints need a session (401 otherwise), and unsafe methods need `X-CSRFToken`. Errors always look like `{"error": {"code", "message", "fields"?}}`. Lists are paginated (`?page=`, `?page_size=` ≤ 200) and every queryset is filtered by `request.user`.

| Endpoint | |
|---|---|
| `GET /api/auth/csrf/` | sets the CSRF cookie |
| `POST /api/auth/dev-login/` | Stage 7 dev sign-in (DEBUG only) |
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
| `GET, POST /api/sync/` | POST returns 409 `gmail_access` when Gmail isn't connected |
| `POST /api/assistant/` | `{question, opportunityId?}` |

"Today" comes from the browser's `X-Timezone` header, falling back to the user's profile zone.
