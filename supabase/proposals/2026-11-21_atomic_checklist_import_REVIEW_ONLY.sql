-- REVIEW ONLY. Deploy after 2026-11-21_core_access_and_na_REVIEW_ONLY.sql.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Invoker: the caller must be an active admin and table policies still apply.
CREATE OR REPLACE FUNCTION public.sqop_import_checklist(p_type_id uuid, p_replace boolean, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 section_offset integer := 0;
 question_offset integer := 0;
 section_count integer;
 question_count integer;
 inserted integer;
BEGIN
 IF sqop_access.actor_role() IS DISTINCT FROM 'admin' THEN
   RAISE EXCEPTION 'Active administrator required' USING ERRCODE='42501';
 END IF;
 IF p_replace IS NULL OR jsonb_typeof(p_rows->'sections') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_rows->'headers') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_rows->'questions') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Invalid checklist payload' USING ERRCODE='22023';
 END IF;
 section_count := jsonb_array_length(p_rows->'sections');
 question_count := jsonb_array_length(p_rows->'questions');
 IF section_count NOT BETWEEN 1 AND 1000 OR question_count NOT BETWEEN 1 AND 10000
    OR jsonb_array_length(p_rows->'headers') NOT BETWEEN 1 AND 10000 THEN
   RAISE EXCEPTION 'The checklist is empty or exceeds the supported size' USING ERRCODE='22023';
 END IF;

 -- Serializes imports for a program and conflicts with new audits' FK checks.
 PERFORM 1 FROM public.audit_types WHERE id=p_type_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Audit program not found' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM public.audits WHERE audit_type_id=p_type_id) THEN
   -- Existing reports still read the program's active checklist. No import in
   -- place may silently change their denominator or accepted scores.
   RAISE EXCEPTION 'Program already has saved audits' USING ERRCODE='55000';
 END IF;

 IF p_replace THEN
   UPDATE public.questions SET active=false WHERE audit_type_id=p_type_id AND active IS TRUE;
   UPDATE public.sections SET active=false WHERE audit_type_id=p_type_id AND active IS TRUE;
 ELSE
   SELECT COALESCE(max(order_index)+1,0) INTO section_offset
     FROM public.sections WHERE audit_type_id=p_type_id;
   SELECT COALESCE(max(item_order)+1,0) INTO question_offset
     FROM public.questions WHERE audit_type_id=p_type_id;
 END IF;

 INSERT INTO public.sections(id,audit_type_id,name_ar,order_index,is_delivery,active)
 SELECT s.id,p_type_id,NULLIF(trim(s.name_ar),''),s.order_index+section_offset,
   COALESCE(s.is_delivery,false),true
 FROM jsonb_to_recordset(p_rows->'sections') AS s(id uuid,name_ar text,order_index integer,is_delivery boolean);

 INSERT INTO public.headers(id,section_id,label_ar,order_index)
 SELECT h.id,h.section_id,NULLIF(trim(h.label_ar),''),h.order_index
 FROM jsonb_to_recordset(p_rows->'headers') AS h(id uuid,section_id uuid,label_ar text,order_index integer)
 JOIN jsonb_to_recordset(p_rows->'sections') AS s(id uuid) ON s.id=h.section_id
 WHERE NULLIF(trim(h.label_ar),'') IS NOT NULL;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 IF inserted<>jsonb_array_length(p_rows->'headers') THEN
   RAISE EXCEPTION 'A header is missing its staged section or label' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.questions(id,audit_type_id,section_id,header_id,item_id,text_ar,max_score,item_order,active)
 SELECT q.id,p_type_id,q.section_id,q.header_id,trim(q.item_id),trim(q.text_ar),
   q.max_score,q.item_order+question_offset,true
 FROM jsonb_to_recordset(p_rows->'questions') AS q(
   id uuid,section_id uuid,header_id uuid,item_id text,text_ar text,max_score integer,item_order integer
 )
 JOIN jsonb_to_recordset(p_rows->'headers') AS h(id uuid,section_id uuid)
   ON h.id=q.header_id AND h.section_id=q.section_id
 WHERE q.max_score>0 AND NULLIF(trim(q.item_id),'') IS NOT NULL AND NULLIF(trim(q.text_ar),'') IS NOT NULL;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 IF inserted<>question_count THEN
   RAISE EXCEPTION 'An item has an invalid header, code, text, or score' USING ERRCODE='22023';
 END IF;

 RETURN jsonb_build_object('totalSections',section_count,'totalQuestions',question_count);
END $$;
REVOKE ALL ON FUNCTION public.sqop_import_checklist(uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sqop_import_checklist(uuid,boolean,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
