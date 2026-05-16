# Logical Ops — DSP Operations App Specification

> **Source-of-truth note:** Any decision that contradicts or extends this
> document must be reflected here in the same commit as the code change.
> If you're reading this and the app behaves differently, that's a bug.

## Overview

Internal web app to replace spreadsheets for managing day-to-day operations at an Amazon DSP (last-mile delivery). Built for a small team of managers, admins, and dispatchers (3–10 users). Phase 1 focuses on **performance and coaching tracking** — the area where spreadsheets cause the most pain.

Long-term vision: a single tool that owns roster, performance, attendance, fleet/VCRs, onboarding, and incidents.

## Goals

- Replace spreadsheet-based performance tracking with a real system of record.
- Make coaching history per driver instantly accessible (the #1 thing sheets fail at).
- Surface trends — who's improving, who's regressing, who needs intervention this week.
- Keep an audit trail: nothing gets silently overwritten.
- Free to run while we prove it works; clean path to a modest paid tier.

## Non-Goals (Phase 1)

- No mobile app. Mobile-friendly web is "nice to have," not required.
- No real-time integrations with Cortex / Netradyne / ADP — file upload only.
- No driver-facing features. Internal ops tool.
- No vehicle assignment workflow yet (deferred to fleet module).

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | One codebase, fast iteration |
| UI | Tailwind v4 + shadcn/ui (base-ui flavor) | Clean defaults |
| Aesthetic | Apple design philosophy | System fonts (SF stack), generous spacing, subtle depth, light/dark adaptive |
| Database | Supabase (Postgres) | Free tier covers MVP |
| Auth | Supabase Auth | Email/password + role-based |
| File storage | Supabase Storage | (planned) for CSV/PDF archive |
| CSV parsing | PapaParse | Battle-tested |
| PDF parsing | pdfjs-dist (legacy/Node build) + `@napi-rs/canvas` polyfill | Legacy build runs in Node; the canvas package provides `DOMMatrix`/`Path2D`/`ImageData` on Vercel's stricter Node runtime (see `lib/parsing/pdfjs-node-polyfill.ts`). Both packages are `serverExternalPackages`. |
| Charts | Recharts | Multi-line trend chart, shared by the per-driver Performance tab and the home Performance dashboard's company-wide trend (last 12 weeks: Overall / DCR / POD) |
| Hosting | Vercel | Free tier, zero-config Next.js deploys |

> **Cost path:** $0 to start → ~$25/mo (Supabase Pro) → ~$45/mo (Vercel Pro) if needed.

## User Roles

The Postgres enum is `owner | hr | ops_manager | dispatcher`, plus legacy `admin | manager` values still in the type for compat (no row uses them after the management-roles migration).

| Role | Permissions |
|---|---|
| **Owner** | Everything — management UI, driver CRUD, coaching edits/voids, imports, all data. |
| **HR** | Same write access as Owner. Distinct label for org clarity. |
| **Ops Manager** | Same write access as Owner. Distinct label for org clarity. |
| **Dispatcher** | View everything. Can log + acknowledge coaching sessions. Cannot edit/void others' coaching, run imports, manage users/drivers. |

> Owner / HR / Ops Manager are functionally identical permission-wise — the labels exist for org reporting. Dispatchers are the only restricted role.

Role is set by management when a teammate is invited. Stored on `users` table. The SQL helper `is_management()` returns true for Owner/HR/Ops Manager (and legacy admin/manager) — used by every RLS policy that gates writes.

**Coaching permissions** (refined during build):
- *Create session*: any active user
- *Acknowledge / unacknowledge*: any active user (via `set_coaching_acknowledged` RPC — bypasses RLS so dispatchers can flip the toggle without being able to edit content)
- *Edit content (topic / notes / date / type)*: management only
- *Void / unvoid*: management only

> **Dispatchers who also drive:** some dispatchers (e.g. Colby, Manuel, Athena) also run routes. `users.driver_id` is a nullable FK to `drivers.id` linking the two records; one-to-one enforced by a partial unique index. The Management page exposes a picker to set or clear the link. `is_management()` ignores this column — driving doesn't grant management permissions.

## Data Model

### `users`
Internal team members.
- `id` (uuid, PK, links to Supabase `auth.users`)
- `email`, `full_name`, `role` (owner / hr / ops_manager / dispatcher; legacy admin/manager values exist), `active` (bool), `created_at`

### `drivers`
- `id` (uuid, PK)
- `transporter_id` (text, **nullable**, unique) — Amazon's short A-prefixed ID
- `full_name`
- `hire_date` (date, nullable)
- `status` (enum: **active / loa / terminated / inactive**)
- `position` (enum: **driver / helper**, default `driver`) — helpers ride along but don't drive any vehicle.
- `approved_vehicle_types` (`vehicle_type[]` — `cdv / edv / standard_parcel`). Ignored when `position = helper`. (Rivians are operated as EDVs at this DSP, so the legacy `rivian` enum value was removed; existing rivian-approved drivers were folded into edv.)
- `notes` (text, nullable)
- `created_at`, `updated_at`

> **Status semantics:**
> - `active` = currently working
> - `loa` = leave of absence (manually set)
> - `terminated` = fired/quit (manually set)
> - `inactive` = no scorecard or safety_event in the last 60 days (auto-set by `refresh_driver_active_status()`)
>
> `inactive` is reversible: a driver who reappears in new data flips back to `active` automatically.

> **Why `transporter_id` is nullable:** drivers can be created from the Netradyne CSV (which uses different IDs we don't store) or from manual entry before any scorecard import. The transporter_id is populated by the first scorecard / DSP-overview / escalations import that names them.

### `scorecards`
Weekly performance snapshot per driver. Unique on (`driver_id`, `week_ending`); re-imports upsert.
- `id`, `driver_id`, `week_ending`
- `tier` (nullable enum — see below)
- **`overall_score`** (numeric, nullable) — DSP Overview CSV's per-driver 0–100 score
- `delivered`, `fico_score` (int, nullable)
- `dcr`, `delivery_completion_rate` (numeric, nullable)
- `pod`, `psb` (numeric, nullable)
- `cdf`, `ced`, `dsb` (int DPMO values, nullable)
- `dsb_count`, `pod_opps` (int counts, nullable)
- `seatbelt_off_rate`, `speeding_event_rate`, `distractions_rate`, `following_distance_rate`, `sign_signal_violations_rate` (numeric, nullable)
- `raw_data` (jsonb)
- `imported_from` (FK → file_imports)
- `created_at`

> **Tier enum:** `fantastic_plus / fantastic / great / fair / poor / platinum / gold / silver / bronze`. The Fantastic family is Amazon's legacy naming; Platinum/Gold/Silver/Bronze is the new one. Both coexist because some sources still emit the old labels.

### `safety_events`
Aggregated event counts per (driver, event_type, period).
- `id`, `driver_id`, `event_date` (timestamptz — period_end for aggregated rows)
- `event_type` (text), `severity` (enum: impacting / non_impacting), `count` (int)
- `source` (text — "netradyne", "manual", etc.)
- `raw_data` (jsonb), `imported_from` (FK), `notes`, `created_at`

> **Severity classification:**
> - **Impacting:** Sign Violations, Traffic Light Violation, Speeding Violations, Driver Distraction, Seatbelt Compliance, Camera Obstruction, Following Distance, Roadside Parking
> - **Non-impacting:** High-G, Hard Braking, Hard Turn, Hard Acceleration, Driver Drowsiness, Weaving, Backing
> - Other Netradyne columns (Low Impact, Driver Initiated, Potential Collision, U Turn, Collision Warning, Requested Video, Cabin Object, Lane Conduct) default to non-impacting.

> **Re-import strategy:** wipe-and-replace by (`source`, `event_date`) before insert. Admin/manager have DELETE permission for this purpose.

### `escalations`
**One row per individual Amazon-issued infraction.** Distinct from safety_events (which is aggregated telemetry) and from coaching_sessions (which is the manager's response).
- `id`, `driver_id`
- `station_code`, `dsp_name`
- `bucket`, `category`, `behavior` (text — Amazon's classification)
- `incident_date` (date), `dsp_notification_date` (date, nullable)
- `ack_status` (text — raw "Yes/No" appeal/coaching status from CSV)
- `scorecard_week` (text), `total_defects_120d` (int)
- `source` (text, default `"amazon-escalations"`)
- `raw_data` (jsonb), `imported_from` (FK), `notes`, `created_at`

Unique on (`driver_id`, `incident_date`, `behavior`, `bucket`); re-imports upsert.

### `coaching_sessions`
- `id`, `driver_id`, `coached_by`
- `session_date` (date)
- **`session_type`** (enum: **discussion / training / verbal_warning / write_up / final_warning / termination**, default `discussion`). `training` is the type used for stats-coaching sessions opened from a trigger row (gets a green badge in the session card).
- **`category`** (text, default `'other'`, CHECK in `safety` / `quality` / `escalation` / `other`) — system-managed field that controls which trigger clears from the needs-coaching lists when this session lands. Not exposed in the dialog UI; auto-set from where the dialog was opened. Trigger-button click paths set it to `safety` / `quality` / `escalation`; the standalone "Log new session" button defaults to `other` (which clears nothing).
- `topic`, `notes`
- `acknowledged` (bool), `acknowledged_at` (timestamptz, nullable)
- `linked_scorecard_id`, `linked_event_ids` (uuid[])
- **`voided_at`, `voided_by`, `void_reason`** — all-or-nothing CHECK constraint. Soft-delete with required reason. Unvoid is admin-only.
- `created_at`, `updated_at`

> **Audit rule:** every UPDATE fires the `log_coaching_session_revision` trigger which snapshots the prior row into `coaching_session_revisions` (jsonb `previous_values`). Originals never silently overwritten. Acknowledge toggles, edits, voids, and unvoids all land in the audit chain.

### `coaching_session_revisions`
`id`, `coaching_session_id` (FK, cascade delete), `edited_by`, `edited_at`, `previous_values` (jsonb).

### `file_imports`  *(was `csv_imports` in the original spec)*
Renamed because not all imports are CSVs (Scorecard PDF, POD Details PDF).
- `id`, `uploaded_by`
- `import_type` (enum: **scorecard / netradyne / escalations / cdf / concessions / pod_details**)
- `file_name`, `file_hash` (nullable), `row_count`, `success_count`, `error_count`, `errors` (jsonb), `created_at`

> The `file_hash` column exists; populating it + warning on duplicate uploads is **deferred** (low ops impact for the small team using the app).

### `concessions`
**One row per individual package concession** (defect on a single delivery). Sourced from the DSP Delivery Concessions CSV. The `impacts_dsb` flag identifies concessions that count toward the DSB metric on the weekly scorecard — these provide the per-package detail behind the DSB Count quality trigger.
- `id`, `driver_id`, `tracking_id` (TBA…), `concession_date`
- `pickup_date`, `delivery_attempt_date`, `delivery_date` (all nullable)
- `delivery_type`, `service_area`, `dsp_name`
- `impacts_dsb` (bool), `defect_types` (text[] — set of flagged categories)
- `raw_data`, `imported_from`, `notes`, `created_at`

Unique on (`driver_id`, `tracking_id`); re-imports upsert.

### `cdf_negative`
**One row per individual negative customer comment.** Sourced from daily/weekly CDF Negative CSVs (same parser handles both).
- `id`, `driver_id`, `tracking_id`, `delivery_group_id`, `delivery_date`
- `feedback_details` (text — verbatim comment, nullable)
- `feedback_types` (text[] — set of flagged categories: Mishandled / Unprofessional / Wrong Address / etc.)
- `raw_data`, `imported_from`, `notes`, `created_at`

Unique on (`driver_id`, `tracking_id`); re-imports upsert.

### `pod_details`
**One row per driver per week** with the Photo-On-Delivery acceptance breakdown. Adds the per-reason reject detail that the scorecard PDF doesn't expose.
- `id`, `driver_id`, `week_ending`
- Totals: `opportunities`, `success`, `bypass`, `rejects`
- Reject reasons (9 columns): `blurry_photo`, `package_in_car`, `package_in_hand`, `package_too_close`, `photo_too_dark`, `human_in_picture`, `package_not_clearly_visible`, `no_package_detected`, `other_reject`
- `raw_data`, `imported_from`, `created_at`

Unique on (`driver_id`, `week_ending`); re-imports upsert.

## Helper SQL functions

- `current_user_role()` (security definer) — reads caller's role for use in RLS.
- `is_active_user()` (security definer) — boolean, used in RLS predicates.
- `is_management()` (security definer) — true for owner / hr / ops_manager (and legacy admin / manager). Drives every RLS policy that gates writes on management-tier access.
- `set_updated_at()` — generic trigger for tables with `updated_at`.
- `log_coaching_session_revision()` — trigger on `coaching_sessions` UPDATE.
- `set_coaching_acknowledged(uuid, boolean)` (security definer, granted to authenticated) — lets dispatchers flip the acknowledged toggle without write access to the rest of the row.
- `refresh_driver_active_status()` (security definer, returns activated_count + deactivated_count) — bidirectional: drivers with no recent activity in 60 days flip from `active` → `inactive`; drivers who reappear in scorecards/events flip back. Called automatically at the end of every import action.

## Coaching Triggers (who needs coaching)

A driver "needs coaching this week" if any of these are true and they haven't been coached in the 7-day window. Logic shared by the dashboard and the per-driver Coaching tab triggers panel.

**Safety triggers:** any impacting safety_event (Netradyne) in the last 7 days.

**Quality triggers** (from latest scorecard):
- DCR < 99.0%
- POD < 99.0%
- CDF DPMO > 800
- CED ≥ 1
- DSB DPMO > 233 *(higher is worse — DPMO is a defect rate)*
- DSB Count ≥ 1 *(any raw defect at all)*
- PSB > 10% defect rate *(< 90% pickup success)*

**Escalation triggers:** any open `escalations` row (`ack_status` not "Yes"). Not bounded by the 7-day window — open escalations are open until acknowledged.

## Pages / Screens

### 1. Login (`/login`)
Email + password (Supabase Auth). Inactive users blocked. Header includes a soft card.

### 2. Performance dashboard (`/`)
Title: **Performance**. (App will host multiple dashboards over time — Ops, HR, Fleet — so the home dashboard is named for what it covers, not generic "Dashboard".)

**View toggle:** a pill control inline with the H1 switches between **Quality** and **Safety** views — same page, same `/`, just `?view=safety` in the URL when on the safety side. **Defaults to Quality** (the user's site isn't the live source for incoming safety events — those come through Netradyne directly — so quality is the more useful daily landing surface). Stat tiles, company trend chart, leaderboards, the needs-coaching hero, and the donuts all change content based on the selected view. The greeting line and the "Active drivers · N" subtitle are always visible.

Header: `Hi {firstName} — Week {N}, {Month Do, YYYY} · {N} active drivers`. If imported data lags today, header appends "(data through {date})". The active drivers count was previously a stat tile; demoted to subtitle since it's contextual not operational.

#### Safety view stat tiles (4)
- **Impacting events** — last 7 days.
- **Non-impacting events** — last 7 days.
- **Coaching sessions** — logged this week.
- **Above threshold** — drivers with 1+ impacting OR 4+ non-impacting events in the last 7 days. Clickable: opens a dialog with the driver list, each name linking to their profile.

#### Quality view stat tiles (4)
- **Avg overall score** — average across all drivers in the latest scorecard week.
- **Drivers with negative CDF** — distinct drivers with one or more `cdf_negative` rows in the Quality dashboard's anchor week (see donut section for the anchor logic). Same window as the CDF donut below, so the tile count and the donut total match.
- **Coaching sessions** — logged this week.
- **Below threshold** — drivers breaking any quality threshold (DCR / POD / CDF DPMO / CED / DSB DPMO / DSB Count / PSB) on the latest scorecard. Clickable dialog with the list.

#### Safety view trend chart
Per-event-type weekly counts for the last 12 Amazon weeks. Severity toggle (Impacting / Non-impacting) swaps the data source. Each event type gets its own colored line; the top 4 highest-volume types are active by default, others toggle on/off via legend pills.

#### Quality view trend chart
Multi-series line chart with a scale toggle (Percent / DPMO+count):
- **Percent** mode: Overall / DCR / POD (0-100 axis).
- **DPMO** mode: CDF DPMO / DSB DPMO / CED (auto-scaled, lower is better).
Same simple unweighted average across all drivers per week — no minimum-volume filter, no current-status filter. Volume-weighting deliberately avoided so the displayed averages don't diverge from Amazon's DSP Overview.

#### Safety view leaderboards (3 cards)
- **Cleanest 5** — fewest impacting events in the last 7 days, ascending. Eligibility = drivers in the latest scorecard (i.e. they actually ran routes during the reporting week).
- **Most improved (top 3)** — biggest week-over-week drop in impacting events. Both weeks must show enough activity to compare; drivers with no improvement excluded.
- **Most events** — descending. Only includes drivers with ≥1 event.

#### Quality view leaderboards (3 cards)
- **Top 5 / Bottom 5** — drivers with `delivered ≥ 400` packages on the latest scorecard and `status = 'active'`, sorted by `overall_score`.
- **Most improved (top 3)** — same eligibility on both the latest week and the week before; positive score delta only.

#### Safety view donuts
Two donut charts side by side (Impacting / Non-impacting), each showing the per-event-type breakdown for the **rolling last 7 days**. Designed for the daily Netradyne upload workflow.

#### Quality view donuts
Two donut charts: **Negative CDF** (feedback types from `cdf_negative` rows in the anchor week) and **DSB** (defect types from `concessions WHERE impacts_dsb = true` in the anchor week). The anchor week is the Sun-Sat Amazon week containing the **most recent date across scorecards, cdf_negative, and concessions** — chosen this way because Amazon publishes scorecards a day or two into the following week, while CDF Negative and Concessions may already be uploaded for the just-completed week. Strictly anchoring to scorecard week would hide that fresh data; taking the max-of-all keeps the donuts honest. Leaderboards stay on scorecard week (they need overall_score) so the donut and leaderboard subtitles may name different weeks during the early-week scorecard gap — each surface labels its own week. The DSB donut deliberately reuses concessions data rather than maintaining a parallel DSB table — the underlying Amazon CSV is the same.

#### Needs coaching hero
Renders below the leaderboards on both views. Content is filtered to whichever view is active — no more in-list Safety/Quality toggle (the dashboard-level toggle handles it). Per-row inline `Log session` button pre-fills the dialog with the view's trigger context.

### 3. Drivers list (`/drivers`)
Searchable, sortable table. Columns: Name (with **Helper** badge when applicable) / Transporter ID / Status / Current Tier / Score / Last Coached / Approved Vehicles. Status filter chips (All / Active / LOA / Inactive / Terminated). Last Coached shows the most recent **non-voided** session as a relative time ("3 days ago") with the absolute date in a tooltip.

### 4. Driver detail (`/drivers/[id]`)
Tabbed: Profile / Performance / Safety events / Coaching. Header strip: name, **Helper** badge if position=helper, status badge, tier badge (from latest scorecard), overall score, last coached (relative time with absolute date in tooltip; — when never coached).

- **Profile:** read-only fields including Position. Editing happens via `/admin/employees`.
- **Performance:** Recharts trend chart (last 12 weeks of Overall / DCR / POD with toggleable series; FICO is captured in scorecards but intentionally not charted) at the top, followed by the wide metrics table grouped as Standing (Tier + Score) | Volume (Delivered) | Safety | Delivery Quality. Negative CDF summary card groups TBAs **by feedback type** (a TBA appears under every type it was flagged for), each TBA shown with its delivery date for easy lookup during coaching. Below the table: summary cards for **POD reject breakdown** (when latest week has rejects), **Concessions** (totals + DSB-impacting count + per-defect-type breakdown), and **Negative Customer Delivery Feedback** (per-type breakdown + full TBA + date list).
- **Safety events:** filterable list (default: last 30 days, impacting only). Toggle to show non-impacting.
- **Coaching:** Triggers panel (Safety / Quality / Escalations) above the chronological session history. Each session shows session_type badge, coach, ack toggle. Edit / Void buttons (management only). "Show N voided" toggle when voided sessions exist.

### 5. Log coaching session (modal)
Date, **type dropdown** (Discussion / Verbal warning / Write up / Final warning / Termination), topic, notes, acknowledged toggle. Save creates immutable session record. Edit mode uses same dialog (management only).

**Trigger-context pre-fill:** when the dialog is opened from a needs-coaching row (Performance dashboard hero list) or a category card on the per-driver Triggers panel, fields pre-populate with the category's context — session type defaults to **Training**, topic to "Safety training" / "Quality training" / "Escalation review", `category` (hidden, system-managed) to the matching value so the corresponding trigger clears on save, and notes to a templated summary of the specific triggers ("3 impacting safety events in last 7 days: Speeding Violations, Driver Distraction", or the latest scorecard's threshold breaches as a bulleted list). The user-visible fields (type, topic, notes, ack) stay editable. The standalone "Log new session" button at the top of the Coaching tab intentionally opens **blank** with type=Discussion and `category = 'other'` — write-ups and out-of-band sessions aren't shaped by templates and don't accidentally clear unrelated triggers.

**Per-category clearing:** the dashboard needs-coaching lists and the per-driver Triggers panel both filter their content by category. Saving a Safety-category session clears the safety trigger for that driver in the 7-day window but leaves any quality trigger intact (and vice versa). `'other'` sessions don't clear anything. Triggers naturally re-surface when the window advances past the session, or when fresh data arrives (new safety events, new scorecard).

### 6. Import (`/import`)
Seven tabs, each backed by `requireRole(["owner","hr","ops_manager","admin","manager"])` (management only). All share a window-level drop-guard so a stray drop outside the dashed area can't navigate the browser to the file.
- **DSP Overview (CSV)** — *primary scorecard source going forward.* Per-driver tier + overall_score + every metric.
- **Scorecard (PDF)** — fallback when the CSV isn't available; same destination table.
- **Netradyne (CSV)** — aggregated event counts; wipe-and-replace by (`source`, `event_date`). **Does not auto-create drivers** — names not already in the `drivers` table are skipped, because Netradyne camera accounts often span multiple physical DSP locations under one org (e.g. DUT4 + DUT7). A driver joins this DSP only when they appear in a station-specific source below. When the strict name lookup misses, a **fuzzy fallback** runs (first-name prefix, common-nickname dictionary, extra-last-name token) — handles the case where Netradyne uses a driver's legal name and Amazon uses what they entered. Fuzzy matches are surfaced in the import result for human review and logged to `file_imports.errors` with the reason. Helpers are excluded from the fuzzy candidate pool.
- **Escalations (CSV)** — Amazon-issued infractions.
- **Concessions (CSV)** — per-package delivery defects.
- **CDF Negative (CSV)** — per-package customer feedback (handles daily and weekly exports).
- **POD Details (PDF)** — photo-on-delivery acceptance breakdown by reject reason. Year falls back to filename when missing in PDF text.

Result card shows match counts and any errors. Driver matching: by transporter_id when available, fallback to normalized full_name. Unmatched names auto-create driver rows **for all imports except Netradyne** (see above).

### 7. Management (`/admin/users`)
Sidebar label is **Management**. Owner-tier admins invite teammates by email (Supabase auth `inviteUserByEmail`), set roles (Owner / HR / Ops Manager / Dispatcher), deactivate. Self-row's role + active controls are disabled to prevent self-lockout. **Driver record column** links a user to a `drivers` row when they also drive routes (e.g. dispatchers who run occasional shifts) — linked rows show the driver's name as a clickable link to the driver profile, with a small unlink button next to it. Unlinked rows show a "Link…" picker dialog that searches active, not-yet-linked drivers. One-to-one enforced by a partial unique index on `users.driver_id`.

### 8. Employees (`/admin/employees`)
Sidebar label is **Employees** (renamed from "Drivers admin" to avoid collision with the public-facing Drivers list). Searchable + status-filterable list with per-row Edit dialog and Add employee dialog at the top. Covers both drivers and helpers — Edit covers every field including position (Driver / Helper) and approved vehicle types (vehicles hidden when position=helper).

## Build Order

1. ✅ Project setup, Supabase, auth, role-based middleware.
2. ✅ Drivers list + driver detail (read-only, seeded with real data from a Netradyne export).
3. ✅ Coaching: create + edit + void + history + per-session type.
4. ✅ Scorecard PDF import + Performance tab.
5. ✅ Netradyne CSV import + Safety events tab.
6. ✅ Performance dashboard (renamed from "Dashboard" — first of several future dashboards: Ops, Fleet, HR).
6. ✅ **6.5. Additional imports** *(extends the original spec):*
   - ✅ Wave 1: DSP Overview Dashboard CSV
   - ✅ Wave 2: Escalations CSV
   - ✅ Wave 3: Concessions CSV + CDF Negative CSV (also surfaced on Performance tab as summary cards instead of a separate Defects tab)
   - ✅ Wave 4: POD Details PDF (with reject-reason breakdown card on Performance tab)
7. ✅ Admin — Management page (Owner / HR / Ops Manager / Dispatcher roles, inviteUserByEmail) + Employees page (CRUD with position + standard_parcel rename).
8. ✅ Polish: Recharts multi-line trend chart on Performance tab.
9. ✅ Phase 1.5 (post-Phase-1 expansion, all shipped): Vercel deploy · Safety/Quality dashboard split with per-category trigger clearing · file-hash hard-block on duplicate uploads · dispatcher↔driver FK + Management picker · Netradyne fuzzy-match fallback + two-DSP filtering · Rivian vehicle type collapsed into EDV · per-event-type safety trend chart + DSB/CDF donuts on Quality view.

## Audit & Data Integrity Rules

- **Coaching sessions:** all UPDATEs flow through the audit trigger. Edits + void/unvoid + acknowledge toggles all snapshot prior state to `coaching_session_revisions`. Voids preserve the original row (soft-delete with required reason).
- **File imports:** every imported row links back to its `file_imports` row. **Duplicate uploads are hard-blocked** by SHA-256 hash on `file_imports.file_hash` — re-uploading the exact same bytes returns an error naming the original upload's date, filename, and import type. Applies globally across all 7 import types. Intentional re-uploads require renaming the file (any byte change forces a new hash).
- **Drivers:** never hard-deleted. Status flips to `terminated` (manual) or `inactive` (auto, reversible). Coaching history survives.
- **Timestamps:** every table has `created_at`. User-facing edits track `updated_at`.

## Environment / Config

- Default timezone for week boundaries: `America/Denver` (set via `NEXT_PUBLIC_DEFAULT_TZ`).
- Amazon DSP weeks are Sunday-through-Saturday. **Amazon's Week 1 of a year = the Sun-Sat week containing Jan 1** (so Week 1 can extend into the prior calendar year — Week 1 of 2026 starts Sun Dec 28, 2025). Helpers: `amazonWeekEnding(week, year)` and `amazonWeekFromEndingDate(weekEnding)` in `lib/format/dates.ts`.
- pdfjs-dist is marked as a serverExternalPackage in `next.config.ts` so the Node build's worker file resolves at runtime. `@napi-rs/canvas` provides the `DOMMatrix`/`Path2D`/`ImageData` globals that pdfjs needs on Vercel's stricter Node runtime (polyfill at `lib/parsing/pdfjs-node-polyfill.ts`, imported before any pdfjs dynamic import).

## Future / Out of Phase 1

The user has flagged these as planned future scope, not part of Phase 1:
- **More dashboards:** Ops & daily planning, Fleet tracking, HR (onboarding/offboarding). Each will sit at its own `/<dashboard>` route. The current home dashboard is intentionally named **Performance** for that reason.
<!-- Dispatcher ↔ driver linkage shipped — see Management page section above. -->
- (no items pending)

## Deferred

Schema and code support these but the UX hasn't shipped:
- **Linked scorecard / event UI on coaching sessions** — `coaching_sessions.linked_scorecard_id` and `linked_event_ids` exist; no picker UI yet.
- **Downloadable error CSVs** — errors are stored in `file_imports.errors` JSONB; UI shows a collapsible list but no download.
- **Per-period tracking on `file_imports`** — would add `period_start` / `period_end` columns and require parser updates. Originally proposed for donut alignment, but the donut anchor now reads dates from the data sources directly (CDF `delivery_date`, DSB `concession_date`), so this is purely audit-trail nice-to-have. Low priority.

## Out of Scope (Phase 1)

- Vehicle / VCR module (Phase 2)
- Attendance / call-out tracking (Phase 2)
- Onboarding & training (Phase 3)
- Incidents / accidents / damages (Phase 3)
- ADP / Slack / Rivian portal integrations
- Mobile app
