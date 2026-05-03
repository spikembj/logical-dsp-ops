-- =============================================================================
-- Add the remaining columns from the Amazon DSP scorecard so the Performance
-- tab can show every stat, not just the subset the original spec listed.
--
-- Source columns from the PDF:
--   Delivered, CED (Customer Escalation Defect), DSB (Delivery Success
--   Behaviors DPMO), POD (Photo-On-Delivery %), PSB (Pickup Success Behaviors),
--   DSB Count, POD Opps.
--
-- All nullable — historical scorecards may not have these.
-- =============================================================================

alter table public.scorecards
  add column if not exists delivered integer,
  add column if not exists ced       integer,
  add column if not exists dsb       integer,
  add column if not exists pod       numeric,
  add column if not exists psb       numeric,
  add column if not exists dsb_count integer,
  add column if not exists pod_opps  integer;
