# Logical Ops — Handoff Document

> Read this **before SPEC.md** if you only have time for one. Read SPEC.md
> right after — it is the source of truth for product behavior.
>
> **Updated 2026-05-18** after Phase 2.5 Daily Ops fully shipped (passes
> A–E), duties admin folded back into `/duties`, the password-reset
> hash-flow bug for invited users fixed, header buttons unified across
> the four primary dashboards, and the Fleet dashboard re-shaped
> (subtitle dropped, Op + Grounded merged into one dual tile,
> registration roster replaced with a fleet-wide parts list).
> SPEC.md is current.

## 1. Current Status

**Phase:** Phase 1 + Phase 1.5 + Phase 2 (Fleet) + Phase 2.5 (Daily Ops)
all shipped. **Phase 3 (HR & Hiring) Passes A + B shipped** — coaching
review queue + worst-10 panel live at `/hr`; HR-specific duties
checklist live at `/hr/duties` (scope column on duties_template_items,
flat-list rendering, 10 seed items). Live in production at
**`https://logical-ops.vercel.app`**. In active daily use by the user,
their boss, and Manny (test dispatcher).

**What works end-to-end:**

- **Auth** — Owner / HR / Ops Manager / Dispatcher roles + middleware.
  Invite flow + per-user password-reset button on `/admin/users`.
  `/set-password` is a client-handled landing that reads URL hash tokens
  (Supabase recovery emails use implicit flow) and renders a friendly
  "link not valid" message instead of bouncing to /login on bad links.
- **9 import surfaces** — DSP Overview CSV, Scorecard PDF, Netradyne
  CSV, Escalations CSV, Concessions CSV, CDF Negative CSV, POD Details
  PDF, Vehicles XLSX, Policy Points CSV (one-off backfill of historical
  write-ups). All file-hash hard-blocked against duplicate re-imports.
- **Performance dashboard** at `/` with Safety / Quality view toggle
  (URL-driven, defaults to Quality). 4 stat tiles, company trend chart,
  3 leaderboards, Needs Coaching hero, two donuts per view.
- **Drivers** at `/drivers` — unified list (drivers + helpers). Position
  filter chips (Drivers default / Helpers / All) + Status filter chips.
  Management sees Add driver / Add helper / per-row Edit; dispatchers
  see the same table without those affordances. (Old `/admin/employees`
  removed 2026-05-17.)
- **Driver detail** at `/drivers/[id]` — 4 tabs. Performance tab shows
  a "Recent activity" panel for drivers without a scorecard so new
  hires don't render as an empty page.
- **Coaching lifecycle** — create / edit / void / unvoid / acknowledge
  / audit trail. Topic + Category merged into a single grouped
  dropdown (Trigger-clearing: safety/quality/escalation/other + Policy
  point: 11 dispatcher-vocabulary write-up categories). Trigger
  clearing logic still gates on the first 4 only.
- **Management page** at `/admin/users` — invite + role select +
  driver-link picker + per-row password-reset key icon.
- **Fleet dashboard** at `/fleet` — 3 stat tiles across the top
  (Operational+Grounded merged into one dual-tile, Registration
  expiring, Open issues). In-the-shop hero grouped by shop location.
  Open-issues hero. Fleet-wide parts list (open parts always visible,
  received/installed/returned behind a "Show N more" toggle). PAVE
  tile at the bottom (quarterly inspections with inline mark-complete).
- **Vehicle list** at `/fleet/vans` — searchable + 6 filter chips +
  inline QR icon per row.
- **Vehicle detail** at `/fleet/vans/[vin]` — Overview / Issues /
  Parts tabs. Overview includes the operational-status override widget,
  the managed shop-location dropdown, and a PAVE history mini-section.
  Issues with `source='eod'` get a small "EOD" badge so it's obvious
  they came from the end-of-day report.
- **QR sheet** at `/fleet/qr-sheet` — printable VIN-encoded QR labels
  with per-van include checkboxes. Plain-VIN encoding so they work with
  Amazon's delivery app barcode scanner.
- **Daily Ops** at `/daily` — van-first inline-editable morning roster
  with driver autocomplete + autosave + driver prefill from last
  assignment per van. Date nav + Copy-from-prev-date seed.
- **Daily Paper** at `/daily/paper` — printable view of today's roster.
- **End-of-day** at `/daily/eod` — auto-saving form for route counts,
  dispatchers, late drivers, incidents, capacity, per-van notes (which
  flow straight into `vehicle_issues` as `source='eod'`), and a
  populated duties-checklist summary card.
- **Duties checklist** at `/duties` — daily/weekly/monthly cadence
  tabs, optimistic checkboxes, color-coded owner chips, inline add
  per section + per-row delete (management only — no separate admin
  page).
- **Wave times admin** at `/admin/waves` — management-only CRUD over
  the wave-time table (reachable from a button on `/daily`).
- **Shops admin** at `/admin/shops` — management-only CRUD over the
  shop dropdown values (reachable from a button on `/fleet`).
- **HR dashboard** at `/hr` (Phase 3 Pass A) — coaching review queue
  (sortable + searchable; default Unreviewed, tabs flip to Reviewed/All;
  inline Reviewed button stamps `hr_reviewed_at`/`hr_reviewed_by` with
  an optional HR note; Undo + edit-note on already-reviewed rows) +
  worst-10 panel (90-day raw count, excludes trainings/discussions/voids,
  category filter via `?cat=`). Management-only — dispatchers gated out
  via middleware on `/hr/*` and the sidebar link is role-hidden.
- **HR Duties** at `/hr/duties` (Phase 3 Pass B) — HR-specific checklist
  on the same engine as `/duties` via a new `scope` column on
  `duties_template_items` (`'ops' | 'hr'`). Daily renders as a flat list
  (no preload/loadout sub-sections — those are dispatch-specific). 10
  daily items seeded from the dispatcher's HR spreadsheet. Inline add /
  delete / edit follow the same pattern as `/duties`.
- **Sidebar** is flat: Performance / Daily Ops / Fleet / Drivers /
  Import, plus a Manage section with HR + Management. Wave times and
  Shops links live on their respective dashboards.

**Known broken:** none reported. Vercel auto-deploy occasionally drops
a commit — pushing an empty `chore: nudge Vercel` commit unblocks it
(happened once on 2026-05-18 with `f315126` → `39b79e6`).

## 2. Design principles

These are the principles to honor in future passes. Each came out of a
specific friction point — they're not aesthetic preferences.

### "No guesswork" — the dashboard is the source of truth, not memory
When something is addressed, it should visibly clear from the action
list without manager intervention. When something needs attention, it
should appear precisely once with enough context to act. Carry this
into every new dashboard.

### Categorize for clearing, not for categorizing
`coaching_sessions.category` exists primarily to drive trigger-clearing
(safety / quality / escalation). The 11 newer policy-point categories
(no_call_no_show / van_damage / etc.) are descriptive labels for
write-ups — they don't clear any trigger. Whenever you add a category
field anywhere, ask: is this driving behavior, or just describing? If
the latter, default to free text or a hidden field.

### Two-DSP defenses
Netradyne camera accounts span DUT4 + DUT7. Amazon also publishes some
reports as `_ALL_…csv` (concessions is one). The driver-creation policy
is now: **only Scorecard, DSP Overview, and the Drivers admin Add
button may create driver rows.** Every other import (Netradyne,
Concessions, CDF Negative, Escalations, POD Details, Vehicles, Policy
Points) is match-only — unmatched names get counted as "Skipped (not
in our DSP)" on the result card. Round-one cleanup was migration
`20260515235252`; round-two was `20260517185341`.

### Date-field semantics differ per surface — by design
- Safety donuts: rolling last 7 days of `event_date`.
- CDF donut + tile #2: latest Sun-Sat **delivery_date week** from data
  sources (not scorecards — scorecards may lead defect data).
- DSB donut: latest Sun-Sat **concession_date week** — Amazon counts
  DSBs against the week they filed the concession.
- Quality leaderboards: latest scorecard `week_ending`.
- Safety leaderboards: rolling last 7 days; eligibility = drivers in
  latest scorecard.
- Each surface labels its own week in the subtitle so cross-period
  reads are visible.

### Amazon Week 1 = Sun-Sat week containing Jan 1
Not "first Sunday ≥ Jan 1." Fixed in `lib/format/dates.ts`. One-time
SQL backfill shifted `scorecards.week_ending` and `pod_details.week_ending`
by 7 days.

### Scope is what Amazon doesn't surface well
Amazon's own dashboards own PMs, DVIC/AVI inspections, DOT/BIT,
odometer defects, warning lights, mileage. Our Fleet module fills the
gaps Amazon leaves: status (with manual overrides), registration
expiry, shop location, our own minor-issue / parts tracker, QR labels,
PAVE compliance. Resist the urge to duplicate Amazon-owned data.

### Locally-managed vs source-of-truth fields are separated explicitly
On `vehicles`, Amazon-managed columns get overwritten on every import;
locally-managed fields (current_shop_id, eod_parking_location, notes)
are never touched. The operational status column is *override-aware*:
a manual override stops imports from overwriting it, with a UI callout
showing what Amazon currently reports and a one-click "use Amazon's
value" to clear. Same pattern is the right starting point if other
features need to merge user-managed and source-of-truth data.

### Inline editing > separate admin pages
The Duties checklist originally had a separate `/admin/duties` page
for template CRUD. We collapsed it: `/duties` itself has the
checkboxes for everyone, plus inline "+ Add task" footers on each
section + per-row delete icons (management only). One less page,
one less click, same security. Default to this pattern when adding
new admin surfaces.

### Reuse one button style for primary actions
All four primary-action header rows (Daily Ops, Fleet, Drivers,
Management) use the same compact primary-blue button class:
```
inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5
text-sm font-medium text-primary-foreground shadow-sm
transition-colors hover:bg-primary/90
```
The earlier subtle gray-text links on `/fleet` got missed entirely by
a real dispatcher during testing. Subtle is a liability for actions
users need to find.

## 3. Active gotchas

### Filesystem flake (macOS APFS)
Occasional `ENOENT` / `ETIMEDOUT` / "short read" during builds. Not
code — APFS / Spotlight indexing. Remedy:
```bash
rm -rf .next node_modules/.cache && npm install && npm run dev
```
Production builds also hit this — a clean rebuild after `rm -rf .next
node_modules/.cache` reliably passes.

### Vercel auto-deploy can drop a commit
Saw this once: `39b79e6` was on GitHub but Vercel didn't pick it up
for 7+ minutes. Pushing a trivial commit (e.g.
`git commit --allow-empty -m "chore: nudge Vercel"`) reliably wakes
the webhook. Manual "Redeploy from latest commit on main" via the
Vercel deployments page works too.

### Turbopack avoided
`next dev` and `next build` are both pinned to `--webpack`. Turbopack
16.2.4–16.2.6 had a temp-manifest race. Don't switch back without
re-testing.

### shadcn flavor = base-ui, not Radix
Components in `components/ui/*` wrap `@base-ui/react/*`. Prop
differences worth knowing:
- `DropdownMenuTrigger` does NOT accept `asChild`
- `Tabs`, `Dialog`, `Checkbox`, `Select` follow base-ui's API
- `Select.onValueChange` receives `string | null` (not `string`) —
  wrap with `(v) => set(v ?? defaultValue)` to satisfy types

### TypeScript strictness on event handlers
Use `e.currentTarget.value`, not `e.target.value`. Latter trips
base-ui inputs under Next 16 strict.

### PDF imports on Vercel
pdfjs-dist needs `DOMMatrix` / `Path2D` / `ImageData` globals that
Node doesn't ship. `lib/parsing/pdfjs-node-polyfill.ts` polyfills
them via `@napi-rs/canvas`; both are listed in
`serverExternalPackages` in `next.config.ts`. The pdf.worker.mjs file
is force-included via `outputFileTracingIncludes`.

### xlsx (SheetJS) audit warning
`npm audit` reports a high-severity finding for `xlsx` (prototype
pollution + ReDoS). Practical impact for our use case (parsing only
Amazon's xlsx, behind auth, internal app, files we control) is
negligible. Don't ignore forever — revisit if scope grows.

### Git committer identity
Sandbox can't auto-detect `user.email`. Commits use the inline form
`git -c user.email="spikembj@gmail.com" -c
user.name="Michael Jorgensen" commit ...`. Don't set this in global
config without the user's say-so.

### Commit messages can't contain apostrophes inside heredocs
The heredoc / backtick combo we use for `git commit -m "$(cat <<EOF
… EOF)"` breaks on apostrophes (`don't`). Rephrase with words instead
("do not" / "user has"). Affects only the commit message text.

### Auth invite / recovery + URL hash tokens
Supabase recovery + invite emails use the **implicit flow** —
tokens arrive in the URL hash (`#access_token=…&refresh_token=…`),
which server code can never see. `/set-password` is therefore a
client-handled page: it reads the hash, calls
`supabase.auth.setSession`, then renders the form. The middleware
treats `/set-password` as public so the pre-auth visit can land.
Three earlier attempts each tripped a different facet of this:
1. server-side getUser → bounce to /login (silent failure)
2. callback route stripping the hash on redirect
3. middleware bouncing the unauthenticated landing visit
All three are fixed; do not regress.

### Server-only modules in client components
`lib/queries/fleet.ts` and `lib/queries/daily-ops.ts` import
`server-only`. Types + pure helpers live in sibling `*-types.ts`
files so client components can import them without dragging the
server module into the bundle. Pattern: when a new query module is
added and its types get used in any client component, split the
types into a sibling `<name>-types.ts` file.

### SMTP rate limit on Supabase free tier
~3–4 auth emails per hour through Supabase's default SMTP. Inviting
several teammates in quick succession will silently drop later ones.
If/when this bites, wire up Resend (or similar) in Supabase →
Authentication → SMTP Settings. No code change required.

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
- `SUPABASE_SERVICE_ROLE_KEY`: **Production only** (limits blast
  radius if a preview URL leaks)

### Connected services
- **Supabase project:** `oaufkjqtjecffpkcwewp`
- **GitHub:** https://github.com/spikembj/logical-dsp-ops.git
- **Vercel:** project `logical-ops`, production URL above. GitHub
  integration installed — every push to `main` auto-deploys (with
  the occasional dropped commit — see gotcha above).
- **Supabase Auth URL Configuration:** Site URL = production URL;
  Redirect allowlist includes `https://logical-ops.vercel.app/**`
  and `http://localhost:3000/**`.

### Workflow preferences (from prior sessions)
- **Discuss before coding** on anything non-trivial. Lay out
  options + tradeoffs and wait for the call.
- **Do it properly** even when slower. User said: "I would rather
  take longer to build it correctly from the bottom up than get it
  all done sooner."
- **Block, don't warn**, on data integrity (file-hash dedup, etc.).
- **Do not suggest stopping or breaks.** User said directly: "it
  annoys me." After shipping a pass, jump to the next thing or ask
  what's next — no "good place to stop" framing.
- **Paste SQL inline as fenced ```sql blocks**, not GitHub links.
  User pastes them straight into Supabase's SQL editor.

## 5. Database state

**All 32 migrations in `supabase/migrations/` have been run against
the live DB.** New since the previous HANDOFF (most recent first):

```
20260518233330  hr_duties_scope (duties_template_items.scope column +
                partial index + 10-item HR daily seed lifted from
                the dispatcher's spreadsheet)
20260518223018  hr_coaching_review (coaching_sessions.hr_reviewed_at +
                hr_reviewed_by + hr_review_notes + two partial indexes
                for the HR queue + worst-10 query)
20260518072444  duties_checklist (duties_template_items +
                duties_completion + RLS + seed ~70 items from the
                dispatcher's existing DUT7 Duties Checklist sheet)
20260518062804  coaching_sessions.category CHECK extended with 11
                policy-point categories + import_type enum extended
                with 'policy_points'
20260518055531  daily_report + vehicle_issues.source column
                with backfill + apply_vehicle_grounding_changes
                updated to tag source='grounding_auto'
20260518033735  vehicle_shops (table + seed of 19 values + FK on
                vehicles.current_shop_id + case-insensitive backfill
                from deprecated current_shop_location text column)
20260518002930  daily_ops_phase_a (wave_times + daily_roster +
                is_operations() helper + RLS + seed 8 waves)
20260517200214  vehicle_pave_inspections (quarterly PAVE tracking +
                quarter/year sync trigger)
20260517185341  phantom drivers round two (broader policy: drivers
                without scorecard or coaching are phantoms)
20260517000344  fleet phase 2 (vehicles, vehicle_issues, vehicle_parts,
                operational_status_source override fields, grounding
                auto-issue function)
```

Plus all prior migrations.

**Live data state worth knowing:**
- 60 vehicles imported via Amazon `VehiclesData.xlsx` (DUT7 only).
- Round-two phantom cleanup removed concession-only / Netradyne-only
  drivers; the list was 100% DUT4 names per user review before apply.
- POLICY POINTS CSV backfilled: 90 days of historical write-ups
  landed as `coaching_sessions` with `session_type='write_up'`.
- PAVE inspections table empty until first Q2 2026 inspection logged.
- Duties template seeded with ~70 items from the spreadsheet (split
  daily / weekly / monthly).

## 6. Open / deferred / out-of-scope

### Open (small / nice-to-have)
- **Per-period tracking on `file_imports`** (was original Pass 8).
  Would add `period_start` / `period_end` for audit trail. Low
  priority — donut alignment no longer needs it.
- **Linked scorecard / event UI on coaching sessions.** Schema
  fields exist; no picker UI yet.
- **Downloadable error CSVs from the Import result card.**
- **"Show all" toggle on the PAVE history mini-section** —
  currently shows last 4 inspections.
- **Fleet History tab** on van detail was explicitly deferred from
  Phase 2 ("low priority — polish pass").
- **Drop `vehicles.current_shop_location` text column** once verified
  the backfill didn't lose anything. Currently marked DEPRECATED in
  the schema comment.

### Phase 3 (user-flagged)
- **HR / hiring.** Pass A shipped (coaching review queue + worst-10 +
  `/hr` landing). Remaining passes per the user's spec call:
  - **B** — HR-specific daily checklist (separate from `/duties`)
  - **C** — Candidates kanban with the 8 status buckets (matches the
    spreadsheet layout the user shared). Separate `candidates` table —
    on TO HIRE, create a `drivers` row with a `candidate_id` FK back
    so HR can click into pre-hire history. High turnover is the reason
    we are NOT unifying with `drivers`.
  - **D** — Dispatcher interview view inside `/daily` (all dispatchers
    see all interviews; first to fill in notes "claims" the row). HR
    edits the dispatcher's question set.
  - **E** — Per-candidate QR-encoded interviewee form (unique URL so
    answers auto-link to the candidate). HR reviews both forms side
    by side.
  - **F** — Onboarding tracking (separate HR onboarding form,
    document expiry beyond what Amazon covers).
- **Driver-facing VCR submission.** Photo-driven damage detection too.
  (User explicitly deferred — skip for now.)
- **Incidents / accidents with insurance + photos.** Separate from
  `vehicle_issues`. User explicitly said: do this AFTER HR is complete.

### Explicitly out of scope
- ADP / Slack / Rivian portal integrations
- Mobile app
- Auto-scraping of Amazon DSP portal (TOS / contract risk — tabled).

## 7. Folder structure (current)

```
.
├── .claude/                          # gitignored — agent worktrees
├── app/
│   ├── (app)/
│   │   ├── admin/
│   │   │   ├── shops/                # Shops dropdown CRUD (mgmt only)
│   │   │   ├── users/                # Management page (invite + reset)
│   │   │   └── waves/                # Wave-times CRUD (mgmt only)
│   │   ├── daily/
│   │   │   ├── page.tsx              # Roster (van-first inline editor)
│   │   │   ├── eod/page.tsx          # End-of-day form
│   │   │   └── paper/page.tsx        # Printable Daily Paper
│   │   ├── drivers/
│   │   │   ├── [id]/                 # Driver detail (4 tabs)
│   │   │   └── page.tsx              # Unified Drivers + Helpers list
│   │   ├── duties/page.tsx           # Duties checklist + inline edit
│   │   ├── hr/
│   │   │   ├── page.tsx              # HR landing — Phase 3 Pass A
│   │   │   └── duties/page.tsx       # HR-specific checklist — Pass B
│   │   ├── fleet/
│   │   │   ├── page.tsx              # Fleet dashboard (3 tiles + heroes + parts + PAVE)
│   │   │   ├── vans/page.tsx         # Vehicles list
│   │   │   ├── vans/[vin]/           # Vehicle detail (Overview / Issues / Parts)
│   │   │   └── qr-sheet/page.tsx     # Printable VIN-QR labels
│   │   ├── import/page.tsx           # 9-tab import surface
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Performance dashboard (Safety/Quality split)
│   ├── (auth)/login/                 # Email + password login
│   ├── (auth)/set-password/          # Client-handled invite/reset landing
│   ├── actions/                      # 13 server-action files
│   ├── auth/callback/                # Magic-link / OAuth callback
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── app/
│   │   ├── admin/                    # users-table (Management page)
│   │   ├── coaching/                 # log/edit/void dialog, triggers panel
│   │   ├── daily-ops/                # date-nav, daily-roster,
│   │   │                             # duties-checklist, eod-form,
│   │   │                             # print-button, waves-admin
│   │   ├── dashboard/                # tiles + charts + leaderboards
│   │   ├── defects/, import/, perf/, safety-events/
│   │   ├── fleet/                    # vehicle-tile, dual-vehicle-tile,
│   │   │                             # vehicles-table, vehicle-detail,
│   │   │                             # vehicle-overview/issues/parts-tab,
│   │   │                             # vehicle-qr-button, qr-sheet,
│   │   │                             # pave-tile, shops-admin
│   │   ├── hr/                       # coaching-review-queue,
│   │   │                             # worst-offenders-panel
│   │   └── …driver-tabs, driver-form-dialog, sidebar-nav, sign-out, theme-*
│   └── ui/                           # shadcn (base-ui flavor) primitives
├── lib/
│   ├── auth/require-role.ts
│   ├── format/                       # badges, dates (Amazon-week helpers)
│   ├── parsing/                      # 7 parsers + file-hash + pdfjs polyfill
│   ├── queries/                      # 14 query helpers + 3 *-types modules
│   ├── supabase/                     # client / server / middleware
│   ├── types/database.ts
│   ├── util/
│   │   ├── coaching-prefill.ts       # trigger → dialog defaults + category map
│   │   └── name-match.ts             # fuzzy nickname/prefix matcher
│   └── utils.ts
├── public/
├── scripts/                          # seed-drivers-from-csv.mjs
├── supabase/migrations/              # 30 migrations (see §5)
├── proxy.ts                          # Next 16 rename of middleware.ts
├── next.config.ts                    # serverExternalPackages + outputFileTracingIncludes
├── package.json
├── SPEC.md                           # Source of truth
└── HANDOFF.md                        # This file
```

`_reference/` (gitignored) holds the user's real CSVs/PDFs/XLSX we
built parsers against. Files never matched against a parser are in
`_reference/_unused/` for the user to delete if desired.

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
> - Any clarifying questions on the design principles (§2) or the
>   open items list (§6).
> - Which open item or next-phase direction you'd recommend starting
>   with, and why.
>
> Treat SPEC.md as authoritative. Update SPEC.md in the same commit
> as any code change that contradicts or extends it. **SQL migrations
> are pasted inline as fenced ```sql blocks**, never as GitHub links
> — the user pastes them straight into Supabase's SQL editor.
>
> Workflow expectations are in HANDOFF §4 — discuss before coding,
> do it properly, block (do not warn) on data integrity, do not
> suggest stopping points.
>
> Performance + Safety + Quality + Fleet + Daily Ops dashboards,
> coaching workflow, all 9 imports, and production deploy are all
> live and stable. Don't reinvent any of them — extend the patterns
> when adding new surfaces.

---
