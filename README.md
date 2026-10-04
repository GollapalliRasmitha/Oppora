# Oppora

**Your personal AI opportunity agent.** Oppora reads your Gmail (read-only), finds internships, jobs, hackathons, scholarships, fellowships and events, pulls out their deadlines, ranks them against your profile and helps you act before they close.

- **Finds** opportunities in your inbox with an AI model (Gemini free tier by default) and never invents details: anything the email doesn't say is shown as *Not mentioned in email*.
- **Ranks** each one by a match % you can inspect (interests, skills, level, deadline), and warns when an email asks for a fee.
- **Tracks** deadlines on a calendar, reminds you the day before, and keeps your saved and applied lists.
- **Helps** with an assistant that answers only from your own opportunities and emails, plus insights and a weekly digest.
- Dark, light or system theme. It works on desktop, tablet and phone, by keyboard and with a screen reader.

| Part | Stack |
|---|---|
| `frontend/` | Next.js 16 (App Router) · TypeScript · Tailwind v4 · Radix · Lucide |
| `backend/` | Django 5.2 · Django REST Framework · Python 3.14 · Celery |
| Infrastructure | Postgres 16 + Redis 7 (`docker-compose.yml`) |
| AI | Gemini REST API (free tier) behind one provider interface; OpenAI optional (paid) |

Deeper docs: [backend/README.md](backend/README.md) (API and backend layout), [docs/google-cloud-setup.md](docs/google-cloud-setup.md) (Google sign-in, Gmail and Gemini, step by step), [CLAUDE.md](CLAUDE.md) (design tokens, decisions, stage notes).

---

## Quick start (Windows)

### 1. Install once (all free)
1. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>. Start it and wait until it says *Engine running*.
2. **Node.js 20+** (LTS): <https://nodejs.org/>
3. **Python 3.14** from python.org, with the *py launcher* option ticked.

### 2. Start everything
In PowerShell, from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1
```

The script:
1. checks Docker, Node and Python
2. creates `.env` on the first run and generates any missing secret keys
3. creates the Python virtual environment and installs packages (first run, or when requirements change)
4. runs `npm install` (first run, or when `package-lock.json` changes)
5. starts Postgres and Redis (`docker compose up -d --wait`)
6. applies database migrations
7. opens four windows:
   - **Oppora backend**: Django, port 8000
   - **Oppora worker**: Celery. It runs Gmail syncs and the AI in the background.
   - **Oppora beat**: the scheduler. It does the following:
     - every 10 minutes, it resumes queued emails, including after the AI's daily limit resets;
     - twice an hour, it checks for new mail;
     - at 09:00 your time, it creates deadline reminders;
     - at 08:00, it creates the daily briefing;
     - on Mondays at 08:00, it creates the weekly digest.
   - **Oppora frontend**: Next.js, port 3000
8. opens <http://localhost:3000>

It's safe to run again: anything already running is left alone, except that the backend restarts when `.env` changed, and the worker and beat restart when `.env` or backend code changed. `-ExecutionPolicy Bypass` applies only to this run.

| Option | What it does |
|---|---|
| `-RefreshDemo` | Reloads the demo account's data for today (dates are relative to the load day). Your real account isn't touched. |
| `-Restart` | Restarts Oppora's own servers (never other programs on ports 8000/3000). |
| `-NoBrowser` | Doesn't open the browser. |

**Stop:** close the four *Oppora …* windows. To stop the database too, run `docker compose stop`.

### 3. Sign in
- **Without Google set up:** *Sign in with Google* opens the seeded demo account (local development only).
- **With your real Gmail:** follow [docs/google-cloud-setup.md](docs/google-cloud-setup.md) (about 15 minutes), put the keys in `.env`, and save. The backend restarts by itself, and Google sign-in then replaces the demo sign-in.

---

## Manual setup (macOS, Linux, or without the script)

```bash
cp .env.example .env            # then fill in DJANGO_SECRET_KEY and TOKEN_ENCRYPTION_KEY (see the comments)
docker compose up -d --wait     # Postgres + Redis

cd backend
python3.14 -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
python manage.py migrate
python manage.py seed_demo      # demo account; needs Node and `npm install` in ../frontend

# four terminals:
python manage.py runserver 127.0.0.1:8000
python -m celery -A config worker --pool=solo --loglevel=info
python -m celery -A config beat --loglevel=info --schedule .celery/beat-schedule
cd ../frontend && npm install && npm run dev           # http://localhost:3000
```

Without Redis or a worker you can set `JOBS_BACKEND=thread`. Syncs then run inside the web process, but nothing is scheduled.

## Configuration

Every variable is listed and explained in [`.env.example`](.env.example). The ones you'll touch:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google sign-in and Gmail (read-only). Keep the Google Cloud app in **Testing** mode with your Gmail as a test user. |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | The AI. Use a Google AI Studio project **without billing** so it stays free. |
| `AI_REQUESTS_PER_MINUTE`, `AI_REQUESTS_PER_DAY` | Keep at or below your free-tier limits. Over the limit, emails wait in a queue and resume by themselves. |
| `GMAIL_INITIAL_SYNC_DAYS` | How far back the first scan looks (default 60 days). |
| `DEFAULT_USER_TIMEZONE` | Used for "today" until the browser reports your zone. |
| `TOKEN_ENCRYPTION_KEY`, `DJANGO_SECRET_KEY` | Generated by the start script. Never commit them. |

`AI_PROVIDER=openai` switches to OpenAI, which is **paid**. It's never enabled by default.

---

## 2-minute demo script

Run `start-oppora.ps1 -RefreshDemo` first, so the demo's dates are relative to today. Each line is what to click and what to say.

**0:00 · Landing (10 s)**
- *"Opportunities get buried in your inbox. Oppora is an AI agent that finds them for you."*
- Point at the illustration and the floating cards, then click **Sign in with Google**.

**0:10 · Dashboard (20 s)**
- *"After sign-in Oppora scans Gmail read-only."* Point at **AI status** (last sync), then the four stat cards (total, deadlines this week with urgent ones, applied, in progress).
- *"Every number is computed from my emails, nothing hard-coded."* Point at the **AI Recommendation** card.

**0:30 · Opportunities (15 s)**
- Click **Opportunities**. Filter with a type chip (**Hackathon**), sort by **Deadline**, search "frontend", then clear the search.
- *"Each card shows the match %, priority and days left, coloured by urgency."* Click the bookmark on **UI Engineer** to save it (toast).

**0:45 · Details (25 s)**
- Open **Frontend Developer**.
- *"The AI Summary explains the match."* Point at the checklist: skills matched, interests matched, and a warning where the email didn't mention eligibility.
- Expand **How this match % is worked out**: *"Checks the email can't answer are left out, so they don't count against me."*
- In the Overview tab, point at *Not mentioned in email*: *"Oppora never guesses."*

**1:10 · Act (20 s)**
- It's already saved (filled bookmark). Click **Set Reminder** (*"09:00 the day before, in the bell"*), then **Apply Now** → **Mark as applied**. Toasts confirm each step.
- Click **Deadlines**: the month view coloured by urgency and the *This week* list.

**1:30 · Assistant (20 s)**
- Click the floating ✦ button, then the prompt **What deadlines are approaching?**
- *"It answers only from my own data and links every opportunity it used."* Click one to jump to it.

**1:50 · Wrap-up (10 s)**
- Open the 🔔 bell, then **Settings → Preferences → Theme → Light**: *"Same design system, light theme."*
- *"Read-only Gmail, encrypted tokens, free-tier AI, and nothing invented."*

Optional extras if there's time: **AI Insights** (trend chart and progress donut), **Calendar** (Month/Week/Day), **Settings → Preview digest now**, **Inbox** (swipe to save or archive on a phone).

---

## How it works

```
Gmail (read-only) ──► sync (Celery worker) ──► pre-filter (no AI: promotions, chats, own mail…)
                                                  │
                                                  ▼
                       Gemini: one call per email → category, fields, deadline, summary
                                                  │  validation + grounding (links, skills, dates and fees
                                                  ▼  must appear in the email; else null)
                       Postgres: Opportunity / Deadline / Email (no bodies) + match score & breakdown
                                                  │
Next.js (App Router) ◄── /api/* proxy ◄── Django REST API (session + CSRF, per-user querysets)
```

- **Minimum data to the AI:** subject, sender, date and a cleaned, trimmed body. Attachments are never read, and email bodies are never stored.
- **Free tier, never failing:** requests are rate-limited and capped per day. Over the limit, emails stay queued and resume automatically after the reset.
- **Idempotent:** every Gmail message is processed once. Follow-ups link to the existing opportunity.
- **Match % =** AI relevance blended with a profile score (interests 40, skills 30, level 15, deadline 15). Unknown checks are neutral, and −25 is applied when the email asks for a fee. Changing your profile re-scores without new AI calls.

## Privacy & security

- **Secrets** live only in `.env` (never committed) and are read on the server. The browser bundle contains no keys.
- **Gmail** access is read-only (`gmail.readonly`); Oppora never sees your Google password.
  - OAuth uses PKCE.
  - Tokens are encrypted at rest and never sent to the browser.
  - Disconnecting revokes access at Google.
- **On Gemini's free tier**, Google may use submitted content to improve its products. Settings → Privacy says exactly what is sent.
- **Sessions** use an httpOnly, SameSite cookie, every change needs a CSRF token, and every query is limited to your own data (tested across two users).
- **Rate limits** apply to sign-in, scans, the assistant and the API.
- **Security headers** are set on every page: CSP, no framing, nosniff, and no-store on the API.
- **Delete my data** (Settings) removes opportunities, emails and notifications and disconnects Gmail.
- **Key rotation:** set `TOKEN_ENCRYPTION_KEY=<new>,<old>`, run `backend\.venv\Scripts\python backend\manage.py rotate_token_key`, then remove the old key.

## Deploy for free

Vercel (website) + Render (API) + Neon (Postgres) + Upstash (Redis) + an hourly GitHub Actions scheduler, all on free plans. Step-by-step guide: [docs/deploy.md](docs/deploy.md). On the free plan:

- **Scans run in short batches** (progress saved after every email), and the hourly scheduler continues them, sends reminders and refreshes the demo.
- **"Try the demo"** opens a shared read-only sample account.
- **Gmail sign-in** stays invite-only (Google Testing mode).
- **Gemini's daily budget** is split fairly between accounts.

## Checks

```powershell
cd frontend; npm run check                            # ESLint + TypeScript + Vitest
npm run build                                         # production build
cd ..\backend; .venv\Scripts\python -m pytest          # API, pipeline, security, journey, performance
.venv\Scripts\ruff check .; .venv\Scripts\ruff format --check .
.venv\Scripts\python manage.py makemigrations --check --dry-run
```

`backend/tests/test_journey.py` runs the complete journey with Google, Gmail and the AI faked: sign-in → sync → AI analysis → details → save → apply → reminder → assistant.

## Troubleshooting

| Symptom | Fix |
|---|---|
| *Sign in with Google* opens the demo account | Google keys aren't in `.env` yet, or the backend wasn't restarted. Saving `.env` restarts it; `-Restart` forces it. |
| Settings shows **Gmail: Needs reconnect** | In Testing mode Google expires refresh tokens after 7 days. Click **Reconnect**. |
| The sync card says **N emails queued** | The AI's daily free limit is used up. They resume by themselves after the reset (midnight Pacific time) while the worker and beat are running. |
| Port 8000 or 3000 is in use | Another program uses it. The script tells you which. Close it, or change the port. |
| Demo dates look old | Run `start-oppora.ps1 -RefreshDemo`. |

## Status and limits

- Built in 12 stages; see the stage notes in [CLAUDE.md](CLAUDE.md).
- For personal use and demos, the Google Cloud app stays in **Testing** mode (up to 100 listed test users).
- A public launch needs Google's restricted-scope verification (privacy policy on a verified domain, demo video, annual CASA security assessment), plus HTTPS, `DJANGO_DEBUG=false` and a non-default Postgres password.
- Email notifications need an email provider (not set up; that would be a paid or extra service). Notifications appear in the in-app bell.
