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
| Excel parsing | SheetJS (`xlsx`) | Parses Amazon's Vehicles xlsx export (the one file Amazon doesn't let us download as CSV) |
| QR codes | `qrcode` | Server-side SVG generation for per-van VIN labels used in the delivery app and around the lot |
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

### `vehicles`
**One row per van.** Seeded from Amazon's Vehicles xlsx export, upserted by VIN. The schema deliberately separates Amazon-managed columns from locally-managed columns — re-imports overwrite the Amazon side and leave our side untouched.

**Identity:**
- `id` (uuid, PK), `vin` (text, unique, not null) — VIN is the natural key for matching against the Amazon export, `id` is the FK target everywhere else.

**Amazon-managed columns** (overwritten by every import):
- `vehicle_name` (text) — human nickname like "VAN 20" / "CDV4" / "R4373 - LMR"
- `license_plate` (text, nullable)
- `make`, `model`, `sub_model`, `year` (text/text/text/int)
- `service_type` (text) — Amazon's verbose label, e.g. "Standard Parcel Electric - Rivian MEDIUM"
- `service_tier` (text) — Amazon's enum-ish code, e.g. `ELECTRIC_RPV_MEDIUM`
- `ownership_type` (enum: `amazon_owned / amazon_rental / amazon_leased`)
- `vehicle_provider` (text, nullable) — fleet management partner (`ELEMENT` / `LP`)
- `registration_expiry_date` (date, nullable) — present in Amazon's file but absent from Amazon's dashboard; surfaces directly on `/fleet` so registrations don't lapse silently
- `registered_state` (text, nullable)
- `station_code` (text) — `DUT4` / `DUT7`
- `raw_data` (jsonb) — full Amazon row, future-proofing against new columns
- `imported_from` (FK → file_imports, nullable)

**Operational status (override-aware):**
- `operational_status` (enum: `operational / grounded / ready_for_audit`) — current effective status, the value the dashboard and lists read
- `operational_status_source` (enum: `amazon / manual`, default `amazon`)
- `operational_status_changed_at` (timestamptz), `operational_status_changed_by` (uuid → users.id, nullable)
- `status_reason_message` (text, nullable) — Amazon's reason text, preserved even when a manual override is active so the UI can show "Amazon currently reports …"
- `manual_status_note` (text, nullable) — your reason when overriding

> **Re-import merge rule:** if `operational_status_source = 'amazon'`, overwrite the status normally. If `source = 'manual'`, leave the status alone but still update `raw_data` so the van detail page can render "Amazon currently reports OPERATIONAL — clear override?" The override clears when you click "Use Amazon's value," which sets source back to `amazon` and applies the latest imported value.

**Locally-managed columns** (untouched by imports):
- `current_shop_id` (uuid FK → vehicle_shops, nullable) — which shop / location the van is at right now. UI picks from the editable `vehicle_shops` list (see below). Old free-text `current_shop_location` column is deprecated but kept around for one cycle after the FK migration so any unmatched values aren't lost.
- `eod_parking_location` (text, nullable) — where it parks overnight on the lot
- `notes` (text, nullable)
- `created_at`, `updated_at`

### `vehicle_issues`
**One row per damage / issue / quirk we want to track.** Supplements (does not replace) Amazon's own issue tracker — scope is the small dents, minor mechanical things, and watch-list items Amazon doesn't ground for.
- `id` (uuid, PK), `vehicle_id` (FK → vehicles.id)
- `reported_at` (timestamptz, default now), `reported_by` (uuid → users.id, nullable)
- `category` (enum: `damage / mechanical / electrical / cosmetic / tires / other`)
- `severity` (enum: `minor / moderate / major / out_of_service`)
- `description` (text)
- `status` (enum: `open / in_shop / fixed / closed_no_repair`, default `open`)
- `resolved_at` (timestamptz, nullable), `resolution_notes` (text, nullable)
- `auto_created` (bool, default `false`) — `true` when created by the grounding-detection trigger on import
- `source` (text, check `'manual' | 'eod' | 'grounding_auto'`, default `'manual'`) — where the row came from. Manual = added on the Fleet page. EOD = typed in the End of Day report's per-van notes section (skip-the-steps issue logging). Grounding_auto = inserted by `apply_vehicle_grounding_changes` when an Amazon import flips a van grounded. UI shows a small EOD badge on issues with `source='eod'`.
- `photo_urls` (jsonb, default `[]`) — empty in Phase 2; populated in Phase 3 (driver-facing VCR + photo damage detection)
- `created_at`, `updated_at`

> **Auto-issue on grounding:** when a vehicles import flips a van from `operational` → `grounded` / `ready_for_audit`, a row is auto-created with `category='other'`, `severity='out_of_service'`, `auto_created=true`, and `description='Auto-created: Amazon grounded — {status_reason_message or "no reason given"}'`. The matching auto-row auto-closes when a later import flips the van back to `operational`. Manual issues are never auto-closed.

### `vehicle_parts`
**One row per part order.** Quantity-tracked so multi-unit orders ("3 brake pads for VAN 17") are a single row, not three.
- `id`, `vehicle_id` (FK → vehicles.id)
- `issue_id` (FK → vehicle_issues.id, **nullable**) — optional link to the issue the part is for; left null when stocking extras or pre-ordering
- `part_name` (text), `part_number` (text, nullable)
- `quantity_ordered`, `quantity_received`, `quantity_installed` (int, default `0`)
- `status` (enum: `needed / ordered / partial / received / installed / returned`) — derivable from the quantities except for `returned`, so stored explicitly
- `vendor` (text, nullable), `cost` (numeric, nullable)
- `ordered_at`, `received_at` (timestamptz, nullable)
- `notes` (text, nullable)
- `created_at`, `updated_at`

### `vehicle_shops`
**Editable lookup of "where a van is right now".** Backs the dropdown on each van's Overview card. Intentionally mixes real shop names (Jiffy Lube, Bountiful Ram Dealer) with locations (LGCL Parking Lot, DUT4) and quasi-statuses (Inactive, Return, Returned, In Use) — matches the dispatcher's existing spreadsheet column.
- `id` (uuid, PK), `name` (text, unique), `sort_order` (int, default 100), `active` (bool, default true)
- `created_at`, `updated_at`
- RLS: read for active users, write for management.
- `vehicles.current_shop_id` references this; ON DELETE SET NULL — deleting a shop clears it off every van that pointed to it.

### `wave_times`
**Editable lookup of Amazon wave numbers → show times.** Used by the Daily Ops roster picker and joined into the dispatch sheet for display. Seeded with 8 waves (1=09:50 … 8=10:30); Amazon re-times them ~twice a year. Management edits via `/admin/waves`.
- `wave` (int, PK, 1-20)
- `show_time` (time)
- `active` (bool, default true) — inactive waves stay in the table (so historical roster rows still join) but are hidden from the picker
- `created_at`, `updated_at`

### `daily_roster`
**One row per (date, driver, vehicle) assignment.** The dispatcher's daily workspace — replaces the "DUT7 Dispatch Sheet" Google Sheet. Rows are the permanent record of who drove which van on which day — useful when damage surfaces and we need to look up who had van X two days ago.
- `id` (uuid, PK), `date` (date), `driver_id` (FK → drivers, restrict), `vehicle_id` (FK → vehicles, restrict), `wave` (int, FK → wave_times.wave, restrict), `notes` (text, nullable)
- `created_at`, `updated_at`, `created_by`, `updated_by`
- Unique on (date, driver_id) and (date, vehicle_id) — prevents double-booking either side
- RLS: read for active users, write for **operations** (dispatcher + management). Dispatchers can edit; this is their workspace.

### `duties_template_items`
**Master list of recurring tasks.** Daily / weekly / monthly cadence. Daily items group into Preload out / Load out / Post load out / RTS / Closing; weekly + monthly are flat. Each item has an owner label (free text — Dispatcher / Assistant / Michael / Barzin / etc.) so the team can split work without ambiguity.
- `id` (uuid, PK), `cadence` (text check `daily|weekly|monthly`), `group_label` (text check, nullable — required for daily, must be null for weekly/monthly per the upsert action), `owner_label` (text), `description` (text), `sort_order` (int, default 100), `active` (bool, default true)
- RLS: read for active users, write for management. Templates are configuration.

### `duties_completion`
**One row per (item, period) marking it done.** Period key encodes the period the duty applies to:
- daily: `YYYY-MM-DD`
- weekly: `YYYY-Www` (ISO week, Mon-Sun)
- monthly: `YYYY-MM`
Unique on `(template_item_id, period_key)`. Unchecking a duty deletes the row entirely (no soft-delete — the "is this done?" question is binary and per-period). Cascades on item delete so historical completions go away when the template item is removed.
- `id` (uuid, PK), `template_item_id` (FK → duties_template_items, cascade), `period_key` (text), `completed_at` (timestamptz), `completed_by` (uuid → users.id, nullable)
- RLS: read for active users, write for is_operations() — dispatchers tick boxes as they finish tasks.

### `daily_report`
**One row per date** capturing the dispatcher's end-of-day summary. Replaces the bottom half of the DUT7 Accountability Sheet.
- `id` (uuid, PK), `date` (date, unique not null)
- `dispatchers` (uuid[]) — `users.id` of dispatchers on shift (no FK on array elements — stale UUIDs render as nothing)
- Route counts: `routes_total`, `routes_reduced`, `routes_recycled`, `routes_ad_hocs` (int, nullable)
- Safety: `camera_hits` (int, nullable), `drivers_after_8pm` (uuid[] — drivers.id by convention)
- Free text: `injuries_incidents`, `notes`
- Next-day capacity: `operational_vans_next_day`, `operational_phones_next_day`
- `created_at`, `updated_at`, `created_by`, `updated_by`
- RLS: same is_operations() pattern as daily_roster.
- The per-van notes section on the EOD form does NOT live in this table — each note is its own `vehicle_issues` row tagged `source='eod'`, so notes flow straight into the issues tracker.

### `vehicle_pave_inspections`
**One row per completed PAVE inspection.** PAVE = Periodic Amazon Vehicle Evaluation, mandatory quarterly per van. A van can have multiple inspections per quarter (e.g. score=2 in April triggers a re-inspection in May) — the latest row wins for "this quarter status." Failure is administrative only, never grounds the van.
- `id`, `vehicle_id` (FK → vehicles.id, cascade)
- `completed_date` (date)
- `quarter` (int 1-4), `year` (int) — denormalized from `completed_date` via the `sync_pave_quarter_from_date` trigger so the "this quarter" lookup is a simple equality query
- `score` (int 1-4) — 3 or 4 acceptable, 1 or 2 means re-inspect required
- `recorded_by` (uuid → users.id, nullable)
- `created_at`

## Helper SQL functions

- `current_user_role()` (security definer) — reads caller's role for use in RLS.
- `is_active_user()` (security definer) — boolean, used in RLS predicates.
- `is_management()` (security definer) — true for owner / hr / ops_manager (and legacy admin / manager). Drives every RLS policy that gates writes on management-tier access.
- `is_operations()` (security definer) — true for management **OR** dispatcher. Used only by `daily_roster` so dispatchers can edit their own workspace. Read access is still `is_active_user`.
- `set_updated_at()` — generic trigger for tables with `updated_at`.
- `log_coaching_session_revision()` — trigger on `coaching_sessions` UPDATE.
- `set_coaching_acknowledged(uuid, boolean)` (security definer, granted to authenticated) — lets dispatchers flip the acknowledged toggle without write access to the rest of the row.
- `refresh_driver_active_status()` (security definer, returns activated_count + deactivated_count) — bidirectional: drivers with no recent activity in 60 days flip from `active` → `inactive`; drivers who reappear in scorecards/events flip back. Called automatically at the end of every import action.
- `apply_vehicle_grounding_changes()` — called by the vehicles import after upserts land. For each van whose Amazon status flipped `operational` → `grounded`/`ready_for_audit`, create an auto-issue (if no open auto-issue exists). For each van that flipped back to `operational`, auto-close any open auto-issue. Manual-source rows are skipped entirely. Returns `(grounded_count, ungrounded_count)`.
- `sync_pave_quarter_from_date()` — trigger on `vehicle_pave_inspections`. Derives `quarter` (1-4) and `year` from `completed_date` so the denormalized fields can't drift.

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

**Set-password flow (`/set-password`).** Newly-invited users and anyone clicking a password-recovery link land here after `/auth/callback` exchanges their token for a session. Form asks for new password + confirmation, calls `supabase.auth.updateUser({ password })`, then forwards to `/`. The callback routes both `type=invite` and `type=recovery` here regardless of whether `next` was set — belt-and-suspenders against any link generated before `redirectTo` was wired up. Without this page, invites would land on the dashboard logged in but with no password, locking users out on their next session.

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
Searchable, sortable table. Columns: Name (with **Helper** badge when applicable) / Transporter ID / Status / Current Tier / Score / Last Coached / Approved Vehicles. Status filter chips (All / Active / LOA / Inactive / Terminated) and Position filter chips (**Drivers** [default] / Helpers / All). Last Coached shows the most recent **non-voided** session as a relative time ("3 days ago") with the absolute date in a tooltip.

**Management-only affordances** (RLS gates writes; UI gates rendering by `isManagement(role)`): two **Add** buttons in the header (Add driver / Add helper) and an inline Edit icon in the last column of every row. Dispatchers see the same table without those affordances. There is no separate Employees admin page — this is the unified surface.

### 4. Driver detail (`/drivers/[id]`)
Tabbed: Profile / Performance / Safety events / Coaching. Header strip: name, **Helper** badge if position=helper, status badge, tier badge (from latest scorecard), overall score, last coached (relative time with absolute date in tooltip; — when never coached).

- **Profile:** read-only fields including Position. Editing happens via the per-row Edit button on `/drivers` (management only).
- **Performance:** Recharts trend chart (last 12 weeks of Overall / DCR / POD with toggleable series; FICO is captured in scorecards but intentionally not charted) at the top, followed by the wide metrics table grouped as Standing (Tier + Score) | Volume (Delivered) | Safety | Delivery Quality. Negative CDF summary card groups TBAs **by feedback type** (a TBA appears under every type it was flagged for), each TBA shown with its delivery date for easy lookup during coaching. Below the table: summary cards for **POD reject breakdown** (when latest week has rejects), **Concessions** (totals + DSB-impacting count + per-defect-type breakdown), and **Negative Customer Delivery Feedback** (per-type breakdown + full TBA + date list).
- **Safety events:** filterable list (default: last 30 days, impacting only). Toggle to show non-impacting.
- **Coaching:** Triggers panel (Safety / Quality / Escalations) above the chronological session history. Each session shows session_type badge, coach, ack toggle. Edit / Void buttons (management only). "Show N voided" toggle when voided sessions exist.

### 5. Log coaching session (modal)
Date, **type dropdown** (Discussion / Verbal warning / Write up / Final warning / Termination), topic, notes, acknowledged toggle. Save creates immutable session record. Edit mode uses same dialog (management only).

**Trigger-context pre-fill:** when the dialog is opened from a needs-coaching row (Performance dashboard hero list) or a category card on the per-driver Triggers panel, fields pre-populate with the category's context — session type defaults to **Training**, topic to "Safety training" / "Quality training" / "Escalation review", `category` (hidden, system-managed) to the matching value so the corresponding trigger clears on save, and notes to a templated summary of the specific triggers ("3 impacting safety events in last 7 days: Speeding Violations, Driver Distraction", or the latest scorecard's threshold breaches as a bulleted list). The user-visible fields (type, topic, notes, ack) stay editable. The standalone "Log new session" button at the top of the Coaching tab intentionally opens **blank** with type=Discussion and `category = 'other'` — write-ups and out-of-band sessions aren't shaped by templates and don't accidentally clear unrelated triggers.

**Per-category clearing:** the dashboard needs-coaching lists and the per-driver Triggers panel both filter their content by category. Saving a Safety-category session clears the safety trigger for that driver in the 7-day window but leaves any quality trigger intact (and vice versa). `'other'` sessions don't clear anything. Triggers naturally re-surface when the window advances past the session, or when fresh data arrives (new safety events, new scorecard).

### 6. Import (`/import`)
Nine tabs, each backed by `requireRole(["owner","hr","ops_manager","admin","manager"])` (management only). All share a window-level drop-guard so a stray drop outside the dashed area can't navigate the browser to the file.
- **DSP Overview (CSV)** — *primary scorecard source going forward.* Per-driver tier + overall_score + every metric.
- **Scorecard (PDF)** — fallback when the CSV isn't available; same destination table.
- **Netradyne (CSV)** — aggregated event counts; wipe-and-replace by (`source`, `event_date`). **Does not auto-create drivers** — names not already in the `drivers` table are skipped, because Netradyne camera accounts often span multiple physical DSP locations under one org (e.g. DUT4 + DUT7). A driver joins this DSP only when they appear in a station-specific source below. When the strict name lookup misses, a **fuzzy fallback** runs (first-name prefix, common-nickname dictionary, extra-last-name token) — handles the case where Netradyne uses a driver's legal name and Amazon uses what they entered. Fuzzy matches are surfaced in the import result for human review and logged to `file_imports.errors` with the reason. Helpers are excluded from the fuzzy candidate pool.
- **Escalations (CSV)** — Amazon-issued infractions.
- **Concessions (CSV)** — per-package delivery defects.
- **CDF Negative (CSV)** — per-package customer feedback (handles daily and weekly exports).
- **POD Details (PDF)** — photo-on-delivery acceptance breakdown by reject reason. Year falls back to filename when missing in PDF text.
- **Vehicles (XLSX)** — Amazon's Vehicles export. Upserts by VIN. Amazon-managed columns overwrite; locally-managed columns and `operational_status_source='manual'` rows are preserved (see `vehicles` table notes). Triggers grounding-issue auto-create/auto-close (see `apply_vehicle_grounding_changes()`). Drivers are not touched by this import — different domain.
- **Policy Points (CSV)** — *one-time backfill of historical write-ups.* No header row; 8 columns (date / first / last / category / action level / description / consequence / training). Filters to last 90 days, name-matches via strict + fuzzy fallback (skips unmatched — does not auto-create), creates `coaching_sessions` rows with `session_type` mapped from action level ("write up" → `write_up`, "record only" → `discussion`, "warning" → `verbal_warning`) and `category` mapped from the CSV's policy-point label. Going forward, log new write-ups via the Log session dialog instead.

Result card shows match counts, the number of rows skipped because the driver isn't in our roster (with a hover sample of up to 5 names), and any errors.

**Driver-creation policy:** only **Scorecard**, **DSP Overview**, and the **Employees** admin page can create driver rows. Every other import (Netradyne, Escalations, Concessions, CDF Negative, POD Details, Vehicles) is **match-only** — names not in our `drivers` table are skipped with a counter on the result card. The reason: scorecards and DSP overview are per-station downloads, so anyone in them is unambiguously ours. Every other report Amazon publishes can span multiple DSPs on a shared account (Netradyne fleets, ALL-suffix concessions CSVs, etc.) and auto-creating drivers from those pulled in phantom DUT4 rows that polluted the dashboard.

Driver matching (for all imports): by `transporter_id` when available, fallback to normalized `full_name`. Netradyne adds a fuzzy fallback for the legal-vs-nickname case (see below). All other match-only imports skip if neither strict match hits.

### 7. Management (`/admin/users`)
Sidebar label is **Management**. Owner-tier admins invite teammates by email (Supabase auth `inviteUserByEmail` with `redirectTo` pointing at `/auth/callback?next=/set-password`), set roles (Owner / HR / Ops Manager / Dispatcher), deactivate. Self-row's role + active controls are disabled to prevent self-lockout. **Driver record column** links a user to a `drivers` row when they also drive routes (e.g. dispatchers who run occasional shifts) — linked rows show the driver's name as a clickable link to the driver profile, with a small unlink button next to it. Unlinked rows show a "Link…" picker dialog that searches active, not-yet-linked drivers. One-to-one enforced by a partial unique index on `users.driver_id`.

**Per-row password-reset button** (key icon on the right) calls `sendPasswordReset` which uses the admin `generateLink('recovery', …)` API to email the teammate a recovery link. Confirms before sending. Used when someone forgets their password or an invite link expired (Supabase invite tokens are valid for 24h by default).

### 8. Fleet dashboard (`/fleet`)
Title: **Fleet**. Inherits the Performance dashboard's pattern language (clickable threshold tiles with popovers, hero lists, "no guesswork" surfaces). Scope is intentionally narrow — Amazon already owns PMs / DVIC / AVI / DOT / odometer defects / warning lights, and we do not duplicate any of it. This dashboard exists to fill the gaps Amazon's dashboard leaves: shop location, registration expiry warnings, our own minor-issue tracker, parts-on-order visibility, and PAVE compliance.

**Header strip:** primary-blue action buttons (All vans · QR sheet · Shops [mgmt only]). No subtitle — the tiles below show the totals.

**3 stat tiles** across the top:
- **Operational + Grounded** — a single dual-tile card with two clickable halves. Each opens its own popover (operational vans vs grounded/ready-for-audit vans).
- **Registration expiring** — count expiring in next 60 days (already-expired included). Click for the list.
- **Open issues** — distinct vans with any `vehicle_issues.status` in (`open`, `in_shop`). Click for the list.

**Hero lists:**
- **In the shop** — grouped by `current_shop_name` (joined from `vehicle_shops`), with per-shop van count and a chevron to expand the list. Vans with no shop set don't appear here.
- **Open issues** — most recent first, grouped by van. Severity badge per row. Per-row inline `Resolve` action (opens the issue dialog in resolve mode).

**Parts** — every `vehicle_parts` row across the fleet, joined with the van name. Open parts (`needed` / `ordered` / `partial`) always visible; `received` / `installed` / `returned` rows tucked behind a "Show N more" details toggle. Columns: Van / Part / Qty (smart breakdown like "2 installed · 1 on hand · 3 pending") / Status / Vendor / Ordered. Each van name links to that van's Parts tab.

**PAVE tile** at the bottom — see §15.

### 9. Vehicle list (`/fleet/vans`)
Searchable, sortable table. Columns: **Name / VIN / Plate / Make+Model / Service tier / Operational status** (with a small "manual" pill if `operational_status_source='manual'`) **/ Current shop / EOD location / Open issues count / Reg expiry**.

Filter chips: All / Operational / Grounded / In shop / Has open issues / Reg expiring soon.

Per-row click: link to detail page. Inline QR icon: opens the QR modal directly from the list without leaving the page.

### 10. Vehicle detail (`/fleet/vans/[vin]`)
Header strip: van name, license plate, operational status badge (with manual-override pill + tooltip showing the manual note when source=manual), ownership chip (Owned / Rental / Leased), service tier. A **QR** button in the header opens a modal with a large SVG QR (encoding the plain VIN text), plus Print and Download SVG actions.

Tabs:
- **Overview** — all Amazon-managed fields read-only. Locally-managed fields: **current shop / location** as a dropdown over the editable `vehicle_shops` list (manage at `/admin/shops`), plus `eod_parking_location` and `notes` as free text editable inline. The operational-status widget is its own card: dropdown to override, optional `manual_status_note` input, and — when the local value differs from Amazon's latest imported value — a callout reading *"Amazon currently reports {operational_status} — use Amazon's value"* with a clear-override button. Setting the dropdown back to Amazon's value (or clicking the callout) flips `operational_status_source` back to `amazon`.
- **Issues** — chronological list (most recent first). "Log new issue" button at top. Per-row Resolve / Edit / Close-without-repair actions. Auto-created issues show an "Auto" badge so it's clear they came from a grounding event. Filter: Open / In shop / All. `photo_urls` slot is wired but the UI is hidden (Phase 3).
- **Parts** — chronological list. "Order part" button. Per-row quantity ledger (ordered / received / installed). Optional link badge to the issue the part is for. Per-row inline `Receive`, `Install`, `Return` actions update the matching quantities (and derive the new `status`). Filter: Open (needed/ordered/partial) / All.
- **History** — derived audit trail: registration-expiry changes, operational-status flips (with source), import touches, manual edits to local fields. Built from a simple `vehicle_history` table populated by triggers. Low priority — defer to a polish pass if it slips.

### 11. Fleet QR sheet (`/fleet/qr-sheet`)
Printable label sheet. Renders every active van as a grid of QRs (4 per row by default), each labeled with the van's nickname and VIN beneath the code. CSS print styles tuned for letter-size paper so it lays out cleanly through the browser's print dialog. Per-vehicle "include" checkbox in the on-screen view so you can print just a subset (e.g. only newly-added vans, or only vans missing their lot label).

QR encodes the plain VIN text — no URL — so it's directly compatible with Amazon's delivery-app VIN entry and any other barcode scanner that expects VIN-as-text.

### 12. Daily Ops dashboard (`/daily`)
Title: **Daily Ops**. The dispatcher's morning workspace. Replaces the "DUT7 Dispatch Sheet" Google Sheet they were editing every morning. Defaults to today; `?date=YYYY-MM-DD` jumps to another day. **Dispatchers + management can write**; everyone can read.

Header strip: date nav (Prev / Today / Next + a date picker), an assignments count, and a **Daily Paper** print button.

**Roster table**, sorted by wave then van:
- **Wave** column shows wave number + show time (joined from `wave_times`)
- **Driver** column links to the driver profile
- **Van** column links to the van detail
- **Notes** column for the dispatcher's ad-hoc note (e.g. "trainer, paired with Adam")
- **Edit** icon per row opens a dialog with the same fields; **Add** button at the top opens an empty version

**Pickers** inside the dialog:
- Driver: searchable list of active drivers (position=driver only; helpers excluded). Drivers already on today's roster are hidden from OTHER rows' pickers; the row's current driver stays visible when editing.
- Van: searchable list of vans where `operational_status='operational'`. Grounded / ready-for-audit vans never appear in the picker — even if you toggle to a date where they were operational. Same conflict-hiding behavior as drivers.
- Wave: dropdown of active waves from `wave_times`.

**Copy from {prev date} button** appears when today is empty *and* there's a prior date with roster rows. Clones rows from the most-recent prior dated roster (handles weekends + skipped days), skipping rows where: (a) the van has since been grounded, (b) the driver has been deactivated, or (c) the slot already exists on the target date. Returns counts in the success toast so you can see what landed and what was dropped.

**Past days are editable** — same workflow as the spreadsheet was. Roster rows are the permanent historical record.

### 13. End of day (`/daily/eod?date=…`)
End-of-day form. Auto-saves on every field change. Fields:
- **Routes** (4 number inputs: Total / Reduced / Recycled / Ad-hocs)
- **Safety + next-day capacity** (Camera hits + Operational vans/phones tomorrow)
- **Dispatchers on shift** — checklist over users with dispatcher OR management role
- **Drivers on shift after 8pm** — searchable chip picker over active drivers
- **Injuries / incidents** (free text)
- **Per-van notes** — type-ahead van picker + note input. Each Add creates a `vehicle_issues` row with `source='eod'`, severity `minor`, category `other`, status `open` — surfaces immediately on `/fleet`, in the van's Issues tab, and in the Vehicles table's open-issues count. Delete on this surface removes the issue.
- **General notes** (free text overflow)
- **Duties checklist** — placeholder until Pass E ships; will summarize "X of Y completed today" with per-shift breakdown.

Save semantics: debounced for typed inputs (~600ms after last keystroke), immediate for chip/checkbox changes. "Saved at HH:MM:SS" indicator at the top of the form.

### 14. Daily Paper (`/daily/paper?date=…`)
Printable view of the roster. Server-rendered, minimal CSS, optimized for letter paper. Same data as the dashboard sorted by wave + van; date in the header; blank lines for the dispatcher names (they handwrite or we'll fill from the EOD report once that lands). On-screen has a Print button; print CSS hides the chrome and Notes column.

### 15. Duties checklist (`/duties?cadence=daily|weekly|monthly`)
Recurring tasks the dispatch team works through each shift / week / month. Cadence tabs at the top; daily groups items by Preload out / Load out / Post load out / RTS / Closing, weekly + monthly group by owner. Each item is a checkbox — clicking toggles the `duties_completion` row for the current period (optimistic UI so the check feels instant). Period auto-rolls based on the current date / ISO week / current month.

**Daily** can be back-dated via `?date=` for late evening writes ("yesterday's duties"). **Weekly** and **monthly** stay on the current period — looking at past completions is a future feature.

Per-section progress counts in each group header (e.g. "Preload out · 7 / 10"). Owner chips are color-coded (Dispatcher = sky, Assistant = violet, Michael = emerald, Barzin = amber, anything else = muted) — quick visual for "who's supposed to do this."

**Inline template editing for management.** Each section ends with an "+ Add task" footer that opens an inline form (description + owner) to append a new item with sort order one bump past the section's last. Every row gets a trash icon for delete (cascades to that item's completion history). No separate admin page — `/duties` IS the editor when you're management.

### 16. Wave times admin (`/admin/waves`)
Management-only. Add / edit / delete waves. The seed migration ships the current 8 waves (1=09:50 … 8=10:30); Amazon shuffles these maybe twice a year, and the dispatcher updates them here without a code deploy. Inactive flag hides a wave from the picker without breaking historical roster rows that still reference it. Delete is blocked when any roster row references the wave (use Inactive instead).

### 17. Shops admin (`/admin/shops`)
Management-only. Edit the list of values that show up in each van's **Current shop / location** dropdown on the Fleet page. Drag rows by the grip handle to reorder (server rewrites `sort_order` in 10s). The Active chip is the toggle itself; pencil flips the name into an inline input with a checkmark to save. Delete is safe — vans pointing to the shop get cleared (`ON DELETE SET NULL`).

### 18. HR dashboard (`/hr`) — Phase 3 Pass A
Management-only — dispatchers cannot reach the route (middleware gate) and never see the sidebar link. Three header stat tiles (Awaiting HR review · Reviewed this week · Top offender 90d), a coaching review queue, and a worst-10 panel. Header has a Duties button that opens `/hr/duties`.

**Coaching review queue.** Sortable / searchable list of every coaching session whose `session_type` is in `{verbal_warning, write_up, final_warning, termination}`. Trainings + discussions are excluded entirely — they never require HR sign-off. Default tab is **Unreviewed**; tabs flip to **Reviewed** or **All**. Each row shows driver name + session-type chip + category + topic + original notes excerpt + coach + date. The Reviewed button opens an inline notes textarea and stamps `hr_reviewed_at` / `hr_reviewed_by` / `hr_review_notes` (the note is optional, e.g. "sent termination letter"). Reviewed rows can be re-opened (Undo preserves the note) or have their note edited in place. Voided sessions appear greyed but still listed for clarity.

**Worst 10 offenders (90-day window).** Top 10 drivers by raw coaching-session count, excluding trainings + discussions + voided sessions. Category dropdown (All / each of the 15 categories) re-queries server-side via `?cat=`. Mini horizontal bar per row makes relative weights visible at a glance. Weighting (write-up worth more than verbal warning) is deferred — count is raw for now.

**Out of Pass A** (deferred to later HR passes): candidates kanban with the 8 status buckets (Pass C) · dispatcher interview view inside `/daily` (Pass D) · per-candidate QR'd interviewee form with dual-form review (Pass E) · onboarding tracking (Pass F).

### 19a. HR Candidates (`/hr/candidates`) — Phase 3 Pass C.A
Collapsible-by-status list of every active candidate. Matches the dispatcher's existing spreadsheet kanban layout — one section per status, click chevron to collapse / expand. Each header shows a chunky color chip (the status's tailwind palette), the count, a `declined-flag` badge if applicable, and a quick "+ Add to <status>" inline button. Candidate cards inside each section are sorted by `interview_dt` ascending (today / future first), then `created_at` descending for those without interviews yet.

**Candidate card.** Name + phone (with `tel:` link, formatted "(801) 555-1234") + interview date / time + DSP chip + "prev. declined" amber badge if the phone matched a prior decline. Inline status dropdown to move between buckets, pencil to edit, trash to delete.

**Add candidate dialog.** Name, phone, status, interview datetime, DSP, source, email, notes. As HR types the phone, a debounced server lookup queries `candidates` for prior rows whose status had `treat_as_declined=true`. If any match, an amber warning surfaces inside the dialog (does not block save — HR may legitimately re-interview someone they declined before).

**Inline status admin.** Collapsible panel above the kanban with: drag-to-reorder, click pencil to rename inline, click color swatch to pick from the 12-color palette, toggle `active` (hides from new-candidate dropdown without losing data), toggle `treat_as_declined` (drives the prev-declined warning), trash to delete (blocked if any candidate is still in that status — Postgres ON DELETE RESTRICT).

**Data model.** Separate `candidates` table (one row per application; high-turnover DSP, so reapplications create new rows). Phone normalized to 10 digits in a DB trigger and indexed for dedup speed. `drivers.candidate_id` FK populated when a candidate converts to a driver (Pass C.B).

### 19b. HR Candidate detail (`/hr/candidates/[id]`) — Phase 3 Pass C.B
Full editable view of one candidate. Header: name + status chip + Edit / Convert-to-driver / Delete buttons. Body: contact + interview info (phone with `tel:`, email with `mailto:`, interview date/time, DSP, source, created). If the status has `is_onboarding=true`, the onboarding checklist appears in the right column with the same optimistic-checkbox UX as Duties; each ticked item stamps `completed_at` + `completed_by`. An "Archived on …" banner with a link to the resulting `/drivers/[id]` appears after conversion.

**Convert-to-driver dialog.** Button enabled only when the candidate's status has `is_onboarding=true` AND every active onboarding item is checked. Form: Position (driver/helper toggle, default driver), Hire date (defaults today), Approved vehicle types (multi-select chips: CDV / EDV / standard parcel — defaults EDV). On confirm: calls the `convert_candidate_to_driver(...)` Postgres RPC which atomically (a) refuses if any active item is unchecked or the candidate is already converted, (b) inserts the driver row with `candidate_id` FK populated, (c) archives the candidate. Toast on success has an inline "Open driver record" link.

**Onboarding template editor at `/hr/candidates/onboarding-template`.** Dedicated page reached from the Onboarding template button in the candidates header (mirrors the Daily Ops Wave times pattern). Drag to reorder, rename inline, Active toggle, trash to delete (cascades to all candidates' completion stamps for that item). 10 seeded items: I-9, W-4, Drug test scheduled, Drug test passed, Background check submitted, Background check cleared, Direct deposit set up, Trainer assigned, Start date confirmed, Uniform issued.

**Status admin at `/hr/candidates/statuses`.** Same dedicated-page treatment. Drag to reorder, rename, color picker (12 palettes), plus three toggles: `active` (visibility), `declined-flag` (drives prev-declined warning), and `is_onboarding` (whether the onboarding checklist appears for candidates in this status — defaults TRUE on the seeded ONBOARDING bucket).

### 19c. Candidates archive (`/hr/candidates/archive`) — Phase 3 Pass C.B
Every archived candidate (hired + declined + manually-archived). Three tabs (All / Hired / Declined / Other), client-side search by name/phone/status. All-time by default. Each row shows the final status chip + an outcome badge (hired = green, declined = amber); hired rows have an "Open driver →" link to `/drivers/[id]`.

### 19d. Dispatcher interview view (`/daily/interviews/[id]`) — Phase 3 Pass D
Dispatchers do the interviews. The "Today's interviews" section on `/daily` (hidden when empty) lists every candidate with `interview_dt` on today's date; each row has time chip + name + tel-linked phone + DSP chip + "assessed" tick if a response exists + "Open interview" / "Review" button.

Clicking opens `/daily/interviews/[id]` — a form with:
- **Status dropdown** at the top. Changes go through the `dispatcher_change_candidate_status` Postgres RPC so dispatchers can move the candidate between buckets without RLS-level write access to other columns (RLS UPDATE cannot restrict columns; an RPC can).
- **Y/N questions** as a three-state chip (Yes / No / —). Skipping leaves no answer recorded.
- **Text questions** as textareas.
- **Conducted by** picker (any active operations user).
- **Overall notes** textarea.

One response per candidate (unique constraint on `dispatcher_interview_responses.candidate_id`). Save upserts the response + replaces all answer rows.

**RLS for dispatcher access.** Dispatchers can read candidates only when `interview_dt is within ±7d` AND not archived. The `candidate_statuses_select` policy is relaxed to `is_operations()` so the status chip + dropdown render. Management always has unrestricted access.

**HR-side view.** `/hr/candidates/[id]` gets a read-only "Dispatcher interview" card showing the response + answers + who/when. Closes the loop so HR can review what the dispatcher captured before moving the candidate forward.

**Question template** at `/hr/candidates/interview-questions` — drag-to-reorder, rename inline, Y/N vs Text picker per row, Active toggle, delete (cascades to historical answers). 16-question starter seed (reliable transport / lifts 50lbs / customer-conflict response / walked through warehouse / etc.) lifted from the dispatcher's existing interview-form spreadsheet.

### 19. HR Duties (`/hr/duties`) — Phase 3 Pass B
HR-specific checklist running on the same engine as `/duties` (same `duties_template_items` + `duties_completion` tables, same period-key logic, same optimistic checkbox UI). Separated via a new `scope` column on `duties_template_items` — ops items default to `scope='ops'` and stay on `/duties`; HR items use `scope='hr'` and only appear here.

Daily renders as one flat list (no preload/loadout/etc. sub-sections — those are dispatch-specific). Cadence tabs (daily / weekly / monthly) work the same as `/duties`. Management-only — the parent `/hr` middleware gate blocks dispatchers from reaching the route at all, and the page checks `requireManagement()` server-side too.

Daily seed lifted from the dispatcher's existing spreadsheet "Open" status: ADP People In-Progress, Files, Check in with new hires, ADP, Make Files for new employees, ADP People to Start, Human Interest, Policy Points DUT4, Policy Points DUT7, Schedule. Owner defaults to `HR`; reassign inline as needed.

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
10. ✅ Phase 2 — **Fleet** (shipped): `vehicles` / `vehicle_issues` / `vehicle_parts` / `vehicle_pave_inspections` tables · 8th import tab (Amazon Vehicles XLSX, SheetJS) · grounding auto-issue trigger · `/fleet` dashboard (3 stat tiles incl. merged Op/Grounded dual-tile + shop-grouped hero + open-issues hero + fleet-wide parts list + PAVE tile) · `/fleet/vans` list with manual-override pill · `/fleet/vans/[vin]` detail (Overview / Issues / Parts) with operational-status override widget · `/fleet/qr-sheet` printable VIN labels · per-van QR modal. Driver-facing VCR + photo-driven damage detection deferred to Phase 3.
11. ✅ Phase 2.5 — **Daily Ops** (all 5 passes shipped). Pass A: `wave_times` + `daily_roster` tables · van-first inline `/daily` roster · `/daily/paper` print · `/admin/waves`. Pass B: `vehicle_shops` + FK on vehicles.current_shop_id · `/admin/shops` · managed shop dropdown. Pass C: `daily_report` + `vehicle_issues.source` · `/daily/eod` form with auto-save + per-van notes that flow into the issues tracker · grounding auto-issues tagged `source='grounding_auto'`. Pass D: extend `coaching_sessions.category` with 11 policy-point categories · Topic input merged into the Category dropdown · 9th import tab "Policy Points (CSV)" with one-off 90-day backfill. Pass E: `duties_template_items` + `duties_completion` tables · `/duties` checklist with daily/weekly/monthly cadence tabs, optimistic checkbox UI, color-coded owner chips, and inline template editing (add at bottom of each section, delete per row) for management · EOD form's duties summary card populated with X/Y per-group counts.
12. 🚧 Phase 3 — **HR & Hiring**. Pass A ✅: `coaching_sessions.hr_reviewed_at` / `hr_reviewed_by` / `hr_review_notes` · `/hr` dashboard with 3 stat tiles + coaching review queue + worst-10 panel · sidebar HR link + middleware gate. Pass B ✅: `duties_template_items.scope` column + 10-item HR daily seed · `/hr/duties`. Pass C.A ✅: `candidate_statuses` + `candidates` + `candidate_onboarding_template_items` + `candidate_onboarding_completion` tables · `drivers.candidate_id` FK · `/hr/candidates` collapsible-by-status kanban with inline status admin + dedup. Pass C.B ✅: `candidate_statuses.is_onboarding` flag + `convert_candidate_to_driver()` RPC · `/hr/candidates/[id]` detail page · onboarding checklist UI with template editor · Convert-to-driver dialog · `/hr/candidates/archive` with tabs + search. Pass D ✅: `dispatcher_interview_questions` + `dispatcher_interview_responses` + `dispatcher_interview_answers` tables · `dispatcher_change_candidate_status` RPC · `candidates_select_for_dispatchers` RLS policy (±7d window) · `/hr/candidates/interview-questions` admin · `/daily/interviews/[id]` form · "Today's interviews" section on `/daily` · read-only Dispatcher interview card on the HR candidate detail page. Pass E (per-candidate QR'd interviewee form) still to come. Incidents/accidents (Phase 3 #3 — separate from `vehicle_issues`) deferred until after HR is complete.

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
- **More dashboards:** Daily Ops (day-of planning, call-outs, van-to-driver assignments), HR (onboarding, document expiry, training certs). Each will sit at its own `/<dashboard>` route. **Fleet** is in progress as Phase 2 (see Build Order item 10). The current home dashboard is intentionally named **Performance** because the app will own several siblings.
<!-- Dispatcher ↔ driver linkage shipped — see Management page section above. -->
- (no items pending)

## Deferred

Schema and code support these but the UX hasn't shipped:
- **Linked scorecard / event UI on coaching sessions** — `coaching_sessions.linked_scorecard_id` and `linked_event_ids` exist; no picker UI yet.
- **Downloadable error CSVs** — errors are stored in `file_imports.errors` JSONB; UI shows a collapsible list but no download.
- **Per-period tracking on `file_imports`** — would add `period_start` / `period_end` columns and require parser updates. Originally proposed for donut alignment, but the donut anchor now reads dates from the data sources directly (CDF `delivery_date`, DSB `concession_date`), so this is purely audit-trail nice-to-have. Low priority.

## Out of Scope (Phase 1)

- Driver-facing VCR submission (Phase 3 — Phase 2 ships manager-tracked issues + parts + QR codes; driver-facing daily inspections + manager photo upload with automatic damage detection are explicitly later)
- Daily Ops / attendance / call-out tracking / van-to-driver assignments (Phase 2 follow-on — Daily Ops dashboard)
- Onboarding & training / HR (Phase 3)
- Incidents / accidents (Phase 3 — `vehicle_issues` covers the operational damage side; full incident reports with insurance + photos are separate)
- ADP / Slack / Rivian portal integrations
- Mobile app
