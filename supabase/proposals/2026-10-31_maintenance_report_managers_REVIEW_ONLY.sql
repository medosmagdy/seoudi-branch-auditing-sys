-- REVIEW ONLY: requires explicit approval. Adds optional report cover names, preserving existing data and older clients.
BEGIN;
ALTER TABLE public.maintenance_reports ADD COLUMN branch_manager text NOT NULL DEFAULT '' CHECK(length(branch_manager)<=200), ADD COLUMN maintenance_area_manager text NOT NULL DEFAULT '' CHECK(length(maintenance_area_manager)<=200);
CREATE OR REPLACE FUNCTION public.sqop_maintenance_create(p_branch uuid,p_date date,p_reviewer text,p_source uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; source_branch uuid;
BEGIN
 IF NOT public.sqop_can_manage_maintenance() THEN RAISE EXCEPTION 'Maintenance access denied' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid inspection date'; END IF;
 IF p_source IS NOT NULL THEN SELECT branch_id INTO source_branch FROM public.maintenance_reports WHERE id=p_source FOR SHARE; IF source_branch IS DISTINCT FROM p_branch THEN RAISE EXCEPTION 'Source branch mismatch'; END IF; END IF;
 INSERT INTO public.maintenance_reports(branch_id,inspection_date,reviewer,source_report_id,created_by,updated_by) VALUES(p_branch,p_date,p_reviewer,p_source,auth.uid(),auth.uid()) RETURNING id INTO target;
 IF p_source IS NOT NULL THEN
 UPDATE public.maintenance_reports target_row SET branch_manager=source_row.branch_manager,maintenance_area_manager=source_row.maintenance_area_manager FROM public.maintenance_reports source_row WHERE target_row.id=target AND source_row.id=p_source;
 INSERT INTO public.maintenance_findings(id,report_id,position,data) SELECT new_id,target,position,jsonb_set(data,'{id}',to_jsonb(new_id::text)) FROM (SELECT gen_random_uuid() new_id,position,data FROM public.maintenance_findings WHERE report_id=p_source) copied;
 END IF;
 RETURN target;
END $$;
CREATE OR REPLACE FUNCTION public.sqop_maintenance_save(p_report jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF (p_report ? 'branch_manager' AND (jsonb_typeof(p_report->'branch_manager') IS DISTINCT FROM 'string' OR length(p_report->>'branch_manager')>200)) OR (p_report ? 'maintenance_area_manager' AND (jsonb_typeof(p_report->'maintenance_area_manager') IS DISTINCT FROM 'string' OR length(p_report->>'maintenance_area_manager')>200)) THEN RAISE EXCEPTION 'Invalid manager fields'; END IF;
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
 UPDATE public.maintenance_reports SET inspection_date=(p_report->>'inspection_date')::date,reviewer=trim(p_report->>'reviewer'),branch_manager=CASE WHEN p_report ? 'branch_manager' THEN trim(p_report->>'branch_manager') ELSE branch_manager END,maintenance_area_manager=CASE WHEN p_report ? 'maintenance_area_manager' THEN trim(p_report->>'maintenance_area_manager') ELSE maintenance_area_manager END,status=p_report->>'status',version=version+1,updated_at=now(),updated_by=auth.uid() WHERE id=old.id RETURNING version INTO next_version;
 RETURN next_version;
END $$;
COMMIT;
