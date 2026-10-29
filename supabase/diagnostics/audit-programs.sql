-- READ ONLY. Run each SELECT in Supabase SQL Editor; this changes no data or policies.

-- Actual program identities; cadence is not stored in the supplied schema.
SELECT id, code, name_ar, name_en, active, scoring_system
FROM public.audit_types
ORDER BY code, name_ar;

-- Historical activity can describe usage, but does not establish the business schedule.
SELECT to_char(a.audit_date, 'YYYY-MM') AS month,
       t.id AS audit_type_id, t.code, t.name_ar,
       a.status, count(*) AS audits, count(DISTINCT a.branch_id) AS branches
FROM public.audits a
JOIN public.audit_types t ON t.id = a.audit_type_id
GROUP BY 1, t.id, t.code, t.name_ar, a.status
ORDER BY 1 DESC, t.code, a.status;

-- Split mismatches by source/target program before considering any cleanup.
SELECT a.audit_type_id AS audit_program_id, at.code AS audit_program,
       q.audit_type_id AS question_program_id, qt.code AS question_program,
       count(*) AS answers,
       count(*) FILTER (WHERE aa.score = coalesce(q.max_score, 4)
                           AND coalesce(aa.is_na, false) = false
                           AND nullif(btrim(aa.comment), '') IS NULL) AS default_like_answers,
       count(*) FILTER (WHERE aa.score IS DISTINCT FROM coalesce(q.max_score, 4)
                           OR coalesce(aa.is_na, false)
                           OR nullif(btrim(aa.comment), '') IS NOT NULL) AS needs_individual_review
FROM public.audit_answers aa
JOIN public.audits a ON a.id = aa.audit_id
JOIN public.questions q ON q.id = aa.question_id
JOIN public.audit_types at ON at.id = a.audit_type_id
LEFT JOIN public.audit_types qt ON qt.id = q.audit_type_id
WHERE q.audit_type_id IS DISTINCT FROM a.audit_type_id
GROUP BY a.audit_type_id, at.code, q.audit_type_id, qt.code
ORDER BY answers DESC;

-- RLS being disabled is not enough to establish exposure: inspect effective grants too.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_read,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_read,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- Inventory privileged callable functions; never invoke them to test permissions.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
ORDER BY p.proname, arguments;
