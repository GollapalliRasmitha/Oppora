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
- **Stage 8 — Google sign-in + Gmail sync + AI pipeline (Gemini free tier): done** (awaiting "continue"). Live Google/Gemini check pending the user's Google Cloud setup (docs/google-cloud-setup.md).
- Next: Stage 9 — Celery + Redis background processing and live sync status.
- Profile skills: keep the demo skills for now (user decision, Stage 3 review).

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
  layout.tsx              fonts (Plus Jakarta Sans; Roboto only for the Google button), <Toaster/>
  globals.css             DESIGN TOKENS (CSS vars + Tailwind @theme) and shared utilities
  icon.svg                favicon (logo mark)
  (marketing)/            public: landing page, /privacy, /terms, /contact
  (app)/layout.tsx        AppShell for every signed-in page
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
Local dev on Windows: `powershell -ExecutionPolicy Bypass -File .\start-oppora.ps1` (Docker + migrations + Django + Next.js + browser; `-RefreshDemo` re-runs seed_demo, `-NoBrowser` skips the browser). Manual: `docker compose up -d` → `manage.py migrate` → `manage.py seed_demo` → `manage.py runserver 127.0.0.1:8000` + `npm run dev` (or the `backend` / `frontend` entries in `.claude/launch.json`). Root `README.md` explains it; `docs/google-cloud-setup.md` is the beginner Google Cloud + Gemini walkthrough.

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

| Token | Value | Tailwind |
|---|---|---|
| Background | `#070A1A` | `bg-bg` |
| Raised surface | `#0F1336` | `bg-surface` |
| Glass / glass strong | `rgba(255,255,255,.04)` / `.06` | `bg-glass`, `glass`, `glass-strong` utilities |
| Border / strong | `rgba(165,160,255,.14)` / `rgba(170,160,255,.30)` | `border-line`, `border-line-strong` |
| Text / secondary / muted | `#EEF0FF` / `#B0B6DA` / `#8189B5` | `text-ink`, `text-ink-2`, `text-ink-3` |
| Purple / violet / blue / pink | `#7C3AED` / `#A78BFA` / `#60A5FA` / `#F472B6` | `purple`, `violet`, `blue`, `pink` |
| Indigo (gradient mid) | `#4F46E5` | `indigo` |
| Success | `#34D399` | `success` |
| Urgency | red `#F87171` ≤3d · orange `#FB923C` 4–10d · blue `#60A5FA` >10d | `urgent`, `soon`, `later` |
| Brand gradient | `#7C3AED → #4F46E5 → #2563EB` (135°) | `bg-brand` |
| Headline gradient | violet → blue → pink | `text-gradient` |
| AI border gradient | purple → blue → pink | `ai-border` (needs `relative`) |
| Radius | 8 / 12 / 20 / pill | `rounded-sm` / `rounded-md` / `rounded-card` / `rounded-full` |
| Type | hero 40→70px/800, section 32→46px/800, card 16–20/700, body 15–18/400, meta 13/500 | `text-hero`, `text-section`, `text-meta` |
| Spacing | Tailwind default 4px scale | |
| Motion | 150–300ms; `animate-float`, `animate-pulse-orb`, `animate-fade-up`, `animate-drawer-in`, `animate-shimmer` | all disabled under `prefers-reduced-motion` |
| Layout | sidebar 230px (desktop) / 72px rail (tablet) | `--sidebar-w`, `--sidebar-w-collapsed` |

Brand-gradient end is `#2563EB` (not `#3B82F6`) so white button text keeps ≥4.5:1 contrast. Muted text `#8189B5` measures ≈5.3:1 on the surface.

## Components

`components/ui`: Button (primary/secondary/ghost/danger; sm keeps a 44px hit area), IconButton (required `label`), GlassCard, Badge, Input, SearchBar, Tabs, FilterChips, Select (Dropdown/Select), Dropdown (menu), Modal, Drawer (right panel; full-screen on mobile), Toast (`toast.success/error/info`; toasts with an action stay 8s), Skeleton, EmptyState, ErrorState, Swipeable (touch-only swipe actions; always paired with buttons), `useReturnFocus` (Drawer/Modal put focus back on whatever opened them), SwitchRow (labelled switch, whole row is the target), TagInput (Enter/comma adds, × removes), MultiChips (multi-select chips).

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
- **Charts** follow the dataviz skill: palette validated on the #0F1336 surface. Trend bars = one hue (`#A78BFA`, hover `#C4B5FD`); the progress donut is an ordered sequence, so an ordinal violet ramp `#EDE9FE → #C4B5FD → #8B5CF6 → #5B21B6` (validator: all checks pass). The violet/blue token pair failed CVD separation, so it is not used as a categorical pair. Every chart has a text alternative, hover/focus tooltips and a table or legend with values. Viz colours live in `components/oppora/charts.tsx` (`VIZ`), not as design tokens.
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
- **Preferences** (`Preferences`, `GmailConnection` types; UserPreference + GmailConnection models): toggles save instantly with a toast and roll back on failure. AI recommendations off → Home/Insights show RecommendationsOffCard and the AI notification is hidden. Minimum match, preferred locations, personalization and categories are stored for the Stage 8 ranking (not applied to existing lists). Theme is dark-only; language English-only.
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
