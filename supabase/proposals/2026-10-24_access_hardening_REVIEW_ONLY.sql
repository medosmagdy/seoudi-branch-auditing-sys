-- REVIEW ONLY. NOT APPLIED TO THE CONNECTED DATABASE.
-- Requires user approval after reviewing docs/release-review-2026-10-24.md.
-- Metadata/access changes only; no existing report/answer/score is rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA IF NOT EXISTS sqop_security;
REVOKE ALL ON SCHEMA sqop_security FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA sqop_security TO authenticated;

-- Private SECURITY DEFINER lookups avoid recursive policies on profiles/roles.
-- Identity always comes from the verified request JWT, never client metadata.
CREATE OR REPLACE FUNCTION sqop_security.actor_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT ur.role::text FROM public.user_roles ur JOIN public.profiles p ON p.id=ur.user_id
 WHERE ur.user_id=(SELECT auth.uid()) AND p.active IS TRUE
 AND ur.role::text IN ('admin','manager','auditor') LIMIT 1
$$;
CREATE OR REPLACE FUNCTION sqop_security.can_read_audit(audit_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(sqop_security.actor_role()='admin' OR
 EXISTS(SELECT 1 FROM public.audits a WHERE a.id=audit_uuid AND
 ((sqop_security.actor_role()='manager' AND a.status::text='submitted') OR
 (sqop_security.actor_role() IN ('manager','auditor') AND (a.auditor_id=(SELECT auth.uid()) OR a.created_by=(SELECT auth.uid()))))),false)
$$;
CREATE OR REPLACE FUNCTION sqop_security.can_edit_audit(audit_uuid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(sqop_security.actor_role()='admin' OR
 (sqop_security.actor_role() IN ('manager','auditor') AND EXISTS(SELECT 1 FROM public.audits a
 WHERE a.id=audit_uuid AND (a.auditor_id=(SELECT auth.uid()) OR a.created_by=(SELECT auth.uid())))),false)
$$;
REVOKE ALL ON FUNCTION sqop_security.actor_role(),sqop_security.can_read_audit(uuid),sqop_security.can_edit_audit(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sqop_security.actor_role(),sqop_security.can_read_audit(uuid),sqop_security.can_edit_audit(uuid) TO authenticated;

-- Refuse to silently combine these policies with an unexpected live policy.
-- The single known broad tracking policy is explicitly replaced below.
DO $$ DECLARE tbl text; p record; BEGIN
 FOREACH tbl IN ARRAY ARRAY['profiles','user_roles','branches','audit_types','sections','headers','questions','audits','audit_answers','audit_section_status','audit_section_deductions','audit_general_deductions','photos','reports','audit_edit_logs','general_deductions','section_deductions','monthly_branch_tracking'] LOOP
  IF to_regclass('public.'||tbl) IS NULL THEN RAISE EXCEPTION 'Missing expected table: %',tbl; END IF;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
   IF p.policyname NOT LIKE 'sqop_review_%' AND NOT (tbl='monthly_branch_tracking' AND p.policyname='monthly tracking authenticated access') THEN
    RAISE EXCEPTION 'Unreviewed existing policy on %: %',tbl,p.policyname;
   END IF;
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,tbl);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',tbl);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO authenticated',tbl);
 END LOOP;
END $$;

CREATE POLICY sqop_review_profiles_read ON public.profiles FOR SELECT TO authenticated
 USING(id=(SELECT auth.uid()) OR sqop_security.actor_role() IN ('admin','manager'));
-- Ordinary users can edit the display name, not their activation state.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE(full_name) ON public.profiles TO authenticated;
CREATE POLICY sqop_review_profiles_update ON public.profiles FOR UPDATE TO authenticated
 USING(sqop_security.actor_role()='admin' OR (id=(SELECT auth.uid()) AND sqop_security.actor_role() IS NOT NULL))
 WITH CHECK(sqop_security.actor_role()='admin' OR id=(SELECT auth.uid()));
CREATE POLICY sqop_review_profiles_delete ON public.profiles FOR DELETE TO authenticated
 USING(sqop_security.actor_role()='admin' AND id<>(SELECT auth.uid()));
CREATE POLICY sqop_review_roles_read ON public.user_roles FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) OR sqop_security.actor_role() IN ('admin','manager'));
CREATE POLICY sqop_review_roles_insert ON public.user_roles FOR INSERT TO authenticated
 WITH CHECK(sqop_security.actor_role()='admin' AND (user_id<>(SELECT auth.uid()) OR role::text='admin'));
CREATE POLICY sqop_review_roles_update ON public.user_roles FOR UPDATE TO authenticated
 USING(sqop_security.actor_role()='admin')
 WITH CHECK(sqop_security.actor_role()='admin' AND (user_id<>(SELECT auth.uid()) OR role::text='admin'));
CREATE POLICY sqop_review_roles_delete ON public.user_roles FOR DELETE TO authenticated
 USING(sqop_security.actor_role()='admin' AND user_id<>(SELECT auth.uid()));
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['branches','audit_types','sections','headers','questions'] LOOP
  EXECUTE format('CREATE POLICY sqop_review_config_read ON public.%I FOR SELECT TO authenticated USING(sqop_security.actor_role() IS NOT NULL)',tbl);
  EXECUTE format('CREATE POLICY sqop_review_config_write ON public.%I FOR ALL TO authenticated USING(sqop_security.actor_role()=''admin'') WITH CHECK(sqop_security.actor_role()=''admin'')',tbl);
 END LOOP;
END $$;
CREATE POLICY sqop_review_audits_read ON public.audits FOR SELECT TO authenticated USING(sqop_security.can_read_audit(id));
CREATE POLICY sqop_review_audits_insert ON public.audits FOR INSERT TO authenticated
 WITH CHECK(sqop_security.actor_role() IS NOT NULL AND (created_by=(SELECT auth.uid()) OR (created_by IS NULL AND auditor_id=(SELECT auth.uid()))));
CREATE POLICY sqop_review_audits_update ON public.audits FOR UPDATE TO authenticated
 USING(sqop_security.can_edit_audit(id))
 WITH CHECK(sqop_security.actor_role()='admin' OR (sqop_security.actor_role() IS NOT NULL AND (created_by=(SELECT auth.uid()) OR auditor_id=(SELECT auth.uid()))));
CREATE POLICY sqop_review_audits_delete ON public.audits FOR DELETE TO authenticated
 USING(sqop_security.actor_role()='admin' OR (sqop_security.actor_role() IS NOT NULL AND created_by=(SELECT auth.uid())));
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['audit_answers','audit_section_status','audit_section_deductions','audit_general_deductions','photos','reports'] LOOP
  EXECUTE format('CREATE POLICY sqop_review_child_read ON public.%I FOR SELECT TO authenticated USING(sqop_security.can_read_audit(audit_id))',tbl);
  EXECUTE format('CREATE POLICY sqop_review_child_write ON public.%I FOR ALL TO authenticated USING(sqop_security.can_edit_audit(audit_id)) WITH CHECK(sqop_security.can_edit_audit(audit_id))',tbl);
 END LOOP;
END $$;
CREATE POLICY sqop_review_logs_read ON public.audit_edit_logs FOR SELECT TO authenticated USING(sqop_security.can_read_audit(audit_id));
CREATE POLICY sqop_review_logs_insert ON public.audit_edit_logs FOR INSERT TO authenticated WITH CHECK(sqop_security.can_edit_audit(audit_id) AND user_id=(SELECT auth.uid()));
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['general_deductions','section_deductions','monthly_branch_tracking'] LOOP
  EXECUTE format('CREATE POLICY sqop_review_management_read ON public.%I FOR SELECT TO authenticated USING(sqop_security.actor_role() IN (''admin'',''manager''))',tbl);
  EXECUTE format('CREATE POLICY sqop_review_management_write ON public.%I FOR ALL TO authenticated USING(sqop_security.actor_role()=''admin'') WITH CHECK(sqop_security.actor_role()=''admin'')',tbl);
 END LOOP;
END $$;

-- Quarantine legacy privileged role-setting/deletion RPCs unused by current UI.
-- Overloads are discovered from the catalog instead of guessing their signatures.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['admin_set_role','assign_role','assign_user_role','change_user_role','delete_user_by_admin','exec_set_role','set_admin_status','set_user_role','set_user_role_v2','update_member_role']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
-- Keep the used account-deletion endpoint, with authorization before any delete.
CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF sqop_security.actor_role() IS DISTINCT FROM 'admin' OR target_user_id=(SELECT auth.uid()) THEN
  RAISE EXCEPTION 'Only an active administrator may delete another account' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.user_roles WHERE user_id=target_user_id;
 DELETE FROM public.profiles WHERE id=target_user_id;
 DELETE FROM auth.users WHERE id=target_user_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_user_completely(uuid) TO authenticated;
COMMIT;
