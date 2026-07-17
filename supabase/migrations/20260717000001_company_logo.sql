-- Логотип/фото компании.
-- 1) Колонка users.logo_url — публичная ссылка на логотип (показывается в ленте машин).
-- 2) Публичный Storage-бакет company-logos: 2 МБ, только PNG/JPG/WEBP.
--    Читать может кто угодно (лого показывается публично), а писать/менять/удалять —
--    только владелец в СВОЮ папку {uid}/... (путь начинается с его auth.uid()).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS logo_url text;

-- Бакет (idempotent). public=true → отдаётся по публичному URL без токена.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152, -- 2 МБ
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Политики (пересоздаём idempotent)
DROP POLICY IF EXISTS "company-logos public read"   ON storage.objects;
DROP POLICY IF EXISTS "company-logos owner insert"   ON storage.objects;
DROP POLICY IF EXISTS "company-logos owner update"   ON storage.objects;
DROP POLICY IF EXISTS "company-logos owner delete"   ON storage.objects;

-- Читают все (в т.ч. анонимы) — лого публичное
CREATE POLICY "company-logos public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'company-logos');

-- Загружает только владелец в свою папку {uid}/...
CREATE POLICY "company-logos owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Обновляет (перезаливает) только владелец
CREATE POLICY "company-logos owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Удаляет только владелец
CREATE POLICY "company-logos owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
