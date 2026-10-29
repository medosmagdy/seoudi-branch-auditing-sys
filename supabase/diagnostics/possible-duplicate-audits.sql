-- READ ONLY. These groups are review candidates, not proof of duplicate visits.
-- Separate audit UUIDs remain visible and must not be deleted automatically.
SELECT
  b.name_ar AS branch_name,
  t.code AS program,
  a.audit_date,
  count(*) AS visit_count,
  jsonb_agg(jsonb_build_object(
    'id', a.id, 'status', a.status, 'auditor_id', a.auditor_id,
    'created_at', a.created_at, 'version', a.version
  ) ORDER BY a.created_at, a.id) AS visits
FROM public.audits a
LEFT JOIN public.branches b ON b.id = a.branch_id
LEFT JOIN public.audit_types t ON t.id = a.audit_type_id
GROUP BY a.branch_id, b.name_ar, a.audit_type_id, t.code, a.audit_date
HAVING count(*) > 1
ORDER BY a.audit_date DESC, b.name_ar;
