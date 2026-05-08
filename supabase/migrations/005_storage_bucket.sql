-- =============================================================
-- Migration 005 — Create documents storage bucket + policies
-- Run this in Supabase SQL Editor
-- =============================================================

-- 1. Create the bucket (private, 50MB per file)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800,
  ARRAY['application/pdf','image/png','image/jpeg','image/jpg','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on storage.objects (Supabase enables this by default, but just in case)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Allow authenticated workspace members to upload files
--    Path format: {workspace_id}/{timestamp}_{filename}
CREATE POLICY "workspace members can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = (my_workspace_id())::text
  );

-- 4. Allow workspace members to read files in their workspace folder
CREATE POLICY "workspace members can read documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = (my_workspace_id())::text
  );

-- 5. Allow workspace members to delete files in their workspace folder
CREATE POLICY "workspace members can delete documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = (my_workspace_id())::text
  );
