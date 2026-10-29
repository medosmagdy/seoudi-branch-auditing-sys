-- REVIEW ONLY: requires explicit approval before applying to production.
-- Adds section overrides and updates only slaughter-specific policies. No audit data or audit RLS changes.
BEGIN;
CREATE TABLE public.user_section_access (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 section_key text NOT NULL CHECK (section_key ~ '^[a-z][a-z0-9_]{0,63}$'),
 visible boolean NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,section_key)
);
ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_section_access FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sqop_section_access_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); own_overrides jsonb; users_json jsonb := '[]'::jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND active=true) THEN
  RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_object_agg(section_key,visible),'{}'::jsonb) INTO own_overrides FROM public.user_section_access WHERE user_id=actor;
 IF public.sqop_share_is_admin() THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',u.user_id,'overrides',u.overrides) ORDER BY u.user_id),'[]'::jsonb)
  INTO users_json FROM (SELECT user_id,jsonb_object_agg(section_key,visible) AS overrides FROM public.user_section_access GROUP BY user_id) u;
 END IF;
 RETURN jsonb_build_object('overrides',own_overrides,'users',users_json);
END $$;
CREATE FUNCTION public.sqop_set_section_access(p_user_id uuid,p_overrides jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.sqop_share_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND active=true) THEN RAISE EXCEPTION 'Active user required'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role='admin') THEN RAISE EXCEPTION 'Administrator section access cannot be restricted'; END IF;
 IF p_overrides IS NULL OR jsonb_typeof(p_overrides)<>'object' THEN RAISE EXCEPTION 'Overrides must be an object'; END IF;
 IF (SELECT count(*) FROM jsonb_each(p_overrides))>64 THEN RAISE EXCEPTION 'Too many section overrides'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_overrides) WHERE key !~ '^[a-z][a-z0-9_]{0,63}$' OR jsonb_typeof(value)<>'boolean') THEN RAISE EXCEPTION 'Invalid section override'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 DELETE FROM public.user_section_access WHERE user_id=p_user_id;
 INSERT INTO public.user_section_access(user_id,section_key,visible,updated_by)
 SELECT p_user_id,key,(value::text)::boolean,auth.uid() FROM jsonb_each(p_overrides);
END $$;
REVOKE ALL ON FUNCTION public.sqop_section_access_context(),public.sqop_set_section_access(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_section_access_context(),public.sqop_set_section_access(uuid,jsonb) TO authenticated;

-- Full slaughter access only for active admins or users explicitly granted that section.
CREATE FUNCTION public.sqop_can_manage_slaughter() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND active=true)
 AND (public.sqop_share_is_admin() OR EXISTS(SELECT 1 FROM public.user_section_access WHERE user_id=auth.uid() AND section_key='slaughtering' AND visible=true));
$$;
REVOKE ALL ON FUNCTION public.sqop_can_manage_slaughter() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sqop_can_manage_slaughter() TO authenticated;
DROP POLICY IF EXISTS slaughter_reports_insert ON public.slaughter_reports;
DROP POLICY IF EXISTS slaughter_reports_select ON public.slaughter_reports;
DROP POLICY IF EXISTS slaughter_reports_update ON public.slaughter_reports;
CREATE POLICY sqop_slaughter_reports_access ON public.slaughter_reports FOR ALL TO authenticated USING ((SELECT public.sqop_can_manage_slaughter())) WITH CHECK ((SELECT public.sqop_can_manage_slaughter()));
DROP POLICY IF EXISTS slaughter_report_photos_insert ON public.slaughter_report_photos;
DROP POLICY IF EXISTS slaughter_report_photos_select ON public.slaughter_report_photos;
DROP POLICY IF EXISTS slaughter_report_photos_delete ON public.slaughter_report_photos;
CREATE POLICY sqop_slaughter_photos_access ON public.slaughter_report_photos FOR ALL TO authenticated USING ((SELECT public.sqop_can_manage_slaughter())) WITH CHECK ((SELECT public.sqop_can_manage_slaughter()));
DROP POLICY IF EXISTS slaughter_locations_insert ON public.slaughter_locations;
DROP POLICY IF EXISTS slaughter_locations_select ON public.slaughter_locations;
CREATE POLICY sqop_slaughter_locations_access ON public.slaughter_locations FOR ALL TO authenticated USING ((SELECT public.sqop_can_manage_slaughter())) WITH CHECK ((SELECT public.sqop_can_manage_slaughter()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.slaughter_reports,public.slaughter_report_photos,public.slaughter_locations TO authenticated;
-- The current slaughter form uses this private bucket; it is absent in production.
INSERT INTO storage.buckets(id,name,public) VALUES('audit-reports','audit-reports',false) ON CONFLICT(id) DO NOTHING;
CREATE POLICY sqop_slaughter_storage_access ON storage.objects FOR ALL TO authenticated USING (bucket_id='audit-reports' AND name LIKE 'slaughter/%' AND (SELECT public.sqop_can_manage_slaughter())) WITH CHECK (bucket_id='audit-reports' AND name LIKE 'slaughter/%' AND (SELECT public.sqop_can_manage_slaughter()));
COMMIT;
