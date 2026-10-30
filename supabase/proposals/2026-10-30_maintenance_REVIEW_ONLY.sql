-- REVIEW ONLY: new isolated maintenance section, explicit approval required before production.
BEGIN;
CREATE TABLE public.maintenance_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES public.branches(id),
 inspection_date date NOT NULL, reviewer text NOT NULL CHECK(length(trim(reviewer)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted')), version integer NOT NULL DEFAULT 1,
 source_report_id uuid REFERENCES public.maintenance_reports(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id), updated_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX maintenance_latest_branch ON public.maintenance_reports(branch_id,inspection_date DESC,created_at DESC,id DESC) WHERE status='submitted';
CREATE TABLE public.maintenance_findings (
 id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES public.maintenance_reports(id) ON DELETE CASCADE,
 position integer NOT NULL, data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'), UNIQUE(report_id,position)
);
CREATE TABLE public.maintenance_photos (
 path text PRIMARY KEY CHECK(path ~ '^maintenance/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
 report_id uuid REFERENCES public.maintenance_reports(id) ON DELETE SET NULL,
 registered boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.maintenance_photos TO service_role;
GRANT SELECT ON public.maintenance_reports TO service_role;
ALTER TABLE public.maintenance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_findings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_reports,public.maintenance_findings FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sqop_can_manage_maintenance() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active=true) AND
 (public.sqop_share_is_admin() OR EXISTS(SELECT 1 FROM public.user_section_access WHERE user_id=auth.uid() AND section_key='maintenance' AND visible=true));
$$;
CREATE FUNCTION public.sqop_maintenance_report(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.sqop_can_manage_maintenance() THEN RAISE EXCEPTION 'Maintenance access denied' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(r)||jsonb_build_object('findings',coalesce((SELECT jsonb_agg(data ORDER BY position) FROM public.maintenance_findings WHERE report_id=r.id),'[]'::jsonb)) INTO result FROM public.maintenance_reports r WHERE id=p_id;
 IF result IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF; RETURN result;
END $$;
CREATE FUNCTION public.sqop_maintenance_index() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.sqop_can_manage_maintenance() THEN RAISE EXCEPTION 'Maintenance access denied' USING ERRCODE='42501'; END IF;
 WITH latest AS (SELECT DISTINCT ON(branch_id) id,branch_id,inspection_date FROM public.maintenance_reports WHERE status='submitted' ORDER BY branch_id,inspection_date DESC,created_at DESC,id DESC)
 SELECT jsonb_build_object(
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar,'name_en',name_en) ORDER BY name_ar) FROM public.branches),'[]'::jsonb),
 'reports',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY inspection_date DESC,created_at DESC,id DESC) FROM (SELECT r.id,r.branch_id,r.inspection_date,r.reviewer,r.status,r.version,r.created_at,count(f.id)::int total,count(f.id) FILTER(WHERE f.data->>'status'='resolved')::int resolved,count(f.id) FILTER(WHERE f.data->>'severity'='high' AND f.data->>'status'<>'resolved')::int high_open FROM public.maintenance_reports r LEFT JOIN public.maintenance_findings f ON f.report_id=r.id GROUP BY r.id) s),'[]'::jsonb),
 'findings',coalesce((SELECT jsonb_agg(f.data||jsonb_build_object('report_id',l.id,'branch_id',l.branch_id,'inspection_date',l.inspection_date,'branch_name',b.name_ar) ORDER BY b.name_ar,f.position) FROM latest l JOIN public.branches b ON b.id=l.branch_id JOIN public.maintenance_findings f ON f.report_id=l.id),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.sqop_maintenance_create(p_branch uuid,p_date date,p_reviewer text,p_source uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; source_branch uuid;
BEGIN
 IF NOT public.sqop_can_manage_maintenance() THEN RAISE EXCEPTION 'Maintenance access denied' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid inspection date'; END IF;
 IF p_source IS NOT NULL THEN SELECT branch_id INTO source_branch FROM public.maintenance_reports WHERE id=p_source FOR SHARE; IF source_branch IS DISTINCT FROM p_branch THEN RAISE EXCEPTION 'Source branch mismatch'; END IF; END IF;
 INSERT INTO public.maintenance_reports(branch_id,inspection_date,reviewer,source_report_id,created_by,updated_by) VALUES(p_branch,p_date,p_reviewer,p_source,auth.uid(),auth.uid()) RETURNING id INTO target;
 IF p_source IS NOT NULL THEN
 INSERT INTO public.maintenance_findings(id,report_id,position,data) SELECT new_id,target,position,jsonb_set(data,'{id}',to_jsonb(new_id::text)) FROM (SELECT gen_random_uuid() new_id,position,data FROM public.maintenance_findings WHERE report_id=p_source) copied;
 END IF;
 RETURN target;
END $$;
CREATE FUNCTION public.sqop_maintenance_save(p_report jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.maintenance_reports%ROWTYPE; f jsonb; photo jsonb; n integer:=0; fid uuid; next_version integer;
BEGIN
 IF NOT public.sqop_can_manage_maintenance() THEN RAISE EXCEPTION 'Maintenance access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM public.maintenance_reports WHERE id=(p_report->>'id')::uuid FOR UPDATE;
 IF old.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
 IF (p_report->>'version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'التقرير اتعدل بواسطة مستخدم آخر؛ أعد تحميله قبل الحفظ' USING ERRCODE='40001'; END IF;
 IF (p_report->>'branch_id')::uuid IS DISTINCT FROM old.branch_id THEN RAISE EXCEPTION 'Branch cannot change'; END IF;
 IF jsonb_typeof(p_report->'findings') IS DISTINCT FROM 'array' OR jsonb_array_length(p_report->'findings')>1000 THEN RAISE EXCEPTION 'Invalid findings'; END IF;
 IF (p_report->>'status') IS NULL OR (p_report->>'status') NOT IN('draft','submitted') OR nullif(trim(p_report->>'reviewer'),'') IS NULL OR length(p_report->>'reviewer')>200 OR nullif(p_report->>'inspection_date','') IS NULL THEN RAISE EXCEPTION 'Invalid report'; END IF;
 IF (p_report->>'inspection_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid inspection date'; END IF;
 DELETE FROM public.maintenance_findings WHERE report_id=old.id;
 FOR f IN SELECT value FROM jsonb_array_elements(p_report->'findings') LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','section','description','initial_history','severity','status','corrective_action','evidence','comments','assigned_to']) k WHERE jsonb_typeof(f->k) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'Invalid finding fields'; END IF;
  fid:=(f->>'id')::uuid;
  IF nullif(trim(f->>'section'),'') IS NULL OR length(f->>'section')>150 OR nullif(trim(f->>'description'),'') IS NULL OR length(f->>'description')>5000 OR length(f->>'initial_history')>100 OR length(f->>'assigned_to')>200 OR length(f->>'corrective_action')>5000 OR length(f->>'evidence')>5000 OR length(f->>'comments')>5000 OR (f->>'severity') NOT IN('high','medium','low') OR (f->>'status') NOT IN('open','new','in_progress','resolved') THEN RAISE EXCEPTION 'Invalid finding'; END IF;
  IF NOT f ? 'due_date' OR (jsonb_typeof(f->'due_date') NOT IN('null','string')) THEN RAISE EXCEPTION 'Invalid due date'; END IF;
  IF f->>'due_date' IS NOT NULL THEN IF (f->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid due date'; END IF; PERFORM (f->>'due_date')::date; END IF;
  IF jsonb_typeof(f->'photos') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'photos')>8 THEN RAISE EXCEPTION 'Invalid photos'; END IF;
  FOR photo IN SELECT value FROM jsonb_array_elements(f->'photos') LOOP
   IF jsonb_typeof(photo)<>'string' OR (photo#>>'{}') !~ '^maintenance/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' OR NOT EXISTS(SELECT 1 FROM public.maintenance_photos WHERE path=photo#>>'{}' AND registered=true) THEN RAISE EXCEPTION 'Invalid photo reference'; END IF;
  END LOOP;
  INSERT INTO public.maintenance_findings(id,report_id,position,data) VALUES(fid,old.id,n,f); n:=n+1;
 END LOOP;
 UPDATE public.maintenance_reports SET inspection_date=(p_report->>'inspection_date')::date,reviewer=trim(p_report->>'reviewer'),status=p_report->>'status',version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=old.id RETURNING version INTO next_version;
 RETURN next_version;
END $$;
CREATE FUNCTION public.sqop_maintenance_delete(p_id uuid,p_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sqop_can_manage_maintenance() THEN RAISE EXCEPTION 'Maintenance access denied' USING ERRCODE='42501'; END IF;
 DELETE FROM public.maintenance_reports WHERE id=p_id AND version=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'التقرير غير موجود أو اتعدل؛ أعد التحميل'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sqop_can_manage_maintenance(),public.sqop_maintenance_report(uuid),public.sqop_maintenance_index(),public.sqop_maintenance_create(uuid,date,text,uuid),public.sqop_maintenance_save(jsonb),public.sqop_maintenance_delete(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_can_manage_maintenance(),public.sqop_maintenance_report(uuid),public.sqop_maintenance_index(),public.sqop_maintenance_create(uuid,date,text,uuid),public.sqop_maintenance_save(jsonb),public.sqop_maintenance_delete(uuid,integer) TO authenticated;
-- Photos remain in Cloudflare R2, registered only through server-verified upload operations.
-- Detaching/deleting reports preserves photo objects referenced by quarterly copies.
COMMIT;
