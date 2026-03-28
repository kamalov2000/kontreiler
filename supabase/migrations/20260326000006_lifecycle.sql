-- ── Orders: расширяем жизненный цикл ──────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('active', 'matched', 'in_transit', 'delivered', 'closed'));

-- ── Trucks: расширяем жизненный цикл ───────────────────────────
ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_status_check;
ALTER TABLE trucks ADD CONSTRAINT trucks_status_check
  CHECK (status IN ('active', 'busy', 'done', 'closed'));

-- ── Notifications: добавляем типы доставки ──────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done'
  ));

-- ── Триггер: заявка → Доставлено → уведомить перевозчика ────────
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

CREATE TRIGGER trg_notify_order_delivered
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_delivered();

-- ── Триггер: рейс → Выполнен → уведомить откликнувшихся клиентов
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

CREATE TRIGGER trg_notify_trip_done
  AFTER UPDATE ON trucks
  FOR EACH ROW EXECUTE FUNCTION notify_trip_done();
