-- =============================================================================
--  КОНТРЕЙЛ — полная схема БД
--  Запускать одним блоком в Supabase Cloud → SQL Editor
--  Порядок: таблицы → RLS → индексы → триггеры → view
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ТАБЛИЦЫ
-- ─────────────────────────────────────────────────────────────────────────────

-- Пользователи
CREATE TABLE users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id),
  role              TEXT    NOT NULL CHECK (role IN ('client', 'carrier')),
  name              TEXT,
  phone             TEXT,
  city              TEXT,
  is_verified       BOOLEAN DEFAULT FALSE,
  is_phone_verified BOOLEAN DEFAULT FALSE,
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Заявки
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES users(id),
  accepted_carrier_id UUID REFERENCES users(id),
  from_city           TEXT NOT NULL,
  to_city             TEXT NOT NULL,
  container_type      TEXT NOT NULL CHECK (container_type IN ('20ft', '40ft', '40HC', '45ft')),
  ready_date          DATE NOT NULL,
  price               INTEGER,
  is_negotiable       BOOLEAN DEFAULT FALSE,
  is_urgent           BOOLEAN DEFAULT FALSE,
  notes               TEXT,
  agreed_price        INTEGER,
  order_number        TEXT UNIQUE,
  status              TEXT DEFAULT 'active' CHECK (status IN (
                        'active', 'matched', 'in_transit', 'delivered', 'closed', 'cancelled'
                      )),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Отклики перевозчиков на заявки
CREATE TABLE responses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id),
  carrier_id UUID NOT NULL REFERENCES users(id),
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, carrier_id)
);

-- Сообщения чата заявки
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Машины перевозчиков
CREATE TABLE trucks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id     UUID NOT NULL REFERENCES users(id),
  from_city      TEXT NOT NULL,
  to_city        TEXT NOT NULL,
  container_type TEXT NOT NULL CHECK (container_type IN ('20ft', '40ft', '40HC', '45ft')),
  available_date DATE NOT NULL,
  price          INTEGER,
  is_negotiable  BOOLEAN DEFAULT FALSE,
  notes          TEXT,
  truck_number   TEXT UNIQUE,
  status         TEXT DEFAULT 'active' CHECK (status IN ('active', 'busy', 'done', 'closed')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Отклики клиентов на машины
CREATE TABLE truck_responses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id   UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES users(id),
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(truck_id, client_id)
);

-- Сообщения чата машины (пара truck + client)
CREATE TABLE truck_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id   UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  client_id  UUID NOT NULL REFERENCES users(id),
  sender_id  UUID NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL CHECK (char_length(text) > 0 AND char_length(text) <= 2000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Уведомления
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN (
               'new_response', 'new_message',
               'new_truck_response', 'new_truck_message',
               'response_accepted',
               'order_delivered', 'trip_done',
               'order_cancelled',
               'review_request'
             )),
  link       TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Отзывы
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewee_id UUID NOT NULL REFERENCES users(id),
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, reviewer_id)
);

-- Сохранённые маршруты перевозчиков
CREATE TABLE saved_routes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_city      TEXT NOT NULL,
  to_city        TEXT NOT NULL,
  container_type TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Коды верификации телефона
CREATE TABLE phone_verification_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used       BOOLEAN DEFAULT FALSE,
  attempts   INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ИНДЕКСЫ
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_messages_order_id          ON messages(order_id, created_at);
CREATE INDEX idx_trucks_status_date         ON trucks(status, available_date);
CREATE INDEX idx_truck_messages_conv        ON truck_messages(truck_id, client_id, created_at);
CREATE INDEX idx_notifications_user         ON notifications(user_id, is_read, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_responses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verification_codes ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Финальная политика UPDATE: запрещает менять role / is_verified / is_phone_verified
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role              = (SELECT u.role              FROM users u WHERE u.id = auth.uid())
    AND is_verified       = (SELECT u.is_verified       FROM users u WHERE u.id = auth.uid())
    AND is_phone_verified = (SELECT u.is_phone_verified FROM users u WHERE u.id = auth.uid())
  );

CREATE POLICY "Authenticated users can view all users"
  ON users FOR SELECT USING (auth.role() = 'authenticated');

-- orders
CREATE POLICY "Active orders visible to all"
  ON orders FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Clients can create orders"
  ON orders FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update own orders"
  ON orders FOR UPDATE USING (auth.uid() = client_id);

-- responses
CREATE POLICY "Carriers see own responses"
  ON responses FOR SELECT USING (auth.uid() = carrier_id);

CREATE POLICY "Clients see responses to their orders"
  ON responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.client_id = auth.uid())
  );

CREATE POLICY "Carriers can create responses"
  ON responses FOR INSERT WITH CHECK (auth.uid() = carrier_id);

-- messages
CREATE POLICY "Chat participants can view messages"
  ON messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.client_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM responses WHERE responses.order_id = order_id AND responses.carrier_id = auth.uid())
  );

CREATE POLICY "Chat participants can send messages"
  ON messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.client_id = auth.uid())
      OR
      EXISTS (SELECT 1 FROM responses WHERE responses.order_id = order_id AND responses.carrier_id = auth.uid())
    )
  );

-- trucks
CREATE POLICY "Trucks visible to all authenticated"
  ON trucks FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Carrier can create own trucks"
  ON trucks FOR INSERT WITH CHECK (auth.uid() = carrier_id);

CREATE POLICY "Carrier can update own trucks"
  ON trucks FOR UPDATE USING (auth.uid() = carrier_id);

-- truck_responses
CREATE POLICY "Client sees own truck responses"
  ON truck_responses FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Carrier sees responses to own trucks"
  ON truck_responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM trucks WHERE trucks.id = truck_id AND trucks.carrier_id = auth.uid())
  );

CREATE POLICY "Client can create truck response"
  ON truck_responses FOR INSERT WITH CHECK (auth.uid() = client_id);

-- truck_messages
CREATE POLICY "Truck chat participants can view messages"
  ON truck_messages FOR SELECT USING (
    auth.uid() = client_id
    OR
    EXISTS (SELECT 1 FROM trucks WHERE trucks.id = truck_id AND trucks.carrier_id = auth.uid())
  );

-- Финальная политика отправки: клиент должен предварительно откликнуться
CREATE POLICY "Truck chat participants can send messages"
  ON truck_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      EXISTS (SELECT 1 FROM trucks WHERE trucks.id = truck_id AND trucks.carrier_id = auth.uid())
      OR
      (
        auth.uid() = client_id
        AND EXISTS (
          SELECT 1 FROM truck_responses
          WHERE truck_responses.truck_id  = truck_messages.truck_id
            AND truck_responses.client_id = auth.uid()
        )
      )
    )
  );

-- notifications
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- reviews
CREATE POLICY "Authenticated users read reviews"
  ON reviews FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users insert own review"
  ON reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- saved_routes
CREATE POLICY "Carriers read own saved routes"
  ON saved_routes FOR SELECT USING (auth.uid() = carrier_id);

CREATE POLICY "Carriers insert saved routes"
  ON saved_routes FOR INSERT WITH CHECK (auth.uid() = carrier_id);

CREATE POLICY "Carriers delete saved routes"
  ON saved_routes FOR DELETE USING (auth.uid() = carrier_id);

-- phone_verification_codes
CREATE POLICY "Users insert own codes"
  ON phone_verification_codes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users select own codes"
  ON phone_verification_codes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users delete own codes"
  ON phone_verification_codes FOR DELETE USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REALTIME
-- ─────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE trucks;
ALTER PUBLICATION supabase_realtime ADD TABLE truck_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE reviews;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ПОСЛЕДОВАТЕЛЬНОСТИ ДЛЯ НОМЕРОВ ЗАЯВОК И МАШИН
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS truck_seq START 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ТРИГГЕРНЫЕ ФУНКЦИИ
-- ─────────────────────────────────────────────────────────────────────────────

-- Уникальный номер заявки: КТ-ГГГГ-NNNNN
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'КТ-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Уникальный номер машины: МШ-ГГГГ-NNNNN
CREATE OR REPLACE FUNCTION generate_truck_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.truck_number IS NULL THEN
    NEW.truck_number := 'МШ-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('truck_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление клиенту: новый отклик на его заявку
CREATE OR REPLACE FUNCTION notify_new_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_client_id UUID;
BEGIN
  SELECT client_id INTO v_client_id FROM orders WHERE id = NEW.order_id;
  IF v_client_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (v_client_id, 'new_response', '/orders/' || NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление: новое сообщение в чате заявки
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id UUID;
  r RECORD;
BEGIN
  SELECT client_id INTO v_client_id FROM orders WHERE id = NEW.order_id;
  IF NEW.sender_id = v_client_id THEN
    FOR r IN SELECT DISTINCT carrier_id FROM responses WHERE order_id = NEW.order_id LOOP
      IF r.carrier_id != NEW.sender_id THEN
        INSERT INTO notifications(user_id, type, link)
        VALUES (r.carrier_id, 'new_message', '/orders/' || NEW.order_id || '/chat');
      END IF;
    END LOOP;
  ELSE
    IF v_client_id IS NOT NULL AND v_client_id != NEW.sender_id THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (v_client_id, 'new_message', '/orders/' || NEW.order_id || '/chat');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление перевозчику: отклик клиента на его машину
CREATE OR REPLACE FUNCTION notify_new_truck_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_carrier_id UUID;
BEGIN
  SELECT carrier_id INTO v_carrier_id FROM trucks WHERE id = NEW.truck_id;
  IF v_carrier_id IS NOT NULL AND v_carrier_id != NEW.client_id THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (v_carrier_id, 'new_truck_response', '/trucks/' || NEW.truck_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление: новое сообщение в чате машины
CREATE OR REPLACE FUNCTION notify_new_truck_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_carrier_id UUID;
BEGIN
  SELECT carrier_id INTO v_carrier_id FROM trucks WHERE id = NEW.truck_id;
  IF NEW.sender_id = NEW.client_id THEN
    IF v_carrier_id IS NOT NULL AND v_carrier_id != NEW.sender_id THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (v_carrier_id, 'new_truck_message',
              '/trucks/' || NEW.truck_id || '/chat?client=' || NEW.client_id);
    END IF;
  ELSE
    IF NEW.client_id != NEW.sender_id THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (NEW.client_id, 'new_truck_message', '/trucks/' || NEW.truck_id || '/chat');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление перевозчику: его отклик принят
CREATE OR REPLACE FUNCTION notify_response_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.accepted_carrier_id IS NULL AND NEW.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (NEW.accepted_carrier_id, 'response_accepted', '/orders/' || NEW.id || '/chat');
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление перевозчику: заявка доставлена
CREATE OR REPLACE FUNCTION notify_order_delivered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered' THEN
    IF NEW.accepted_carrier_id IS NOT NULL THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (NEW.accepted_carrier_id, 'order_delivered', '/orders/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление клиентам: рейс машины выполнен
CREATE OR REPLACE FUNCTION notify_trip_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r RECORD;
BEGIN
  IF OLD.status IS DISTINCT FROM 'done' AND NEW.status = 'done' THEN
    FOR r IN SELECT client_id FROM truck_responses WHERE truck_id = NEW.id LOOP
      INSERT INTO notifications(user_id, type, link)
      VALUES (r.client_id, 'trip_done', '/trucks/' || NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Уведомление: заявка отменена или перевозчик де-выбран
CREATE OR REPLACE FUNCTION notify_order_cancelled()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (OLD.accepted_carrier_id, 'order_cancelled', '/my-responses');
  END IF;
  IF OLD.status = 'matched' AND NEW.status = 'active' AND OLD.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (OLD.accepted_carrier_id, 'order_cancelled', '/my-responses');
  END IF;
  RETURN NEW;
END;
$$;

-- Запрос отзыва после доставки
CREATE OR REPLACE FUNCTION notify_review_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered' THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (NEW.client_id, 'review_request', '/orders/' || NEW.id);
    IF NEW.accepted_carrier_id IS NOT NULL THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (NEW.accepted_carrier_id, 'review_request', '/orders/' || NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ТРИГГЕРЫ
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

CREATE TRIGGER trg_truck_number
  BEFORE INSERT ON trucks
  FOR EACH ROW EXECUTE FUNCTION generate_truck_number();

CREATE TRIGGER trg_notify_new_response
  AFTER INSERT ON responses
  FOR EACH ROW EXECUTE FUNCTION notify_new_response();

CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_message();

CREATE TRIGGER trg_notify_new_truck_response
  AFTER INSERT ON truck_responses
  FOR EACH ROW EXECUTE FUNCTION notify_new_truck_response();

CREATE TRIGGER trg_notify_new_truck_message
  AFTER INSERT ON truck_messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_truck_message();

CREATE TRIGGER trg_notify_response_accepted
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_response_accepted();

CREATE TRIGGER trg_notify_order_delivered
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_delivered();

CREATE TRIGGER trg_notify_trip_done
  AFTER UPDATE ON trucks
  FOR EACH ROW EXECUTE FUNCTION notify_trip_done();

CREATE TRIGGER trg_notify_order_cancelled
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_cancelled();

CREATE TRIGGER trg_notify_review_request
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_review_request();


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. VIEW
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW user_avg_ratings AS
SELECT
  reviewee_id                    AS user_id,
  ROUND(AVG(rating)::numeric, 1) AS avg_rating,
  COUNT(*)::integer              AS review_count
FROM reviews
GROUP BY reviewee_id;

GRANT SELECT ON user_avg_ratings TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. AUTH TRIGGER + INSERT POLICY
-- ─────────────────────────────────────────────────────────────────────────────

-- Автосоздание профиля при регистрации (SECURITY DEFINER обходит RLS)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, role, name, phone, city)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- INSERT policy — fallback для upsert с фронта
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
