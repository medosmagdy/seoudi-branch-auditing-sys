
CREATE POLICY "audit photos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'audit-photos');
CREATE POLICY "audit photos insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audit-photos');
CREATE POLICY "audit photos update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'audit-photos') WITH CHECK (bucket_id = 'audit-photos');
CREATE POLICY "audit photos delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'audit-photos');
