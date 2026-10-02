# Oppora — project memory

Personal AI agent that reads a user's Gmail, finds opportunities, extracts deadlines, ranks them and helps the user act. Full brief: `PROMPT.md`. Visual reference: `design/reference.png`.

**Read this file at the start of every session and keep it current.**

## Current stage

- **Stage 1 — Foundation + Landing + Dashboard: done** (awaiting "continue").
- Next: Stage 2 — Opportunities + Opportunity details.

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
  (app)/{opportunities,opportunities/[id],deadlines,inbox,insights,calendar,settings}/
                          placeholder pages (UpcomingPage) until their stage
components/ui/            generic primitives (no Oppora domain knowledge)
components/oppora/        Oppora components (domain-aware) + app shell
components/landing/       landing-page sections + hero illustration
lib/domain/               types.ts, dates.ts (days left, urgency), stats.ts (all computed numbers)
lib/mock/seed.ts          THE seed file (later loaded into the DB); store.ts = in-memory mock DB
lib/api/*                 typed service functions — the ONLY data entry point for components
lib/hooks/                useResource (loading/error/retry/optimistic), useOpportunityActions, useNow
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

`components/ui`: Button (primary/secondary/ghost/danger; sm keeps a 44px hit area), IconButton (required `label`), GlassCard, Badge, Input, SearchBar, Tabs, FilterChips, Select (Dropdown/Select), Dropdown (menu), Modal, Drawer (right panel; full-screen on mobile), Toast (`toast.success/error/info`), Skeleton, EmptyState, ErrorState.

`components/oppora`: Logo/LogoMark, AIOrb, AICard, Monogram (letter tile instead of company logos), PriorityBadge, DeadlineIndicator (stacked | pill, always writes "N days left"), MatchMeter, StatCard (+Skeleton), OpportunityRow (+Skeleton, ⋯ menu; container-query layout), StatusBadge, NotificationItem, NotificationsPanel, SyncStatus (+useSyncStatus), Sidebar, Header, MobileBottomNav, FloatingAIButton, AIAssistantPanel, AppShell, ShellProvider/useShell, PageHeader, UpcomingPage, Avatar, GoogleSignInButton.

Still to build in their stages: OpportunityCard (S2), EmailCard (S3), CalendarEvent (S3/S4), charts (S4).

## Decisions

- **Data layer:** components never `fetch`. They call `lib/api/*`, which return typed mock data via `mock()` (latency + dev switches). Stage 7 swaps the bodies for real API calls; signatures stay.
- **Dev state switches:** append `?mock=error`, `?mock=empty` or `?mock=slow` to any app URL to preview error / empty / loading states.
- **All numbers are computed** in `lib/domain/stats.ts` from the seed and today's date (`lib/clock.ts`). Nothing is hard-coded in the UI.
- "This week" for trends = the last 7 days. "Deadlines this week" / "coming up soon" = deadlines in the next 0–7 days. Urgent = ≤3 days.
- Strong match = match ≥ 88 %, not yet applied, deadline not passed. Drives the AI recommendation, assistant greeting and notifications.
- Application status: `null` (not started) | `in_progress` | `applied`. Saved is a separate flag, so Applied 8 + In progress 3 + Saved 7 can all be true with 12 opportunities.
- "Not interested" hides an opportunity everywhere (`dismissed`), with Undo in the toast.
- Time-of-day text uses `useNow()` (null during SSR) to avoid hydration mismatches.
- Landing "Sign in with Google" and "Get Started" link to `/dashboard` until OAuth lands in Stage 8.
- AI assistant panel exists (greeting computed from data, suggested prompts) but answers "can't answer yet" until Stage 5.
- Notifications are derived from data until Stage 5 adds the API.
- OpportunityRow uses container queries (`@container` on the list): full row ≥768px of list width, compact below.
- `.claude/launch.json` (repo root) starts the frontend dev server for previews.

## Seed targets (verified by `tests/seed-targets.test.ts` for 2 Oct 2026)

Total 12 (+2 this week) · Deadlines this week 4 (2 urgent) · Applied 8 (+1) · In progress 3 (+1) · Saved 7. AI recommendation: "I found 3 opportunities that strongly match your interests. Two have deadlines coming up soon."

Deadlines, discovery dates and application dates in the seed are **absolute**, so these counts are exact on 2 Oct 2026 and drift naturally on later days (days-left is always computed live). Opportunities 6–12 were added to reach the targets; programs without a real-world equivalent use fictional organizers (CodeCircle, Bright Futures Foundation). Opportunity fields not stated in the mock emails are `null`.

## Gmail / Google verification notes (for Stage 8)

`gmail.readonly` is a **restricted** scope. For the demo/MVP keep the Google Cloud app in **Testing** mode with listed test users (max 100). A public launch needs: OAuth consent-screen verification, a published privacy policy and homepage on a verified domain, a demo video of the scope use, and an annual third-party security assessment (CASA) because restricted-scope data is stored on our servers.
