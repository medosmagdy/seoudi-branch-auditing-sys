-- READ ONLY: no INSERT, UPDATE, DELETE, or changes to policies/functions.
-- Inspect the latest five Madinaty Food Safety visits and fruit/vegetable sections.
WITH visits AS MATERIALIZED (
  SELECT a.id, a.audit_date, a.created_at, a.status, a.audit_type_id,
         b.name_ar AS branch_name, t.code AS program_code
  FROM public.audits a
  JOIN public.branches b ON b.id = a.branch_id
  JOIN public.audit_types t ON t.id = a.audit_type_id
  WHERE b.name_ar ~ 'مدينت[ىي]'
    AND (t.code ~* '^FS($|[^A-Za-z])'
         OR t.id = 'dfcbaad0-679d-41e4-9e52-8037e3d1311f'::uuid)
  ORDER BY a.audit_date DESC, a.created_at DESC, a.id
  LIMIT 5
), sections AS MATERIALIZED (
  SELECT a.id AS audit_id, a.audit_date, a.status, a.audit_type_id,
         s.id AS section_id, s.name_ar, s.active
  FROM visits a
  JOIN public.sections s ON s.audit_type_id = a.audit_type_id
  WHERE s.name_ar ~ 'خضر|خضار|فاكه'
)
SELECT jsonb_pretty(jsonb_build_object(
  'visits', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM visits v), '[]'::jsonb),
  'sections', coalesce((SELECT jsonb_agg(jsonb_build_object(
    'audit_id', s.audit_id,
    'audit_date', s.audit_date,
    'section_id', s.section_id,
    'section_name', s.name_ar,
    'section_active', s.active,
    'section_na', coalesce((SELECT st.is_na FROM public.audit_section_status st
      WHERE st.audit_id = s.audit_id AND st.section_id = s.section_id LIMIT 1), false),
    'section_deductions', coalesce((SELECT jsonb_agg(d.percentage)
      FROM public.audit_section_deductions d
      WHERE d.audit_id = s.audit_id AND d.section_id = s.section_id), '[]'::jsonb),
    'general_deductions', coalesce((SELECT jsonb_agg(d.percentage)
      FROM public.audit_general_deductions d WHERE d.audit_id = s.audit_id), '[]'::jsonb),
    'questions', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'question_id', q.id, 'item', q.item_id, 'text', q.text_ar,
      'active', q.active, 'max_score', q.max_score,
      'same_program', q.audit_type_id = s.audit_type_id,
      'answer_exists', aa.id IS NOT NULL,
      'score', aa.score, 'legacy_score_value', aa.score_value,
      'is_na', aa.is_na,
      'has_comment', coalesce(nullif(btrim(aa.comment), '') IS NOT NULL, false),
      'has_photo', EXISTS (SELECT 1 FROM public.photos p
        WHERE p.audit_id = s.audit_id AND p.question_id = q.id)
    ) ORDER BY q.item_order, q.id)
      FROM public.questions q LEFT JOIN public.audit_answers aa
        ON aa.question_id = q.id AND aa.audit_id = s.audit_id
      WHERE q.section_id = s.section_id), '[]'::jsonb)
  ) ORDER BY s.audit_date DESC, s.section_id) FROM sections s), '[]'::jsonb)
)) AS madinaty_diagnostic;
