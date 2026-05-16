# Logical Ops — Handoff Document

> Read this **before SPEC.md** if you only have time for one. Read SPEC.md
> right after — it is the source of truth for product behavior.
>
> **Updated 2026-05-16** after a full day of Phase 1.5 work (15+ shipped
> passes building out the Safety/Quality dashboard, coaching workflow,
> data-integrity guards, and production deploy). SPEC.md is current.

## 1. Current Status

**Phase:** Phase 1 + Phase 1.5 fully shipped and live in production at
**`https://logical-ops.vercel.app`**. Both the user and their boss have
working accounts; the app is in active daily use.

**What works end-to-end:**
- Auth + role middleware (Owner / HR / Ops Manager / Dispatcher)
- 7 import surfaces (DSP Overview CSV, Scorecard PDF, Netradyne CSV,
  Escalations CSV, Concessions CSV, CDF Negative CSV, POD Details PDF)
  — all with SHA-256 hard-block on duplicate uploads
- Drivers list, driver detail (4 tabs), Last Coached relative-time
- Coaching lifecycle: create, edit, void, unvoid, acknowledge, audit trail
- Coaching dialog auto-fills + auto-categorizes when opened from a trigger
- Per-category trigger clearing — coaching a safety issue clears the
  safety trigger but leaves quality untouched
- Performance dashboard with **Safety / Quality view toggle** (URL-driven,
  defaults to Quality). Each view has its own:
  - 4 stat tiles (incl. a clickable "above/below threshold" tile with a
    popover driver list)
  - Company trend chart (per-event-type for Safety; percent / DPMO
    toggle for Quality)
  - Top / Most-improved / Bottom 5 leaderboards
  - Full-width Needs Coaching hero (filtered to the active view)
  - Two donuts (impacting + non-impacting for Safety; CDF + DSB for
    Quality)
- Management page with dispatcher↔driver FK picker
- Employees page with Add / Edit / position (Driver / Helper) / vehicle
  types (CDV / EDV / Standard Parcel)

**Known broken:** none reported. Production smoke-tested today end-to-end.

## 2. Design principles that came out of today's work

These aren't bugs to fix — they're principles to honor in future passes.

### "No guesswork" — the dashboard is the source of truth, not memory
When something is addressed, it should visibly clear from the action list
without manager intervention. When something needs attention, it should
appear precisely once with enough context to act. The user articulated
this explicitly while building the per-category trigger clearing and
trigger-pre-fill flows. Carry this into Fleet / Daily Ops / HR when
those land.

### Categorize for clearing, not for categorizing
`coaching_sessions.category` (safety / quality / escalation / other) exists
to drive which trigger list a session clears — not as a user-facing
classification axis. The user originally wanted no category at all;
keeping it as a hidden, auto-set column was the compromise. The
session_type enum (incl. `training`) is the visible signal.

### Two-DSP defenses
Netradyne camera accounts span DUT4 + DUT7 at this org. The Netradyne
importer **never auto-creates drivers** — unmatched names are skipped,
with a fuzzy-fallback (nickname dict + first-name-prefix + extra-last-
name-token) for the legal-vs-nickname mismatch. Drivers join this DSP
only when they appear in a station-specific Amazon import (scorecards /
DSP Overview / POD Details / Concessions / CDF Negative / Escalations).
A one-time cleanup migration in 20260515235252 purged drivers that only
had Netradyne data.

### Date-field semantics differ per surface — by design
- Safety donuts: **rolling last 7 days** of `event_date` (daily Netradyne
  uploads).
- CDF donut + tile #2: latest Sun-Sat **delivery_date week** from the
  data sources (not scorecards — scorecards may lead the defect data).
- DSB donut: latest Sun-Sat **concession_date week** — Amazon counts
  DSBs against the week they filed the concession (financial scorecard
  semantic), not the delivery week.
- Quality leaderboards: latest scorecard `week_ending`.
- Safety leaderboards: rolling last 7 days; eligibility = drivers in
  latest scorecard.

Each surface's subtitle labels its own week so the user can see when
two surfaces are showing different periods.

### Amazon Week 1 = Sun-Sat week containing Jan 1
Not "first Sunday ≥ Jan 1." This was a real bug in `amazonWeekEnding` /
`amazonWeekFromEndingDate` discovered today — every "Week N" label and
every parser-computed `week_ending` was off by +7 days. Fixed in
`lib/format/dates.ts`. A one-time SQL backfill shifted existing
`scorecards.week_ending` and `pod_details.week_ending` rows back by 7
days to match (no migration file — pure data cleanup specific to this
DB's accumulated state).

## 3. Active gotchas

### Filesystem flake (macOS APFS)
Occasional `ENOENT` / `ETIMEDOUT` / "short read" errors during builds.
Not code — APFS / Spotlight indexing. Remedy:
```bash
rm -rf .next node_modules/.cache && npm install && npm run dev
```

### Turbopack avoided
`next dev` and `next build` are both pinned to `--webpack`. Turbopack
16.2.4–16.2.6 had a temp-manifest race. Don't switch back without
re-testing.

### shadcn flavor = base-ui, not Radix
Components in `components/ui/*` wrap `@base-ui/react/*`. Some prop
differences:
- `DropdownMenuTrigger` does NOT accept `asChild`
- `Tabs`, `Dialog`, `Checkbox`, `Select` follow base-ui's API

### TypeScript strictness on event handlers
Use `e.currentTarget.value`, not `e.target.value`. Latter trips base-ui
inputs under Next 16 strict.

### PDF imports on Vercel
pdfjs-dist needs `DOMMatrix` / `Path2D` / `ImageData` globals that Node
doesn't ship. `lib/parsing/pdfjs-node-polyfill.ts` polyfills them via
`@napi-rs/canvas`; both packages are listed in `serverExternalPackages`
in `next.config.ts`. The pdf.worker.mjs file is force-included in the
Vercel deployment via `outputFileTracingIncludes` (also in next.config).

### Git committer identity
The sandbox can't auto-detect `user.email`. Commits in this worktree use
the inline form `git -c user.email="spikembj@gmail.com" -c
user.name="Michael Jorgensen" commit ...`. Don't set this in global
config without the user's explicit say-so.

## 4. Access & environment

### Required env vars (in `.env.local`, gitignored)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-only
NEXT_PUBLIC_DEFAULT_TZ        # = America/Denver
```

### Vercel scope on env vars
- The three `NEXT_PUBLIC_*` vars + `NEXT_PUBLIC_DEFAULT_TZ` are scoped
  to **all environments** (Production / Preview / Development).
- `SUPABASE_SERVICE_ROLE_KEY` is **Production only** by design (limits
  blast radius if a preview URL leaks).

### Connected services
- **Supabase project:** `oaufkjqtjecffpkcwewp`
- **GitHub:** https://github.com/spikembj/logical-dsp-ops.git
- **Vercel:** project `logical-ops`, production URL above. GitHub
  integration installed — every push to `main` auto-deploys.
- **Supabase Auth URL Configuration:** Site URL = production URL;
  Redirect allowlist includes `https://logical-ops.vercel.app/**` and
  `http://localhost:3000/**`.

## 5. Database state

**Supabase migrations applied** (everything in `supabase/migrations/`
has been run against the live DB). Chronological with brief purpose:

```
20260501214330  init (enums, tables, RLS, triggers)
20260501214340  baseline GRANTs
20260502152928  coaching soft-void + acknowledge RPC
20260502165843  drivers nullable transporter_id
20260502173649  scorecards cdf integer (numeric overflow fix)
20260502180054  scorecards full columns (delivered/ced/dsb/...)
20260502203356  scorecards allow UPDATE (initial — superseded by RLS gap fix below)
20260502222114  safety_events admin DELETE
20260503143410  inactive status + platinum tiers + session_type
20260503164204  scorecards overall_score
20260503211220  escalations table
20260504104233  refresh_active_status bidirectional
20260508165130  concessions table
20260508170543  cdf_negative table
20260508191643  pod_details table
20260508231023  position enum + standard_parcel rename
20260509071714  management roles (enum add)
20260509073330  management roles part 2 (data + RLS via is_management())
20260515215557  RLS gap backfill (9 UPDATE/DELETE policies)
20260515235252  drop netradyne phantom drivers (one-time cleanup)
20260516002944  drop rivian vehicle type
20260516025815  users.driver_id FK (dispatcher↔driver linkage)
20260516072730  coaching_sessions.category column
20260516171320  coaching_session_type: add 'training'
```

**One-off SQL run today (not versioned)** — these are state-specific
cleanups, not schema migrations, and shouldn't go in `migrations/`:
- Shifted `scorecards.week_ending` and `pod_details.week_ending` back
  by 7 days after the Amazon-Week-1 helper fix.

## 6. Open / deferred / out-of-scope

### Open (small / nice-to-have)
- **Per-period tracking on `file_imports`** (was Pass 8). Would add
  `period_start` / `period_end` for audit trail + future Import History
  view. Donut alignment no longer needs it — anchors read data-source
  dates directly. **Low priority.**
- **Linked scorecard/event UI on coaching sessions.** Schema fields
  already exist; no picker UI.
- **Downloadable error CSVs from the Import result card.**

### Phase 2 / 3 — the next big builds (user-flagged)
- **Daily Ops dashboard** at its own route. Day-of planning, call-outs,
  who's where. Replaces a spreadsheet.
- **Fleet / VCR tracking.** Vehicle assignment, damages, mileage.
- **HR / hiring.** Onboarding, document expiry, training certs.

The user wants Phase 2 dashboards to follow the same patterns the
Performance dashboard settled on: view toggle in the header where the
content meaningfully splits, clickable threshold tiles with popovers,
data-source-driven anchors, "no guesswork" trigger clearing where
applicable.

### Explicitly out of scope (Phase 3+)
- ADP / Slack / Rivian portal integrations
- Mobile app
- Auto-scraping of Amazon DSP portal (TOS / contract risk — discussed
  and tabled; user will continue manual / email-attachment uploads
  unless a safer path emerges, e.g. Netradyne's enterprise API)

## 7. Folder structure (current)

```
.
├── .claude/
├── app/
│   ├── (app)/
│   │   ├── admin/
│   │   │   ├── employees/         # CRUD for drivers + helpers (was "drivers admin")
│   │   │   └── users/             # Management page (incl. dispatcher↔driver picker)
│   │   ├── drivers/
│   │   │   ├── [id]/              # Driver detail (layout + 4 tabs)
│   │   │   └── page.tsx           # Drivers list (with Last Coached column)
│   │   ├── import/page.tsx        # 7-tab import surface
│   │   ├── layout.tsx
│   │   └── page.tsx               # Performance dashboard (Safety/Quality split)
│   ├── (auth)/login/
│   ├── actions/                   # 10 server-action files
│   ├── auth/callback/
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── app/
│   │   ├── admin/                 # users-table + drivers-admin
│   │   ├── coaching/              # log/edit/void dialog, session card+list, triggers panel
│   │   ├── dashboard/             # view-toggle, threshold-tile, leaderboards (Safety + Quality),
│   │   │                          # needs-coaching-list, safety-donuts, quality-donuts,
│   │   │                          # safety-trend-chart, quality-trend-chart, stat-tile
│   │   ├── defects/, import/, perf/, safety-events/
│   │   └── …driver-tabs, sidebar-nav, sign-out, theme-*
│   └── ui/                        # shadcn (base-ui flavor) primitives
├── lib/
│   ├── auth/require-role.ts
│   ├── format/                    # badges, dates (incl. Amazon-week helpers)
│   ├── parsing/                   # 5 parsers + file-hash helper + pdfjs polyfill
│   ├── queries/                   # 10 query helpers (incl. coaching-triggers, dashboard)
│   ├── supabase/                  # client / server / middleware
│   ├── types/database.ts
│   ├── util/
│   │   ├── coaching-prefill.ts    # trigger → dialog defaults
│   │   └── name-match.ts          # fuzzy nickname/prefix matcher
│   └── utils.ts
├── public/
├── scripts/                       # seed-drivers-from-csv.mjs
├── supabase/migrations/           # 24 migrations (see §5)
├── proxy.ts                       # root proxy (Next 16 rename of middleware)
├── next.config.ts                 # serverExternalPackages + outputFileTracingIncludes
├── package.json
├── SPEC.md                        # Source of truth
└── HANDOFF.md                     # This file
```

`_reference/` (gitignored) holds the user's real CSVs/PDFs we built
parsers against. Files we never matched against a parser were moved to
`_reference/_unused/` for the user to permanently delete if desired.

## 8. Starter prompt for next session

Paste this verbatim if starting a fresh session:

---

> **Read these two files before doing anything else:**
> 1. `SPEC.md` — the source of truth for what the app does.
> 2. `HANDOFF.md` — current state, gotchas, open items, design
>    principles, deferred work.
>
> Confirm you've read both. Then before writing any code, tell me:
> - One-paragraph summary of where the project is.
> - Any clarifying questions on the design principles (§2 of HANDOFF)
>   or the open items list.
> - Which Phase 2 direction (Daily Ops / Fleet / HR) you'd recommend
>   starting with, and why — or which deferred item you'd pick up first.
>
> Treat SPEC.md as authoritative. Update SPEC.md in the same commit
> as any code change that contradicts or extends it.
>
> Quality / Safety dashboards, coaching workflow, all 7 imports, and
> production deploy are all live and stable. Don't reinvent any of
> them — extend the patterns when adding new dashboards.

---
