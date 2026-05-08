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
| PDF parsing | pdfjs-dist (legacy/Node build) | Works server-side; configured via `serverExternalPackages` |
| Charts | Recharts | (planned for step 8 polish) |
| Hosting | Vercel | Free tier, zero-config Next.js deploys |

> **Cost path:** $0 to start → ~$25/mo (Supabase Pro) → ~$45/mo (Vercel Pro) if needed.

## User Roles

| Role | Permissions |
|---|---|
| **Admin** | Everything — user management, driver CRUD, coaching edits/voids, all data |
| **Manager** | View all data, log coaching sessions, upload imports, edit drivers |
| **Dispatcher** | View driver list and profiles, log coaching sessions, no admin access |

Role is set by an admin when a teammate is invited. Stored on `users` table.

**Coaching permissions** (refined during build):
- *Create session*: any active user
- *Acknowledge / unacknowledge*: any active user (via `set_coaching_acknowledged` RPC — bypasses RLS so non-admins can flip the toggle without being able to edit content)
- *Edit content (topic / notes / date / type)*: admin only
- *Void / unvoid*: admin only

## Data Model

### `users`
Internal team members.
- `id` (uuid, PK, links to Supabase `auth.users`)
- `email`, `full_name`, `role` (admin / manager / dispatcher), `active` (bool), `created_at`

### `drivers`
- `id` (uuid, PK)
- `transporter_id` (text, **nullable**, unique) — Amazon's short A-prefixed ID
- `full_name`
- `hire_date` (date, nullable)
- `status` (enum: **active / loa / terminated / inactive**)
- `approved_vehicle_types` (`vehicle_type[]` — cdv / edv / step_van / rivian)
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
- **`session_type`** (enum: **discussion / verbal_warning / write_up / final_warning / termination**, default `discussion`)
- `topic`, `notes`
- `acknowledged` (bool), `acknowledged_at` (timestamptz, nullable)
- `linked_scorecard_id`, `linked_event_ids` (uuid[])
- **`voided_at`, `voided_by`, `void_reason`** — all-or-nothing CHECK constraint. Soft-delete with required reason. Unvoid is admin-only.
- `created_at`, `updated_at`

> **Audit rule:** every UPDATE fires the `log_coaching_session_revision` trigger which snapshots the prior row into `coaching_session_revisions` (jsonb `previous_values`). Originals never silently overwritten. Acknowledge toggles, edits, voids, and unvoids all land in the audit chain.

### `coaching_session_revisions`
`id`, `coaching_session_id` (FK, cascade delete), `edited_by`, `edited_at`, `previous_values` (jsonb).

### `file_imports`  *(was `csv_imports` in the original spec)*
Renamed because not all imports are CSVs (Scorecard PDF, future POD Details PDF).
- `id`, `uploaded_by`
- `import_type` (enum: **scorecard / netradyne / escalations / cdf / concessions / pod_details**)
- `file_name`, `file_hash` (nullable), `row_count`, `success_count`, `error_count`, `errors` (jsonb), `created_at`

> Re-import detection by `file_hash` is **deferred to step 8 polish.**

## Helper SQL functions

- `current_user_role()` (security definer) — reads caller's role for use in RLS.
- `is_active_user()` (security definer) — boolean, used in RLS predicates.
- `set_updated_at()` — generic trigger for tables with `updated_at`.
- `log_coaching_session_revision()` — trigger on `coaching_sessions` UPDATE.
- `set_coaching_acknowledged(uuid, boolean)` (security definer, granted to authenticated) — lets non-admins flip the acknowledged toggle without write access to the rest of the row.
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

### 2. Dashboard (`/`)
Header: `Hi {firstName} — Week {N}, {Month Do, YYYY}` based on the current calendar week. If imported data lags today, header appends "(data through {date})".

**Stat tiles (4):**
- Active drivers — distinct drivers with scorecard or safety_event in **last 30 days** (stricter than the 60-day inactive cutoff so the operational headcount is accurate while still keeping recently-stale drivers visible in the drivers list).
- Safety events — impacting count primary, non-impacting secondary.
- Coaching sessions — this week.
- Needs coaching — equal-split SplitStatTile: Safety on the left, Quality on the right.

**Hero list:** "Needs coaching this week" with Safety/Quality toggle (counts shown as pill chips), Show-N picker (15/30/50/All, default 15), whole section collapsible, inline `Log session` button per row that opens the same dialog used on the Coaching tab.

**Right column:** Recent coaching — last 10 non-voided sessions across the DSP.

### 3. Drivers list (`/drivers`)
Searchable, sortable table. Columns: Name / Transporter ID / Status / Current Tier / Score / Last Coached / Approved Vehicles. Status filter chips (All / Active / LOA / Inactive / Terminated).

### 4. Driver detail (`/drivers/[id]`)
Tabbed: Profile / Performance / Safety events / Coaching. Header strip: name, status badge, tier badge (from latest scorecard), overall score, last coached.

- **Profile:** read-only fields. Editing in step 7.
- **Performance:** wide table grouped as Standing (Tier + Score) | Volume (Delivered) | Safety | Delivery Quality. Trend chart deferred to step 8.
- **Safety events:** filterable list (default: last 30 days, impacting only). Toggle to show non-impacting.
- **Coaching:** Triggers panel (Safety / Quality / Escalations) above the chronological session history. Each session shows session_type badge, coach, ack toggle. Edit / Void buttons (admin only). "Show N voided" toggle when voided sessions exist.

### 5. Log coaching session (modal)
Date, **type dropdown** (Discussion / Verbal warning / Write up / Final warning / Termination), topic, notes, acknowledged toggle. Save creates immutable session record. Edit mode uses same dialog (admin only).

### 6. Import (`/import`)
Tabs:
- **DSP Overview (CSV)** — *primary scorecard source going forward.* Includes per-driver tier + overall_score.
- **Scorecard (PDF)** — fallback if only the PDF is available; same destination table.
- **Netradyne (CSV)** — aggregated event counts per driver.
- **Escalations (CSV)** — Amazon-issued infractions.
- *(planned waves 3–4)* CDF Negative, Concessions, POD Details.

Drag-and-drop. Result card shows match counts and any errors. Driver matching: by transporter_id when available, fallback to normalized full_name. Unmatched names auto-create driver rows.

### 7. Admin — Users (`/admin/users`)
Invite, set role, deactivate. *Stubbed; full UI in step 7.*

### 8. Admin — Drivers (`/admin/drivers`)
Bulk add, edit any field, change status. *Stubbed; full UI in step 7.*

## Build Order

1. ✅ Project setup, Supabase, auth, role-based middleware.
2. ✅ Drivers list + driver detail (read-only, seeded with real data from a Netradyne export).
3. ✅ Coaching: create + edit + void + history + per-session type.
4. ✅ Scorecard PDF import + Performance tab.
5. ✅ Netradyne CSV import + Safety events tab.
6. ✅ Dashboard (Quality tier breakdown deferred until DSP Overview CSV — landed in 6.5).
6. **6.5. Additional imports** *(in progress — extends the spec):*
   - ✅ Wave 1: DSP Overview Dashboard CSV (lights up per-driver tier + overall_score)
   - ✅ Wave 2: Escalations CSV
   - ⏳ Wave 3: CDF Negative + Concessions CSVs
   - ⏳ Wave 4: POD Details PDF
7. ⏳ Admin — users & drivers (proper CRUD).
8. ⏳ Polish: Recharts trends, file-hash re-import detection, downloadable error CSVs, empty/error states, refinement.

## Audit & Data Integrity Rules

- **Coaching sessions:** all UPDATEs flow through the audit trigger. Edits + void/unvoid + acknowledge toggles all snapshot prior state to `coaching_session_revisions`. Voids preserve the original row (soft-delete with required reason).
- **File imports:** every imported row links back to its `file_imports` row. File-hash re-import detection deferred to step 8.
- **Drivers:** never hard-deleted. Status flips to `terminated` (manual) or `inactive` (auto, reversible). Coaching history survives.
- **Timestamps:** every table has `created_at`. User-facing edits track `updated_at`.

## Environment / Config

- Default timezone for week boundaries: `America/Denver` (set via `NEXT_PUBLIC_DEFAULT_TZ`).
- Amazon DSP weeks are Sunday-through-Saturday. Helpers: `amazonWeekEnding(week, year)` and `amazonWeekFromEndingDate(weekEnding)` in `lib/format/dates.ts`.
- pdfjs-dist is marked as a serverExternalPackage in `next.config.ts` so the Node build's worker file resolves at runtime.

## Open Questions / Deferred

- **File-hash re-import detection** — deferred to step 8.
- **Linked scorecard / event UI on coaching sessions** — schema supports it; no UI yet.
- **Recharts trend lines on the Performance tab** — deferred to step 8.
- **Per-tab views on the driver detail beyond what's shipped** — none planned.

## Out of Scope (Phase 1)

- Vehicle / VCR module (Phase 2)
- Attendance / call-out tracking (Phase 2)
- Onboarding & training (Phase 3)
- Incidents / accidents / damages (Phase 3)
- ADP / Slack / Rivian portal integrations
- Mobile app
