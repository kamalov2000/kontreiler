-- Таблица уведомлений
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
                'new_response', 'new_message',
                'new_truck_response', 'new_truck_message'
              )),
  link        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свои уведомления
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

-- Пользователь может пометить свои уведомления прочитанными
CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- Триггер: новый отклик на заявку → уведомление клиенту
-- ──────────────────────────────────────────────────────────────
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

CREATE TRIGGER trg_notify_new_response
  AFTER INSERT ON responses
  FOR EACH ROW EXECUTE FUNCTION notify_new_response();

-- ──────────────────────────────────────────────────────────────
-- Триггер: новое сообщение в чате заявки → уведомление собеседнику
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_client_id UUID;
  r RECORD;
BEGIN
  SELECT client_id INTO v_client_id FROM orders WHERE id = NEW.order_id;

  IF NEW.sender_id = v_client_id THEN
    -- Отправил клиент → уведомить всех перевозчиков-откликнувшихся
    FOR r IN SELECT DISTINCT carrier_id FROM responses WHERE order_id = NEW.order_id LOOP
      IF r.carrier_id != NEW.sender_id THEN
        INSERT INTO notifications(user_id, type, link)
        VALUES (r.carrier_id, 'new_message', '/orders/' || NEW.order_id || '/chat');
      END IF;
    END LOOP;
  ELSE
    -- Отправил перевозчик → уведомить клиента
    IF v_client_id IS NOT NULL AND v_client_id != NEW.sender_id THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (v_client_id, 'new_message', '/orders/' || NEW.order_id || '/chat');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ──────────────────────────────────────────────────────────────
-- Триггер: отклик на машину → уведомление перевозчику
-- ──────────────────────────────────────────────────────────────
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

CREATE TRIGGER trg_notify_new_truck_response
  AFTER INSERT ON truck_responses
  FOR EACH ROW EXECUTE FUNCTION notify_new_truck_response();

-- ──────────────────────────────────────────────────────────────
-- Триггер: новое сообщение в чате рейса → уведомление собеседнику
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_new_truck_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_carrier_id UUID;
BEGIN
  SELECT carrier_id INTO v_carrier_id FROM trucks WHERE id = NEW.truck_id;

  IF NEW.sender_id = NEW.client_id THEN
    -- Отправил клиент → уведомить перевозчика (ссылка с client param)
    IF v_carrier_id IS NOT NULL AND v_carrier_id != NEW.sender_id THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (v_carrier_id, 'new_truck_message',
              '/trucks/' || NEW.truck_id || '/chat?client=' || NEW.client_id);
    END IF;
  ELSE
    -- Отправил перевозчик → уведомить клиента
    IF NEW.client_id != NEW.sender_id THEN
      INSERT INTO notifications(user_id, type, link)
      VALUES (NEW.client_id, 'new_truck_message',
              '/trucks/' || NEW.truck_id || '/chat');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_truck_message
  AFTER INSERT ON truck_messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_truck_message();

-- Realtime для уведомлений
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
