# DSP Operations App — Specification

## Overview

A web app to replace spreadsheets for managing day-to-day operations at an Amazon DSP (last-mile delivery). Built for a small team of managers, admins, and dispatchers (3–10 users). Phase 1 focuses on **performance and coaching tracking** — the area where spreadsheets cause the most pain.

Long-term vision is a single tool that owns: roster, performance, attendance, fleet/VCRs, onboarding, and incidents.

## Goals

- Replace spreadsheet-based performance tracking with a real system of record.
- Make coaching history per driver instantly accessible (the #1 thing sheets fail at).
- Surface trends — who's improving, who's regressing, who needs intervention this week.
- Keep an audit trail: nothing gets silently overwritten.
- Free to run while we prove it works; clean path to a modest paid tier.

## Non-Goals (Phase 1)

- No mobile app. Mobile-friendly web is "nice to have," not required.
- No real-time integrations with Cortex / Netradyne / ADP — CSV upload only.
- No driver-facing features. This is an internal ops tool.
- No vehicle assignment workflow yet (deferred to fleet module).

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | One codebase, fast iteration, great DX |
| UI | Tailwind CSS + shadcn/ui | Clean, accessible defaults, no design-from-scratch |
| Database | Supabase (Postgres) | Free tier covers MVP, simple to scale |
| Auth | Supabase Auth | Email/password with role-based access |
| File storage | Supabase Storage | For CSV archive + future incident photos |
| CSV parsing | PapaParse | Battle-tested, handles edge cases |
| Charts | Recharts | Trend lines on driver detail pages |
| Hosting | Vercel | Free tier, zero-config Next.js deploys |

**Cost path:** $0 to start → ~$25/mo (Supabase Pro) when DB or auth grows → ~$45/mo with Vercel Pro if we need it.

## User Roles

| Role | Permissions |
|---|---|
| **Admin** | Everything — user management, driver CRUD, all data |
| **Manager** | View all data, log coaching sessions, upload CSVs, edit drivers |
| **Dispatcher** | View driver list and profiles, log coaching sessions, no admin access |

Role is set by an admin when a teammate is invited. Stored on `users` table.

## Data Model

### `users`
Internal team members (managers, dispatchers, admins).
- `id` (uuid, PK, links to Supabase auth user)
- `email`
- `full_name`
- `role` (enum: admin / manager / dispatcher)
- `active` (bool)
- `created_at`

### `drivers`
- `id` (uuid, PK)
- `transporter_id` (Amazon's driver ID, unique)
- `full_name`
- `hire_date`
- `status` (enum: active / loa / terminated)
- `approved_vehicle_types` (array — e.g. CDV, EDV, Step Van, Rivian)
- `notes` (text, optional)
- `created_at`, `updated_at`

> Vehicle assignment is **not** stored here. That belongs to the fleet module (Phase 2).

### `scorecards`
Weekly performance snapshot per driver.
- `id` (uuid, PK)
- `driver_id` (FK → drivers)
- `week_ending` (date)
- `tier` (enum: fantastic / great / fair / poor)
- `fico_score` (int, nullable)
- `dcr` (numeric, nullable)
- `delivery_completion_rate` (numeric, nullable)
- `cdf` (numeric, nullable) — Customer Delivery Feedback
- `seatbelt_off_rate` (numeric, nullable)
- `speeding_event_rate` (numeric, nullable)
- `distractions_rate` (numeric, nullable)
- `following_distance_rate` (numeric, nullable)
- `sign_signal_violations_rate` (numeric, nullable)
- `raw_data` (jsonb — full row from CSV for forensics)
- `imported_from` (FK → csv_imports)
- `created_at`

> Use a generous schema — Cortex columns shift over time. The `raw_data` jsonb column is the safety net.

### `safety_events`
Individual Netradyne (or other) events.
- `id` (uuid, PK)
- `driver_id` (FK → drivers)
- `event_date` (timestamptz)
- `event_type` (text — e.g. "Speeding", "Hard Braking", "Sign Violations")
- `severity` (enum: impacting / non_impacting) — derived from event_type per existing rules
- `count` (int, default 1) — for aggregated rows
- `source` (text — "netradyne", "manual", etc.)
- `raw_data` (jsonb)
- `imported_from` (FK → csv_imports, nullable for manual entries)
- `notes` (text)
- `created_at`

**Severity classification (matches existing logic):**
- **Impacting:** Sign Violations, Traffic Light, Speeding, Distraction, Seatbelt, Camera Obstruction, Following Distance, Roadside Parking
- **Non-impacting:** High-G, Hard Braking, Hard Turn, Hard Acceleration, Drowsiness, Weaving, Backing

### `coaching_sessions`
- `id` (uuid, PK)
- `driver_id` (FK → drivers)
- `coached_by` (FK → users)
- `session_date` (date)
- `topic` (text — short summary)
- `notes` (text — full coaching notes)
- `acknowledged` (bool, default false)
- `acknowledged_at` (timestamptz, nullable)
- `linked_scorecard_id` (FK → scorecards, nullable)
- `linked_event_ids` (uuid[], nullable — array of safety_events.id)
- `created_at`, `updated_at`

> **Audit rule:** edits create a new row in `coaching_session_revisions` rather than mutating in place. Original `created_at` never changes.

### `coaching_session_revisions`
- `id`, `coaching_session_id` (FK), `edited_by`, `edited_at`, `previous_values` (jsonb)

### `csv_imports`
- `id` (uuid, PK)
- `uploaded_by` (FK → users)
- `import_type` (enum: scorecard / netradyne)
- `file_name`
- `row_count`
- `success_count`
- `error_count`
- `errors` (jsonb — array of row-level errors)
- `created_at`

## Pages / Screens

### 1. Login
- Email + password (Supabase Auth).
- Inactive users blocked at login.

### 2. Dashboard (`/`)
The "what needs my attention this week" page.
- Summary tiles: total active drivers, count by tier (Fantastic/Great/Fair/Poor) for current week.
- "Drivers needing coaching": filtered list of drivers with impacting events this week and no logged coaching session.
- "Trending down": drivers whose tier dropped vs last week.
- "Recent coaching activity": last 10 sessions logged.

### 3. Drivers list (`/drivers`)
- Searchable, sortable table.
- Columns: Name, Transporter ID, Status, Current Week Tier, Last Coached Date, Approved Vehicles.
- Filter chips: status, tier, "needs coaching."
- Click row → driver detail.

### 4. Driver detail (`/drivers/[id]`)
The heart of the app. Tabbed layout:
- **Profile tab:** name, transporter ID, hire date, status, approved vehicle types, notes. Edit button (admin/manager only).
- **Performance tab:** trend chart (last 12 weeks of tier + FICO + DCR), weekly scorecard table.
- **Safety events tab:** filterable event list. Default filter: last 30 days, impacting only. Toggle to show non-impacting.
- **Coaching tab:** chronological session log. "Log new session" button always visible at top.
- **Header strip** (always visible): name, current tier badge, last coached, status badge.

### 5. Log coaching session (modal or `/drivers/[id]/coach`)
- Date, topic, notes (rich text or simple textarea — start simple).
- Optional: link this session to a specific scorecard week or specific safety events (multi-select from driver's recent events).
- Acknowledged toggle (set when driver confirms).
- Save creates immutable record.

### 6. CSV import (`/import`)
- Two tabs: Scorecard, Netradyne.
- Drag-and-drop file input.
- Parse → preview first 10 rows mapped to schema → confirm.
- Match drivers by `transporter_id`. Unmatched rows shown with options: create new driver, skip, or fix the ID.
- On import: write rows + create `csv_imports` audit record.
- Show success/error summary with downloadable error CSV.

### 7. Admin — Users (`/admin/users`)
- Admin only.
- Invite by email, set role.
- Deactivate users (no delete — preserves coaching history).

### 8. Admin — Drivers (`/admin/drivers`)
- Manager + admin.
- Bulk-add via CSV or one-off form.
- Edit any field, change status.

## Build Order

1. Project setup, Supabase, auth, role-based middleware.
2. Drivers list + driver detail (read-only first, with seed data).
3. Coaching session create + history view.
4. CSV import for scorecards.
5. CSV import for Netradyne events.
6. Dashboard.
7. Admin — users & drivers.
8. Polish, error states, empty states.

## Audit & Data Integrity Rules

- **Coaching sessions:** edits create revisions, originals never overwritten.
- **CSV imports:** every row links back to its `csv_imports` row. Re-imports of the same file are detected by file hash and warned.
- **Drivers:** soft-delete only (status → terminated). Coaching history must survive.
- **Timestamps:** every table has `created_at`. User-facing edits also track `updated_at` and `updated_by`.

## Open Questions (resolve during build)

- Exact column names from real Cortex / Netradyne CSVs — confirm once samples are in hand.
- Whether to display non-impacting events on the dashboard or hide them by default.
- Coaching session: free text vs structured topics list. Start free text; add structure if patterns emerge.

## Out of Scope (for now)

- Vehicle / VCR module (Phase 2)
- Attendance / call-out tracking (Phase 2)
- Onboarding & training (Phase 3)
- Incidents / accidents / damages (Phase 3)
- ADP / Slack / Rivian portal integrations
- Mobile app
