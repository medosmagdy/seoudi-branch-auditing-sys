CREATE POLICY "audit reports read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'audit-reports' AND public.can_edit_audit(((storage.foldername(name))[1])::uuid));

CREATE POLICY "audit reports insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-reports' AND public.can_edit_audit(((storage.foldername(name))[1])::uuid));

CREATE POLICY "audit reports update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'audit-reports' AND public.can_edit_audit(((storage.foldername(name))[1])::uuid))
  WITH CHECK (bucket_id = 'audit-reports' AND public.can_edit_audit(((storage.foldername(name))[1])::uuid));