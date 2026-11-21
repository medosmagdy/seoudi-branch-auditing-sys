-- Review before applying to production. This only adds a private, opt-in setting.
-- No changes to existing settings, recipients, audit data, policies or scores.
BEGIN;
CREATE TABLE IF NOT EXISTS public.audit_correction_email_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  roles text[] NOT NULL DEFAULT '{}',
  user_ids uuid[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (array_position(roles, NULL) IS NULL AND roles <@ ARRAY['admin','manager','auditor']::text[]
    AND cardinality(roles) <= 3),
  CHECK (array_position(user_ids, NULL) IS NULL AND cardinality(user_ids) <= 500)
);
ALTER TABLE public.audit_correction_email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_correction_email_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.audit_correction_email_settings TO service_role;
INSERT INTO public.audit_correction_email_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
COMMIT;
