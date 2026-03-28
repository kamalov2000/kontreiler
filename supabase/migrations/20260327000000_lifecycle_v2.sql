-- ── Orders: добавляем статус 'cancelled' ───────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('active', 'matched', 'in_transit', 'delivered', 'closed', 'cancelled'));

-- ── Notifications: добавляем тип 'order_cancelled' ───────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done',
    'order_cancelled'
  ));

-- ── Триггер: уведомить перевозчика при отмене или откате статуса ──
CREATE OR REPLACE FUNCTION notify_order_cancelled()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Заявка отменена, пока перевозчик был выбран
  IF NEW.status = 'cancelled' AND OLD.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (OLD.accepted_carrier_id, 'order_cancelled', '/my-responses');
  END IF;

  -- Статус откатили с matched → active (перевозчик де-выбран)
  IF OLD.status = 'matched' AND NEW.status = 'active' AND OLD.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (OLD.accepted_carrier_id, 'order_cancelled', '/my-responses');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_order_cancelled
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_cancelled();
