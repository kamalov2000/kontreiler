-- Автоматическое истечение заявок по таймеру (пункт 1)
-- Добавляем колонку was_expired для статистики

ALTER TABLE orders ADD COLUMN IF NOT EXISTS was_expired BOOLEAN DEFAULT FALSE;

-- Функция истечения просроченных заявок
CREATE OR REPLACE FUNCTION expire_overdue_orders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE orders
  SET status = 'expired'
  WHERE status = 'active'
    AND format IN ('regular', 'urgent')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION expire_overdue_orders() TO service_role;

-- Регистрируем cron-задачу (каждую минуту)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expire-overdue-orders');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'expire-overdue-orders',
      '* * * * *',
      'SELECT expire_overdue_orders()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
