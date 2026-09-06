ALTER TABLE public.audit_types ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.audits ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.audit_edit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  action text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_edit_logs TO authenticated;
GRANT ALL ON public.audit_edit_logs TO service_role;

ALTER TABLE public.audit_edit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edit logs read" ON public.audit_edit_logs
  FOR SELECT TO authenticated USING (public.can_edit_audit(audit_id));

CREATE POLICY "edit logs insert" ON public.audit_edit_logs
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_audit(audit_id) AND user_id = auth.uid());

CREATE INDEX IF NOT EXISTS audit_edit_logs_audit_idx ON public.audit_edit_logs(audit_id, created_at DESC);