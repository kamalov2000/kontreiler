-- Таблица документов к заявкам
CREATE TABLE IF NOT EXISTS order_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,  -- путь в Storage bucket
  file_size   INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

-- Читать могут: клиент заявки, принятый перевозчик, любой откликнувшийся перевозчик
CREATE POLICY "order_documents_select" ON order_documents
  FOR SELECT USING (
    auth.uid() IN (
      SELECT client_id FROM orders WHERE id = order_id
      UNION
      SELECT carrier_id FROM responses WHERE order_id = order_documents.order_id
    )
  );

-- Загружать могут: клиент заявки или принятый перевозчик
CREATE POLICY "order_documents_insert" ON order_documents
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by AND
    auth.uid() IN (
      SELECT client_id FROM orders WHERE id = order_id
      UNION
      SELECT accepted_carrier_id FROM orders WHERE id = order_id AND accepted_carrier_id IS NOT NULL
    )
  );

-- Удалять может только загрузивший
CREATE POLICY "order_documents_delete" ON order_documents
  FOR DELETE USING (auth.uid() = uploaded_by);

-- Storage bucket (выполнить вручную в Supabase Dashboard → Storage):
-- Название bucket: order-docs
-- Public: false
-- Allowed MIME types: application/pdf, image/*, application/msword,
--   application/vnd.openxmlformats-officedocument.wordprocessingml.document
-- Max file size: 10 MB
