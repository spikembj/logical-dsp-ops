# Logical Ops — Handoff Document

> Read this **before SPEC.md** if you only have time for one. Read SPEC.md
> right after — it is the source of truth for product behavior.

## 1. Current Status

**Phase:** Phase 1 (Performance + Coaching tracking) — **all 8 build-order steps shipped.** Last commit on `main` is `1d8b2df` ("Step 8: Recharts trend chart on Performance tab + final SPEC sync").

**What's working end-to-end:**
- Auth + role middleware (Owner / HR / Ops Manager / Dispatcher)
- Drivers list, driver detail (Profile / Performance / Safety events / Coaching tabs)
- Coaching: create / edit / void / unvoid / acknowledge with full audit trail
- 7 import surfaces: DSP Overview CSV (primary), Scorecard PDF (fallback), Netradyne CSV, Escalations CSV, Concessions CSV, CDF Negative CSV, POD Details PDF
- Performance dashboard at `/`: stat tiles, needs-coaching hero list with Safety/Quality toggle, recent coaching activity
- Performance tab on driver detail: Recharts multi-line trend (Overall/DCR/POD/FICO), wide metrics table grouped Standing/Volume/Safety/Quality, summary cards (POD reject breakdown, Concessions, Negative CDF)
- Management page (`/admin/users`) — invite, role change, deactivate
- Drivers admin (`/admin/drivers`) — CRUD with Driver/Helper position + Standard Parcel vehicle type

**Last verified state:** the user confirmed POD Details import works, all 7 import sources have been tested, the Defects-tab→Performance-card consolidation is in place, the Recharts trend chart was just shipped.

**In-progress / partially built:** none. Phase 1 is feature-complete.

**Known broken:** none reported. ETIMEDOUT errors during builds in the last session were transient APFS filesystem flakes on macOS, not code issues.

## 2. Deviations from SPEC.md

All deviations are **already reflected in SPEC.md** — it was synced in commit `1d8b2df`.

Summary of where the original spec was extended/changed:

| Original spec | Current behavior | Why |
|---|---|---|
| `csv_imports` table | Renamed to `file_imports` | Not all imports are CSVs (Scorecard + POD Details are PDFs) |
| `import_type` = scorecard / netradyne | Expanded: scorecard / netradyne / escalations / cdf / concessions / pod_details | Step 6.5 added 5 more import sources |
| Roles: admin / manager / dispatcher | Renamed: owner / hr / ops_manager / dispatcher (legacy values still in enum for compat — `is_management()` helper covers both) | User wanted distinct labels for org clarity; Owner/HR/Ops Manager are functionally identical |
| `drivers.status` = active / loa / terminated | Added `inactive` (auto-flipped after 60 days no activity, reversible) | Operational reality: high turnover, need to auto-archive stale drivers without losing them |
| `vehicle_type` includes `step_van` | Renamed to `standard_parcel` | User's terminology |
| No driver/helper distinction | Added `position` enum (driver/helper) on drivers | Helpers ride along but don't drive — common case |
| Tier enum: fantastic_plus/fantastic/great/fair/poor | Added platinum/gold/silver/bronze | Amazon's new tier system; both coexist |
| `coaching_sessions` had no type | Added `session_type` enum (Discussion / Verbal warning / Write up / Final warning / Termination) | User asked for it — common HR pattern |
| `coaching_sessions` immutable | Added soft-void (`voided_at`/`voided_by`/`void_reason`) + admin edit. Audit trigger captures every UPDATE | Compromise between strict immutability and real-world "data turned out wrong" |
| Dashboard tier breakdown | Deferred until DSP Overview CSV — landed in 6.5 | PDF didn't have per-driver tier; CSV does |
| Recharts trend chart | Landed in step 8 | As planned |
| File-hash re-import detection | Scaffolding only (`lib/parsing/file-hash.ts`) — not wired | Low ops impact for current team size, deferred |
| New `concessions`, `cdf_negative`, `pod_details`, `escalations` tables | All added in 6.5 | Each captures unique per-package or per-incident detail |
| Defects tab on driver detail | Removed; data folded into Performance tab as summary cards | User preferred fewer tabs |

## 3. Project State

### Folder structure
```
.
├── .claude/
├── app/
│   ├── (app)/
│   │   ├── admin/
│   │   │   ├── drivers/         # Drivers admin CRUD
│   │   │   └── users/           # Management page
│   │   ├── drivers/
│   │   │   ├── [id]/            # Driver detail (layout + 4 tabs)
│   │   │   └── page.tsx         # Drivers list
│   │   ├── import/page.tsx      # 7-tab import surface
│   │   ├── layout.tsx           # Authed app shell with sidebar
│   │   └── page.tsx             # Performance dashboard (home)
│   ├── (auth)/
│   │   └── login/
│   ├── actions/                 # Server actions (10 files)
│   ├── auth/callback/           # Supabase magic-link callback
│   ├── globals.css
│   └── layout.tsx               # Root layout + ThemeProvider
├── components/
│   ├── app/
│   │   ├── admin/               # Management + drivers admin UI
│   │   ├── coaching/            # Session dialog/card/list/triggers panel
│   │   ├── dashboard/           # Stat tiles + needs-coaching list
│   │   ├── defects/             # Defects list (used inline on Performance tab)
│   │   ├── import/              # 7 upload components + GlobalDropGuard
│   │   ├── perf/                # PerformanceTrendChart (Recharts)
│   │   ├── safety-events/
│   │   └── …driver-tabs, sidebar-nav, sign-out, theme-*
│   └── ui/                      # shadcn (base-ui flavor) primitives
├── lib/
│   ├── auth/require-role.ts     # requireRole + requireUser + requireManagement
│   ├── format/                  # badges, dates
│   ├── parsing/                 # 5 parsers (PDF + CSV) + file-hash scaffold
│   ├── queries/                 # 9 query helpers
│   ├── supabase/                # client / server / middleware
│   ├── types/database.ts        # Hand-rolled DB types
│   └── utils.ts                 # cn()
├── public/
├── scripts/                     # seed-drivers-from-csv.mjs
├── supabase/
│   ├── migrations/              # 18 migrations (see below)
│   ├── seed-drivers.sql
│   ├── seed.sql
│   └── cleanup-netradyne-ids.sql
├── middleware.ts                # Root middleware → updateSession
├── next.config.ts               # serverExternalPackages: ["pdfjs-dist"]
├── package.json
├── tsconfig.json
├── SPEC.md                      # Source of truth
└── HANDOFF.md                   # This file
```

### Key dependencies (from package.json)
**Runtime:**
- `next@16.2.4` (pinned to webpack via `next dev --webpack` / `next build --webpack` — Turbopack 16.2.4 has a temp-manifest race we worked around)
- `react@19.2.4`, `react-dom@19.2.4`
- `@supabase/ssr@^0.10.2`, `@supabase/supabase-js@^2.105.1`
- `@base-ui/react@^1.4.1` (shadcn now wraps base-ui, not Radix)
- `tailwindcss@^4`, `tw-animate-css`, `tailwind-merge`, `clsx`, `class-variance-authority`
- `lucide-react`, `sonner`, `next-themes`
- `papaparse`, `pdfjs-dist@^5.7.284`
- `recharts@^3.8.1`
- `zod@^4.4.2`, `date-fns`, `date-fns-tz`

**Dev:**
- `supabase` (CLI, npm-installed dev dep)
- TypeScript 5, ESLint 9

### Database state
**Supabase project:** `oaufkjqtjecffpkcwewp` (URL in `.env.local`).

**Migrations applied (chronological):**
1. `20260501214330_init.sql` — initial schema (enums, tables, RLS, triggers)
2. `20260501214340_grants.sql` — baseline GRANTs (Supabase doesn't auto-grant for raw SQL anymore)
3. `20260502152928_coaching_void_and_admin_edits.sql` — soft-void + acknowledge RPC
4. `20260502165843_drivers_nullable_transporter_id.sql`
5. `20260502173649_scorecards_cdf_integer.sql` — fixed numeric overflow
6. `20260502180054_scorecards_full_columns.sql` — added delivered/ced/dsb/pod/psb/dsb_count/pod_opps
7. `20260502203356_scorecards_allow_update.sql`
8. `20260502222114_safety_events_admin_delete.sql`
9. `20260503143410_inactive_tier_session_type.sql` — inactive status + platinum tiers + session_type + refresh_driver_active_status
10. `20260503164204_scorecards_overall_score.sql`
11. `20260503211220_escalations.sql`
12. `20260504104233_refresh_active_status_bidirectional.sql`
13. `20260508165130_concessions.sql`
14. `20260508170543_cdf_negative.sql`
15. `20260508191643_pod_details.sql`
16. `20260508231023_position_and_standard_parcel.sql`
17. `20260509071714_management_roles.sql` — adds owner/hr/ops_manager enum values
18. `20260509073330_management_roles_part2.sql` — migrates data + replaces all RLS with `is_management()`

**One-off SQL the user has already run:**
- `supabase/cleanup-netradyne-ids.sql` (cleared wrong IDs from initial seed)
- `select * from public.refresh_driver_active_status();` (one-time cleanup; now also called automatically after every import)
- The seed admin snippet from `supabase/seed.sql` (top section)

### Seed data loaded
- 205 drivers initially seeded from a Netradyne CSV (transporter_ids cleared, then repopulated by scorecard imports)
- Real data imported across testing: Week 16 + Week 38 2025 scorecard PDFs, Week 17 DSP Overview CSV, Apr 1–26 Netradyne, Week 16 Escalations, Week 18 Concessions, Week 17 daily + weekly CDF Negative, Week 16 POD Details

## 4. Access & Environment

### Required env vars
In `.env.local` (gitignored — never commit values):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-only, used by inviteUser admin action
NEXT_PUBLIC_DEFAULT_TZ        # = America/Denver
```

`.env.example` is committed as a template.

> **Important for next session:** confirm `.env.local` is present at the repo root before doing anything. Without it, server actions and the Supabase client both fail silently or throw at request time.

### Connected services
- **Supabase project:** `oaufkjqtjecffpkcwewp` (org/region details in the dashboard — keys are local-only)
- **GitHub:** `https://github.com/spikembj/logical-dsp-ops.git`, push via PAT cached in macOS keychain
- **Vercel:** **not yet deployed.** Project lives only locally + on GitHub. Step 8 polish notes mention deployment as future work.

## 5. Active Issues / Known Gotchas

### Filesystem flake (macOS APFS)
Several times this session, `npm run build` or `git add` failed with `ENOENT`, `ETIMEDOUT`, or "short read" errors that disappeared on retry. Root cause is APFS / Spotlight indexing — not the code. Standard remediation:
```bash
rm -rf .next node_modules/.cache && npm install && npm run dev
```

### Turbopack avoided
`next dev` and `next build` are both pinned to `--webpack` because Turbopack 16.2.4 hits a temp-manifest race that breaks the dev server intermittently. Don't switch back without re-testing.

### Next dev server cache corruption
If you see `_buildManifest.js.tmp.<hash>` errors, nuke `.next` entirely (sometimes twice — APFS again) before restarting `npm run dev`.

### shadcn is base-ui-flavored, not Radix
The `components/ui/*` files import from `@base-ui/react/*`, not `@radix-ui/*`. Some props differ:
- `DropdownMenuTrigger` does NOT accept `asChild`. Style the trigger directly or use base-ui's `render` prop.
- The `Tabs`, `Dialog`, `Checkbox`, `Select` components also follow base-ui's API.

### TypeScript strictness on event handlers
Use `e.currentTarget.value` (not `e.target.value`) on input/select/textarea handlers. The latter trips Next 16's strict mode with base-ui Input.

### Active driver count
Dashboard "Active drivers" tile uses a 30-day window for distinctness; the 60-day rule is the auto-deactivate threshold. These are deliberately different.

### TODOs in code
`grep -rn "TODO\|FIXME"` in `app/`, `components/`, `lib/` returns **none**. Clean.

### Reference data location
`/_reference/` (gitignored) has the user's real CSVs/PDFs we built parsers against. Never commit anything from here.

## 6. Next Concrete Steps

Phase 1 is complete. Most likely next directions, in order of value:

1. **Deploy to Vercel.** No deploy has happened. Push the current `main` to a Vercel project, configure env vars in Vercel's dashboard, verify all 7 imports work in production. **Done when:** the user can visit a public URL, sign in, run an import. Likely needs:
   - Vercel project link (`npx vercel link` or via web UI)
   - All 4 env vars copy-pasted into Vercel project settings
   - First production smoke test

2. **Add a "Has driver record" badge on the Management page.** Some dispatchers also drive (Colby, Manuel, Athena per the user). Today their `users` row and `drivers` row aren't linked. Cheapest first pass: scan drivers by normalized name match against each user, show a small badge. **Done when:** the management table shows the badge for any user whose name matches a driver, with a link to that driver's profile.

3. **Wire file-hash re-import detection.** Helper exists at `lib/parsing/file-hash.ts`. For each of the 7 import actions: compute SHA256, query `file_imports.file_hash` for an existing row, return a `duplicate_warning` flag in the summary, surface in the upload UI. **Done when:** uploading the same file twice shows a "you already imported this file" warning before proceeding.

Phase 2 work the user mentioned for future sessions (do **not** start without explicit approval):
- Ops dashboard / daily planning
- Fleet tracking / VCRs
- HR onboarding/offboarding
- Driver-facing features

## 7. Starter Prompt for Next Session

Paste this verbatim into the next Claude Code session:

---

> **Read these two files before doing anything else:**
> 1. `SPEC.md` — the source of truth for what the app does.
> 2. `HANDOFF.md` — current state, deviations, gotchas, and your starter tasks.
>
> Confirm you've read both. Then **before writing any code**, tell me:
> - One-paragraph summary of where the project is.
> - Any clarifying questions you have about Phase 1 state, the gotchas section, or the next tasks.
> - Which of the three "Next Concrete Steps" tasks you'd recommend starting with, and why.
>
> Then wait for my answer before you start.
>
> The three candidate next tasks (full detail in HANDOFF.md §6) are:
> 1. Deploy to Vercel.
> 2. Add a "Has driver record" badge on the Management page (link dispatchers who also drive).
> 3. Wire file-hash re-import detection across the 7 import actions.
>
> Treat SPEC.md as authoritative. Update it in the same commit as any code change that contradicts or extends it.

---
