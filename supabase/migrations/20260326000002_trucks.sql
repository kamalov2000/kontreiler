-- Таблица машин (предложения перевозчиков)
CREATE TABLE trucks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id     UUID NOT NULL REFERENCES users(id),
  from_city      TEXT NOT NULL,
  to_city        TEXT NOT NULL,
  container_type TEXT NOT NULL CHECK (container_type IN ('20ft', '40ft', '40HC', '45ft')),
  available_date DATE NOT NULL,
  price          INTEGER,
  is_negotiable  BOOLEAN DEFAULT FALSE,
  status         TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trucks_status_date ON trucks(status, available_date);

-- Отклики клиентов на машину
CREATE TABLE truck_responses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id   UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES users(id),
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(truck_id, client_id)
);

-- Сообщения для чатов по машинам (пара: truck + client)
-- Каждая пара (truck_id, client_id) — отдельный диалог перевозчик↔клиент
CREATE TABLE truck_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id   UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES users(id),  -- идентифицирует диалог
  sender_id  UUID NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_truck_messages_conv ON truck_messages(truck_id, client_id, created_at);

-- ──────────────── RLS ────────────────

ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_messages ENABLE ROW LEVEL SECURITY;

-- TRUCKS: читают все авторизованные, пишет и меняет только владелец
CREATE POLICY "Trucks visible to all authenticated"
  ON trucks FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Carrier can create own trucks"
  ON trucks FOR INSERT WITH CHECK (auth.uid() = carrier_id);

CREATE POLICY "Carrier can update own trucks"
  ON trucks FOR UPDATE USING (auth.uid() = carrier_id);

-- TRUCK_RESPONSES: клиент видит свои, перевозчик видит отклики на свои машины
CREATE POLICY "Client sees own truck responses"
  ON truck_responses FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Carrier sees responses to own trucks"
  ON truck_responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM trucks WHERE trucks.id = truck_id AND trucks.carrier_id = auth.uid())
  );

CREATE POLICY "Client can create truck response"
  ON truck_responses FOR INSERT WITH CHECK (auth.uid() = client_id);

-- TRUCK_MESSAGES: только участники диалога (перевозчик + конкретный клиент)
CREATE POLICY "Truck chat participants can view messages"
  ON truck_messages FOR SELECT USING (
    -- Клиент этого диалога
    auth.uid() = client_id
    OR
    -- Перевозчик этой машины
    EXISTS (
      SELECT 1 FROM trucks
      WHERE trucks.id = truck_id
        AND trucks.carrier_id = auth.uid()
    )
  );

CREATE POLICY "Truck chat participants can send messages"
  ON truck_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      auth.uid() = client_id
      OR
      EXISTS (
        SELECT 1 FROM trucks
        WHERE trucks.id = truck_id
          AND trucks.carrier_id = auth.uid()
      )
    )
  );

-- Realtime для обеих таблиц
ALTER PUBLICATION supabase_realtime ADD TABLE trucks;
ALTER PUBLICATION supabase_realtime ADD TABLE truck_messages;
