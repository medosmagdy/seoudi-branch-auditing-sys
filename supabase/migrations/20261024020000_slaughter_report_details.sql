-- Additive only. Preserve existing reports, policies and scoring logic.
-- Run before deploying the application files that read/write report_details.
ALTER TABLE public.slaughter_reports
  ADD COLUMN IF NOT EXISTS report_details jsonb;
COMMENT ON COLUMN public.slaughter_reports.report_details IS
  'Versioned snapshot of entered checklist, notes, weights and trip details; existing records remain NULL.';
