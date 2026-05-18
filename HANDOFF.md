# Logical Ops — Handoff Document

> Read this **before SPEC.md** if you only have time for one. Read SPEC.md
> right after — it is the source of truth for product behavior.
>
> **Updated 2026-05-18** with Daily Ops Pass A: `/daily` roster +
> `/daily/paper` print view + `/admin/waves` wave-times CRUD. Plus
> the auth fix for invite/password-reset (set-password landing +
> resetPasswordForEmail) shipped on 2026-05-17. SPEC.md is current.

## 1. Current Status

**Phase:** Phase 1 + Phase 1.5 + Phase 2 (Fleet) all shipped and live in
production at **`https://logical-ops.vercel.app`**. Daily-use app for the
user and their boss; everything imported and clicked through today end-
to-end.

**What works end-to-end:**
- Auth + role middleware (Owner / HR / Ops Manager / Dispatcher)
- **8 import surfaces** — DSP Overview CSV, Scorecard PDF, Netradyne CSV,
  Escalations CSV, Concessions CSV, CDF Negative CSV, POD Details PDF,
  **Vehicles XLSX**. All with SHA-256 hard-block on duplicate uploads.
- Drivers list + driver detail (4 tabs incl. Performance with the new
  recent-activity panel for drivers without scorecards)
- Coaching lifecycle: create, edit, void, unvoid, acknowledge, audit
  trail. Per-category trigger clearing (safety / quality / escalation),
  trigger-pre-fill auto-categorization.
- Performance dashboard with Safety / Quality view toggle (URL-driven,
  defaults to Quality). Each view: 4 stat tiles, company trend chart,
  3 leaderboards, full-width Needs Coaching hero, two donuts.
- Management page with dispatcher↔driver FK picker
- Drivers list is the unified roster (drivers + helpers). Management
  sees Add driver / Add helper / inline Edit; dispatchers see read-only.
  There is no separate Employees admin page — that was merged into
  /drivers on 2026-05-17.
- **Fleet dashboard** at `/fleet` with 4 tiles (Operational, Grounded,
  Reg expiring, Open issues), "In the shop" hero grouped by shop
  location, Open issues hero, collapsible registration roster, and a
  bottom **PAVE** tile (Periodic Amazon Vehicle Evaluation) with
  per-quarter status + inline mark-complete.
- `/fleet/vans` searchable list with manual-override pill + filter
  chips, inline QR icon per row
- `/fleet/vans/[vin]` tabbed detail (Overview / Issues / Parts)
  including the status-override widget (B+badge merge semantics) and
  the PAVE history mini-section on Overview
- `/fleet/qr-sheet` printable VIN-encoded QR labels (per-van include
  checkboxes, browser-print to letter-size)
- Per-van QR modal everywhere (table icon, detail header, QR sheet)
- **Daily Ops Pass A** — `/daily` dispatcher workspace with inline-
  editable roster (driver / van / wave / notes), date nav, "Copy from
  {prev date}" seed, dispatchers + management can write. `/daily/paper`
  printable view. `/admin/waves` to edit Amazon wave numbers + times
  without a code deploy.
- **Auth invite + reset flows** — `/set-password` landing page now
  catches both `type=invite` and `type=recovery`. Per-row key icon on
  the Management page sends a password reset via
  `resetPasswordForEmail`. Closes the gap that locked out Manny.

**Known broken:** none reported.

## 2. Design principles (additive to prior list — don't drop the old ones)

These are the principles to honor in future passes. The earlier four from
Phase 1.5 still hold; Phase 2 added two more.

### "No guesswork" — the dashboard is the source of truth, not memory
When something is addressed, it should visibly clear from the action list
without manager intervention. When something needs attention, it should
appear precisely once with enough context to act. Carry this into every
new dashboard.

### Categorize for clearing, not for categorizing
`coaching_sessions.category` (safety / quality / escalation / other)
exists to drive which trigger list a session clears. The user originally
wanted no category at all; keeping it as a hidden, auto-set column was
the compromise. session_type (incl. `training`) is the visible signal.

### Two-DSP defenses
Netradyne camera accounts span DUT4 + DUT7. Amazon also publishes some
reports as `_ALL_…csv` (concessions is one). The driver-creation policy
is now: **only Scorecard, DSP Overview, and the Employees admin page may
create driver rows.** Every other import (Netradyne, Concessions, CDF
Negative, Escalations, POD Details, Vehicles) is match-only — unmatched
names are counted as "Skipped (not in our DSP)" on the result card.
Round-one cleanup was migration 20260515235252; round-two cleanup is
20260517185341 (catches the broader policy).

### Date-field semantics differ per surface — by design
- Safety donuts: rolling last 7 days of `event_date`.
- CDF donut + tile #2: latest Sun-Sat **delivery_date week** from data
  sources (not scorecards — scorecards may lead defect data).
- DSB donut: latest Sun-Sat **concession_date week** — Amazon counts
  DSBs against the week they filed the concession.
- Quality leaderboards: latest scorecard `week_ending`.
- Safety leaderboards: rolling last 7 days; eligibility = drivers in
  latest scorecard.
- Each surface's subtitle labels its own week so cross-period reads are
  visible.

### Amazon Week 1 = Sun-Sat week containing Jan 1
Not "first Sunday ≥ Jan 1." Fixed in `lib/format/dates.ts`. One-time
SQL backfill shifted existing `scorecards.week_ending` and
`pod_details.week_ending` by 7 days.

### Phase 2 additions

**Scope is what Amazon doesn't surface well.** Amazon's own dashboards
own PMs, DVIC/AVI inspections, DOT/BIT, odometer defects, warning lights,
mileage. Our Fleet module fills the gaps Amazon leaves: status (with
manual overrides), registration expiry, shop location, our own minor-
issue / parts tracker, QR labels, PAVE compliance. Resist the urge to
duplicate Amazon-owned data.

**Locally-managed vs Amazon-managed fields are separated explicitly.**
On `vehicles`, Amazon-managed columns get overwritten on every import;
locally-managed fields (shop location, EOD parking, notes) are never
touched. The operational status column is *override-aware*: a manual
override stops imports from overwriting it, with a UI callout showing
what Amazon currently reports and a one-click "use Amazon's value" to
clear. Same pattern is the right starting point if other Phase 2/3
features need to merge user-managed and source-of-truth data.

## 3. Active gotchas

### Filesystem flake (macOS APFS)
Occasional `ENOENT` / `ETIMEDOUT` / "short read" during builds. Not
code — APFS / Spotlight indexing. Remedy:
```bash
rm -rf .next node_modules/.cache && npm install && npm run dev
```

### Turbopack avoided
`next dev` and `next build` are both pinned to `--webpack`. Turbopack
16.2.4–16.2.6 had a temp-manifest race. Don't switch back without
re-testing.

### shadcn flavor = base-ui, not Radix
Components in `components/ui/*` wrap `@base-ui/react/*`. Prop
differences worth knowing:
- `DropdownMenuTrigger` does NOT accept `asChild`
- `Tabs`, `Dialog`, `Checkbox`, `Select` follow base-ui's API
- `Select.onValueChange` receives `string | null` (not `string`) — wrap
  with `(v) => set(v ?? defaultValue)` to satisfy types

### TypeScript strictness on event handlers
Use `e.currentTarget.value`, not `e.target.value`. Latter trips base-ui
inputs under Next 16 strict.

### PDF imports on Vercel
pdfjs-dist needs `DOMMatrix` / `Path2D` / `ImageData` globals that Node
doesn't ship. `lib/parsing/pdfjs-node-polyfill.ts` polyfills them via
`@napi-rs/canvas`; both packages are listed in `serverExternalPackages`
in `next.config.ts`. The pdf.worker.mjs file is force-included via
`outputFileTracingIncludes` (also in next.config).

### xlsx (SheetJS) audit warning
`npm audit` reports a high-severity finding for `xlsx` (prototype
pollution + ReDoS). Practical impact for our use case (parsing only
Amazon's xlsx, behind auth, internal app, files we control) is
negligible. Don't ignore forever — revisit if scope grows.

### Git committer identity
Sandbox can't auto-detect `user.email`. Commits use the inline form
`git -c user.email="spikembj@gmail.com" -c user.name="Michael Jorgensen"
commit ...`. Don't set this in global config without the user's say-so.

### Auth invite / recovery requires the set-password landing page
Supabase's `inviteUserByEmail` and `resetPasswordForEmail` issue a
session token but do NOT actually set a password — that's our app's
job. `/set-password` handles it: invite/recovery clicks go through
`/auth/callback` (which exchanges the token) and forward to the form
where the user picks a password. Both actions pass `redirectTo` so the
right destination is baked into the email link, and the callback has a
belt-and-suspenders fallback for `type=invite`/`recovery` even when
`next` isn't present. **Without this, new teammates get logged in once
on invite click and then are locked out on their next session** —
verified by Manny's lockout on 2026-05-17 which kicked off this fix.

### Server-only modules in client components
`lib/queries/fleet.ts` imports `server-only`. Types + pure helpers
(`daysUntilExpiry`, `quarterOf`, the row types) live in `fleet-types.ts`
so client components can import them without dragging the server module
into the bundle. Pattern: when a new query module is added and its types
get used in any client component, split the types into a sibling
`<name>-types.ts` file.

## 4. Access & environment

### Required env vars (in `.env.local`, gitignored)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-only
NEXT_PUBLIC_DEFAULT_TZ        # = America/Denver
```

### Vercel env scope
- `NEXT_PUBLIC_*` vars + `NEXT_PUBLIC_DEFAULT_TZ`: all environments
- `SUPABASE_SERVICE_ROLE_KEY`: **Production only** (limits blast radius
  if a preview URL leaks)

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
has been run against the live DB). New since the previous HANDOFF:

```
20260517000344  fleet phase 2 (vehicles, vehicle_issues, vehicle_parts,
                operational_status_source override fields, grounding
                auto-issue function)
20260517185341  phantom drivers round two (broader policy: drivers
                without scorecard or coaching are phantoms)
20260517200214  vehicle_pave_inspections (quarterly PAVE tracking +
                quarter/year sync trigger)
20260518002930  daily_ops_phase_a (wave_times + daily_roster +
                is_operations() helper + RLS + seed 8 waves)
```

Plus all prior migrations from previous HANDOFF.

**Live data state worth knowing:**
- 60 vehicles imported via Amazon `VehiclesData.xlsx` (DUT7 only)
- Round-two phantom cleanup deleted concession-only / Netradyne-only
  drivers and their dependent rows. Confirmed by user — list was 100%
  DUT4 names before applying.
- PAVE inspections table currently empty; tracking starts with first
  Q2 2026 inspection recorded.

## 6. Open / deferred / out-of-scope

### Open (small / nice-to-have)
- **Per-period tracking on `file_imports`** (was Pass 8). Would add
  `period_start` / `period_end` for audit trail. Low priority — donut
  alignment no longer needs it.
- **Linked scorecard / event UI on coaching sessions.** Schema fields
  already exist; no picker UI.
- **Downloadable error CSVs from the Import result card.**
- **"Show all" toggle on the PAVE history mini-section** — currently
  shows last 4 inspections; older still in DB but not surfaced.
- **Fleet history tab** on van detail was explicitly deferred from
  Phase 2 build ("low priority — defer to polish pass").

### Phase 2.5 — Daily Ops (Pass A shipped, B-E pending)
Pass A live: `/daily` roster + `/daily/paper` print + `/admin/waves`.
Remaining passes scoped + agreed:
  - **Pass B** — shop dropdown for Fleet. New `vehicle_shops` table +
    small CRUD; van detail Overview's "Current shop" becomes a Select
    over the shop list rather than free text. Seed list from user's
    screenshot (Jiffy Lube / Goodyear / Rivian Dealer / Bountiful Ram
    Dealer / etc. — about 18 entries).
  - **Pass C** — end-of-day report. Per-date row capturing route
    counts (total / reduced / recycled / ad-hocs), dispatcher names,
    drivers staying after 8pm, injuries/incidents free text, camera
    hits, the various checkboxes. No Q/S drivers-messaged section —
    that workflow lives in coaching already.
  - **Pass D** — extend `coaching_sessions.category` enum with the 11
    policy-point categories from the user's screenshot (same_day_call_off,
    no_call_no_show, abandon_route, safety_concern, quality_issue,
    behavior_issue, van_damage, property_damage, slept_in, quit,
    unable_to_finish). Existing trigger-clearing logic untouched —
    only safety/quality/escalation clear triggers. Plus a one-off
    backfill script for the last 90 days of the POLICY POINTS CSV.
  - **Pass E** — duties checklist. `duties_template_items` +
    `duties_completion` schema; daily/weekly/monthly templated lists
    with per-item completion (timestamp + user); template editable
    by management.

### Phase 3 (user-flagged)
- **HR / hiring.** Onboarding, document expiry, training certs.
- **Driver-facing VCR submission** (Phase 3 — Phase 2 ships manager-
  tracked issues + parts + QR). Photo-driven damage detection also
  Phase 3.
- **Incidents / accidents with insurance + photos.** Separate from
  `vehicle_issues` which covers operational damage.

### Explicitly out of scope
- ADP / Slack / Rivian portal integrations
- Mobile app
- Auto-scraping of Amazon DSP portal (TOS / contract risk — tabled).
  Continue manual / email-attachment uploads unless a safer path
  emerges (e.g. Netradyne enterprise API).

## 7. Folder structure (current)

```
.
├── .claude/
├── app/
│   ├── (app)/
│   │   ├── admin/
│   │   │   ├── users/             # Management page (dispatcher↔driver picker + reset button)
│   │   │   └── waves/             # Edit Amazon wave numbers + show times
│   │   ├── daily/
│   │   │   ├── page.tsx           # Daily Ops dashboard (inline-editable roster + date nav)
│   │   │   └── paper/page.tsx     # Printable Daily Paper view
│   │   ├── drivers/
│   │   │   ├── [id]/              # Driver detail (layout + 4 tabs)
│   │   │   └── page.tsx           # Unified Drivers + Helpers list; mgmt-only Edit/Add
│   │   ├── fleet/
│   │   │   ├── page.tsx           # Fleet dashboard (tiles + heroes + roster + PAVE)
│   │   │   ├── vans/page.tsx      # Vehicles list
│   │   │   ├── vans/[vin]/        # Vehicle detail (Overview / Issues / Parts)
│   │   │   └── qr-sheet/page.tsx  # Printable VIN-QR labels
│   │   ├── import/page.tsx        # 8-tab import surface
│   │   ├── layout.tsx
│   │   └── page.tsx               # Performance dashboard (Safety/Quality split)
│   ├── (auth)/login/
│   ├── (auth)/set-password/       # Invite + password-reset landing
│   ├── actions/                   # 12 server-action files (added daily-ops.ts)
│   ├── auth/callback/
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── app/
│   │   ├── admin/                 # users-table (Management page)
│   │   ├── coaching/              # log/edit/void dialog, session card+list, triggers panel
│   │   ├── dashboard/             # view-toggle, threshold-tile, leaderboards,
│   │   │                          # needs-coaching-list, donuts, trend charts, stat-tile
│   │   ├── defects/, import/, perf/, safety-events/
│   │   ├── daily-ops/             # date-nav, daily-roster, print-button, waves-admin
│   │   ├── fleet/                 # vehicle-tile, vehicles-table, vehicle-detail,
│   │   │                          # vehicle-overview/issues/parts-tab,
│   │   │                          # vehicle-qr-button, qr-sheet, pave-tile
│   │   └── …driver-tabs, driver-form-dialog, sidebar-nav, sign-out, theme-*
│   └── ui/                        # shadcn (base-ui flavor) primitives
├── lib/
│   ├── auth/require-role.ts
│   ├── format/                    # badges, dates (incl. Amazon-week helpers)
│   ├── parsing/                   # 6 parsers + file-hash + pdfjs polyfill + vehicles-xlsx
│   ├── queries/                   # 14 query helpers (added daily-ops.ts, daily-ops-types.ts)
│   ├── supabase/                  # client / server / middleware
│   ├── types/database.ts
│   ├── util/
│   │   ├── coaching-prefill.ts    # trigger → dialog defaults
│   │   └── name-match.ts          # fuzzy nickname/prefix matcher
│   └── utils.ts
├── public/
├── scripts/                       # seed-drivers-from-csv.mjs
├── supabase/migrations/           # 27 migrations (see §5)
├── proxy.ts                       # Next 16 rename of middleware.ts
├── next.config.ts                 # serverExternalPackages + outputFileTracingIncludes
├── package.json
├── SPEC.md                        # Source of truth
└── HANDOFF.md                     # This file
```

`_reference/` (gitignored) holds the user's real CSVs/PDFs/XLSX we
built parsers against. Files never matched against a parser are in
`_reference/_unused/` for the user to delete if desired. Daily Ops
reference files will land here next.

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
> - Any clarifying questions on the design principles (§2) or the open
>   items list (§6).
> - Which open item or next-phase direction you'd recommend starting
>   with, and why.
>
> Treat SPEC.md as authoritative. Update SPEC.md in the same commit
> as any code change that contradicts or extends it. SQL migrations
> should be pasted inline as a fenced ```sql block, not as a GitHub
> link — the user pastes them directly into Supabase's SQL editor.
>
> Performance + Safety + Quality + Fleet dashboards, coaching workflow,
> all 8 imports, and production deploy are all live and stable. Don't
> reinvent any of them — extend the patterns when adding new surfaces.

---
