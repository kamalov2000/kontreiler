-- Безопасность: две дыры в RLS.
--
-- 1) Storage-бакет order-docs: политики были USING (bucket_id='order-docs') —
--    любой авторизованный мог СКАЧАТЬ любой чужой документ (договоры, ТН) и
--    УДАЛИТЬ любой файл. Привязываем доступ к участию в заказе (путь = orderId/...).
--
-- 2) reviews: WITH CHECK проверял только reviewer_id=auth.uid() — можно было
--    накрутить/занизить рейтинг любому по любому заказу. Требуем, чтобы автор и
--    адресат были двумя сторонами доставленного заказа.

-- ── Storage ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "storage upload" ON storage.objects;
DROP POLICY IF EXISTS "storage select" ON storage.objects;
DROP POLICY IF EXISTS "storage delete" ON storage.objects;

-- Читают: клиент заявки и любой откликнувшийся перевозчик (как order_documents_select)
CREATE POLICY "order-docs read participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-docs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM orders WHERE client_id = auth.uid()
      UNION
      SELECT order_id::text FROM responses WHERE carrier_id = auth.uid()
    )
  );

-- Загружают: клиент заявки или принятый перевозчик
CREATE POLICY "order-docs upload participants" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-docs' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM orders WHERE client_id = auth.uid()
      UNION
      SELECT id::text FROM orders WHERE accepted_carrier_id = auth.uid()
    )
  );

-- Удаляет: только загрузивший файл (storage.objects.owner = автор загрузки)
CREATE POLICY "order-docs delete owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'order-docs' AND owner = auth.uid());

-- ── Reviews ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users insert own review" ON reviews;
CREATE POLICY "Users insert own review" ON reviews
  FOR INSERT WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_id
        AND o.status = 'delivered'
        AND (
          (o.client_id = auth.uid()          AND o.accepted_carrier_id = reviewee_id) OR
          (o.accepted_carrier_id = auth.uid() AND o.client_id          = reviewee_id)
        )
    )
  );
