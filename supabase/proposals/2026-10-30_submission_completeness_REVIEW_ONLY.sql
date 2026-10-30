-- REVIEW ONLY: explicit approval required. Future submissions only; no historical backfill.
BEGIN;
CREATE FUNCTION public.sqop_assert_complete_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE missing_count integer; first_item text;
BEGIN
 IF NEW.status IS DISTINCT FROM 'submitted' OR (TG_OP='UPDATE' AND OLD.status='submitted') THEN RETURN NEW; END IF;
 SELECT count(*),min(coalesce(q.item_id,q.id::text)) INTO missing_count,first_item
 FROM public.questions q JOIN public.sections s ON s.id=q.section_id AND s.active=true AND s.audit_type_id=NEW.audit_type_id
 LEFT JOIN public.audit_answers a ON a.audit_id=NEW.id AND a.question_id=q.id
 LEFT JOIN public.audit_section_status st ON st.audit_id=NEW.id AND st.section_id=s.id
 WHERE q.audit_type_id=NEW.audit_type_id AND q.active=true AND coalesce(st.is_na,false)=false AND coalesce(a.is_na,false)=false
 AND (a.question_id IS NULL OR a.score IS NULL OR a.score<0 OR a.score>coalesce(q.max_score,4));
 IF missing_count>0 THEN RAISE EXCEPTION 'لا يمكن اعتماد الفحص: % بند بدون تقييم صحيح. أول بند: %',missing_count,first_item USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sqop_assert_complete_submission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sqop_complete_before_submission BEFORE INSERT OR UPDATE OF status ON public.audits FOR EACH ROW EXECUTE FUNCTION public.sqop_assert_complete_submission();
COMMIT;
