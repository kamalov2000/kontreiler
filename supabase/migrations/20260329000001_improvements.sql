-- ── 1. Три точки маршрута + точный адрес ────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS via_city TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS from_city_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS via_city_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS to_city_address TEXT;

-- ── 2. Срок действия заявки ─────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── 3. Статус 'expired' ─────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('active', 'matched', 'in_transit', 'delivered', 'closed', 'cancelled', 'expired'));

-- ── 4. Новый формат номера заявки: КТ-XXXXX (без года) ──────────────────
-- Сбрасываем счётчик (тестовые заявки не считаем)
ALTER SEQUENCE order_seq RESTART WITH 1;

-- Обновляем функцию генерации номера
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'КТ-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. Функция: перевести просроченные заявки в статус 'expired' ─────────
CREATE OR REPLACE FUNCTION expire_overdue_orders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE orders
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION expire_overdue_orders() TO service_role;

-- ── 6. pg_cron: запускать каждый час (если расширение установлено) ────────
DO $$
BEGIN
  -- Проверяем наличие pg_cron
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'expire-orders-hourly',
      '0 * * * *',
      'SELECT expire_overdue_orders()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron недоступен — пропускаем
  NULL;
END $$;
