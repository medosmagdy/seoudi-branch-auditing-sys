-- Optional bootstrap only if the location registry does not exist.
-- Existing tables, records, grants and policies are deliberately left unchanged.
DO $bootstrap$
BEGIN
  IF to_regclass('public.slaughter_locations') IS NOT NULL THEN
    RAISE NOTICE 'slaughter_locations already exists; no changes made';
    RETURN;
  END IF;
  CREATE TABLE public.slaughter_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('farm', 'slaughterhouse')),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kind, name)
  );
  ALTER TABLE public.slaughter_locations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.slaughter_locations FROM anon;
  GRANT SELECT, INSERT ON public.slaughter_locations TO authenticated;
  CREATE POLICY slaughter_location_admin_read ON public.slaughter_locations
    FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.user_roles r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE r.user_id = auth.uid() AND r.role::text = 'admin' AND p.active IS TRUE)
    );
  CREATE POLICY slaughter_location_admin_insert ON public.slaughter_locations
    FOR INSERT TO authenticated WITH CHECK (
      created_by = auth.uid() AND EXISTS (
        SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
        WHERE r.user_id = auth.uid() AND r.role::text = 'admin' AND p.active IS TRUE)
    );
END;
$bootstrap$;
