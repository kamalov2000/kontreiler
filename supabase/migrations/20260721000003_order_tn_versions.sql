-- Архив редакций транспортной накладной (ТН) по заявке.
-- Раньше ТН только рендерилась и скачивалась — введённые данные нигде не сохранялись.
-- Теперь каждое «Сохранить» пишет версию: полный набор полей формы (data jsonb) +
-- ссылку на сгенерированный PDF, положенный в bucket order-docs (таблица order_documents).
-- Последняя версия подставляется при повторном открытии формы; список версий = архив.
-- RLS зеркалит order_documents (участники заявки читают; клиент/принятый перевозчик пишут).

CREATE TABLE IF NOT EXISTS order_tn_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(id),
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  doc_path    TEXT,
  doc_name    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_tn_versions_order_idx ON order_tn_versions(order_id, created_at DESC);

ALTER TABLE order_tn_versions ENABLE ROW LEVEL SECURITY;

-- Читать: клиент заявки, принятый перевозчик, любой откликнувшийся перевозчик
DROP POLICY IF EXISTS "order_tn_versions_select" ON order_tn_versions;
CREATE POLICY "order_tn_versions_select" ON order_tn_versions
  FOR SELECT USING (
    auth.uid() IN (
      SELECT client_id FROM orders WHERE id = order_id
      UNION
      SELECT carrier_id FROM responses WHERE order_id = order_tn_versions.order_id
    )
  );

-- Создавать: клиент заявки или принятый перевозчик
DROP POLICY IF EXISTS "order_tn_versions_insert" ON order_tn_versions;
CREATE POLICY "order_tn_versions_insert" ON order_tn_versions
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND
    auth.uid() IN (
      SELECT client_id FROM orders WHERE id = order_id
      UNION
      SELECT accepted_carrier_id FROM orders WHERE id = order_id AND accepted_carrier_id IS NOT NULL
    )
  );

-- Удалять может только создатель версии
DROP POLICY IF EXISTS "order_tn_versions_delete" ON order_tn_versions;
CREATE POLICY "order_tn_versions_delete" ON order_tn_versions
  FOR DELETE USING (auth.uid() = created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON order_tn_versions TO authenticated, service_role;
