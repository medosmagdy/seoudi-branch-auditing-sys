-- REVIEW ONLY: explicit user approval required. No existing roles, audit data or scores are changed.
BEGIN;
CREATE TABLE public.audit_email_access_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id), roles text[] NOT NULL DEFAULT ARRAY['admin','manager','auditor'], user_ids uuid[] NOT NULL DEFAULT '{}', updated_by uuid REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.audit_email_access_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_email_access_settings FROM PUBLIC,anon,authenticated;
INSERT INTO public.audit_email_access_settings(id) VALUES(true);
CREATE FUNCTION public.sqop_can_prepare_audit_email() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active=true) AND EXISTS(SELECT 1 FROM public.audit_email_access_settings s WHERE s.id=true AND (auth.uid()=ANY(s.user_ids) OR EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role::text=ANY(s.roles))));
$$;
CREATE FUNCTION public.sqop_audit_email_access_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed boolean; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active=true) THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 allowed:=public.sqop_can_prepare_audit_email();
 IF public.sqop_share_is_admin() THEN SELECT jsonb_build_object('allowed',allowed,'roles',roles,'user_ids',user_ids) INTO result FROM public.audit_email_access_settings WHERE id=true;
 ELSE result:=jsonb_build_object('allowed',allowed,'roles',null,'user_ids',null); END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.sqop_set_audit_email_access(p_roles text[],p_users uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_roles IS NULL OR p_users IS NULL OR cardinality(p_roles)>3 OR cardinality(p_users)>500 OR EXISTS(SELECT 1 FROM unnest(p_roles) r WHERE r IS NULL OR r NOT IN ('admin','manager','auditor')) OR EXISTS(SELECT 1 FROM unnest(p_users) u WHERE u IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=u AND p.active=true)) OR (SELECT count(DISTINCT r) FROM unnest(p_roles) r)<>cardinality(p_roles) OR (SELECT count(DISTINCT u) FROM unnest(p_users) u)<>cardinality(p_users) THEN RAISE EXCEPTION 'Invalid email access configuration'; END IF;
 UPDATE public.audit_email_access_settings SET roles=p_roles,user_ids=p_users,updated_by=auth.uid(),updated_at=now() WHERE id=true;
END $$;
REVOKE ALL ON FUNCTION public.sqop_can_prepare_audit_email(),public.sqop_audit_email_access_context(),public.sqop_set_audit_email_access(text[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_can_prepare_audit_email(),public.sqop_audit_email_access_context(),public.sqop_set_audit_email_access(text[],uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.sqop_audit_email_recipients(p_audit_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE actor uuid:=auth.uid(); audit public.audits%ROWTYPE; peers jsonb; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND active=true) THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF NOT public.sqop_can_prepare_audit_email() THEN RAISE EXCEPTION 'Email preparation access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO audit FROM public.audits WHERE id=p_audit_id;
 IF audit.id IS NULL OR audit.status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Submitted audit required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.audit_types t WHERE t.id=audit.audit_type_id AND concat_ws(' ',t.code,t.name_ar,t.name_en) ~* '(صيان|maintenance|\mMAINT\M|\mMNT\M)') THEN RAISE EXCEPTION 'Maintenance recipients are separate and not configured' USING ERRCODE='42501'; END IF;
 peers := public.sqop_audit_sharing_context()->'peers';
 IF NOT public.sqop_share_is_admin() AND (EXISTS(SELECT 1 FROM public.user_section_access WHERE user_id=actor AND section_key='audits' AND visible=false) OR NOT(
  coalesce(audit.created_by=actor,false) OR coalesce(audit.auditor_id=actor,false) OR coalesce(peers ? audit.created_by::text,false) OR coalesce(peers ? audit.auditor_id::text,false)
  OR (EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=actor AND role='manager') AND public.sqop_manager_can_read_branch(audit.branch_id))
 )) THEN RAISE EXCEPTION 'Audit access denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('branch_id',audit.branch_id,'to_addresses',coalesce(r.to_addresses,'{}'::text[]),'cc_addresses',coalesce(r.cc_addresses,'{}'::text[]),'configured',r.branch_id IS NOT NULL)
 INTO result FROM (SELECT 1) seed LEFT JOIN public.branch_email_recipients r ON r.branch_id=audit.branch_id;
 RETURN result;
END $fn$;
COMMIT;
