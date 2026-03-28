-- Добавляем поле "принятый перевозчик" в заявки
ALTER TABLE orders ADD COLUMN accepted_carrier_id UUID REFERENCES users(id);

-- Обновляем CHECK статуса, чтобы включить 'matched'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('active', 'matched', 'closed'));

-- Добавляем тип уведомления response_accepted
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted'
  ));

-- Триггер: клиент принял отклик → уведомление перевозчику
CREATE OR REPLACE FUNCTION notify_response_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.accepted_carrier_id IS NULL AND NEW.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (NEW.accepted_carrier_id, 'response_accepted',
            '/orders/' || NEW.id || '/chat');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_response_accepted
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_response_accepted();
