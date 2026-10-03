CREATE TABLE IF NOT EXISTS public.powerbi_evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  audit_date date NOT NULL,
  report_month date NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_name text NOT NULL,
  audit_type_id uuid REFERENCES public.audit_types(id) ON DELETE SET NULL,
  audit_type_name text,
  department_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  department_name text NOT NULL,
  department_score numeric(8,2),
  department_max_score numeric(8,2),
  final_score numeric(8,2),
  status text,
  source text NOT NULL DEFAULT 'audit',
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, department_id)
);

CREATE INDEX IF NOT EXISTS powerbi_scores_date_idx ON public.powerbi_evaluation_scores (audit_date DESC);
CREATE INDEX IF NOT EXISTS powerbi_scores_month_branch_idx ON public.powerbi_evaluation_scores (report_month, branch_name);
CREATE INDEX IF NOT EXISTS powerbi_scores_department_idx ON public.powerbi_evaluation_scores (department_name);

GRANT SELECT ON public.powerbi_evaluation_scores TO authenticated;
GRANT SELECT ON public.powerbi_evaluation_scores TO anon;
GRANT ALL ON public.powerbi_evaluation_scores TO service_role;
ALTER TABLE public.powerbi_evaluation_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "powerbi scores read authenticated" ON public.powerbi_evaluation_scores;
CREATE POLICY "powerbi scores read authenticated" ON public.powerbi_evaluation_scores FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_powerbi_evaluation_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE affected integer;
BEGIN
  TRUNCATE TABLE public.powerbi_evaluation_scores;
  INSERT INTO public.powerbi_evaluation_scores (
    audit_id, audit_date, report_month, branch_id, branch_name,
    audit_type_id, audit_type_name, department_id, department_name,
    department_score, department_max_score, final_score, status, source
  )
  SELECT
    a.id,
    a.audit_date,
    date_trunc('month', a.audit_date)::date,
    b.id,
    b.name_ar,
    at.id,
    at.name_en,
    s.id,
    s.name_en,
    CASE WHEN SUM(CASE WHEN aa.is_na THEN 0 ELSE q.max_score END) = 0 THEN NULL
         ELSE ROUND(100.0 * SUM(CASE WHEN aa.is_na THEN 0 ELSE COALESCE(aa.score, 0) END) / SUM(CASE WHEN aa.is_na THEN 0 ELSE q.max_score END), 2)
    END,
    SUM(CASE WHEN aa.is_na THEN 0 ELSE q.max_score END),
    CASE WHEN SUM(CASE WHEN aa.is_na THEN 0 ELSE q.max_score END) = 0 THEN NULL
         ELSE ROUND(100.0 * SUM(CASE WHEN aa.is_na THEN 0 ELSE COALESCE(aa.score, 0) END) / SUM(CASE WHEN aa.is_na THEN 0 ELSE q.max_score END), 2)
    END,
    a.status,
    'audit'
  FROM public.audits a
  JOIN public.branches b ON b.id = a.branch_id
  JOIN public.audit_types at ON at.id = a.audit_type_id
  JOIN public.questions q ON q.audit_type_id = a.audit_type_id
  JOIN public.sections s ON s.id = q.section_id
  LEFT JOIN public.audit_answers aa ON aa.audit_id = a.id AND aa.question_id = q.id
  GROUP BY a.id, a.audit_date, b.id, b.name_ar, at.id, at.name_en, s.id, s.name_en, a.status;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON TABLE public.powerbi_evaluation_scores IS 'Flat, Power BI-ready table with one row per audit department and historical/current scores.';
COMMENT ON FUNCTION public.refresh_powerbi_evaluation_scores() IS 'Rebuilds the Power BI table from all historical and current audits.';

SELECT public.refresh_powerbi_evaluation_scores();

CREATE OR REPLACE FUNCTION public.refresh_powerbi_scores_on_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_powerbi_evaluation_scores();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_powerbi_scores_after_audit ON public.audits;
CREATE TRIGGER refresh_powerbi_scores_after_audit
AFTER INSERT OR UPDATE ON public.audits
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_powerbi_scores_on_audit();

DROP TRIGGER IF EXISTS refresh_powerbi_scores_after_answer ON public.audit_answers;
CREATE TRIGGER refresh_powerbi_scores_after_answer
AFTER INSERT OR UPDATE OR DELETE ON public.audit_answers
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_powerbi_scores_on_audit();
