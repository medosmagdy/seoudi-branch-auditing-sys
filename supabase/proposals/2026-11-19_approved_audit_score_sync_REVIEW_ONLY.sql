-- REVIEW ONLY. Install after approval; no existing audit is updated by this script.
-- Keep an already submitted audit's stored scores in step with its scored edits.
BEGIN;

CREATE SCHEMA IF NOT EXISTS sqop_score_sync;
REVOKE ALL ON SCHEMA sqop_score_sync FROM PUBLIC;

-- Match computeAudit's Math.round(value * 100) / 100 with double precision.
-- Comparing the fractional part avoids rounding a value just below a half up.
CREATE FUNCTION sqop_score_sync.round_score(value double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $$
  SELECT (floor(value * 100) + CASE WHEN value * 100 - floor(value * 100) >= 0.5 THEN 1 ELSE 0 END) / 100
$$;

CREATE FUNCTION sqop_score_sync.on_scored_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  old_row jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;
  new_row jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  target_id uuid;
  program_id uuid;
  branch_name text;
  include_delivery boolean;
  before_general double precision;
  final_score double precision;
BEGIN
  -- Leave anonymous/legacy roles outside automatic re-approval. The trigger
  -- uses the caller's existing table privileges and never elevates them.
  IF NOT has_schema_privilege('sqop_score_sync','USAGE') THEN RETURN NULL; END IF;

  IF TG_OP = 'UPDATE' AND
    (old_row - ARRAY['id', 'comment', 'score_value', 'reason_text', 'created_at', 'updated_at']) =
    (new_row - ARRAY['id', 'comment', 'score_value', 'reason_text', 'created_at', 'updated_at'])
  THEN
    RETURN NULL;
  END IF;

  FOR target_id IN
    SELECT DISTINCT a.id
    FROM unnest(ARRAY[(old_row->>'audit_id')::uuid, (new_row->>'audit_id')::uuid]) a(id)
    WHERE a.id IS NOT NULL ORDER BY a.id
  LOOP
    -- Lock without conflicting with the child FK key-share lock. After waiting,
    -- the later writer recomputes from its own edit and the committed earlier edit.
    SELECT a.audit_type_id, b.name_ar INTO program_id, branch_name
    FROM public.audits a LEFT JOIN public.branches b ON b.id = a.branch_id
    WHERE a.id = target_id AND a.status = 'submitted'
    FOR NO KEY UPDATE OF a;
    IF NOT FOUND THEN CONTINUE; END IF;
    include_delivery := coalesce(btrim(branch_name) IN ('دارك ستور زايد','دارك ستور المعادي','دارك ستور الكيت كات'),false);

    IF TG_TABLE_NAME = 'audit_answers' AND NOT EXISTS (
      SELECT 1 FROM public.questions q JOIN public.sections s ON s.id = q.section_id
      WHERE q.id IN ((old_row->>'question_id')::uuid, (new_row->>'question_id')::uuid)
        AND q.audit_type_id = program_id AND s.audit_type_id = program_id
        AND q.active AND s.active
        AND (include_delivery OR NOT coalesce(s.is_delivery,false))
        AND NOT EXISTS (SELECT 1 FROM public.audit_section_status st
          WHERE st.audit_id = target_id AND st.section_id = s.id AND st.is_na)
        -- An insert/delete of the implicit default alone is not a scoring edit.
        AND (
          TG_OP = 'UPDATE' OR
          (coalesce(old_row,new_row)->>'is_na')::boolean IS TRUE OR
          (coalesce(old_row,new_row)->>'score')::numeric IS DISTINCT FROM coalesce(q.max_score,4)
        )
    ) THEN CONTINUE; END IF;

    IF TG_TABLE_NAME IN ('audit_section_status','audit_section_deductions') AND NOT EXISTS (
      SELECT 1 FROM public.sections s
      WHERE s.id IN ((old_row->>'section_id')::uuid, (new_row->>'section_id')::uuid)
        AND s.audit_type_id = program_id AND s.active
        AND (include_delivery OR NOT coalesce(s.is_delivery,false))
        AND (TG_TABLE_NAME = 'audit_section_status' OR NOT EXISTS (
          SELECT 1 FROM public.audit_section_status st
          WHERE st.audit_id = target_id AND st.section_id = s.id AND st.is_na))
    ) THEN CONTINUE; END IF;

    IF TG_TABLE_NAME = 'audit_section_status' AND TG_OP IN ('INSERT','DELETE') AND
      (coalesce(old_row,new_row)->>'is_na')::boolean IS NOT TRUE
    THEN CONTINUE; END IF;

    -- Same active template and score defaults as loadReportModel. Pending
    -- explicit null/out-of-range edits can be saved as before, but cannot
    -- replace the official score until every included question is resolved.
    WITH input AS (
      SELECT s.id, s.order_index, coalesce(s.is_delivery,false) AS delivery,
        coalesce(q.max_score,4)::double precision AS configured_max,
        CASE WHEN a.id IS NULL THEN coalesce(q.max_score,4)
             ELSE a.score END::double precision AS score,
        coalesce(a.is_na,false) AS is_na
      FROM public.sections s
      JOIN public.questions q ON q.section_id = s.id AND q.audit_type_id = program_id AND q.active
      LEFT JOIN public.audit_answers a ON a.question_id = q.id AND a.audit_id = target_id
      WHERE s.audit_type_id = program_id AND s.active
        AND NOT EXISTS (SELECT 1 FROM public.audit_section_status st
          WHERE st.audit_id = target_id AND st.section_id = s.id AND st.is_na)
    ), section_points AS (
      SELECT id, order_index,
        sum(CASE WHEN configured_max > 0 THEN configured_max ELSE 4 END) AS maximum,
        sum(score) AS earned
      FROM input
      WHERE NOT is_na AND score IS NOT NULL
        AND (NOT delivery OR include_delivery)
      GROUP BY id, order_index
    ), totals AS (
      SELECT coalesce(sum(maximum),0) AS maximum,
        sqop_score_sync.round_score(coalesce(sum(greatest(0, sqop_score_sync.round_score(
          p.earned - sqop_score_sync.round_score(p.maximum * least(100,greatest(0,coalesce(d.percentage,0))) / 100)
        )) ORDER BY p.order_index,p.id),0)) AS earned
      FROM section_points p CROSS JOIN LATERAL (
        SELECT sum(d.percentage::double precision ORDER BY d.created_at,d.id) AS percentage
        FROM public.audit_section_deductions d WHERE d.audit_id = target_id AND d.section_id = p.id
      ) d
    )
    SELECT CASE WHEN maximum > 0 THEN sqop_score_sync.round_score(earned / maximum * 100) ELSE 0 END
      INTO before_general FROM totals
      WHERE NOT EXISTS (SELECT 1 FROM input WHERE NOT is_na AND (score IS NULL OR score < 0 OR score > configured_max));

    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT greatest(0,least(100,sqop_score_sync.round_score(before_general -
      least(100,greatest(0,coalesce(sum(d.percentage::double precision ORDER BY d.created_at,d.id),0))))))
      INTO final_score FROM public.audit_general_deductions d WHERE d.audit_id = target_id;

    UPDATE public.audits
      SET score = final_score, overall_score = before_general
      WHERE id = target_id AND status = 'submitted'
        AND (score IS DISTINCT FROM final_score::numeric OR overall_score IS DISTINCT FROM before_general::numeric);
  END LOOP;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION sqop_score_sync.round_score(double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION sqop_score_sync.on_scored_edit() FROM PUBLIC;
GRANT USAGE ON SCHEMA sqop_score_sync TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sqop_score_sync.round_score(double precision) TO authenticated, service_role;

DO $install$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['audit_answers','audit_section_status','audit_section_deductions','audit_general_deductions']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER sqop_sync_approved_score AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION sqop_score_sync.on_scored_edit()',
      target
    );
  END LOOP;
END
$install$;

COMMIT;
