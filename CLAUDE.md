# Oppora — project memory

Personal AI agent that reads a user's Gmail, finds opportunities, extracts deadlines, ranks them and helps the user act. Full brief: `PROMPT.md`. Visual reference: `design/reference.png`.

**Read this file at the start of every session and keep it current.**

## Current stage

- Stage 1 — Foundation + Landing + Dashboard: done.
- Stage 2 — Opportunities + Opportunity details: done.
- Stage 3 — Deadlines + Inbox: done.
- Stage 4 — AI Insights + Calendar: done.
- Stage 5 — Settings + Notifications + AI assistant: done.
- **Stage 6 — UX review pass: done** (awaiting "continue").
- Next: Stage 7 — Backend (Django models, APIs, tests, seed loader; switch lib/api to the API).
- Profile skills: keep the demo skills for now (user decision, Stage 3 review).

## Working rules (from PROMPT.md §0)

- One stage at a time; at the end: lint + type-check + tests, check earlier pages, commit `stage-N: …`, summarise, **stop**.
- One design system. Never restyle a component for one page — extend the design system first.
- Ask before: paid services, changing a design token, breaking data-model changes, more Gmail scopes.
- Never invent facts. Unknown → `null` → "Not mentioned in email".

## Repo layout

```
/frontend     Next.js 16 (App Router) + TS + Tailwind v4 + Radix (shadcn-style) + Lucide
/backend      Django + DRF (Stage 7 — placeholder for now)
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
lib/mock/seed.ts          THE seed file: createSeed(today) (later loaded into the DB); store.ts = in-memory mock DB
lib/api/*                 typed service functions — the ONLY data entry point for components
lib/hooks/                useResource (loading/error/retry/optimistic), useOpportunityActions, useEmailActions,
                          useUrlParams (page state in the query string), useScanGmail, useNow
tests/                    Vitest + Testing Library
```

Scripts (in `/frontend`): `npm run dev | build | lint | typecheck | test | check` (`check` = lint + typecheck + tests).

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

- **Data layer:** components never `fetch`. They call `lib/api/*`, which return typed mock data via `mock()` (latency + dev switches). Stage 7 swaps the bodies for real API calls; signatures stay.
- **Dev state switches:** append `?mock=error`, `?mock=empty`, `?mock=slow` or `?mock=gmail` to any app URL to preview error / empty / loading / Gmail-disconnected states. `?mock=gmail` = expired Gmail access: Gmail-backed data fails with the Gmail error, while account, preferences and sync status (`mock(…, { gmail: false })`) still load and show "Needs reconnect" / "Sync failed", so Settings can reconnect.
- **Seed is relative to today:** `createSeed(today)` expresses every date as an offset, so targets and days-left hold on any demo date (tests run it across several dates incl. midnight and month/year boundaries). Past timestamps use offsets ≤ -1 day so nothing is ever in the future.
- The mock store resets on a full page reload (client-side navigation keeps changes).
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
- Landing "Sign in with Google" and "Get Started" link to `/dashboard` until OAuth lands in Stage 8.
- **AI assistant** (`lib/domain/assistant.ts`, mock until Stage 8): answers only from the user's stored opportunities, emails and interviews; every answer lists the opportunities/emails it used as links (clicking closes the panel); when the data doesn't contain the answer it says so and offers prompts. The 5 brief prompts are always visible (list before the first question, chip row above the input after). "Why is this opportunity relevant?" uses the opportunity page you're on, otherwise asks which. Conversation persists while navigating; Clear resets it.
- Notifications are derived from data and filtered by settings (New opportunities, Deadline reminders, AI recommendations); the bell refreshes each time it opens.
- **Preferences** (`Preferences`, `GmailConnection` types; in the mock store): toggles save instantly with a toast and roll back on failure. AI recommendations off → Home/Insights show RecommendationsOffCard and the AI notification is hidden. Minimum match, preferred locations, personalization and categories are stored for the Stage 8 ranking (not applied to existing lists). Theme is dark-only; language English-only.
- Profile save (name, interests, skills, experience level) re-runs `explainMatch` on every opportunity so AI Summaries stay truthful.
- Gmail: Manage (scopes, read-only, 60-day first scan, reconnect), Disconnect (confirm; revokes + deletes tokens; opportunities stay). Scans need a connected Gmail — otherwise the Gmail-error toast with "Reconnect Gmail" (`useScanGmail`, shared by every Scan Gmail button and the sync button).
- Delete my data (confirm): deletes opportunities, emails, interviews, notification state, disconnects Gmail, resets sync to "Not synced yet". Account and preferences remain.
- Interview `end` is nullable — the Swiggy invitation gives a start time only, so no end time is shown.
- OpportunityRow uses container queries (`@container` on the list): full row ≥768px of list width, compact below.
- `.claude/launch.json` (repo root) starts the frontend dev server for previews.
- Next.js dev indicator is off (`devIndicators: false`).
- Seed has 7 follow-up emails (application received, team reminders, practice rounds, info sessions…) linked to existing opportunities, spread across the last 30 days. They add no opportunities, so the dashboard targets are unchanged (inbox: 27 emails, 5 unread).

## Seed targets (verified by `tests/seed-targets.test.ts` on several dates)

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
