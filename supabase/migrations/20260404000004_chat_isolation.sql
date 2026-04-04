-- Изоляция чата по паре (order_id, carrier_id)
-- До этой миграции все сообщения были общими для всего ордера.
-- Теперь каждый диалог клиент↔перевозчик изолирован.

-- 1. Добавляем carrier_id в messages (nullable — старые сообщения остаются как есть)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS carrier_id UUID REFERENCES users(id);

-- 2. Обновляем индекс для быстрой фильтрации по паре
DROP INDEX IF EXISTS idx_messages_order_id;
CREATE INDEX idx_messages_order_carrier ON messages(order_id, carrier_id, created_at);

-- 3. Обновляем RLS
DROP POLICY IF EXISTS "Chat participants can view messages" ON messages;
DROP POLICY IF EXISTS "Chat participants can send messages" ON messages;

-- SELECT: клиент видит все диалоги своего ордера; перевозчик — только свои
CREATE POLICY "Chat participants can view messages"
  ON messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id
        AND orders.client_id = auth.uid()
    )
    OR
    (carrier_id = auth.uid())
  );

-- INSERT: клиент указывает carrier_id (валидный откликнувшийся); перевозчик = carrier_id
CREATE POLICY "Chat participants can send messages"
  ON messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND carrier_id IS NOT NULL
    AND (
      -- Клиент заявки отправляет в диалог с конкретным перевозчиком
      (
        EXISTS (
          SELECT 1 FROM orders
          WHERE orders.id = order_id AND orders.client_id = auth.uid()
        )
        AND EXISTS (
          SELECT 1 FROM responses
          WHERE responses.order_id = order_id AND responses.carrier_id = carrier_id
        )
      )
      OR
      -- Перевозчик отправляет в свой диалог
      (
        carrier_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM responses
          WHERE responses.order_id = order_id AND responses.carrier_id = auth.uid()
        )
      )
    )
  );
