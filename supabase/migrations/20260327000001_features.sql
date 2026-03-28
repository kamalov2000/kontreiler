-- ── 1. Верификация телефона ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE phone_verification_codes ENABLE ROW LEVEL SECURITY;
-- Пользователь может вставлять и читать свои коды
CREATE POLICY "Users insert own codes"
  ON phone_verification_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users select own codes"
  ON phone_verification_codes FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. Поле notes для заявок и машин ────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── 3. Договорная цена сделки ────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS agreed_price INTEGER;

-- ── 4. Отзывы ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id),
  reviewer_id  UUID NOT NULL REFERENCES users(id),
  reviewee_id  UUID NOT NULL REFERENCES users(id),
  rating       INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, reviewer_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read reviews"
  ON reviews FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Users insert own review"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- Realtime для отзывов
ALTER PUBLICATION supabase_realtime ADD TABLE reviews;

-- ── 5. Сохранённые маршруты ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_routes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_city      TEXT NOT NULL,
  to_city        TEXT NOT NULL,
  container_type TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Carriers read own saved routes"
  ON saved_routes FOR SELECT
  USING (auth.uid() = carrier_id);
CREATE POLICY "Carriers insert saved routes"
  ON saved_routes FOR INSERT
  WITH CHECK (auth.uid() = carrier_id);
CREATE POLICY "Carriers delete saved routes"
  ON saved_routes FOR DELETE
  USING (auth.uid() = carrier_id);

-- ── 6. Обновляем notifications constraint: добавляем review_request ──
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done',
    'order_cancelled',
    'review_request'
  ));

-- ── 7. Триггер: запрос отзыва при статусе "Доставлено" ───────────────
CREATE OR REPLACE FUNCTION notify_review_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered' THEN
    -- Уведомить клиента
    INSERT INTO notifications(user_id, type, link)
    VALUES (NEW.client_id, 'review_request', '/orders/' || NEW.id);
    -- Уведомить перевозчика
    IF NEW.accepted_carrier_id IS NOT NULL THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (NEW.accepted_carrier_id, 'review_request', '/orders/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_review_request
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_review_request();
