-- Monthly branch evaluation headers and per-department scores.
CREATE TABLE IF NOT EXISTS public.branch_evaluation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_name text NOT NULL,
  report_month date NOT NULL,
  final_score numeric(6,2) CHECK (final_score >= 0),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_name, report_month),
  CHECK (report_month = date_trunc('month', report_month)::date)
);

CREATE TABLE IF NOT EXISTS public.branch_evaluation_department_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.branch_evaluation_reports(id) ON DELETE CASCADE,
  department_name text NOT NULL,
  score numeric(6,2) NOT NULL DEFAULT 0 CHECK (score >= 0),
  max_score numeric(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, department_name),
  CHECK (score <= max_score)
);

CREATE INDEX IF NOT EXISTS branch_evaluation_reports_month_idx
  ON public.branch_evaluation_reports(report_month DESC);

CREATE INDEX IF NOT EXISTS branch_evaluation_department_scores_report_idx
  ON public.branch_evaluation_department_scores(report_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_evaluation_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_evaluation_department_scores TO authenticated;
GRANT ALL ON public.branch_evaluation_reports TO service_role;
GRANT ALL ON public.branch_evaluation_department_scores TO service_role;

ALTER TABLE public.branch_evaluation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_evaluation_department_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evaluation reports read" ON public.branch_evaluation_reports
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "evaluation reports insert" ON public.branch_evaluation_reports
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "evaluation reports update" ON public.branch_evaluation_reports
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "evaluation reports delete" ON public.branch_evaluation_reports
  FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "department scores read" ON public.branch_evaluation_department_scores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "department scores insert" ON public.branch_evaluation_department_scores
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.branch_evaluation_reports report
      WHERE report.id = report_id AND report.created_by = auth.uid()
    )
  );
CREATE POLICY "department scores update" ON public.branch_evaluation_department_scores
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.branch_evaluation_reports report
      WHERE report.id = report_id AND report.created_by = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.branch_evaluation_reports report
      WHERE report.id = report_id AND report.created_by = auth.uid()
    )
  );
CREATE POLICY "department scores delete" ON public.branch_evaluation_department_scores
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.branch_evaluation_reports report
      WHERE report.id = report_id AND report.created_by = auth.uid()
    )
  );

COMMENT ON TABLE public.branch_evaluation_reports IS 'Monthly evaluation header per branch with final score.';
COMMENT ON TABLE public.branch_evaluation_department_scores IS 'Individual department scores for a monthly branch evaluation.';
COMMENT ON COLUMN public.branch_evaluation_reports.report_month IS 'First day of the evaluation month.';
COMMENT ON COLUMN public.branch_evaluation_reports.final_score IS 'Final score calculated from department scores.';
COMMENT ON COLUMN public.branch_evaluation_department_scores.score IS 'Department score.';
COMMENT ON COLUMN public.branch_evaluation_department_scores.max_score IS 'Maximum possible department score.';
