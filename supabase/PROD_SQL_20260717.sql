-- ════════════════════════════════════════════════════════════════════════
-- ПРОД-МИГРАЦИЯ 2026-07-17 — логотип компании + Genset
-- Применять на проде одним куском (идемпотентно). Соответствует файлам:
--   supabase/migrations/20260717000001_company_logo.sql
--   supabase/migrations/20260717000002_truck_genset.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Логотип/фото компании ────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos', 'company-logos', true, 2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "company-logos public read"  ON storage.objects;
DROP POLICY IF EXISTS "company-logos owner insert"  ON storage.objects;
DROP POLICY IF EXISTS "company-logos owner update"  ON storage.objects;
DROP POLICY IF EXISTS "company-logos owner delete"  ON storage.objects;

CREATE POLICY "company-logos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-logos');

CREATE POLICY "company-logos owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "company-logos owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "company-logos owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── 2. Genset у машины ──────────────────────────────────────────────────
ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS has_genset boolean NOT NULL DEFAULT false;
