-- Review only. No recipient values or addresses belong in this public repository.
-- Apply only after approval; this does not send mail or alter audit data.
BEGIN;
CREATE TABLE public.branch_email_recipients (
 branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
 to_addresses text[] NOT NULL,
 cc_addresses text[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.branch_email_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.branch_email_recipients FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sqop_branch_email_directory() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE result jsonb;
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('branch_id',b.id,'branch_name',b.name_ar,
  'to_addresses',coalesce(r.to_addresses,'{}'::text[]),'cc_addresses',coalesce(r.cc_addresses,'{}'::text[]),'configured',r.branch_id IS NOT NULL) ORDER BY b.name_ar,b.id),'[]'::jsonb)
 INTO result FROM public.branches b LEFT JOIN public.branch_email_recipients r ON r.branch_id=b.id;
 RETURN result;
END $fn$;
CREATE FUNCTION public.sqop_save_branch_email_recipients(p_rows jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE row jsonb; item jsonb; to_list text[]; cc_list text[]; target uuid;
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Rows must be an array'; END IF;
 IF jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Invalid row count'; END IF;
 IF (SELECT count(DISTINCT value->>'branch_id') FROM jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Duplicate or missing branch'; END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY value->>'branch_id' LOOP
  target := (row->>'branch_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=target) THEN RAISE EXCEPTION 'Unknown branch'; END IF;
  IF jsonb_typeof(row->'to_addresses') IS DISTINCT FROM 'array' OR jsonb_typeof(row->'cc_addresses') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid recipient lists'; END IF;
  IF jsonb_array_length(row->'to_addresses')<1 OR jsonb_array_length(row->'to_addresses')>100 OR jsonb_array_length(row->'cc_addresses')>100 THEN RAISE EXCEPTION 'Invalid recipient count'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements((row->'to_addresses')||(row->'cc_addresses')) LOOP
   IF jsonb_typeof(item)<>'string' OR length(item#>>'{}')>254 OR length(split_part(item#>>'{}','@',1))>64 OR (item#>>'{}') !~ $email$^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$$email$ THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  END LOOP;
  SELECT array_agg(address ORDER BY first_position) INTO to_list FROM (SELECT lower(value) AS address,min(ord) AS first_position FROM jsonb_array_elements_text(row->'to_addresses') WITH ORDINALITY a(value,ord) GROUP BY lower(value)) t;
  SELECT coalesce(array_agg(address ORDER BY first_position),'{}'::text[]) INTO cc_list FROM (SELECT lower(value) AS address,min(ord) AS first_position FROM jsonb_array_elements_text(row->'cc_addresses') WITH ORDINALITY a(value,ord) WHERE NOT lower(value)=ANY(to_list) GROUP BY lower(value)) c;
  INSERT INTO public.branch_email_recipients(branch_id,to_addresses,cc_addresses,updated_by) VALUES(target,to_list,cc_list,auth.uid()) ON CONFLICT(branch_id) DO UPDATE SET to_addresses=EXCLUDED.to_addresses,cc_addresses=EXCLUDED.cc_addresses,updated_at=now(),updated_by=auth.uid();
 END LOOP;
END $fn$;
CREATE FUNCTION public.sqop_audit_email_recipients(p_audit_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE actor uuid:=auth.uid(); audit public.audits%ROWTYPE; peers jsonb; result jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND active=true) THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION public.sqop_branch_email_directory(),public.sqop_save_branch_email_recipients(jsonb),public.sqop_audit_email_recipients(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_branch_email_directory(),public.sqop_save_branch_email_recipients(jsonb),public.sqop_audit_email_recipients(uuid) TO authenticated;
COMMIT;
