-- REVIEW ONLY: not applied. Requires the already-installed audit sharing feature.
-- No changes to audit_answers, scores, existing roles, or existing audit-table RLS.
BEGIN;
CREATE TABLE public.manager_audit_branch_scopes (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 branch_ids uuid[] NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.manager_audit_branch_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_audit_branch_scopes FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sqop_set_manager_branch_scope(p_user_id uuid,p_branch_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ids uuid[];
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.id=p_user_id AND p.active=true AND r.role='manager') THEN RAISE EXCEPTION 'Active manager account required'; END IF;
 IF p_branch_ids IS NULL THEN
   DELETE FROM public.manager_audit_branch_scopes WHERE user_id=p_user_id;
 ELSE
   IF array_position(p_branch_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid branch identifiers'; END IF;
   SELECT coalesce(array_agg(DISTINCT id ORDER BY id),ARRAY[]::uuid[]) INTO ids FROM unnest(p_branch_ids) AS id;
   IF (SELECT count(*) FROM public.branches WHERE id=ANY(ids))<>cardinality(ids) THEN RAISE EXCEPTION 'Unknown branch'; END IF;
   INSERT INTO public.manager_audit_branch_scopes(user_id,branch_ids,updated_by) VALUES(p_user_id,ids,auth.uid())
   ON CONFLICT(user_id) DO UPDATE SET branch_ids=EXCLUDED.branch_ids,updated_at=now(),updated_by=auth.uid();
 END IF;
END $$;
CREATE FUNCTION public.sqop_manager_can_read_branch(p_branch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active=true)
 AND (NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='manager')
 OR NOT EXISTS(SELECT 1 FROM public.manager_audit_branch_scopes WHERE user_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.manager_audit_branch_scopes WHERE user_id=auth.uid() AND p_branch_id=ANY(branch_ids)));
$$;
REVOKE ALL ON FUNCTION public.sqop_set_manager_branch_scope(uuid,uuid[]),public.sqop_manager_can_read_branch(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_set_manager_branch_scope(uuid,uuid[]),public.sqop_manager_can_read_branch(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sqop_audit_sharing_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); peers jsonb; groups jsonb := '[]'::jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND active=true) THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT other.user_id ORDER BY other.user_id),'[]'::jsonb) INTO peers
 FROM public.audit_share_members own JOIN public.audit_share_members other ON other.group_id=own.group_id
 JOIN public.profiles p ON p.id=other.user_id AND p.active=true
 WHERE own.user_id=actor AND other.user_id<>actor;
 IF public.sqop_share_is_admin() THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'member_ids',
    coalesce((SELECT jsonb_agg(m.user_id ORDER BY m.user_id) FROM public.audit_share_members m WHERE m.group_id=g.id),'[]'::jsonb)) ORDER BY g.created_at,g.id),'[]'::jsonb)
  INTO groups FROM public.audit_share_groups g;
 END IF;
 RETURN jsonb_build_object('peers',peers,'groups',groups,
 'branch_scoping_installed',true,
 'visible_branch_ids',CASE WHEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='manager') THEN (SELECT branch_ids FROM public.manager_audit_branch_scopes WHERE user_id=actor) ELSE NULL END,
 'manager_scopes',CASE WHEN public.sqop_share_is_admin() THEN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'branch_ids',branch_ids) ORDER BY user_id) FROM public.manager_audit_branch_scopes),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
CREATE OR REPLACE FUNCTION public.sqop_dashboard_snapshot(p_scope text DEFAULT 'branches'::text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_branch uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = auth.uid() AND r.role::text IN ('admin', 'manager')
      AND p.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Dashboard access denied' USING ERRCODE = '42501';
  END IF;
  IF p_scope NOT IN ('branches', 'warehouses') OR p_scope IS NULL THEN
    RAISE EXCEPTION 'Invalid location scope' USING ERRCODE = '22023';
  END IF;
  IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_start > p_end THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22023';
  END IF;

  WITH locations AS MATERIALIZED (
    SELECT b.id, b.name_ar, b.code, b.active
    FROM public.branches b
    WHERE public.sqop_manager_can_read_branch(b.id) AND (btrim(b.name_ar) = 'المخازن المركزية') = (p_scope = 'warehouses')
  ), programs AS MATERIALIZED (
    SELECT t.* FROM public.audit_types t
    WHERE (concat_ws(' ', t.code, t.name_ar, t.name_en)
      ~* '(\mwh\M|warehouse|مخازن|مخزن)') = (p_scope = 'warehouses')
  ), selected AS MATERIALIZED (
    SELECT a.id, a.audit_date, a.status, a.branch_id, a.audit_type_id,
      b.name_ar AS branch_name, t.code, t.name_ar, t.name_en
    FROM public.audits a
    JOIN locations b ON b.id = a.branch_id
    JOIN programs t ON t.id = a.audit_type_id
    WHERE (p_start IS NULL OR a.audit_date >= p_start)
      AND (p_end IS NULL OR a.audit_date <= p_end)
      AND (p_branch IS NULL OR a.branch_id = p_branch)
      AND (public.sqop_share_is_admin() OR a.status = 'submitted')
  ), question_totals AS (
    SELECT a.id AS audit_id, s.id AS section_id,
      coalesce(sum(CASE
        WHEN coalesce(aa.is_na, false) OR (aa.id IS NOT NULL AND aa.score IS NULL) THEN 0
        WHEN coalesce(q.max_score, 4) > 0 THEN coalesce(q.max_score, 4) ELSE 4 END), 0) AS maximum,
      coalesce(sum(CASE WHEN coalesce(aa.is_na, false) THEN 0
        WHEN aa.id IS NULL THEN coalesce(q.max_score, 4) ELSE coalesce(aa.score, 0) END), 0) AS earned,
      count(*) FILTER (WHERE NOT coalesce(aa.is_na, false)
        AND aa.score < CASE
          WHEN q.text_ar ~* 'CCP|OPRP|نقاط التحكم الحرجة|المتطلبات التشغيلية الأولية' THEN 4
          WHEN coalesce(q.max_score, 4) > 0 THEN coalesce(q.max_score, 4) ELSE 4 END) AS non_compliant,
      count(*) FILTER (WHERE NOT coalesce(aa.is_na, false) AND aa.score = 0) AS critical
    FROM selected a
    JOIN public.sections s ON s.audit_type_id = a.audit_type_id AND s.active IS TRUE
    JOIN public.questions q ON q.section_id = s.id
      AND q.audit_type_id = a.audit_type_id AND q.active IS TRUE
    LEFT JOIN public.audit_answers aa ON aa.audit_id = a.id AND aa.question_id = q.id
    WHERE a.status = 'submitted'
    GROUP BY a.id, s.id
  ), section_rows AS (
    SELECT a.id AS audit_id, s.id, s.name_ar, s.name_en, s.is_delivery,
      coalesce(st.is_na, false) AS excluded,
      coalesce(q.maximum, 0) AS maximum, coalesce(q.earned, 0) AS earned,
      CASE WHEN coalesce(st.is_na, false) THEN 0 ELSE coalesce(q.non_compliant, 0) END AS non_compliant,
      CASE WHEN coalesce(st.is_na, false) THEN 0 ELSE coalesce(q.critical, 0) END AS critical,
      coalesce((SELECT jsonb_agg(d.percentage) FROM public.audit_section_deductions d
        WHERE d.audit_id = a.id AND d.section_id = s.id), '[]'::jsonb) AS deduction_entries,
      coalesce((SELECT sum(d.percentage) FROM public.audit_section_deductions d
        WHERE d.audit_id = a.id AND d.section_id = s.id), 0) AS deduction
    FROM selected a
    JOIN public.sections s ON s.audit_type_id = a.audit_type_id AND s.active IS TRUE
    LEFT JOIN public.audit_section_status st ON st.audit_id = a.id AND st.section_id = s.id
    LEFT JOIN question_totals q ON q.audit_id = a.id AND q.section_id = s.id
    WHERE a.status = 'submitted'
  ), packed AS (
    SELECT audit_id, jsonb_agg(jsonb_build_object(
      'id', id, 'nameAr', name_ar, 'nameEn', name_en,
      'isDelivery', coalesce(is_delivery, false), 'isNa', excluded,
      'maximum', maximum, 'earned', earned, 'deduction', deduction, 'deductions', deduction_entries,
      'nonCompliant', non_compliant, 'critical', critical
    ) ORDER BY id) AS sections
    FROM section_rows GROUP BY audit_id
  )
  SELECT jsonb_build_object(
    'version', 1,
    'locations', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name_ar', name_ar, 'code', code, 'active', active
    ) ORDER BY name_ar) FROM locations), '[]'::jsonb),
    'audits', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'date', a.audit_date, 'status', a.status,
      'branchId', a.branch_id, 'branchName', a.branch_name,
      'type', jsonb_build_object('id', a.audit_type_id, 'code', a.code,
        'name_ar', a.name_ar, 'name_en', a.name_en),
      'generalDeductions', CASE WHEN a.status = 'submitted' THEN coalesce((
        SELECT jsonb_agg(d.percentage) FROM public.audit_general_deductions d WHERE d.audit_id = a.id
      ), '[]'::jsonb) ELSE '[]'::jsonb END,
      'generalDeduction', CASE WHEN a.status = 'submitted' THEN coalesce((
        SELECT sum(d.percentage) FROM public.audit_general_deductions d WHERE d.audit_id = a.id
      ), 0) ELSE 0 END,
      'sections', coalesce(p.sections, '[]'::jsonb)
    ) ORDER BY a.audit_date DESC, a.id) FROM selected a
      LEFT JOIN packed p ON p.audit_id = a.id), '[]'::jsonb)
  ) INTO payload;
  RETURN payload;
END;
$function$;


COMMIT;
