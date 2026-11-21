-- REVIEW ONLY. Apply with the matching app build after isolated verification and approval.
-- No historical audits, scores, answers, sharing memberships or scopes are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA IF NOT EXISTS sqop_access;
REVOKE ALL ON SCHEMA sqop_access FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA sqop_access TO authenticated;

CREATE OR REPLACE FUNCTION sqop_access.actor_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT r.role::text
 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
 WHERE p.id = (SELECT auth.uid()) AND p.active IS TRUE
 AND r.role::text IN ('admin','manager','auditor')
$$;

CREATE OR REPLACE FUNCTION sqop_access.is_peer(person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.audit_share_members mine
   JOIN public.audit_share_members peer USING (group_id)
   JOIN public.profiles p ON p.id = peer.user_id AND p.active IS TRUE
   WHERE mine.user_id = (SELECT auth.uid()) AND peer.user_id = person
 )
$$;

CREATE OR REPLACE FUNCTION sqop_access.can_edit_audit(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.audits a WHERE a.id = target AND (
     (SELECT sqop_access.actor_role()) = 'admin' OR (
       (SELECT sqop_access.actor_role()) IN ('manager','auditor') AND (
         a.created_by = (SELECT auth.uid()) OR a.auditor_id = (SELECT auth.uid())
         OR sqop_access.is_peer(a.created_by) OR sqop_access.is_peer(a.auditor_id)
       )
     )
   )
 )
$$;

CREATE OR REPLACE FUNCTION sqop_access.can_read_audit(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT sqop_access.can_edit_audit(target) OR (
   COALESCE((SELECT sqop_access.actor_role()) = 'manager',false) AND EXISTS (
     SELECT 1 FROM public.audits a WHERE a.id = target AND a.status = 'submitted'
       AND public.sqop_manager_can_read_branch(a.branch_id)
   )
 )
$$;

REVOKE ALL ON FUNCTION sqop_access.actor_role(),sqop_access.is_peer(uuid),
 sqop_access.can_edit_audit(uuid),sqop_access.can_read_audit(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sqop_access.actor_role(),sqop_access.is_peer(uuid),
 sqop_access.can_edit_audit(uuid),sqop_access.can_read_audit(uuid) TO authenticated;

DO $$
DECLARE t text; p record;
BEGIN
 FOR t IN SELECT unnest(ARRAY['profiles','user_roles','branches','audit_types','sections','headers','questions',
   'audits','audit_answers','audit_section_status','audit_section_deductions','audit_general_deductions',
   'photos','reports','audit_edit_logs','general_deductions','section_deductions','monthly_branch_tracking',
   'expiry_records','expiry_record_images'])
 LOOP
   FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
     IF p.policyname NOT LIKE 'sqop_access_%'
       AND NOT (t='monthly_branch_tracking' AND p.policyname='monthly tracking authenticated access')
       AND NOT (t='expiry_records' AND p.policyname IN (
         'expiry_records_select_authenticated','expiry_records_insert_authenticated',
         'expiry_records_update_authenticated','expiry_records_delete_authenticated'))
       AND NOT (t='expiry_record_images' AND p.policyname IN (
         'expiry_images_select_authenticated','expiry_images_insert_authenticated',
         'expiry_images_delete_authenticated'))
     THEN RAISE EXCEPTION 'Unexpected policy on %: %',t,p.policyname; END IF;
     EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
   END LOOP;
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
 END LOOP;
END
$$;

GRANT SELECT ON public.profiles, public.audit_edit_logs TO authenticated;
GRANT UPDATE(full_name) ON public.profiles TO authenticated;
GRANT INSERT ON public.audit_edit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles, public.branches, public.audit_types,
 public.sections, public.headers, public.questions, public.audit_answers, public.audit_section_status,
 public.audit_section_deductions, public.audit_general_deductions, public.photos, public.reports,
 public.general_deductions, public.section_deductions, public.monthly_branch_tracking,
 public.expiry_records, public.expiry_record_images TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.audits TO authenticated;
-- Normal workflows can submit and reopen an audit but cannot transfer its ownership or scope.
GRANT UPDATE(status, version, score, overall_score, submitted_at, edited_at) ON public.audits TO authenticated;

CREATE POLICY sqop_access_profiles_read ON public.profiles FOR SELECT TO authenticated
 USING (id=(SELECT auth.uid()) OR (SELECT sqop_access.actor_role()) IN ('admin','manager')
    OR ((SELECT sqop_access.actor_role())='auditor' AND sqop_access.is_peer(id)));
CREATE POLICY sqop_access_profiles_name ON public.profiles FOR UPDATE TO authenticated
 USING (id=(SELECT auth.uid()) AND (SELECT sqop_access.actor_role()) IS NOT NULL)
 WITH CHECK (id=(SELECT auth.uid()));

CREATE POLICY sqop_access_roles_read ON public.user_roles FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR (SELECT sqop_access.actor_role())='admin');
CREATE POLICY sqop_access_roles_insert ON public.user_roles FOR INSERT TO authenticated
 WITH CHECK ((SELECT sqop_access.actor_role())='admin' AND (user_id<>(SELECT auth.uid()) OR role::text='admin'));
CREATE POLICY sqop_access_roles_update ON public.user_roles FOR UPDATE TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin')
 WITH CHECK ((SELECT sqop_access.actor_role())='admin' AND (user_id<>(SELECT auth.uid()) OR role::text='admin'));
CREATE POLICY sqop_access_roles_delete ON public.user_roles FOR DELETE TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin' AND user_id<>(SELECT auth.uid()));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['branches','audit_types','sections','headers','questions'] LOOP
   EXECUTE format('CREATE POLICY sqop_access_config_read ON public.%I FOR SELECT TO authenticated USING ((SELECT sqop_access.actor_role()) IS NOT NULL)',t);
   EXECUTE format('CREATE POLICY sqop_access_config_manage ON public.%I FOR ALL TO authenticated USING ((SELECT sqop_access.actor_role())=''admin'') WITH CHECK ((SELECT sqop_access.actor_role())=''admin'')',t);
 END LOOP;
END $$;

CREATE POLICY sqop_access_audits_read ON public.audits FOR SELECT TO authenticated
 USING (
   (SELECT sqop_access.actor_role())='admin'
   OR ((SELECT sqop_access.actor_role()) IN ('manager','auditor') AND (
     created_by=(SELECT auth.uid()) OR auditor_id=(SELECT auth.uid())
     OR sqop_access.is_peer(created_by) OR sqop_access.is_peer(auditor_id)
   ))
   OR ((SELECT sqop_access.actor_role())='manager' AND status='submitted'
       AND public.sqop_manager_can_read_branch(branch_id))
 );
CREATE POLICY sqop_access_audits_insert ON public.audits FOR INSERT TO authenticated
 WITH CHECK ((SELECT sqop_access.actor_role()) IS NOT NULL AND status='draft'
   AND auditor_id=(SELECT auth.uid()) AND (created_by IS NULL OR created_by=(SELECT auth.uid())));
CREATE POLICY sqop_access_audits_update ON public.audits FOR UPDATE TO authenticated
 USING (sqop_access.can_edit_audit(id)) WITH CHECK (sqop_access.can_edit_audit(id));
CREATE POLICY sqop_access_audits_delete ON public.audits FOR DELETE TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin' OR (
   (SELECT sqop_access.actor_role()) IN ('auditor','manager')
   AND (created_by=(SELECT auth.uid()) OR auditor_id=(SELECT auth.uid()))
 ));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['audit_answers','audit_section_status','audit_section_deductions',
                           'audit_general_deductions','photos','reports'] LOOP
   EXECUTE format('CREATE POLICY sqop_access_child_read ON public.%I FOR SELECT TO authenticated USING (sqop_access.can_read_audit(audit_id))',t);
   EXECUTE format('CREATE POLICY sqop_access_child_manage ON public.%I FOR ALL TO authenticated USING (sqop_access.can_edit_audit(audit_id)) WITH CHECK (sqop_access.can_edit_audit(audit_id))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['general_deductions','section_deductions'] LOOP
   EXECUTE format('CREATE POLICY sqop_access_management_read ON public.%I FOR SELECT TO authenticated USING ((SELECT sqop_access.actor_role()) IN (''admin'',''manager''))',t);
   EXECUTE format('CREATE POLICY sqop_access_management_write ON public.%I FOR ALL TO authenticated USING ((SELECT sqop_access.actor_role())=''admin'') WITH CHECK ((SELECT sqop_access.actor_role())=''admin'')',t);
 END LOOP;
END $$;
CREATE POLICY sqop_access_tracking_read ON public.monthly_branch_tracking FOR SELECT TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin' OR
   ((SELECT sqop_access.actor_role())='manager' AND public.sqop_manager_can_read_branch(branch_id)));
CREATE POLICY sqop_access_tracking_write ON public.monthly_branch_tracking FOR ALL TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin')
 WITH CHECK ((SELECT sqop_access.actor_role())='admin');
CREATE POLICY sqop_access_logs_read ON public.audit_edit_logs FOR SELECT TO authenticated
 USING (sqop_access.can_read_audit(audit_id));
CREATE POLICY sqop_access_logs_add ON public.audit_edit_logs FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND sqop_access.can_edit_audit(audit_id));

CREATE POLICY sqop_access_expiry_read ON public.expiry_records FOR SELECT TO authenticated
 USING ((SELECT sqop_access.actor_role()) IS NOT NULL);
CREATE POLICY sqop_access_expiry_add ON public.expiry_records FOR INSERT TO authenticated
 WITH CHECK ((SELECT sqop_access.actor_role()) IS NOT NULL AND created_by=(SELECT auth.uid()) AND review_status='pending');
CREATE POLICY sqop_access_expiry_update ON public.expiry_records FOR UPDATE TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin' OR (
   (SELECT sqop_access.actor_role()) IS NOT NULL AND created_by=(SELECT auth.uid()) AND review_status='pending'))
 WITH CHECK ((SELECT sqop_access.actor_role())='admin' OR (
   (SELECT sqop_access.actor_role()) IS NOT NULL AND created_by=(SELECT auth.uid()) AND review_status='pending'));
CREATE POLICY sqop_access_expiry_delete ON public.expiry_records FOR DELETE TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin');
CREATE POLICY sqop_access_expiry_images_read ON public.expiry_record_images FOR SELECT TO authenticated
 USING ((SELECT sqop_access.actor_role()) IS NOT NULL);
CREATE POLICY sqop_access_expiry_images_add ON public.expiry_record_images FOR INSERT TO authenticated
 WITH CHECK ((SELECT sqop_access.actor_role())='admin' OR EXISTS (
   SELECT 1 FROM public.expiry_records r WHERE r.id=expiry_record_id
     AND r.created_by=(SELECT auth.uid()) AND (SELECT sqop_access.actor_role()) IS NOT NULL));
CREATE POLICY sqop_access_expiry_images_delete ON public.expiry_record_images FOR DELETE TO authenticated
 USING ((SELECT sqop_access.actor_role())='admin');

-- Owners and sharing peers may inherit the prior visit's active N/A flags.
-- Comments are returned only where the previous audit is independently readable.
CREATE OR REPLACE FUNCTION public.sqop_audit_na_defaults(p_audit_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_audit public.audits%ROWTYPE; previous_id uuid; can_read_previous boolean;
BEGIN
 IF NOT sqop_access.can_edit_audit(p_audit_id) THEN
   RAISE EXCEPTION 'Audit edit access required' USING ERRCODE = '42501';
 END IF;
 SELECT * INTO STRICT current_audit FROM public.audits WHERE id=p_audit_id;
 IF current_audit.status IS DISTINCT FROM 'draft' THEN
   RETURN jsonb_build_object('answers','[]'::jsonb,'statuses','[]'::jsonb);
 END IF;
 SELECT a.id INTO previous_id FROM public.audits a
 WHERE a.branch_id=current_audit.branch_id AND a.audit_type_id=current_audit.audit_type_id
   AND a.id<>p_audit_id AND a.audit_date<=current_audit.audit_date
   AND (current_audit.created_at IS NULL OR a.created_at<current_audit.created_at)
 ORDER BY a.audit_date DESC, a.created_at DESC, a.id LIMIT 1;
 can_read_previous := sqop_access.can_read_audit(previous_id);
 RETURN jsonb_build_object(
   'answers',COALESCE((SELECT jsonb_agg(jsonb_build_object('question_id',aa.question_id,'score',NULL,
     'is_na',true,'comment',CASE WHEN can_read_previous THEN aa.comment ELSE NULL END))
     FROM public.audit_answers aa JOIN public.questions q ON q.id=aa.question_id
     WHERE aa.audit_id=previous_id AND aa.is_na IS TRUE AND q.active IS TRUE
       AND q.audit_type_id=current_audit.audit_type_id),'[]'::jsonb),
   'statuses',COALESCE((SELECT jsonb_agg(jsonb_build_object('section_id',s.id,'is_na',true))
     FROM public.audit_section_status st JOIN public.sections s ON s.id=st.section_id
     WHERE st.audit_id=previous_id AND st.is_na IS TRUE AND s.active IS TRUE
       AND s.audit_type_id=current_audit.audit_type_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.sqop_audit_na_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sqop_audit_na_defaults(uuid) TO authenticated;

-- The service that signs R2 reads first checks the caller's actual JWT.
CREATE OR REPLACE FUNCTION public.sqop_audit_photo_access(p_audit_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT sqop_access.can_read_audit(p_audit_id)
$$;
REVOKE ALL ON FUNCTION public.sqop_audit_photo_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sqop_audit_photo_access(uuid) TO authenticated;

-- Keep the admin endpoint, but retain its transaction and verify the caller first.
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF sqop_access.actor_role() IS DISTINCT FROM 'admin' OR target_user_id=(SELECT auth.uid()) THEN
   RAISE EXCEPTION 'Only an active administrator may delete another account' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.user_roles WHERE user_id=target_user_id;
 DELETE FROM public.profiles WHERE id=target_user_id;
 DELETE FROM auth.users WHERE id=target_user_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO authenticated;
-- These role/account mutation RPCs have no callers in the current app.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.proname,p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND p.proname=ANY(ARRAY['admin_set_role','assign_role','assign_user_role','change_user_role',
    'delete_user_by_admin','exec_set_role','set_admin_status','set_user_role','set_user_role_v2','update_member_role'])
 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
     f.proname,pg_get_function_identity_arguments(f.oid));
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
