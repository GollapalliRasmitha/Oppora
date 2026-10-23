# Oppora — project memory

Personal AI agent that reads a user's Gmail, finds opportunities, extracts deadlines, ranks them and helps the user act. Full brief: `PROMPT.md`. Visual reference: `design/reference.png`.

**Read this file at the start of every session and keep it current.**

## Current stage

- Stage 1 — Foundation + Landing + Dashboard: done.
- Stage 2 — Opportunities + Opportunity details: done.
- Stage 3 — Deadlines + Inbox: done.
- Stage 4 — AI Insights + Calendar: done.
- Stage 5 — Settings + Notifications + AI assistant: done.
- Stage 6 — UX review pass: done.
- Stage 7 — Backend + frontend switched to the API: done.
- Stage 8 — Google sign-in + Gmail sync + AI pipeline (Gemini free tier): done; verified with the user's real Gmail (51 opportunities found).
- Stage 9 — Celery + Redis background jobs (+ real-data feedback: type chips, fees, hide sender): done.
- Stage 10 — Security hardening: done.
- Pre-Stage-11 fixes (A skills matching + score breakdown, B weekly digest, C light theme): done.
- Stage 11 — Performance + accessibility audit: done.
- Stage 12 — Final polish + end-to-end journey + README: done. All 12 stages of PROMPT.md are complete.
- **Free public deployment: live (5 Oct 2026).**
  - Website: https://oppora-app.vercel.app (Vercel Hobby, root `frontend`, `BACKEND_ORIGIN` only).
  - API: https://oppora-api.onrender.com (Render free, Singapore, blueprint `render.yaml`).
  - Database: Neon (Singapore, project "Oppora", branch `production`, direct connection, no pooler). Rate limits: Upstash Redis free (Singapore).
  - Scheduler: GitHub Actions `Oppora scheduler` (variable `OPPORA_BACKEND_URL`, secret `OPPORA_CRON_SECRET`); manual run #4 succeeded.
  - Google OAuth client has both redirect URIs (localhost + Vercel); still in Testing with 3 test users.
  - The owner's account was copied with `copy_account` (59 opportunities, 125 emails, 526 processed messages) and Gmail reconnected on production.
- Profile check (4 Oct 2026): the user's Google account has 6 interests, 1 skill and a level set; the demo account is unchanged. Suggest adding more skills (worth up to 30 match points).
- Profile skills: keep the demo skills for now (user decision, Stage 3 review).
- **Resume-ready README (15 Oct 2026):** pitch + live link + "Try the demo" first, screenshots in `docs/screenshots/`
  (taken from the live public demo "Alex" only: made-up emails), features, stack + Mermaid diagram, engineering and
  privacy highlights, "built with Claude Code", setup further down; the 2-minute demo script moved to
  `docs/demo-script.md`; "Status and limits" updated (live, HTTPS, DEBUG off). Before going public the full git
  history was scanned: no secrets (only test values); `test_privacy.py` now uses `someone@example.com`.

## Working rules (from PROMPT.md §0)

- One stage at a time; at the end: lint + type-check + tests, check earlier pages, commit `stage-N: …`, summarise, **stop**.
- One design system. Never restyle a component for one page — extend the design system first.
- Ask before: paid services, changing a design token, breaking data-model changes, more Gmail scopes.
- Never invent facts. Unknown → `null` → "Not mentioned in email".

## Repo layout

```
/frontend     Next.js 16 (App Router) + TS + Tailwind v4 + Radix (shadcn-style) + Lucide
/backend      Django 5.2 + DRF on Python 3.14 (venv: backend/.venv) — see backend/README.md
/design       visual reference
docker-compose.yml   Postgres 16 + Redis 7 for local dev
.env.example         every environment variable
```

### Frontend structure

```
app/
  layout.tsx              fonts (Plus Jakarta Sans; Roboto only for the Google button), no-flash theme script
  globals.css             DESIGN TOKENS (CSS vars + Tailwind @theme) and shared utilities
  icon.svg                favicon (logo mark)
  (marketing)/            public: landing page, /privacy, /terms, /contact
  (app)/layout.tsx        AppShell + <Toaster/> for every signed-in page
  (app)/dashboard/        Dashboard (page.tsx = server, dashboard-view.tsx = client)
  (app)/opportunities/    list (search/type/show/sort in the URL) + [id]/ details
  (app)/deadlines/        month calendar + upcoming list
  (app)/inbox/            emails: search/filter in the URL, extract, swipe save/archive
  (app)/insights/         highlight cards, trends bar chart (7/30 days), progress donut, AI recommendation
  (app)/calendar/         Month / Week / Day views; ?view=&date= in the URL
  (app)/settings/         Gmail connection, notifications, preferences, AI preferences, account (profile, subscription, privacy, delete data, sign out)
components/ui/            generic primitives (no Oppora domain knowledge)
components/oppora/        Oppora components (domain-aware) + app shell
components/landing/       landing-page sections + hero illustration
lib/domain/               types.ts, dates.ts (days left, urgency), stats.ts (all computed numbers),
                          match.ts (match reasons + sentence), opportunities.ts (search/filter/sort),
                          deadlines.ts (grouping, month grid, deadline kinds), inbox.ts (filters/counts/search),
                          calendar.ts (calendar items, week/day helpers), insights.ts (all insight numbers),
                          assistant.ts (grounded mock answers for Oppora AI)
lib/mock/seed.ts          THE seed file: createSeed(today); loaded into Postgres by `manage.py seed_demo` via scripts/export-seed.ts
lib/api/*                 typed service functions — the ONLY data entry point for components; client.ts = HTTP client
lib/hooks/                useResource (loading/error/retry/optimistic), useOpportunityActions, useEmailActions,
                          useUrlParams (page state in the query string), useScanGmail, useNow
tests/                    Vitest + Testing Library
```

Scripts (in `/frontend`): `npm run dev | build | lint | typecheck | test | check` (`check` = lint + typecheck + tests).
Backend checks (in `/backend`): `.venv/Scripts/ruff check . && .venv/Scripts/ruff format --check .`, `manage.py makemigrations --check --dry-run`, `.venv/Scripts/python -m pytest`.
Local dev on Windows: `powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1` (Docker + migrations + Django + Next.js + browser; `-RefreshDemo` re-runs seed_demo, `-NoBrowser` skips the browser, `-Restart` restarts Oppora's own servers; a backend older than `.env` is restarted automatically; idle "Oppora …" windows from crashed servers are closed). Manual: `docker compose up -d` → `manage.py migrate` → `manage.py seed_demo` → `manage.py runserver 127.0.0.1:8000` + `npm run dev` (or the `backend` / `frontend` entries in `.claude/launch.json`). Root `README.md` explains it; `docs/google-cloud-setup.md` is the beginner Google Cloud + Gemini walkthrough.

### Backend structure (Stage 7)

```
config/          settings (secrets only from ../.env), urls (/api/*; unknown paths → JSON 404)
core/            api.py (Pagination, exception handler → {"error": {code, message, fields?}}, GmailAccessError 409),
                 clock.py (now(); user_now(request) = user's zone from X-Timezone header, else profile),
                 data.py (per-user dicts in API shape), seed.py (export_seed → node, load_seed), views.py
                 (dashboard, insights, sync, assistant), domain/ (pure logic: dates, match, stats, insights, calendar, assistant)
accounts/        User (UUID pk, email login, interests/skills/experience_level/timezone), UserPreference, GmailConnection
                 (+ encrypted tokens, historyId, sync state, is_demo); google.py = OAuth code + PKCE flow
mail/            Email (message id, thread id, sender, subject, date, snippet — never bodies), EmailClassification,
                 ProcessedMessage (queue + idempotency, no content); content.py (MIME → minimal text), prefilter.py,
                 gmail.py (read-only client), pipeline.py (extract → score → store), sync.py (orchestration)
ai/              providers/ (base interface, gemini, openai, fake), client.py (rate limiter, daily budget, retries),
                 schema.py (one neutral schema → Gemini/OpenAI), extract.py (prompt + validation/grounding), AIUsage model
opportunities/   Opportunity, Deadline (1:1), Application (1:1), SavedItem (opportunity XOR email), Interview
notifications/   Notification (derived, upserted by `key`)
tests/           pytest-django against Postgres
```

## Design tokens (source: `frontend/app/globals.css`)

Two themes, one token set: `:root` holds the dark values, `:root[data-theme="light"]` overrides every colour token with its light value (a test enforces that both blocks define the same tokens). Components only use tokens, never per-theme classes.

| Token | Dark | Light | Tailwind |
|---|---|---|---|
| Background | `#070A1A` | `#F4F5FB` | `bg-bg` |
| Raised surface | `#0F1336` | `#FFFFFF` | `bg-surface` |
| Glass / glass strong | `rgba(255,255,255,.04)` / `.06` | `rgba(255,255,255,.72)` / `.90` | `bg-glass`, `glass`, `glass-strong` utilities |
| Tint (hover/well/track overlay) | `#FFFFFF` | `#1E1B4B` | `bg-tint/[.04]` etc. (never `white/…`) |
| Chrome (sidebar, bottom nav, sticky bars) | `rgba(8,11,31,.9)` | `rgba(255,255,255,.92)` | `bg-chrome` |
| Unread email surface | `#141A45` | `#EEF0FF` | `bg-unread` |
| Border / strong | `rgba(165,160,255,.14)` / `rgba(170,160,255,.30)` | `rgba(79,70,229,.14)` / `.30` | `border-line`, `border-line-strong` |
| Text / secondary / muted | `#EEF0FF` / `#B0B6DA` / `#8189B5` | `#0F1336` / `#3D4370` / `#5B628F` | `text-ink`, `text-ink-2`, `text-ink-3` |
| Purple / violet / blue / pink | `#7C3AED` / `#A78BFA` / `#60A5FA` / `#F472B6` | `#7C3AED` / `#6D28D9` / `#1D4ED8` / `#BE185D` | `purple`, `violet`, `blue`, `pink` |
| Indigo (gradient mid) | `#4F46E5` | `#4F46E5` | `indigo` |
| Success | `#34D399` | `#065F46` | `success` |
| Urgency ≤3d · 4–10d · >10d | `#F87171` · `#FB923C` · `#60A5FA` | `#B91C1C` · `#9A3412` · `#1D4ED8` | `urgent`, `soon`, `later` |
| Shadows | `--shadow-card`, `--shadow-pop` (menus, toasts, drawers, tooltips), `--shadow-chrome` (sidebar), `--glow-*`, `--glow-purple` | softer navy-tinted values | `shadow-[var(--shadow-pop)]` |
| Accent washes | full strength | half (`--wash: .5`) | `bg-wash` (hero cards), `bg-wash-ai` (AI cards) |
| Chart colours | bar `#A78BFA` (hover `#C4B5FD`); progress ramp `#EDE9FE → #C4B5FD → #8B5CF6 → #5B21B6` | bar `#7C3AED` (hover `#5B21B6`); ramp `#2E1065 → #5B21B6 → #8B5CF6 → #A78BFA` | `--viz-bar`, `--viz-bar-hover`, `--viz-1…4`, `--viz-track` |
| Logo sparkles | `#FFFFFF` / `#C4B5FD` | `#6D28D9` / `#8B5CF6` | `--logo-star`, `--logo-star-2` |
| Effects | `--focus-halo` (focused fields), `--glow-active` (selected nav item/day), `--glow-ai` (AI cards), `--shadow-fab(-hover)` (floating AI button) | softer light values | `shadow-[var(--…)]` |
| Brand gradient | `#7C3AED → #4F46E5 → #2563EB` (135°) | same | `bg-brand` |
| Headline gradient | violet → blue → pink | `#6D28D9 → #1D4ED8 → #BE185D` | `text-gradient` |
| AI border gradient | purple → blue → pink | `ai-border` (needs `relative`) |
| Radius | 8 / 12 / 20 / pill | `rounded-sm` / `rounded-md` / `rounded-card` / `rounded-full` |
| Type | hero 40→70px/800, section 32→46px/800, page h1 28→32px/800, stat 30→34px/800, card 16–20/700, body 15px/400, meta 13/500, micro 12 | `text-hero`, `text-section`, `text-page`, `text-stat`, `text-body`, `text-meta`, `text-micro` |
| Spacing | Tailwind default 4px scale | |
| Motion | 150–300ms; `animate-float`, `animate-pulse-orb`, `animate-fade-up`, `animate-drawer-in`, `animate-shimmer` | all disabled under `prefers-reduced-motion` |
| Layout | sidebar 230px (desktop) / 72px rail (tablet) | `--sidebar-w`, `--sidebar-w-collapsed` |

Brand-gradient end is `#2563EB` (not `#3B82F6`) so white button text keeps ≥4.5:1 contrast (5.2–5.7:1, both themes). Muted text `#8189B5` measures ≈5.3:1 on the dark surface; light muted `#5B628F` ≥5.6:1 on bg, surface, glass and tint wells. Every text/icon token was checked ≥4.5:1 in both themes, and every page was scanned in the browser (all text vs its composited background) in both themes at 1366px, 768px and 375px: no failures. Chart palettes were validated with the dataviz validator per theme surface (#0F1336 / #FFFFFF); on light the progress ramp is reversed so Applied stays the most prominent step.

## Components

`components/ui`: Button (primary/secondary/ghost/danger; sm keeps a 44px hit area), IconButton (required `label`), GlassCard, Badge, Input, SearchBar, Tabs, FilterChips, Select (Dropdown/Select), Dropdown (menu), Modal, Drawer (right panel; full-screen on mobile), Toast (`toast.success/error/info`; toasts with an action stay 8s), Skeleton, EmptyState, ErrorState, Swipeable (touch-only swipe actions; always paired with buttons), `useReturnFocus` (Drawer/Modal put focus back on whatever opened them), SwitchRow (labelled switch, whole row is the target), IntentLink (drop-in `next/link` that prefetches on hover/focus/touch instead of on scroll-into-view), TagInput (Enter/comma adds, × removes), MultiChips (multi-select chips).

`components/oppora`: Logo/LogoMark, AIOrb, AICard, Monogram (letter tile instead of company logos), PriorityBadge, DeadlineIndicator (stacked | pill, always writes "N days left"), MatchMeter, MatchRing, MatchChecklist (+`matchChecklist()`), OpportunityCard (+Skeleton), SaveToggle (button | compact icon; outline = not saved, filled violet = saved), EmailCard (+Skeleton; `onOpen`, `expanded`, `footer` actions), MonthCalendar (roving-focus grid; dots when narrow, chips ≥672px container; `showHeader`, `colorBy`), DeadlineItem (+Skeleton; Set Reminder · Open · Mark Complete), CalendarEvent (chip | dot | card; colorBy urgency | kind) + CalendarLegend, InsightCard (+Skeleton), RecommendationsOffCard, BarChart (single series, hover/focus tooltip, table view), DonutChart (ordinal, legend with values + %), InfoItem + NotMentioned (the one way to render missing fields), LoadError (the one page-load error: Gmail → Reconnect Gmail, else retry), PageSearch (a page's own search; sticky under the header on mobile), StatCard (+Skeleton; optional `href` makes the card a link), OpportunityRow (+Skeleton, ⋯ menu; container-query layout), StatusBadge, NotificationItem, NotificationsPanel, SyncStatus (+useSyncStatus), Sidebar, Header, MobileBottomNav, FloatingAIButton, AIAssistantPanel, AppShell, ShellProvider/useShell, PageHeader, UpcomingPage, Avatar, GoogleSignInButton.

All brief components exist; later stages connect them to the real API.

## Decisions

- **Data layer:** components never `fetch`. They call `lib/api/*`, which call `request()` / `listAll()` in `lib/api/client.ts`. Requests go to `/api/*` on the Next.js origin; `next.config.ts` rewrites them to Django (`BACKEND_ORIGIN`, adding Django's trailing slash), so cookies are first-party and there is no CORS. Signatures and return types are unchanged from the mock era; no UI component changed for the switch.
- **The server owns computed logic:** dashboard stats, recommendation, insights, calendar items, notifications, match explanation and the assistant live in `backend/core/domain/` (ported from TS; the TS copies were deleted and their tests moved to pytest). TS keeps UI helpers (dates/urgency, filters/sort, inbox filters, deadline grouping, calendar view helpers, `matchChecklist`/`matchSentence`, `strongMatches` for the assistant greeting). `explainMatch` exists in both (TS for the seed, Python for profile edits/extraction); `test_domain.py` asserts they agree on every seed opportunity.
- **Auth (Stage 7, still the base):** session cookie (httpOnly, SameSite=Lax, Secure when not DEBUG) + CSRF (`X-CSRFToken` from the `csrftoken` cookie, fetched via `/api/auth/csrf/` if missing; `FRONTEND_ORIGIN` is a trusted origin). Until Google OAuth (Stage 8) the client calls `POST /api/auth/dev-login/` once on a 401 and retries; the server only allows it when DEBUG and `DJANGO_DEV_LOGIN` are on, so a production build can't sign in until Stage 8. Expected in dev: the first page load logs a few 401s in the console before the automatic sign-in.
- **Every queryset is filtered by `request.user`**; related ids in bodies (`opportunityId`, `emailId`) must belong to the user (else 400 "does not exist"). `test_isolation.py` loads the full seed for two users and tries every endpoint with the other user's ids.
- **IDs are UUIDs** (not enumerable). Seed ids (`opp_…`, `em_…`) only exist in seed.ts; emails keep theirs as `gmail_message_id` (the pipeline's idempotency key, unique per user).
- `sourceEmailIds` = emails linked to the opportunity (`Email.opportunity` FK); the seed's lists matched exactly, so there is no M2M.
- **"Today"** is computed in the user's zone: the browser sends `X-Timezone`, falling back to `User.timezone` (default `Asia/Kolkata`). Stored timestamps are UTC.
- **Notifications** are derived on each GET and upserted by a stable key (`new:<opp>`, `deadline:<opp>`, `ai_recommendation`), so read/cleared state survives text changes ("closes in 2 days" → "1 day").
- Ties in assistant/list ordering follow seed order: the loader creates rows one by one and snapshots order by `created_at`.
- Percentages use JS-style rounding (`js_round`, half up), not Python's banker's rounding.
- **Dev state switches** (dev builds only): `?mock=error | empty | slow | gmail` are handled in `request()` without touching the network (`empty` returns each call's `empty()` value). `?mock=gmail`: Gmail-backed calls fail with the Gmail error; account/preferences/sync (`gmail: false`) still load, with the connection shown as "Needs reconnect" and sync as "Sync failed".
- `LoadError` also handles an expired session ("You've been signed out" → Sign in again).
- **Seed loading:** `manage.py seed_demo [--date] [--tz] [--email]` runs `frontend/scripts/export-seed.ts` with Node (`tsx`, TZ set to the user's zone) and replaces that user's data. Dates are relative to the load day, so re-run it to refresh the demo. Backend tests use the same export (Node + `npm install` in /frontend required).
- **Python 3.14:** every dependency through Stage 10 (Celery, redis, openai, google-auth, cryptography) has 3.14 wheels (checked with `pip install --dry-run`), so no Python 3.12 is needed.
- **Seed is relative to today:** `createSeed(today)` expresses every date as an offset, so targets and days-left hold on any demo date (tests run it across several dates incl. midnight and month/year boundaries). Past timestamps use offsets ≤ -1 day so nothing is ever in the future.
- **Match reasons are stored** on each opportunity (`matchReasons`: skills / interests / experience as met | unmet | unknown, plus matched skills/interests), computed by `explainMatch()` — the Stage 8 pipeline stores the same shape. The deadline check is computed live. Unmet/unknown checks show as warnings, never hidden.
- Demo profile has `skills` and `experienceLevel: "Undergraduate student"` (needed for the checklist; editable in Settings, Stage 5). Experience is only "met" when the email explicitly targets students.
- Opportunities list: search, type chip and sort live in the URL (`?q=&type=&sort=`) via `history.replaceState`; the header search routes to `/opportunities?q=`. Chip counts reflect the current search.
- Sort: Relevance = match desc; Deadline = open soonest → no deadline → closed; Priority = High→Low, ties by deadline.
- Opportunity details is full-screen on mobile: bottom nav hidden (`isFullScreenOnMobile`), sticky Apply/Save/Share bar, AI button raised above it.
- Apply Now opens a modal: application link if the email had one (none do in the seed → points to Related Emails), then "Mark as applied".
- Share uses the Web Share API, falling back to copying the link.
- SVG gradients use `useId()` ids — a duplicate id inside a `display:none` subtree breaks rendering elsewhere.
- One search bar per screen: the header search hides on pages with their own search (`hasOwnSearch`: /opportunities, /inbox).
- `--fab-clearance` bottom padding on signed-in pages (160px mobile, 104px md+) so the floating AI button never covers the last content.
- Application links: official careers/program pages (not specific postings); example.com for fictional or moved programs (Women Techmakers now redirects elsewhere); Zoho and Bright Futures intentionally have none.
- **Mark Complete = mark as applied** (the deadline's required action is done); no separate "completed" flag. Completed items stay in the list with a check.
- Deadlines: "This week" = next 0–7 days (same window as the dashboard), then Later, then Closed (collapsed). Clicking a day filters the list to that day; chips/links open the opportunity. Week starts Monday.
- Inbox filters: Opportunities = opportunity categories; Deadlines = emails linked to an opportunity due in the next 7 days; Other = College/Newsletter/Promotion/Other. Counts follow the search. Archived emails are hidden (Undo in toast).
- Opening an email (subject) marks it read silently and expands the preview; explicit read/unread, save and archive buttons toast.
- Extract Opportunity (mock): only for unlinked emails; creates an opportunity from the email's own fields (title from subject, organizer = sender, summary = snippet, match = AI relevance; priority from relevance ≥85 High / ≥70 Medium / else Low); everything else null. Non-opportunity emails return "No opportunity found".
- Swipe (touch only): right = save, left = archive; buttons are the fallback and the keyboard path.
- **Charts** follow the dataviz skill: palette validated on the #0F1336 surface. Trend bars = one hue (`#A78BFA`, hover `#C4B5FD`); the progress donut is an ordered sequence, so an ordinal violet ramp `#EDE9FE → #C4B5FD → #8B5CF6 → #5B21B6` (validator: all checks pass). The violet/blue token pair failed CVD separation, so it is not used as a categorical pair. Every chart has a text alternative, hover/focus tooltips and a table or legend with values. Viz colours are per-theme CSS variables (`--viz-*` in globals.css, read through `VIZ` in `components/oppora/charts.tsx`); the light set was validated on #FFFFFF (see the tokens table).
- Insights definitions: Most common category = most frequent type (% of all tracked); Top company = organization with most opportunities; Best Day To Apply = weekday on which the most opportunities arrived (ties are flagged, never hidden); Trends = **opportunity emails** found per day (emails in opportunity categories: new opportunities plus updates, reminders and invitations; 7 or 30 days, ending today). Counting opportunities discovered would cap the 7-day view at 2 bars, because the "+2 this week" target allows only two new opportunities; Progress = applied ÷ all tracked, split into disjoint Applied / In Progress / Saved (saved, not started) / Other; recommendation count = strong matches.
- Calendar items: deadlines (all-day; kind from type: application / hackathon / scholarship), interviews (timed, from seed `interviews`, each backed by an invitation email) and reminders (09:00 the day before the deadline for opportunities with `reminderSet`; none for closed deadlines). Calendar page colours by kind (with icons + legend); Deadlines page colours by urgency.
- Seed: TCS and Microsoft have reminders on; Atlassian (+5 days 14:00–14:45, video call) and Swiggy (+9 days 11:00, location not stated) interviews.
- Calendar: month day click → Day view; week day header → Day view; every event links to its opportunity. Mobile week view collapses empty days to one line.
- **All numbers are computed** in `lib/domain/stats.ts` from the seed and today's date (`lib/clock.ts`). Nothing is hard-coded in the UI.
- "This week" for trends = the last 7 days. "Deadlines this week" / "coming up soon" = deadlines in the next 0–7 days. Urgent = ≤3 days.
- Strong match = match ≥ 88 %, not yet applied, deadline not passed. Drives the AI recommendation, assistant greeting and notifications.
- Application status: `null` (not started) | `in_progress` | `applied`. Saved is a separate flag, so Applied 8 + In progress 3 + Saved 7 can all be true with 12 opportunities.
- "Not interested" hides an opportunity everywhere (`dismissed`), with Undo in the toast.
- Time-of-day text uses `useNow()` (null during SSR) to avoid hydration mismatches.
- Landing "Sign in with Google" and "Get Started" link to `/dashboard` until OAuth lands in Stage 8 (the dev sign-in does the rest).
- **AI assistant** (`lib/domain/assistant.ts`, mock until Stage 8): answers only from the user's stored opportunities, emails and interviews; every answer lists the opportunities/emails it used as links (clicking closes the panel); when the data doesn't contain the answer it says so and offers prompts. The 5 brief prompts are always visible (list before the first question, chip row above the input after). "Why is this opportunity relevant?" uses the opportunity page you're on, otherwise asks which. Conversation persists while navigating; Clear resets it.
- Notifications are derived from data and filtered by settings (New opportunities, Deadline reminders, AI recommendations); the bell refreshes each time it opens.
- **Preferences** (`Preferences`, `GmailConnection` types; UserPreference + GmailConnection models): toggles save instantly with a toast and roll back on failure. AI recommendations off → Home/Insights show RecommendationsOffCard and the AI notification is hidden. Minimum match, preferred locations, personalization and categories are stored for the Stage 8 ranking (not applied to existing lists). Language English-only.
- Profile save (name, interests, skills, experience level) re-runs `explainMatch` on every opportunity so AI Summaries stay truthful.
- Gmail: Manage (scopes, read-only, 60-day first scan, reconnect), Disconnect (confirm; revokes + deletes tokens; opportunities stay). Scans need a connected Gmail — otherwise the Gmail-error toast with "Reconnect Gmail" (`useScanGmail`, shared by every Scan Gmail button and the sync button).
- Delete my data (confirm): deletes opportunities, emails, interviews, notification state, disconnects Gmail, resets sync to "Not synced yet". Account and preferences remain.
- Interview `end` is nullable — the Swiggy invitation gives a start time only, so no end time is shown.
- OpportunityRow uses container queries (`@container` on the list): full row ≥768px of list width, compact below.
- `.claude/launch.json` (repo root) starts the frontend dev server for previews.
- Next.js dev indicator is off (`devIndicators: false`).
- Seed has 7 follow-up emails (application received, team reminders, practice rounds, info sessions…) linked to existing opportunities, spread across the last 30 days. They add no opportunities, so the dashboard targets are unchanged (inbox: 27 emails, 5 unread).

## Seed targets (verified through the API by `backend/tests/test_seed_targets.py` on 5 dates incl. midnight, New Year and 29 Feb)

Total 12 (+2 this week) · Deadlines this week 4 (2 urgent) · Applied 8 (+1) · In progress 3 (+1) · Saved 7. AI recommendation: "I found 3 opportunities that strongly match your interests. Two have deadlines coming up soon."

All seed dates are offsets from today, so these hold on every date (offsets reproduce the brief's days-left as of 2 Oct 2026, e.g. Google +74 days, TCS +2). Opportunities 6–12 were added to reach the targets; programs without a real-world equivalent use fictional organizers (CodeCircle, Bright Futures Foundation). Opportunity fields not stated in the mock emails are `null`.

## Gmail / Google verification notes (for Stage 8)

`gmail.readonly` is a **restricted** scope. For the demo/MVP keep the Google Cloud app in **Testing** mode with listed test users (max 100). A public launch needs: OAuth consent-screen verification, a published privacy policy and homepage on a verified domain, a demo video of the scope use, and an annual third-party security assessment (CASA) because restricted-scope data is stored on our servers.

## Stage 6 UX review (decisions)

- Audited every page at 1440 / 820 / 768 / 375px for horizontal overflow, unnamed controls, small targets, contrast <4.5:1, focus rings, and the loading / empty / error / Gmail / no-results states.
- Opportunities has a **Show** select (All · Saved · In progress · Applied, `?show=`) — the brief's Saved and Applications lists, with their own empty states. Dashboard stat cards link to the matching list (Deadlines card → /deadlines).
- Empty states always have a primary action: Deadlines/Calendar offer **Scan Gmail** when there's nothing to show (Deadlines shows View opportunities if opportunities exist but none have deadlines).
- Pages with `useSearchParams` render a skeleton Suspense fallback (header + controls + cards), never a blank page.
- Mobile: page searches stick under the header (`PageSearch`; wrappers use `max-sm:contents` so sticky spans the page).
- `FilterChips` pads its scroller so focus rings and the active glow aren't clipped. Multi-select chips use the Lucide Check icon.
- `hit-y` utility (globals.css) extends text-sized buttons/links to a ≥44px hit area; truncation must live on an inner span (overflow clips the ::after).
- Mobile bottom nav keeps the brief's full labels: 11px labels, and the Opportunities column is wider (`1fr 1.45fr 1fr 1fr 1fr`) so labels have ≥18px between them at 360px; targets stay 64px tall.
- Opportunities Show/Sort: stacked below 430px, two equal columns from 430px, inline from 640px. `Select` triggers can shrink (`min-w-0`, value truncates) instead of overflowing.
- Trend chart is titled "Opportunity Emails Found" (it counts opportunity emails, not opportunities).

## Stage 8 decisions (Google sign-in, Gmail sync, AI pipeline)

- **Google OAuth** (accounts/google.py): authorization-code flow with **PKCE (S256)**, `access_type=offline` + `prompt=consent` (refresh token for the sync), `state` + verifier in the session (10-minute TTL, popped on use → no replay / login CSRF). Scopes are exactly `openid`, `userinfo.email`, `userinfo.profile`, `gmail.readonly`. The ID token is verified with google-auth (`verify_oauth2_token`, audience = client id, `email_verified` required). Implemented directly with `requests` (no google-auth-oauthlib).
- Redirect URI goes **through the Next.js origin** (`http://localhost:3000/api/auth/google/callback`, no trailing slash; Next adds Django's slash), so the session cookie is first-party. Next.js passes Django's 302s through unchanged.
- `GET /api/auth/google/login/?next=&intent=signin|connect` (plain Django view). Without Google credentials it signs in the seeded demo user (DEBUG only); `DEV_LOGIN_ENABLED` is automatically **off once `GOOGLE_CLIENT_ID/SECRET` are set**. `next` must be a same-site path (`safe_next`).
- Callback: creates/gets the user by verified email, stores tokens, starts the first scan for new users, redirects to `next`. Errors → `/?auth_error=<code>` (shown by `AuthErrorNotice` on the landing page). Gmail box unticked → signed in but disconnected → `/settings?gmail_error=scope_missing`. Reconnecting with a different Google account → grant revoked, `gmail_error=account_mismatch`.
- `POST /api/auth/gmail/connect/` returns `{redirect}` (Google consent) for real accounts; `connectGmail()` navigates there. The seeded demo account (`GmailConnection.is_demo`) has no mailbox: connect and scans stay simulated (time-based phases, as in Stage 7).
- Disconnect and Delete my data **revoke the token at Google** and delete stored tokens + historyId (+ ProcessedMessage rows for delete).
- **Tokens are encrypted at rest now** (core/crypto.py, Fernet/MultiFernet from `TOKEN_ENCRYPTION_KEY`, comma-separated for rotation; start-oppora.ps1 generates the key). Never serialized to the client.
- **Testing mode:** refresh tokens expire after 7 days → the next sync gets `invalid_grant` → `GmailAuthError` → connection "Needs reconnect" (sync phase error). Documented for the user.
- **Gmail sync** (mail/sync.py): first scan = `newer_than:GMAIL_INITIAL_SYNC_DAYS d` minus chats/spam/trash/sent/drafts, capped at `GMAIL_MAX_MESSAGES_PER_SYNC`; later scans = `history.list(startHistoryId)` (404 → full scan). Message ids are queued as `ProcessedMessage` rows (unique per user + message id → **idempotent**, never processed twice); processing is oldest first. A sync stuck >30 min (server restart) can be started again; queued work is never lost.
- **Background jobs** (core/jobs.py): a daemon thread per sync in Stage 8 (Celery in Stage 9; same call sites). `JOBS_EAGER=True` in tests.
- **Minimum content to the AI**: subject, sender name + address, sent time, and a cleaned plain-text body trimmed to `AI_MAX_BODY_CHARS` (4000): text parts only (HTML → text keeping link targets), **attachments never read** (parts with a filename/attachmentId are skipped), reply quotes and signatures removed. Forwarded content is kept. Bodies are never stored; Email keeps id, thread, sender, subject, date, snippet.
- **Pre-filter** (mail/prefilter.py, no AI): skips SPAM/TRASH/CHAT/DRAFT/SENT/CATEGORY_SOCIAL, the user's own messages, obvious promotions (promo words + Promotions tab, unless internship/hackathon/scholarship/… in the subject/opening), and anything without opportunity words. **Skipped emails are never stored** (only a content-free ProcessedMessage row).
- **AI provider interface** (ai/providers/base.py): one method `generate_json(system, prompt, schema) -> dict` + typed errors (NotConfigured, RateLimited, DailyLimitReached, TransientAIError, InvalidOutput). `AI_PROVIDER=gemini` (default; REST `generateContent`, key in the `x-goog-api-key` header, `responseMimeType=application/json` + `responseSchema`, temperature 0) or `openai` (Chat Completions strict json_schema; paid, unit-tested with mocked HTTP only). One neutral schema (ai/schema.py) is converted per provider. REST instead of the google-genai SDK, whose API is in flux (new `interactions` API).
- **Model:** `GEMINI_MODEL=gemini-3.8-flash` (current stable Flash, Oct 2026). `gemini-3.5-flash-lite` is the fallback if the free daily limit is too low.
- **Free-tier limits, never failing the sync** (ai/client.py): sliding-window limiter at `AI_REQUESTS_PER_MINUTE` (default 9, under the ~10 RPM free tier) shared by all threads; daily budget `AI_REQUESTS_PER_DAY` (default 200) counted in `AIUsage` per provider per **Pacific-time quota day**; a 429 pauses for Gemini's `retryDelay` (else 10/20/40/80/120 s backoff) and retries up to 5×; per-day quota 429s → DailyLimitReached. Remaining emails stay **queued**, the sync completes and reports `queued` (the sync card shows "N emails queued"). Three transient failures in a row stop the run (the rest stays queued).
- **One AI call per email** does classify + extract + summarize (schema: category, is_opportunity, relevance, priority, summary, organization, opportunity_name, deadline, eligibility, location, duration, skills, requirements, benefits, application_link, action_required, interview, confidence). The prompt says the email is data, not instructions (prompt-injection guard), to use null for anything not stated, and gives the user's interests for relevance.
- **Validation + grounding** (ai/extract.py): schema/type checks (missing fields, unknown category → InvalidOutput → one retry with the error → then `needs_review`, nothing stored). Grounding: the application link must be a URL that appears in the email; skills must be mentioned in the email; deadlines must be real dates within −400…+730 days of the email; interviews need a parseable start within −1…+365 days. Dropped fields become null.
- **Store** (mail/pipeline.py): not an opportunity and relevance < 50 → not stored. Confidence < 0.5 → email stored with classification `needs_review`, no opportunity. Follow-ups (same Gmail thread, or same type + organization + name) **link to the existing opportunity** and only fill fields it doesn't have yet (never overwrite); interviews/deadlines are added once.
- **Match score** = blend of AI relevance and a profile score from the stored match reasons (interests met 40, skills up to 30 / unknown 15, experience met 15 / unknown 8, deadline open or unknown 15). The weight comes from **personalization** (low 0.3, balanced 0.5, high 0.7 profile weight); +5 for a preferred location. **Categories to track** and **minimum match** now apply to new opportunities (the email is still stored). Priority = the AI's when given; a deadline ≤3 days on a ≥70 match is always High; otherwise High ≥85 (or ≤7 days and ≥70), Medium ≥65, else Low.
- **Privacy disclosure:** on Gemini's free tier Google may use submitted content to improve its products. Settings → Privacy says exactly what is sent and that it's the free tier. Paid tiers/OpenAI are never enabled without asking.
- The assistant stays deterministic and grounded (it now answers from the real synced data). An LLM front end is optional later; it would share the same AI budget.
- Frontend: `GoogleSignInButton` and both Get Started buttons are plain `<a href="/api/auth/google/login?next=/dashboard">` (full navigation); Sign out calls `POST /api/auth/logout/`; Settings shows toasts for `?gmail=connected` / `?gmail_error=…`; `SyncStatus` type gained optional `queued`.
- Tests: everything offline. `tests/gmail_fakes.py` (Gmail message builder + FakeGmail) and `ai.providers.fake.FakeProvider`; the rate limiter and backoff use a fake clock (no sleeping). The conftest blanks all AI keys so no test can reach a real API.
- **`.env` loading** (config/settings.py `load_env_file`): real environment variables win, but values that came from `.env` are re-read on every start. Plain `load_dotenv()` kept the first start's values forever, because runserver's reloader parent passes its environment to every reloaded child. This is why sign-in stayed on the demo after the Google keys were filled in. `core.apps` adds `.env` to runserver's watched files (`sender.extra_files`), so saving it restarts the dev server. Tests are hermetic: the conftest blanks every Google/AI key and sets `DEV_LOGIN_ENABLED`, so the developer's real `.env` never changes test behaviour.
- **First real sync (3 Oct 2026) findings, fixed:** (1) `gemini-3.8-flash` returned 503 "high demand" → `TransientAIError(overloaded=True)`; the client retries **immediately on `GEMINI_FALLBACK_MODEL`** (default `gemini-3.5-flash-lite`, free tier) and stays on it for 5 minutes (`FALLBACK_FOR`) before trying the main model again; same limiter + daily budget; `EmailClassification.model_name` records the model used. (2) A dev-server restart kills the in-process sync thread but left the phase "analyzing", and the UI disables the sync button while running → `mail.sync._active` (users with a live job in this process); a sync marked running without one is interrupted and is **resumed** by `GET /api/sync/` polling and **at server start** (`MailConfig.ready`, only in runserver's serving child: `RUN_MAIN=true`). The queue is idempotent, so resuming never double-processes. (3) The demo account predated `is_demo` → data migration `accounts.0003_mark_demo_connection`. (4) Follow-ups now link across types (same org + name: e.g. one email says Hackathon, another Competition). (5) **New Google accounts start with an empty profile** (no interests/skills/level) → matches cluster around 44%; filling Settings → Profile runs `mail.pipeline.rescore()`, which re-explains matches and recomputes the match % of AI-found opportunities from their stored relevance (no new AI calls; seeded demo scores stay fixed). Personalization/location changes rescore too. Note: the AI's relevance was judged against "interests: not specified" for emails processed before the profile is filled in.

## Real-data feedback (after the first sync, 3 Oct 2026)

- **Type chips** cover every `OpportunityType` (Internship, Hackathon, Job, Scholarship, Competition, Fellowship, Event; workshops are Events). Only types the user has get a chip (`chipTypes()`, from the unsearched list so chips don't jump while typing); the selected chip always stays so it can be cleared.
- **No deadline** shows once ("No deadline mentioned"), not "No deadline" + "No deadline mentioned".
- **Fees** ("Asks for a fee: ₹500"): the extraction schema has `fee {amount, currency, quote}`; `ai/fees.validate_fee` keeps it only when the quote appears in the email, talks about paying (fee/charge/payment/deposit/...), isn't a negation ("no registration fee", "free of cost"), and involves money; the amount must be written in the quote (else amount null). Never inferred from the sender or company. Stored on Opportunity (`fee_amount`, `fee_currency`, `fee_text` = the email's sentence, `fee_checked_at`). Fee-asking opportunities get −25 match (`FEE_PENALTY`, also in `rescore`) and Low priority. UI: `FeeBadge` (urgent tone, the sentence in the tooltip) on cards, rows and the details header; the details Overview shows a note with the email's own sentence. Sentence splitting keeps "Rs. 500/-" whole.
- **Re-checking stored opportunities** (`mail/fees.recheck_fees`, `manage.py recheck_fees`, and automatically at the end of every sync with an empty queue): bodies aren't stored, so source emails are re-read from Gmail (read-only; snippet if Gmail fails). A free rule scan (`fee_sentences`) first; only emails with a paying sentence cost an AI request, and only those sentences are sent. When the AI budget is spent, rule-only checks still finish and the rest waits (`waiting`). First run on the real data: 48 checked free, 3 waiting for the AI.
- **Hide all from this sender** (`HiddenSender`: user + sender email + the opportunity ids it hid): `POST /api/hidden-senders/ {opportunityId}` hides every opportunity whose emails came from that opportunity's first sender and skips their future emails (pipeline outcome `hidden_sender`, nothing stored). `DELETE` ("Show again", toast Undo or Settings → Preferences → Hidden senders) restores exactly what the rule hid, not separately dismissed ones. The shared `OpportunityMenu` (⋯) is used by OpportunityRow and now OpportunityCard.

## Stage 9 decisions (Celery + Redis)

- `config/celery.py` (app `oppora`, settings namespace `CELERY_`), broker = Redis (`REDIS_URL`), no result backend. `acks_late` + `reject_on_worker_lost` (a task a dying worker held is delivered again), prefetch 1, visibility timeout 4 h (longer than the longest sync).
- **Windows: `--pool=solo`** (one process). This also keeps the AI per-minute limiter (in-process) correct: run **one worker**. The daily budget is in the database, so it's global anyway.
- `core.jobs.enqueue` → `core.tasks.run_job.delay(path, args)`; `run_job` only runs functions in `ALLOWED_JOBS` (`mail.sync.run_sync`), so a message in Redis can't name arbitrary code. If Redis is unreachable, the job runs in a web-process thread (logged). `JOBS_BACKEND=thread` keeps the Stage 8 behaviour; `JOBS_EAGER` for tests.
- **Sync lock** (`core.locks`): Redis key `oppora:lock:sync:<user>` (SET NX, 20 min TTL, refreshed after every email; expires by itself if a worker dies). "Running" = lock held, or started < 60 s ago (pickup grace). Replaces the in-process `_active` set; tests and thread mode use an in-process lock. `run_sync` is a no-op when the lock is taken (duplicate deliveries are safe).
- **Beat schedule** (`CELERY_BEAT_SCHEDULE`, state in `backend/.celery/`, gitignored): `resume_queued` every 10 min (interrupted syncs, and queued emails **as soon as the AI's daily budget is available again**, i.e. within 10 min of the Pacific-midnight reset; it doesn't start while the budget is spent); `sync_all` at :05 and :35 (incremental scans for connected, non-demo accounts); `deadline_reminders` and `daily_briefing` hourly, acting at 09:00 / 08:00 in each user's time zone.
- **Scheduled notifications** use date-stamped keys (`reminder:<opp>:<date>`, `briefing:<date>`), so re-runs never duplicate. `refresh_notifications` lists them with the derived ones, filtered by the same settings (reminders → Deadline reminders; briefing → AI recommendations). The briefing is built only from the user's data and is skipped when there's nothing to say. Email notifications (`notify_email`) still need an email provider (not set up; would be a paid/added service: ask first).
- The start script runs **four windows** (backend, worker, beat, frontend) and restarts worker/beat when `.env` or any backend `.py` file is newer than they are.
- `MailConfig.ready`'s resume-on-start only runs with `JOBS_BACKEND=thread`; with Celery, beat's `resume_queued` does it.

## Stage 10 decisions (security hardening)

- **Rate limits** (core/throttling.py, DRF throttles on a cache): general `user` 600/min (the sync status is polled about once a second during a scan) and `anon` 60/min; `auth` 20/min per IP (dev-login, logout, and the Google login/callback redirects via `auth_rate_limited` → `/?auth_error=rate_limited`); `sync` 20/hour (POST only: polling isn't limited by it); `assistant` 20/min. All overridable with `RATE_*` env vars. 429 → `{"error": {"code": "rate_limited", "message": "… wait N seconds …"}}` + `Retry-After`; the client maps it to `ApiError("rate_limited")`. Counters live in `CACHES["default"]` (Redis db 1); **fail open** if the cache is down (logged), so a cache outage can't take the API down. Tests use `THROTTLE_CACHE="local"` (locmem, cleared per test) and patch `SimpleRateThrottle.THROTTLE_RATES` (DRF binds rates at import time).
- Client IP = `core/client_ip.py` (rate limits and GuardRail use the same function): the website's `proxy.ts` passes
  the visitor's IP in `X-Oppora-Client-IP` with `X-Oppora-Proxy-Secret` = `PROXY_SECRET`, trusted only with the
  right secret; otherwise X-Forwarded-For with `NUM_PROXIES` (local 1; Render 3).
- (21 Oct 2026) Every throttle counts with an atomic fixed-window counter (`AtomicRateThrottle`: cache `add` + `incr`), not DRF's read-then-write history list, so parallel requests can't slip past a limit (see the GuardRail section). The fail-open test now breaks `add`/`incr`.
- **Input limits:** `DATA_UPLOAD_MAX_MEMORY_SIZE` 256 KB, max 200 fields; `?q=` ≤ 200 characters and ≤ 8 terms (`BoundedSearchFilter`); every body goes through a serializer (types, lengths, choices, user-scoped ids); filters reject unknown choices; `ordering` is a whitelist; path ids are UUIDs; `X-Timezone` is validated.
- **Headers.** Django: nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, COOP same-origin; on `/api/*` (`core.middleware.SecurityHeadersMiddleware`) also `Cache-Control: no-store`, `CSP: default-src 'none'; frame-ancestors 'none'`, CORP same-origin and Permissions-Policy. Production (`DEBUG=false`): HSTS 1 year + subdomains, HTTPS redirect, secure cookies; `SECURE_HSTS_PRELOAD` and `TRUST_X_FORWARDED_PROTO` are explicit opt-ins. `manage.py check --deploy` passes apart from preload (deliberately opt-in).
- **Next.js headers** (next.config.ts): CSP "without nonces" per the Next 16 docs (`script-src 'self' 'unsafe-inline'`; nonces would force dynamic rendering for every page); everything else is 'self' only (fonts self-hosted by next/font, no third-party scripts/images), `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests` in production; dev adds `'unsafe-eval'` + the HMR websocket. Also nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, COOP, HSTS in production; `poweredByHeader: false`. Verified in the browser: no CSP violations. The app never uses eval; the only dangerouslySetInnerHTML is the static theme script (`THEME_SCRIPT` in lib/theme.ts, no user input).
- **CORS:** none, on purpose. The browser only talks to the Next.js origin; Django sends no Access-Control-* headers, and cross-origin writes fail the CSRF Origin check (tested).
- **Links from data:** `lib/safe-url.ts`: external links (application links from emails) render only if http(s) (no `javascript:`/`data:`); assistant links render only if internal (`/…`, not `//host` or `/\host`).
- **Tokens:** Fernet at rest since Stage 8; `manage.py rotate_token_key` re-encrypts with the first key of `TOKEN_ENCRYPTION_KEY=new,old` (MultiFernet). Tokens never appear in any API response (tested).
- **Jobs:** `core.tasks.run_job` only runs allowlisted functions (Stage 9).
- **Secrets:** a production-build scan found none of the `.env` secrets in any of the 423 build files and no key-shaped strings in the browser bundle; `NEXT_PUBLIC_API_URL` (unused since Stage 7) was removed from `.env`.
- **Dependencies:** `pip-audit -r requirements.txt` → no known vulnerabilities; `npm audit --omit=dev` → 0. Accepted, dev-only: `braces` (GHSA-vfj7-8cjw-p6xm, via ESLint's fast-glob), with no patched version; npm's "fix" downgrades eslint-config-next to 14. Re-check later.
- Before a public deployment: change the default Postgres password, set `DJANGO_DEBUG=false`, serve over HTTPS, and go through Google's restricted-scope verification (see the Gmail notes above).

## Pre-Stage-11 fixes (4 Oct 2026)

**A. Skills matching + score breakdown**
- Real data showed 43/51 opportunities had no extracted skills list, so skills were always "unknown" with fixed points: adding skills changed nothing.
- Skills now match case-insensitively with synonyms (`skill_aliases.json`, identical copies in `backend/core/domain/` and `frontend/lib/domain/`, test-enforced; e.g. React/React.js/ReactJS, JS/JavaScript, Node/Node.js) as whole words in the title, summary, requirements and the skills list. Aliases that are common English words (go, next, ai) are left out.
- Interests match the built-in signals, the opportunity type ("internships" → Internship) or all of the interest's words in the text.
- Skills are **met** if any match, **unmet** only if the email lists skills and none match, otherwise **unknown**. The checklist shows "Skills not mentioned in email" (or "Add skills to your profile to compare" when the user has none).
- Profile score (`mail/pipeline.py`): interests 40, skills 30, level 15, deadline 15. Unknown checks are **neutral**, i.e. left out of both the points and the maximum. With no known fit checks the score is 50 (0 if the deadline has passed).
- `Opportunity.score_breakdown` (JSON) stores relevance, profile weight, parts, location bonus, fee penalty and score. The details page shows "How this match % is worked out" (collapsible, inside the AI Summary), whose lines add up to the score.
- `manage.py rescore_matches` re-scores without AI calls. On the real account the average went from 50 → 56 %; skills met went from 4 → 6 and interests met from 24 → 32.

**B. Weekly digest**
- The "Weekly AI digest" setting was previously connected to nothing.
- Now: the Celery beat task `notifications.tasks.weekly_digest` runs hourly (minute 9) and creates the notification for users whose local time is Monday 08:00 (`DIGEST_LOCAL_HOUR`), only when the setting is on. Key `digest:<Monday>`, title "Your weekly digest", `link` "/digest".
- `Notification.link` and the serializer's `href` route bell items that aren't about one opportunity.
- `GET /api/digest/` (`core/domain/digest.py`) is computed from the user's own data: new this week, top 3 matches with reasons (open, not applied, no fee), deadlines in the next 7 days, fee warnings, and progress.
- The `/digest` page, plus "Preview digest now" in Settings. No email is sent.

**C. Light theme**
- `Preferences.theme`: dark | light | system, default dark, stored on the account.
- The browser keeps a copy in localStorage `oppora-theme`. An inline head script (`THEME_SCRIPT`) sets `<html data-theme>` before first paint, so there is no flash on any page, including the landing page, and it follows OS changes for System.
- `AppShell` mirrors the account value into the browser on load. Settings applies the theme instantly and reverts if the save fails. The transitions are frozen for one frame during a switch.
- `<html suppressHydrationWarning>` is needed because the script changes the attribute before hydration.
- The viewport `themeColor` follows the OS.
- The browser pane's colour-scheme emulation doesn't fire `change` events, so the live System switch is covered by a unit test instead.
- The hero illustration (night scene in a circular vignette), the Monogram tiles and the Google button are unchanged in light (they sit on their own backgrounds). Inbox swipe backgrounds use `bg-purple/25` / `bg-urgent/25` with `text-ink`. Calendar days outside the month use `text-ink-3` (they previously used ink-3/50, which failed contrast).

## Stage 11 decisions (performance + accessibility audit, 4 Oct 2026)

**Lighthouse** (production build `next start -p 3100`, launch config `frontend-prod`; Dashboard measured with a temporary local session for the demo account, deleted afterwards):

| Page | Mobile (default 4× CPU) | Mobile (calibrated 2× CPU) | Desktop | A11y / Best practices / SEO |
|---|---|---|---|---|
| Landing | 83 → **93** | **97** | **99** | 100 / 100 / 100 |
| Dashboard | 60 → 82 | 75 → **91** | **100** | 100 / 100 / 100 |

- **Why calibrated:** this laptop (i5-1334U, ~44 % busy with the dev stack) scores 813–1039 on Lighthouse's CPU benchmark, and Lighthouse itself warns "the tested device appears to have a slower CPU than Lighthouse expects". Lighthouse's throttling docs put that bracket at 2× to emulate a mid-tier phone (4× assumes a 1500–2000 high-end desktop).
- **The cap is the framework, not the app:** the near-empty /contact page (94 elements) scores 80 under 4×, because React plus the Next runtime cost ~850 ms of script at 4× here.
- Re-check on a faster machine or with PageSpeed Insights after deploying.

**What changed**
- **Intent prefetching** (`components/ui/intent-link.tsx`, the "hover-triggered prefetch" pattern from the Next 16 prefetching guide). Shell nav, stat cards, opportunity rows/cards, deadline items and dashboard links now prefetch on hover, focus or touch start, instead of the 14 viewport prefetches that fired while the dashboard was still loading. This took dashboard TBT from 600 ms to 130 ms (2×).
- **Lazy panels** (`components/oppora/lazy-panels.tsx`, `next/dynamic`): the assistant and notifications drawers load on first open and stay mounted after that (the conversation persists). Their code is prefetched when the browser is idle, 4 s after load. `FloatingAIButton` moved to its own module and `useNotifications` to `lib/hooks/use-notifications.ts` so the shell no longer pulls in the panels.
- **Compositor-only animations:**
  - The AI orb's pulse no longer animates `box-shadow`; it uses scale plus a separate glow layer animating opacity/transform.
  - Skeleton shimmer is a `::after` moved with `transform` instead of animating `background-position`.
  - Together these cut dashboard "Rendering" from 1.6 s to 0.07 s (4×).
- **Hero art as a static file:** `public/hero-scene.svg` (the ~480-shape night scene, generated once from the old procedural SVG; edit the file directly) is rendered with `next/image` (`priority`, `unoptimized`, since it's an SVG). Landing DOM went from 823 to 297 nodes. These are the only images in the app; icons and the logo are inline SVG, and there are no raster images to optimize.
- The hero text no longer fades in (it's the LCP element and must paint with the HTML).
- `<Toaster/>` moved from the root layout to the signed-in layout, so the landing page doesn't load sonner.

**Caching**
- Hashed `/_next/static` assets are served `public, max-age=31536000, immutable` (Next default).
- `hero-scene.svg` is cached for 1 day with stale-while-revalidate for 7.
- API responses stay `no-store` (per-user data, Stage 10).
- No server-side response cache: every API endpoint answers in ~10–30 ms locally.

**Queries**
- Every main endpoint runs a constant 0–6 SQL queries.
- `tests/test_performance.py` doubles all opportunities (with deadlines, applications, saves and emails) and asserts that no endpoint's query count grows (no N+1), with a ceiling of 12.

**Accessibility (keyboard + screen reader)**
- A scripted audit on every page (production build) checked:
  - every tab stop has an accessible name;
  - no outline is removed without a replacement;
  - no nested interactive elements, duplicate ids, unlabelled images or exposed decorative SVGs;
  - one h1 and no heading-level skips, with one `main`, plus nav/header landmarks, a skip link and `lang`.
- Fixed: Insights went h1 → h3, so a visually hidden "Highlights" h2 was added. The StatCard ring (drawn by the card via `has-[a:focus-visible]`) was confirmed in the built CSS.
- **Dialogs** (assistant, notifications, after lazy loading): labelled and described; focus moves inside; the background is hidden from screen readers; Escape closes and focus returns to the trigger. The assistant input is labelled "Ask Oppora AI" and answers are in a live region.
- Contrast: see the light-theme pass (both themes, 3 widths).
- Real NVDA/VoiceOver and physical keyboard runs weren't possible here (the browser pane couldn't take synthetic key presses), so they were checked through the accessibility tree and DOM instead. Worth a quick manual pass with NVDA before launch.

## Stage 12 decisions (final polish, 4 Oct 2026)

**Consistency pass**
- A code audit for anything bypassing the design system found:
  - no raw colours left in classes (brand art excepted: hero scene, Monogram tiles, AI orb, Google button);
  - every radius on the scale (one 6px chip moved to `rounded-sm`);
  - motion only 200/300 ms;
  - icon sizes following text size.
- **Shadows:** 14 one-off glow/focus values were consolidated into named per-theme tokens (`--focus-halo`, `--glow-active`, `--glow-ai`, `--shadow-fab`, `--shadow-fab-hover`).
- **Type:** arbitrary sizes became tokens (`text-page` for every page h1, `text-stat`, `text-body` 15px, `text-micro` 12px). The details title and the dashboard greeting now use the same h1 size as every other page. The only arbitrary size left is the 11px bottom-nav label (Stage 6 decision for 360px).
- **Toasts:** successes are short with no period ("Profile saved"); errors are sentences starting "Couldn't …" ending with "Please try again." ("We couldn't …" variants normalized).
- Checked in both themes: modals, menus, select popovers, toasts, and the empty / error / Gmail-disconnected states (`?mock=`). Every scan passes 4.5:1.
  - The pane can leave CSS transitions unfinished, so a scan right after a theme flip has to finish them first (`document.getAnimations()`).

**Bugs found and fixed**
- The header account menu's **Sign out** only showed a toast and navigated: it never ended the session. Sign-out is now one hook (`lib/hooks/use-sign-out.ts`) shared by the header and Settings, calling the API before leaving; tested.
- **Journey gap:** the details page had no way to set a deadline reminder (only the ⋯ menu and Deadlines). It now has **Set Reminder / Reminder set** next to Save (desktop) and a bell button in the mobile sticky bar, shown only for open deadlines.
- Reminder toggles (details + DeadlineItem) are named after their visible text plus the title (WCAG 2.5.3 label-in-name), with `aria-pressed` for the state. They used to say "Remove reminder for …" while showing "Reminder set".
- Assistant greeting grammar: "1 opportunity that matches".

**End-to-end journey**
- `backend/tests/test_journey.py` runs the whole journey through the real API, pipeline and scheduled task. Only Google's endpoints, the Gmail API and the AI model are faked. Steps:
  - landing sign-in → Google consent (gmail.readonly only) → callback;
  - first scan → one AI call (the promotion is pre-filtered) → dashboard;
  - details (grounded fields, null location, breakdown adds up) → save → apply;
  - reminder at 09:00 the day before (no duplicates on re-run) → assistant answer linking the opportunity.
- Browser walk-through on the demo account: details → Set Reminder → Apply → Mark as applied → the reminder at 09:00 the day before on the calendar → the assistant lists and links the deadlines. Demo data was restored afterwards and re-seeded (`seed_demo`).
- The live sign-in redirect was checked: it goes to Google with exactly openid/email/profile/gmail.readonly, PKCE S256 and the Next.js callback. The real Google sign-in itself needs the user (passwords are never entered by the assistant).
- On the real account, the queue left over from the free-tier limit has drained by itself: 264 processed, 241 pre-filtered, 0 queued, 57 opportunities.

**README** rewritten: overview, Windows quick start, manual setup (macOS/Linux), configuration table, a 2-minute demo script, how it works, privacy & security, checks, troubleshooting, status and limits. In the demo script, "Frontend Developer" is the one seed opportunity that's open and not applied, and it's already saved, so the script saves "UI Engineer" from the list instead.

## Free deployment decisions (4 Oct 2026; guide: docs/deploy.md)

**Hosting**
- Vercel (frontend, root `frontend`, env `BACKEND_ORIGIN`), Render free (`render.yaml` blueprint; gunicorn, 1 worker × 4 threads; migrations in the build), Neon (Postgres, `conn_health_checks` because it pauses), Upstash (Redis: rate-limit counters only; `_cache_url` keeps the URL as-is because hosted Redis has no database 1). No card anywhere.
- GitHub Actions hourly at :17 UTC (≈730 of 2,000 free private-repo minutes). Every 10 minutes would exceed the free minutes.
- **Same-origin as before:** Vercel proxies `/api/*` to Render, so cookies are first-party and there's no CORS. Vercel waits up to 120 s for the backend, which covers a 30–60 s cold start.
- `NUM_PROXIES=3` + `PROXY_SECRET` (same value in Vercel and Render). Measured 23 Oct 2026 with fake
  X-Forwarded-For entries: straight to Render the chain ends "visitor, Cloudflare, Render's relay" (visitor 3rd from
  the end, can't be faked); through the website Vercel adds a step, so with `NUM_PROXIES=2` every visitor looked like
  a Cloudflare address and visitors behind the same Cloudflare edge shared one sign-in limit. Fixed with the signed
  header (HomeHaat's design). `RENDER_EXTERNAL_HOSTNAME` is added to `ALLOWED_HOSTS` automatically. `FRONTEND_ORIGIN` is the Vercel URL and is trusted for CSRF (`CSRF_EXTRA_ORIGINS` for extras). Local `.env` stays on `http://localhost:3000`.
- **Production refuses to start** unless the secret key is ≥ 50 characters, `TOKEN_ENCRYPTION_KEY` and `DATABASE_URL` are set, `CRON_SECRET` is ≥ 32 characters (if set), and `FRONTEND_ORIGIN` is https.
- Secrets come from `manage.py generate_secrets`, run by the user in their own terminal. Render's generated values are only 44 characters, too short for Django's 50-character check.

**No always-on worker**
- `JOBS_BACKEND=thread`. `run_sync(user, seconds)` is time-boxed (`SYNC_BATCH_SECONDS`, 480 in production; 0 = until done, locally). It stops between emails; every email is committed as it finishes, so a sleeping instance loses nothing and the next Scan or scheduler call continues.
- **`POST /api/cron/`** (Bearer `CRON_SECRET`, `hmac.compare_digest`, auth rate limit, 404 when unset) answers 202 and runs `core.scheduler.tick` in a thread:
  - demo refresh;
  - reminders, briefing, digest;
  - `sync_accounts(CRON_BATCH_SECONDS)`: each account gets an equal slice of the remaining time, longest-waiting first, via `sync.run_scheduled`.
- Answering immediately keeps each GitHub job to seconds; a synchronous run would bill minutes.
- Scheduled notifications fire at **or after** their local hour (`>=`). Their date-stamped keys keep them once a day, so late or skipped hourly runs (and Celery beat) still deliver.
- `GET /api/health/` (no DB) is pinged by the landing page (`WakeBackend`) to start waking Render early. `request()` retries **GETs only** on 502/503/504 (3 s, 8 s, 15 s); writes are never repeated.

**AI fair share**
- `AIUserUsage` (user, provider, quota day). `ai.client.for_user()` (contextvar) wraps each sync.
- `_reserve` checks the global `AI_REQUESTS_PER_DAY`, then the account's `fair_share()` = daily budget ÷ connected non-demo accounts. Over its share → `DailyLimitReached`, and the emails stay queued for the next quota day.
- `AI_FAIR_SHARE=false` turns it off.

**Public read-only demo**
- `GET /api/auth/demo/` ("Try the demo" on the landing hero and CTA): `ensure_demo()`, then logs out any real session and signs into `DEMO_USER_EMAIL`.
- `DemoReadOnlyMiddleware` refuses every non-GET `/api/` request from the demo user with 403 `demo_read_only`. Only logout and the assistant are allowed. Gmail connect for the demo redirects to `gmail_error=demo_read_only`.
- `DEMO_READ_ONLY` defaults to `not DEBUG`: locally the demo account stays writable for testing (`seed_demo` resets it).
- `/api/auth/me` returns `isDemo` and `readOnly`.
- **Frontend:**
  - `DemoBanner` on every page;
  - `notifyReadOnlyDemo()` shows one "This is a read-only demo" toast and silences the action's own error toast for 2 s (the action still rolls back);
  - the demo's theme choice stays in the visitor's browser (no ThemeSync, local only).
- **No Node in production:** `core/demo_seed.json` (from `manage.py export_demo_template`) is shifted by whole days to today by `core.demo.shifted()`. This covers ISO dates, UTC timestamps and "4 October"-style dates in email text (nearest year). A test proves it equals a fresh export on 5 dates. **Re-run `export_demo_template` after editing seed.ts** (a test fails if the file is stale).
- The demo reloads when the day changes (`GmailConnection.demo_seeded_for`).

**Sign-in for non-test users**
- In Testing mode Google blocks them on its own "Access blocked" page, which Oppora can't change.
- The landing page says sign-in is invite-only and offers the demo. If Google redirects back with `access_denied`, the notice says only invited accounts can connect Gmail.

**Copying data to production**
- `manage.py copy_account --email … [--yes] [--replace]` with `TARGET_DATABASE_URL` set in the terminal (the `target` alias exists only then, and in tests). Dry run by default; refuses to overwrite without `--replace` or to copy the demo; checks the target is migrated.
- Copies the profile, preferences, opportunities (+ deadlines, applications, interviews), emails + classifications, saved items, hidden senders, notification state and the ProcessedMessage log, with the same UUIDs and timestamps (`auto_now` is paused during the copy). Already-analysed emails are therefore never re-sent to the AI, and queued ones continue.
- Never copied: Google tokens (connection left disconnected; history_id kept), AI usage counters, sessions. The user-created signal now writes to the same database alias.

**Privacy**
- The page states plainly that relevant emails go to **Gemini's free tier** (subject, sender, date, cleaned text ≤ 4,000 characters; never attachments).
- It also says that under Google's terms Google may use the content and human reviewers may read it, and that Google advises against sending personal information to unpaid services. Settings links to the page.

## AI consent, privacy filter, demo name (5 Oct 2026)

**Consent before any scan**
- `UserPreference.ai_mode`: `ask` (default) | `ai` | `rules`, plus `ai_mode_set_at`. The API exposes it as `preferences.ai.mode` (only `ai`/`rules` can be set) and `/api/auth/me` `aiMode`.
- A data migration marked accounts that already had AI-analysed emails as `ai` (the owner chose it by building Oppora). The demo seed is `ai`.
- **Where the choice is enforced:**
  - the Google callback sends users without a choice to `/welcome?next=…` instead of starting a scan;
  - `POST /api/sync/` answers 409 `ai_choice_required`, and the frontend routes to `/welcome`;
  - the scheduler (`run_scheduled`), Celery `sync_all` and `resume_queued` skip such accounts;
  - the pipeline raises `AIChoiceRequired` (emails stay queued).
- **`/welcome`** (route group `(onboarding)`, no app shell) shows the statement: subject, sender and a cleaned, *shortened* copy go to Gemini's free tier, where Google may review it. It says "shortened copy (up to 4,000 characters)" rather than "snippet", which would be inaccurate.
  - It also lists what's removed and never sent, plus the "Use without AI" trade-off.
  - Its buttons are **Continue** / **Use without AI**. The choice is saved first; only then does the first scan start.
  - `next` must be a same-site path.
- `ConsentGate` in AppShell redirects anyone still on `ask` (not the demo). Settings → Privacy has "How Oppora reads your emails" (With AI / Without AI). Every email reads the mode fresh from the database, so a switch applies to the very next one.
- **Rules-only** (`mail/rules.py`, model_name `rules`):
  - the type comes from keywords (subject first);
  - the organization from the sender's display name, the title from the subject;
  - a deadline only right after a deadline phrase (within 60 characters; years inferred forward);
  - the link near apply/register, the eligibility sentence, the user's matched skills, and `rule_fee()`;
  - everything else stays null.
  - No AI and no budget used. Fee re-checks use `rule_fee` in rules mode.

**Personal details removed before the AI** (`ai/redact.py`)
- Applied to the subject, body, sender and fee sentences: email addresses → `[email]`; phones (10–15 digits, not dates) → `[phone]`; OTP/verification/login codes and "123456 is your …" → `[code]`; link secrets → `[token]`; the user's name (full name incl. initials, then each part ≥ 2 letters, whole words) → `[name]`.
  - Link secrets are sensitive query parameters (token/code/key/sig/session/email/…) and secret-looking values. Path tokens are hidden only on sign-in, reset, verify or unsubscribe-style URLs, so Google Forms and job links stay intact.
- The sender goes as display name + domain. The system prompt no longer contains the user's name (only interests, for relevance), and it explains the placeholders.
- Grounding still checks against the original email. A cleaned link the AI returns is mapped back to the email's own link, which is stored locally and never sent.
- `tests/test_privacy.py` proves an AI request contains none of 13 personal details from a realistic email, while dates, amounts and form links survive.

**Demo name**: the seed user is now **Alex** (`alex@example.com`, id `u_alex`; the `DEMO_USER_EMAIL` default changed). The template was re-exported. The old local demo row was removed and re-seeded.

## Waking a sleeping backend (5 Oct 2026)

- **Measured on production:** while Render's free instance wakes up (~45 s), Vercel's proxy answers **502 within about 1 second**; it doesn't wait. The old client retry (3 retries over ~26 s) gave up before the server was up, so sign-in and first page loads failed.
- **`lib/wake.ts`**:
  - `waitForBackend()` polls `GET /api/health` (2, 3, 5, 8, 10, 10, 15, 15, 20 s apart, each check with a 20 s timeout, about 90 s in total). Concurrent callers share one wait.
  - It sets a small store (`idle` / `waking` / `failed`) that `WakingNotice` shows below the header: "Waking up the server, this can take up to a minute…", or "taking too long" for 8 s. `WakingNotice` is mounted in the root layout and is an always-present `role=status` live region.
- **`request()`:**
  - Each fetch has a 90 s timeout.
  - On 502/503/504 or a timeout it waits for the server and retries, at most 3 times.
  - **Reads** are always retried; a 1/2/4 s pause applies when the server was already up.
  - **Writes** are retried only when the server was asleep: it can't have run the first attempt, so nothing is ever saved or applied twice. If it was awake, the error is shown instead.
  - If the server never wakes, the request fails with "taking too long to wake up".
- **`WakeLink`** is used for everything that leaves the page for the backend: Sign in with Google, Get Started, Try the demo, "Use your own Gmail". It waits for the backend before navigating, so Google's callback never lands on a sleeping server. It's still a real `<a>` (no JS → plain link; Ctrl/⌘-click untouched), with `aria-busy` while waiting.
- **`/api/health/`** has no auth, no DB, no session and **no throttle**: the rate limiter would hit Upstash on every poll. A test asserts 0 queries, no cache access and no cookies over 100 calls.
- **The keep-awake cron was not added.** Every 10 minutes on GitHub Actions is ~4,300 minutes a month, which exceeds a private repo's 2,000 free minutes (the hourly scheduler already uses ~730). That would block all workflows, the scheduler included, or bill a card. GitHub's scheduled runs are also delayed by hours, so they can't keep anything awake reliably.
  - Free alternatives: an external pinger (cron-job.org or UptimeRobot, no card), or making the repo public (unlimited Actions minutes).
  - Render's free 750 hours a month cover one service awake 24/7 (≤ 744 h). `/api/health/` doesn't touch Neon, so the database can still pause.

## Honest sync status + AI-error handling (6 Oct 2026)

- **Bug (test users: "Sync completed", no opportunities):**
  - Gemini errors other than 429, 401/403 or 5xx (e.g. **400 "API key not valid"**, 404 unknown model, 400 unsupported region) were plain `AIError`s.
  - `process_queue`'s catch-all then marked **each email** `needs_review`/`error` and moved on. The run ended "completed" with 0 queued and 0 opportunities, and those emails were never retried.
  - The owner's account looked fine only because its data was copied from the laptop.
- **Fix (`mail/sync.py`):**
  - Any AI-wide problem now **stops the run and leaves the emails queued**, recording `GmailConnection.sync_wait_reason` + `sync_wait_detail` (migration `accounts.0007`). This covers the daily budget (`ai_quota`), fair share (`ai_share`, via the new `ShareUsedUp`), any other AI refusal (`ai_unavailable`, with the provider's short error), 3 transient failures in a row (`ai_busy`) and no consent answer (`ai_choice`). A time-boxed batch reports `time_box`.
  - Only per-message problems (and `InvalidOutput`) mark that one email failed.
  - `requeue_ai_failures()` runs at the start of every sync: emails whose `last_error` matches `^(Gemini|OpenAI) \d{3}` go back to the queue, so accounts hit by the bug heal themselves on their next Scan or hourly run.
- **Status API** (`SyncStatusSerializer`): adds `waitReason`, `waitDetail`, `resetsAt` (next midnight Pacific, for quota/share) and mailbox totals from one GROUP BY on ProcessedMessage: `fetched`, `filtered` (pre-filter), `analysed` (done + needs_review), `failed`, `found` (opportunities). The demo uses its sample totals.
- **Sync card** (`describeSync()` in `sync-status.tsx`):
  - "Sync completed" only when nothing waits, with "Fetched X emails · analysed Y · found Z opportunities".
  - Otherwise it names the reason: "Analysis paused: today's AI limit is used up" or "…your share…" plus "N emails waiting · continues automatically after <local reset time>"; "AI analysis isn't working right now · <Gemini error>"; "The AI is busy right now"; "Analysing your emails in batches".
  - Waiting uses an hourglass and problems use a warning icon. Long text wraps (line-clamp-2). The completion toast uses the same wording.
- **Answers from the code:** the first sync scans `newer_than:60d` (`GMAIL_INITIAL_SYNC_DAYS`), up to 500 messages, oldest first. **Scan Gmail runs the AI immediately** in a background thread for up to `SYNC_BATCH_SECONDS` (480 s, about 70 AI calls at 9/min); the hourly scheduler continues the rest.
- **Shared Gemini quota:** the laptop's Celery beat (`sync_all` every 30 min, `resume_queued`) and production use the **same `GEMINI_API_KEY`**, but each counts its own `AIUsage`. Gemini's real per-project daily quota is shared. Locally, 125 of 126 analysed emails used the fallback model.
- **`manage.py sync_report [--database target]`**: a read-only per-account report (masked emails; counts, outcomes, grouped error types, AI usage; never email content) for diagnosing production via `TARGET_DATABASE_URL`.

## GuardRail connection (21 Oct 2026)

GuardRail is Rasmitha's separate security dashboard (repo `guardrail`). Oppora now reports security events to it;
**off unless `GUARDRAIL_ENABLED=true`, `GUARDRAIL_URL` and a 32+ character `GUARDRAIL_SECRET` are set**
(= GuardRail's `INGEST_SECRET_OPPORA`; `npm run connect:oppora` in guardrail writes them locally, values never shown).

- `backend/guardrail/` (same design as HomeHaat's): `client.py` `report()` only queues a masked event and returns; a
  background thread signs batches (HMAC-SHA256 over `v1:timestamp:nonce:body`) and POSTs them with a **2 s timeout**;
  GuardRail down / 5xx / 429 → `OutboxEvent` table (max 5,000), resent after the next good send, by Celery Beat every
  10 min (`guardrail.tasks.flush_outbox`) and by the hourly scheduler run (`core.scheduler.tick`); other 4xx → dropped.
  Every event has a `uid` (retries stored once) and `actor_id` (HMAC of the email: tells accounts apart, never the email).
- What is reported: successful sign-ins (Django's `user_logged_in` signal; the shared **demo account is never
  reported**), failed Google sign-ins except Cancel / timeout (`accounts.google.HARMLESS_ERRORS`; e.g. a forged
  `state` → `login_failed` reason `state_mismatch`), sign-in rate-limit hits (`core.throttling.auth_rate_limited`),
  any API 429, scanner paths (`/.env`, `/wp-admin`…), a wrong scheduler secret (401 on `/api/cron/`), and 403s for
  signed-in non-demo users (the demo's read-only refusals are normal and not reported).
- Visitor IP = the same one Oppora's rate limits use (DRF `get_ident`, `NUM_PROXIES`). No country: Oppora's frontend
  doesn't pass one with a secret, so it couldn't be trusted.
- Tests: `tests/test_guardrail.py` (14). The conftest switches GuardRail off for every test unless the test turns it
  on, so a developer's `.env` never makes tests send anything. All 267 backend tests pass.
- **Finding (21 Oct 2026, from GuardRail's attack simulator):** DRF's `SimpleRateThrottle` reads the request history
  from the cache and writes it back in two steps, so requests arriving at the same moment can all pass. Locally, 75
  sign-in requests sent 8 at a time got **70 through a 20/min limit** (one at a time: exactly 20). This affects every
  DRF throttle here (auth, assistant, sync). **Fixed (21 Oct 2026):** `core/throttling.py` `AtomicRateThrottle`.
  In plain words: instead of "read the list, add my request, write it back" (which eight requests can do at the same
  moment, each seeing the old list), every request now does one indivisible step: "add 1 to this minute's counter and
  tell me the new total". Redis does that step for one request at a time, so the 21st request always sees 21 and is
  refused. The counter is created with an expiry and disappears by itself after its window (a fixed window: around
  a window boundary up to twice the limit can pass, the usual trade-off). Rates, per-user/per-IP keys, Retry-After,
  the 429 shape and fail-open are unchanged. Proof: `tests/test_throttle_race.py` (75 parallel sign-ins through a
  slow cache: exactly 20 pass; before the fix 75 did), and on the real Redis 75 requests 8 at a time → **20 allowed,
  55 blocked**. 270 backend tests pass.
  *Say it:* "An attack simulator showed parallel requests slipped past my rate limit, because the check was
  read-then-write; I replaced it with an atomic Redis increment, so 75 parallel sign-ins now get exactly 20 through."
