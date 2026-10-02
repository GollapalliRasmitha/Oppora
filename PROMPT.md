# OPPORA — Build Brief for Claude Code

You are the lead engineer and product designer for **Oppora**, a personal AI agent that reads a user's Gmail, finds opportunities (internships, jobs, hackathons, scholarships, competitions, fellowships, workshops, conferences), pulls out their deadlines, ranks them against the user's interests and helps the user act on them.

The result must look and feel like a real startup product: **AI + Career + Productivity + Premium SaaS**. It must be good enough for a hackathon demo, a portfolio, an MVP and real users.

---

## 0. How we work (read this first)

1. **Build in stages, in the order in Section 9.** Finish one stage completely. At the end of each stage:
   - run lint, type-check and tests, and fix any failures
   - confirm that earlier pages still look and work the same
   - commit with a message like `stage-3: deadlines + inbox`
   - post a short summary: what you built, what you assumed, what's left
   - **stop and wait for me to say "continue"** before starting the next stage.
2. **Keep `CLAUDE.md` at the repo root up to date.** It holds the design tokens, the component list, the folder structure, the decisions we made and the current stage. Read it at the start of every session.
3. **One product, one design system.** Every page uses the shared tokens and components. Never restyle a component just for one page. If something new is needed, add it to the design system first and then use it.
4. **Ask me before you** add a paid service, change a design token, change the data model in a way that breaks earlier stages, or request more Gmail permissions.
5. **Never invent facts.** This applies to the UI copy, the mock data and the AI output. If something isn't known, show it as missing (`null` → "Not mentioned in email").
6. **Visual reference:** `design/reference.png` (and any files in `design/`). Match its atmosphere and quality, but don't copy it literally.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Lucide icons |
| Backend | Django + Django REST Framework |
| Database | PostgreSQL |
| Background jobs | Celery + Redis (Celery Beat for scheduled jobs) |
| AI | OpenAI API with structured outputs (JSON schema) |
| Email / auth | Google OAuth 2.0 + Gmail API |
| Local dev | `docker-compose` for Postgres and Redis; `.env.example` lists every variable |

**Repo layout:** a monorepo with `/frontend`, `/backend`, `/design`, `docker-compose.yml` and `CLAUDE.md`.

**Data layer rule:** the frontend never calls `fetch` from inside components. All data goes through typed service functions in `frontend/lib/api/*`. Until Stage 7, those functions return typed mock data. In Stage 7 they switch to the real API, and **no UI component changes**.

---

## 2. Design system (the single source of truth)

**Look and feel:** a deep midnight-navy background, almost black. Dark glassmorphism cards with thin, softly glowing borders. Soft purple and blue ambient light. Rounded corners. Clean, compact, premium layouts. Use glow sparingly; not everything should be neon.

**Colour tokens** (define them as CSS variables and in the Tailwind theme):
- Background `#070A1A`, raised surface `#0F1336`, glass `rgba(255,255,255,.04–.06)`
- Border `rgba(165,160,255,.14)`, strong border `rgba(170,160,255,.30)`
- Text `#EEF0FF`, secondary text `#B0B6DA`, muted text `#8189B5`
- Accents: electric purple `#7C3AED`, violet `#A78BFA`, neon blue `#60A5FA`, pink `#F472B6`
- Gradients: brand (buttons and active states) purple → indigo → blue; headline text violet → blue → pink; AI-card border purple → blue → pink
- Urgency: **red** = 3 days or less, **orange** = 4–10 days, **blue** = more than 10 days. Always show the number of days as text as well, so colour is never the only signal.

**Type:** Plus Jakarta Sans (fallbacks: Inter, then system). Use a clear hierarchy: hero 56–70px/800, section heading 32–46px/800, card heading 16–20px/700, body 15–18px/400, metadata 12–13px/500 in muted text.

**Spacing and shape:** a 4px spacing scale. Corner radius 8 (small), 12 (controls), 20 (cards), pill (badges). Buttons and touch targets are at least 44px tall.

**Icons:** Lucide only, line style, used the same way everywhere. Do not use emoji in the UI. Where the copy below shows ✨ 🔒 🔔 📅, use the matching Lucide icon (Sparkles, Lock, Bell, CalendarClock).

**Company logos:** do not use real company logos. Show a coloured monogram tile with the first letter of the company name. The "Sign in with Google" button must follow Google's sign-in branding guidelines.

**Motion:** subtle and quick (150–300ms). Hover lift on cards, glow on buttons, a pulsing AI orb, a focus glow on search, smooth page transitions. Turn all motion off when `prefers-reduced-motion` is set.

**Reusable components** (build them in `frontend/components/ui` and `frontend/components/oppora`):
Button, IconButton, GlassCard, AICard, Input, SearchBar, Tabs, FilterChips, Dropdown/Select, Badge, PriorityBadge, DeadlineIndicator, MatchMeter, StatCard, OpportunityCard, OpportunityRow, EmailCard, NotificationItem, CalendarEvent, Modal, Drawer, Toast, Skeleton, EmptyState, ErrorState, Sidebar, Header, MobileBottomNav, FloatingAIButton, AIAssistantPanel, AppShell.

---

## 3. Definition of done for EVERY page

Each page counts as finished only when it has all of the following. Do this per page, not as a separate pass at the end:

- **Responsive layout.** Desktop has a fixed 230px sidebar. Tablet has a collapsible icon sidebar. Mobile has a bottom nav (Home · Opportunities · Deadlines · Inbox · Profile), sticky search and a floating AI button. Design mobile on purpose; don't just shrink the desktop layout.
- **States:** loading (a skeleton shaped like the real content), empty (an icon, one helpful sentence and a primary action), error (what happened and a retry action) and no search results.
- **Accessibility:** full keyboard navigation, visible focus rings, ARIA labels on icon-only buttons, real `<button>`/`<a>`/`<label>` elements and text contrast of at least 4.5:1.
- **Feedback:** a toast after every user action (save, apply, mark complete and so on). Use optimistic UI where it's safe.

---

## 4. Seed data (one shared file: `frontend/lib/mock/seed.ts`, later loaded into the DB)

- **Calculate every "days left" from today's date.** Never hard-code it.
- **Calculate every number from the seed data:** dashboard stats, filter counts, insights percentages and progress. Choose the seed so these targets come out true: Total opportunities **12** (+2 this week) · Deadlines this week **4** (2 urgent) · Applied **8** (+1) · In progress **3** (+1) · Saved **7**. If two targets can't both be true, keep the data consistent and tell me which number moved.
- **Opportunities** (absolute deadlines; type; priority; match %):
  1. Google Summer Internship 2027 — Google · Internship — 15 Dec 2026 — High — 92%
  2. Microsoft Explore — Microsoft · Internship — 5 Oct 2026 — High — 90%
  3. TCS CodeVita 2026 — TCS · Hackathon — 4 Oct 2026 — High — 88%
  4. Frontend Developer — Amazon · Job — 9 Oct 2026 — Medium — 86%
  5. Women Techmakers Scholarship — Google · Scholarship — 8 Oct 2026 — Medium — 84%
  6. Add more realistic items (internships, hackathons, jobs, scholarships) until the targets above are met.
- **Inbox emails** that link to these opportunities, including some that are not opportunities (newsletter, college, promotion), with a mix of read and unread.
- **User:** Rasmitha, Free Plan. Interests: frontend development, software engineering, hackathons.

---

## 5. Pages and features

### 5.1 Landing page (public)
- **Navbar:** logo (an abstract orbital AI symbol with a small sparkle) · Features · How It Works · About · a compact **Get Started** button with the brand gradient. On mobile, collapse the links into a menu.
- **Hero** (two columns on desktop, stacked on mobile):
  - Badge: "Your personal AI opportunity agent"
  - Heading: "Your Gmail, **Smarter Opportunities.**" The second line uses the violet → blue → pink gradient.
  - Text: "Oppora uses AI to scan your Gmail, find relevant opportunities, track deadlines and help you stay ahead — all in one place."
  - Buttons: **Sign in with Google** (primary) and **See how it works →** (ghost). Under them: a lock icon and "Secure Gmail connection".
  - **Visual:** an original illustration (no stock photo) that blends into the background. It shows a student seen from behind at a desk, a futuristic city, soft orbital lines, a glowing AI orb and purple/blue lighting. Floating glass cards: "Google Careers · Summer Internship 2027", "New opportunity found · Frontend Developer · Amazon", "Application deadline · 15 Dec", "4 deadlines this week". The cards float gently.
- **Why Oppora?** Subheading: "Everything you need to catch the right opportunity at the right time — without digging through your inbox." Six compact glass cards:
  - AI-Powered: "Intelligently scans your Gmail and extracts relevant opportunities."
  - Smart Tracking: "Keeps track of deadlines and sends timely reminders."
  - Personalized: "Built around your interests, goals and career aspirations."
  - All in One Place: "Opportunities, emails, calendar and insights — unified."
  - Secure: "Your data stays with you. You control what Oppora can access."
  - Simple & Beautiful: "A clean interface that makes your journey easier."
- **How it works:** "From inbox to offer in three steps." 01 Connect Gmail ("Connect your Gmail account securely.") · 02 AI Finds Opportunities ("Oppora scans relevant emails and identifies opportunities.") · 03 Take Action ("Track deadlines, save opportunities and apply before time runs out."). The timeline glows and runs horizontally on desktop and vertically on mobile.
- **Final CTA:** a large glowing glass section. "Don't let your next opportunity get buried in your inbox." · "Let Oppora find it for you." · **Get Started →**
- **Footer:** logo · Features · How It Works · Privacy · Terms · Contact · "Your future doesn't wait. Neither should you."

### 5.2 App shell (shared by every signed-in page)
- **Sidebar:** Home, Opportunities, Deadlines, Inbox, AI Insights, Calendar, Settings. The active item has a purple/blue glow. At the bottom: avatar, "Rasmitha", "Free Plan" and a green online dot.
- **Header:** search ("Search opportunities, companies or keywords…") · notifications bell with an unread dot · AI assistant button · profile avatar.
- **Sync status** (shared component, real data from Stage 9): "AI is scanning your Gmail…" → "12 emails being analyzed…" → "Sync completed" · "Last synced 2 minutes ago".

### 5.3 Dashboard home
- Greeting: "Good Morning, Rasmitha!" (with a Sparkles icon; the greeting changes with the time of day). Below it: "Here's what's happening with your opportunities today."
- An AI status card on the right with a small glowing orb and the sync status.
- Four StatCards: Total Opportunities, Deadlines This Week, Applied, In Progress. Each has an icon, number, label and trend.
- **Latest Opportunities:** five OpportunityRows showing logo, title, company · type, deadline, days left, priority, View Details and a ⋯ menu (save, mark applied, set reminder, not interested). "View all →" opens the Opportunities page.
- **Upcoming Deadlines:** a compact list for the next 7 days.
- **AI Recommendation** (AICard): "I found 3 opportunities that strongly match your interests. Two have deadlines coming up soon." Buttons: **View Opportunities** and **Ask AI**. The text is generated from the data, not hard-coded.

### 5.4 Opportunities
- Title "Opportunities" · "All the opportunities found from your Gmail, sorted by relevance."
- SearchBar ("Search opportunities…") · FilterChips: All, Internship, Hackathon, Job, Scholarship (each with a count) · sort Dropdown: Relevance, Deadline, Priority.
- OpportunityCard: logo, title, company · type, deadline, days left (urgency colour), priority, MatchMeter ("92% Match"), Save toggle and View Details.

### 5.5 Opportunity details (its own route; full-screen on mobile with a sticky Apply bar)
- A Back button. Header: logo, title, company · type, deadline with days left. Buttons: **Apply Now**, **Save**, **Share**.
- Tabs: **Overview** (description, location, duration, eligibility, skills, application link) · **Requirements** · **Benefits** · **Related Emails**.
- **AI Summary** (AICard): one sentence explaining the match (for example, "This opportunity matches your profile because of your interest in frontend development and software engineering."), a match ring ("92% Match"), and a checklist: Matches your skills · Matches your interests · Suitable experience level · Deadline is still available. Items that aren't met show as warnings rather than being hidden.
- Any field the AI couldn't find shows as "Not mentioned in email".

### 5.6 Deadlines
- "Deadlines" · "Stay on top of your important dates."
- A month calendar on the left (compact on mobile) and an upcoming list on the right, coloured by urgency.
- Clicking an event opens its opportunity. Actions: Set Reminder, Open Opportunity, Mark Complete.

### 5.7 Inbox
- "Inbox" · "Relevant emails from your Gmail." SearchBar ("Search emails…") · filters: All, Opportunities, Deadlines, Other.
- EmailCard: sender, subject, preview, date, category badge, AI relevance %, read/unread state, and an **Extract Opportunity** action (shown when no opportunity is linked yet).
- On mobile, emails are swipe-friendly cards (swipe to save or archive, with buttons as a fallback).

### 5.8 AI Insights
- "AI Insights" · "Your personalized insights based on Gmail analysis."
- Insight cards: Most Common Category (with %), Top Company (count), Best Day To Apply (count).
- An Opportunity Trends chart (opportunities found in the last 7 days) in the purple/blue palette.
- An Application Progress ring (applied ÷ all tracked) with a legend: Applied, In Progress, Saved, Other.
- AI Recommendation: "Based on your profile, you have 3 opportunities worth reviewing this week." → **View Opportunities**.
- All values are computed from the data.

### 5.9 Calendar
- Month, Week and Day views. Event types: application deadline, interview, hackathon, scholarship deadline and reminder, each with its own icon and colour. Clicking an event opens the related opportunity.

### 5.10 Settings
- **Gmail connection:** the Google account email, status (Connected / Needs reconnect), Manage and Disconnect.
- **Notifications:** toggles for Email notifications, Deadline reminders, New opportunities and Weekly AI digest.
- **Preferences:** theme (dark only for now; show it as dark), language, opportunity preferences.
- **AI preferences:** AI recommendations on/off, personalization level, opportunity categories to track.
- **Account:** Profile, Subscription, Privacy (shows what Oppora stores and a "Delete my data" option), Sign out.

### 5.11 Notifications panel (opened from the bell)
- Items: New opportunity found ("Google Summer Internship matches your profile.") · Deadline approaching ("TCS CodeVita closes in N days.") · AI recommendation ("You have 3 opportunities worth reviewing.").
- Actions: Mark as read (one item) and Clear all.

### 5.12 AI assistant
- A floating Sparkles button on every signed-in page. Clicking it opens a right-side panel (full-screen sheet on mobile) titled "Oppora AI".
- Greeting: "Hi! I found 3 opportunities that match your profile today."
- Suggested prompts: Find internships for me · What deadlines are approaching? · Show high-priority opportunities · Why is this opportunity relevant? · What should I apply for this week?
- Answers come only from the user's own stored opportunities and emails. Each answer links to the opportunities it mentions. When the data doesn't contain the answer, it says so.

### 5.13 Required state copy
- Empty opportunities: "Oppora hasn't discovered any opportunities yet." → **Scan Gmail**. Also write matching empty states for Inbox, Deadlines, Saved, Applications, Notifications and Search results.
- AI working: "Oppora AI is analyzing your Gmail…" · "Finding opportunities relevant to you."
- Gmail error: "We couldn't access your Gmail. Reconnect your account to continue." → **Reconnect Gmail**. Also handle network errors, AI errors, session expired / sign-in errors and empty search results.

---

## 6. Backend (Django + DRF)

**Models:** User, GmailConnection, Email, EmailClassification, Opportunity, Deadline, Application, SavedItem, Notification, UserPreference.

**Endpoints:** `/api/auth/`, `/api/emails/`, `/api/opportunities/`, `/api/deadlines/`, `/api/applications/`, `/api/saved/`, `/api/notifications/`, `/api/insights/`, `/api/preferences/`, plus `/api/sync/` (start a sync, check status) and `/api/assistant/`.

**Requirements:** authentication on every endpoint; every queryset filtered by `request.user` (write a test that proves user A can never read or change user B's data); serializer validation; pagination; filtering and search; consistent JSON errors; `select_related`/`prefetch_related` and database indexes on the fields used for filtering.

**Auth design:** Django owns Google OAuth (authorization-code flow with offline access), because Celery needs the refresh token. Django sets a secure, httpOnly, SameSite session cookie, and Next.js sends it with every request. Protect state-changing requests with CSRF.

---

## 7. Gmail + AI pipeline

- **Permissions:** request only `gmail.readonly` plus basic profile and email. Never ask for a Gmail password. Note: `gmail.readonly` is a *restricted* scope, so keep the Google app in **Testing** mode with listed test users for the demo and MVP, and write down in `CLAUDE.md` what Google verification would need for a public launch.
- **Sync:** an initial sync of the last N days (configurable, default 60), then incremental sync with the Gmail `historyId`. Handle token refresh, connect, disconnect (which revokes the token and deletes stored tokens) and connection status.
- **Pipeline:** Email → Clean → pre-filter (cheap rules, such as skipping obvious promotions, before calling the AI) → Classify → Extract → Prioritize → Summarize → Store.
- **Categories:** Internship, Job, Hackathon, Scholarship, Competition, Fellowship, Event, College, Newsletter, Promotion, Other.
- **Extracted fields** (OpenAI structured output with a strict JSON schema): category, priority, summary, organization, opportunity_name, deadline (ISO date), eligibility, location, skills[], application_link, action_required, confidence. **Any field not stated in the email must be `null`. Never guess.** Validate the output against the schema, and send anything that fails to a retry or a "needs review" state.
- **Matching:** the match % comes from the user's interests and preferences, and the checklist reasons are stored so the UI can show *why* something matched.
- **Privacy:** store only what's needed (message ID, sender, subject, date, a short snippet and the extracted fields). Don't keep full email bodies after processing unless I ask for it.

---

## 8. Background jobs (Celery + Redis)

```
Gmail → Django → Redis → Celery worker → AI processing → PostgreSQL → Oppora dashboard
```

- **Tasks:** Gmail sync, classification, extraction (opportunity + deadline), summarization, notifications, a daily AI briefing and deadline reminders (Celery Beat).
- **Make every task idempotent** by keying on Gmail message ID, so the same email is never processed twice. Add retries with exponential backoff and handle Gmail and OpenAI rate limits.
- **API requests never wait for AI.** The UI polls `/api/sync/` (or uses SSE) to show live sync status.

---

## 9. Build order (one stage at a time, stopping after each)

1. **Foundation + Stage 1:** monorepo, design tokens, core components, AppShell, Landing page and Dashboard (mock data).
2. Opportunities + Opportunity details.
3. Deadlines + Inbox.
4. AI Insights + Calendar.
5. Settings + Notifications + AI assistant (mock answers).
6. **UX review pass:** check every page against Section 3 on desktop, tablet and mobile, and fix any gaps.
7. Backend: models, APIs, tests, seed loader. Switch the frontend services from mock data to the API.
8. Google OAuth + Gmail sync + the AI pipeline. Connect the real results to Dashboard, Inbox, Opportunities, Deadlines, Insights and the assistant.
9. Celery + Redis background processing and live sync status.
10. **Security hardening:** encrypt OAuth tokens at rest (key from env), keep secrets only in env and never in the frontend bundle, rate-limit auth, sync and assistant endpoints, validate all input, set secure headers and CORS, use minimum scopes.
11. **Performance + accessibility audit:** lazy loading, caching, query optimization, `next/image`, Lighthouse score of 90+ on Landing and Dashboard, keyboard-only and screen-reader checks.
12. **Final polish:** check consistency of spacing, type, colour, borders, shadows, gradients, icons, motion, toasts, navigation, search and filters. Then run the full journey end to end:
    Landing → Google sign-in → Gmail connection → sync → AI analysis → opportunity detected → deadline extracted → priority set → Dashboard → Opportunity details → Save → Apply → deadline reminder → AI assistant.
    Write a short `README.md` with setup steps and a 2-minute demo script.

**Start now with Stage 1 only. Stop when it's done and summarise.**
