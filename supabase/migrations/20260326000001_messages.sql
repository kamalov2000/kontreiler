-- Таблица сообщений чата
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  text        TEXT NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_order_id ON messages(order_id, created_at);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Участники сделки: клиент заявки + перевозчики, откликнувшиеся на неё
CREATE POLICY "Chat participants can view messages"
  ON messages FOR SELECT USING (
    -- Пользователь — клиент этой заявки
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id
        AND orders.client_id = auth.uid()
    )
    OR
    -- Пользователь — перевозчик, откликнувшийся на эту заявку
    EXISTS (
      SELECT 1 FROM responses
      WHERE responses.order_id = order_id
        AND responses.carrier_id = auth.uid()
    )
  );

CREATE POLICY "Chat participants can send messages"
  ON messages FOR INSERT WITH CHECK (
    -- Отправитель — это текущий пользователь
    auth.uid() = sender_id
    AND (
      EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_id
          AND orders.client_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM responses
        WHERE responses.order_id = order_id
          AND responses.carrier_id = auth.uid()
      )
    )
  );

-- Включаем Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
