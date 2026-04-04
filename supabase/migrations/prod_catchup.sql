-- =============================================================================
-- PROD CATCHUP — применять ТОЛЬКО если таблицы уже существуют
-- Создаёт: функции, триггеры, вьюхи, RLS-политики, последовательности,
--          pg_cron задачи, Storage bucket, удаляет phone_verification_codes
-- Безопасен для повторного запуска (идемпотентен)
-- =============================================================================

-- =============================================================================
-- 1. ПОСЛЕДОВАТЕЛЬНОСТИ
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS order_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS truck_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS auction_seq   START 1;
CREATE SEQUENCE IF NOT EXISTS reduction_seq START 1;


-- =============================================================================
-- 2. RLS — включить на всех таблицах
-- =============================================================================
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 3. RLS ПОЛИТИКИ
-- =============================================================================

-- ── users ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert own profile"          ON users;
DROP POLICY IF EXISTS "Users can update own profile"          ON users;
DROP POLICY IF EXISTS "users_update_own"                      ON users;
DROP POLICY IF EXISTS "Authenticated users can view all users" ON users;

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Authenticated users can view all users"
  ON users FOR SELECT USING (auth.role() = 'authenticated');

-- Нельзя менять role, is_verified, is_phone_verified через клиент
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role              = (SELECT u.role              FROM users u WHERE u.id = auth.uid())
    AND is_verified       = (SELECT u.is_verified       FROM users u WHERE u.id = auth.uid())
    AND is_phone_verified = (SELECT u.is_phone_verified FROM users u WHERE u.id = auth.uid())
  );

-- ── orders ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Active orders visible to all" ON orders;
DROP POLICY IF EXISTS "Clients can create orders"    ON orders;
DROP POLICY IF EXISTS "Clients can update own orders" ON orders;

CREATE POLICY "Active orders visible to all"
  ON orders FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Clients can create orders"
  ON orders FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update own orders"
  ON orders FOR UPDATE USING (auth.uid() = client_id);

-- ── responses ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Carriers see own responses"             ON responses;
DROP POLICY IF EXISTS "Clients see responses to their orders"  ON responses;
DROP POLICY IF EXISTS "Carriers can create responses"          ON responses;

CREATE POLICY "Carriers see own responses"
  ON responses FOR SELECT USING (auth.uid() = carrier_id);

CREATE POLICY "Clients see responses to their orders"
  ON responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.client_id = auth.uid())
  );

CREATE POLICY "Carriers can create responses"
  ON responses FOR INSERT WITH CHECK (auth.uid() = carrier_id);

-- ── messages ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chat participants can view messages" ON messages;
DROP POLICY IF EXISTS "Chat participants can send messages" ON messages;

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

-- ── trucks ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trucks visible to all authenticated" ON trucks;
DROP POLICY IF EXISTS "Carrier can create own trucks"       ON trucks;
DROP POLICY IF EXISTS "Carrier can update own trucks"       ON trucks;

CREATE POLICY "Trucks visible to all authenticated"
  ON trucks FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Carrier can create own trucks"
  ON trucks FOR INSERT WITH CHECK (auth.uid() = carrier_id);

CREATE POLICY "Carrier can update own trucks"
  ON trucks FOR UPDATE USING (auth.uid() = carrier_id);

-- ── truck_responses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Client sees own truck responses"        ON truck_responses;
DROP POLICY IF EXISTS "Carrier sees responses to own trucks"   ON truck_responses;
DROP POLICY IF EXISTS "Client can create truck response"       ON truck_responses;

CREATE POLICY "Client sees own truck responses"
  ON truck_responses FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Carrier sees responses to own trucks"
  ON truck_responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM trucks WHERE trucks.id = truck_id AND trucks.carrier_id = auth.uid())
  );

CREATE POLICY "Client can create truck response"
  ON truck_responses FOR INSERT WITH CHECK (auth.uid() = client_id);

-- ── truck_messages ────────────────────────────────────────────────────────────
-- Используем прямые поля carrier_id/client_id (денормализованы для Realtime)
DROP POLICY IF EXISTS "Truck chat participants can view messages" ON truck_messages;
DROP POLICY IF EXISTS "Truck chat participants can send messages" ON truck_messages;

CREATE POLICY "Truck chat participants can view messages"
  ON truck_messages FOR SELECT USING (
    auth.uid() = client_id OR auth.uid() = carrier_id
  );

CREATE POLICY "Truck chat participants can send messages"
  ON truck_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      auth.uid() = carrier_id
      OR (
        auth.uid() = client_id
        AND EXISTS (
          SELECT 1 FROM truck_responses
          WHERE truck_responses.truck_id  = truck_messages.truck_id
            AND truck_responses.client_id = auth.uid()
        )
      )
    )
  );

-- ── notifications ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users see own notifications"             ON notifications;
DROP POLICY IF EXISTS "Users can mark own notifications read"   ON notifications;

CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── bids ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can view bids" ON bids;
DROP POLICY IF EXISTS "Carrier can insert own bids" ON bids;

CREATE POLICY "Authenticated can view bids"
  ON bids FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Carrier can insert own bids"
  ON bids FOR INSERT WITH CHECK (auth.uid() = carrier_id);

GRANT SELECT, INSERT ON bids TO authenticated;

-- ── reviews ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users read reviews" ON reviews;
DROP POLICY IF EXISTS "Users insert own review"          ON reviews;

CREATE POLICY "Authenticated users read reviews"
  ON reviews FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users insert own review"
  ON reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- ── saved_routes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Carriers read own saved routes" ON saved_routes;
DROP POLICY IF EXISTS "Carriers insert saved routes"   ON saved_routes;
DROP POLICY IF EXISTS "Carriers delete saved routes"   ON saved_routes;

CREATE POLICY "Carriers read own saved routes"
  ON saved_routes FOR SELECT USING (auth.uid() = carrier_id);

CREATE POLICY "Carriers insert saved routes"
  ON saved_routes FOR INSERT WITH CHECK (auth.uid() = carrier_id);

CREATE POLICY "Carriers delete saved routes"
  ON saved_routes FOR DELETE USING (auth.uid() = carrier_id);

-- ── order_documents ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "order_documents_select" ON order_documents;
DROP POLICY IF EXISTS "order_documents_insert" ON order_documents;
DROP POLICY IF EXISTS "order_documents_delete" ON order_documents;

CREATE POLICY "order_documents_select" ON order_documents
  FOR SELECT USING (
    auth.uid() IN (
      SELECT client_id  FROM orders    WHERE id       = order_id
      UNION
      SELECT carrier_id FROM responses WHERE order_id = order_documents.order_id
    )
  );

CREATE POLICY "order_documents_insert" ON order_documents
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by AND
    auth.uid() IN (
      SELECT client_id          FROM orders WHERE id = order_id
      UNION
      SELECT accepted_carrier_id FROM orders WHERE id = order_id AND accepted_carrier_id IS NOT NULL
    )
  );

CREATE POLICY "order_documents_delete" ON order_documents
  FOR DELETE USING (auth.uid() = uploaded_by);


-- =============================================================================
-- 4. ФУНКЦИИ
-- =============================================================================

-- ── Автосоздание пользователя при регистрации ─────────────────────────────────
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

-- ── Генерация номера заявки ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    IF NEW.format = 'auction' THEN
      NEW.order_number := 'А-' || LPAD(nextval('auction_seq')::TEXT, 5, '0');
    ELSIF NEW.format = 'reduction' THEN
      NEW.order_number := 'Р-' || LPAD(nextval('reduction_seq')::TEXT, 5, '0');
    ELSE
      NEW.order_number := 'КТ-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Генерация номера машины ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_truck_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.truck_number IS NULL THEN
    NEW.truck_number := 'МШ-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('truck_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ── Уведомление: новый отклик на заявку → клиенту ────────────────────────────
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

-- ── Уведомление: новое сообщение в чате заявки ───────────────────────────────
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

-- ── Уведомление: отклик на машину → перевозчику ──────────────────────────────
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

-- ── Уведомление: новое сообщение в чате машины ───────────────────────────────
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

-- ── Уведомление: принятие отклика ────────────────────────────────────────────
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

-- ── Уведомление: заявка доставлена → перевозчику ─────────────────────────────
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

-- ── Уведомление: рейс завершён → клиентам ────────────────────────────────────
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

-- ── Уведомление: заявка отменена → перевозчику ───────────────────────────────
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

-- ── Уведомление: запрос отзыва при доставке ──────────────────────────────────
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

-- ── Валидация ставки в аукционе ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_bid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format    TEXT;
  v_start     INTEGER;
  v_min       INTEGER;
  v_max       INTEGER;
  v_step      INTEGER;
  v_end_time  TIMESTAMPTZ;
  v_best      INTEGER;
BEGIN
  SELECT format, auction_start_price, auction_end_time,
         auction_min_price, auction_max_price, auction_step
    INTO v_format, v_start, v_end_time, v_min, v_max, v_step
  FROM orders WHERE id = NEW.order_id;

  IF v_end_time IS NOT NULL AND v_end_time < NOW() THEN
    RAISE EXCEPTION 'auction_ended';
  END IF;

  IF v_format = 'reduction' THEN
    SELECT MIN(amount) INTO v_best FROM bids WHERE order_id = NEW.order_id;
    IF v_best IS NULL THEN v_best := v_start; END IF;
    IF NEW.amount >= v_best THEN RAISE EXCEPTION 'bid_too_high:%', v_best; END IF;
    IF v_min IS NOT NULL AND NEW.amount < v_min THEN RAISE EXCEPTION 'bid_too_low:%', v_min; END IF;
    IF v_step IS NOT NULL AND (v_best - NEW.amount) % v_step != 0 THEN
      RAISE EXCEPTION 'bid_wrong_step:%', v_step;
    END IF;
  ELSIF v_format = 'auction' THEN
    SELECT MAX(amount) INTO v_best FROM bids WHERE order_id = NEW.order_id;
    IF v_best IS NULL THEN v_best := v_start; END IF;
    IF NEW.amount <= v_best THEN RAISE EXCEPTION 'bid_too_low:%', v_best; END IF;
    IF v_max IS NOT NULL AND NEW.amount > v_max THEN RAISE EXCEPTION 'bid_too_high:%', v_max; END IF;
    IF v_step IS NOT NULL AND (NEW.amount - v_best) % v_step != 0 THEN
      RAISE EXCEPTION 'bid_wrong_step:%', v_step;
    END IF;
  ELSE
    RAISE EXCEPTION 'not_auction';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Автозакрытие завершённых торгов ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_finished_auctions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order          RECORD;
  v_winner_carrier UUID;
  v_winner_amount  INTEGER;
BEGIN
  FOR v_order IN
    SELECT * FROM orders
    WHERE format IN ('reduction', 'auction')
      AND status = 'active'
      AND auction_end_time < NOW()
  LOOP
    IF v_order.format = 'reduction' THEN
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
        FROM bids WHERE order_id = v_order.id ORDER BY amount ASC, created_at ASC LIMIT 1;
    ELSE
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
        FROM bids WHERE order_id = v_order.id ORDER BY amount DESC, created_at ASC LIMIT 1;
    END IF;

    IF v_winner_carrier IS NULL THEN
      IF v_order.auction_auto_extend THEN
        UPDATE orders SET auction_end_time = NOW() + interval '1 hour' WHERE id = v_order.id;
      ELSE
        UPDATE orders SET status = 'expired' WHERE id = v_order.id;
      END IF;
    ELSIF v_order.auction_auto_winner THEN
      UPDATE orders SET
        status              = 'matched',
        accepted_carrier_id = v_winner_carrier,
        auction_winner_id   = v_winner_carrier,
        agreed_price        = v_winner_amount
      WHERE id = v_order.id;
      INSERT INTO notifications(user_id, type, link)
        VALUES (v_winner_carrier, 'auction_won', '/orders/' || v_order.id);
      INSERT INTO notifications(user_id, type, link)
        VALUES (v_order.client_id, 'auction_ended', '/orders/' || v_order.id);
    ELSE
      UPDATE orders SET status = 'closed' WHERE id = v_order.id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION settle_finished_auctions() TO service_role;

-- ── Автоистечение просроченных заявок ────────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_overdue_orders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE orders
  SET status = 'expired', was_expired = TRUE
  WHERE status = 'active'
    AND format IN ('regular', 'urgent')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION expire_overdue_orders() TO service_role;


-- =============================================================================
-- 5. ТРИГГЕРЫ
-- =============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created        ON auth.users;
DROP TRIGGER IF EXISTS trg_order_number            ON orders;
DROP TRIGGER IF EXISTS trg_truck_number            ON trucks;
DROP TRIGGER IF EXISTS trg_notify_new_response     ON responses;
DROP TRIGGER IF EXISTS trg_notify_new_message      ON messages;
DROP TRIGGER IF EXISTS trg_notify_new_truck_response ON truck_responses;
DROP TRIGGER IF EXISTS trg_notify_new_truck_message  ON truck_messages;
DROP TRIGGER IF EXISTS trg_notify_response_accepted  ON orders;
DROP TRIGGER IF EXISTS trg_notify_order_delivered    ON orders;
DROP TRIGGER IF EXISTS trg_notify_trip_done          ON trucks;
DROP TRIGGER IF EXISTS trg_notify_order_cancelled    ON orders;
DROP TRIGGER IF EXISTS trg_notify_review_request     ON orders;
DROP TRIGGER IF EXISTS trg_validate_bid              ON bids;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

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

CREATE TRIGGER trg_validate_bid
  BEFORE INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION validate_bid();


-- =============================================================================
-- 6. ВЬЮХИ
-- =============================================================================
CREATE OR REPLACE VIEW user_avg_ratings AS
SELECT
  reviewee_id                      AS user_id,
  ROUND(AVG(rating)::numeric, 1)   AS avg_rating,
  COUNT(*)::integer                AS review_count
FROM reviews
GROUP BY reviewee_id;

GRANT SELECT ON user_avg_ratings TO authenticated;

CREATE OR REPLACE VIEW order_best_bids AS
SELECT
  b.order_id,
  o.format,
  COUNT(DISTINCT b.carrier_id)::integer AS participant_count,
  COUNT(*)::integer                     AS bid_count,
  CASE
    WHEN o.format = 'reduction' THEN MIN(b.amount)
    ELSE MAX(b.amount)
  END AS best_amount
FROM bids b
JOIN orders o ON o.id = b.order_id
GROUP BY b.order_id, o.format;

GRANT SELECT ON order_best_bids TO authenticated;


-- =============================================================================
-- 7. ИНДЕКСЫ (если не существуют)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_messages_order_id        ON messages(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user       ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trucks_status_date       ON trucks(status, available_date);
CREATE INDEX IF NOT EXISTS idx_truck_messages_conv      ON truck_messages(truck_id, client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_truck_messages_carrier_id ON truck_messages(carrier_id);


-- =============================================================================
-- 8. REALTIME
-- =============================================================================
DO $$
BEGIN
  -- Добавляем таблицы в публикацию Realtime (игнорируем если уже добавлены)
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE trucks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE truck_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE reviews;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- =============================================================================
-- 9. STORAGE BUCKET
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-docs', 'order-docs', false, 10485760,
  ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage upload"  ON storage.objects;
DROP POLICY IF EXISTS "storage select"  ON storage.objects;
DROP POLICY IF EXISTS "storage delete"  ON storage.objects;

CREATE POLICY "storage upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'order-docs');

CREATE POLICY "storage select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'order-docs');

CREATE POLICY "storage delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'order-docs');


-- =============================================================================
-- 10. PG_CRON
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Удалить старые задачи (если были), создать заново
    BEGIN PERFORM cron.unschedule('expire-overdue-orders'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('settle-auctions-5min');  EXCEPTION WHEN OTHERS THEN NULL; END;

    PERFORM cron.schedule('expire-overdue-orders', '* * * * *',    'SELECT expire_overdue_orders()');
    PERFORM cron.schedule('settle-auctions-5min',  '*/5 * * * *',  'SELECT settle_finished_auctions()');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 11. УДАЛИТЬ МЁРТВУЮ ТАБЛИЦУ
-- =============================================================================
DROP TABLE IF EXISTS public.phone_verification_codes;
