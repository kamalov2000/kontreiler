-- ── 1. Формат заявки ────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'regular'
  CHECK (format IN ('regular', 'urgent', 'reduction', 'auction'));

-- Миграция: старые срочные заявки → format = 'urgent'
UPDATE orders SET format = 'urgent' WHERE is_urgent = true AND format = 'regular';

-- ── 2. Поля для торгов ───────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_start_price INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_end_time    TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_winner_id   UUID REFERENCES users(id);

-- ── 3. Таблица ставок ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_id  UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Все авторизованные видят ставки (перевозчику нужно знать текущий минимум/максимум)
CREATE POLICY "Authenticated can view bids"
  ON bids FOR SELECT USING (auth.role() = 'authenticated');

-- Перевозчик создаёт свои ставки
CREATE POLICY "Carrier can insert own bids"
  ON bids FOR INSERT WITH CHECK (auth.uid() = carrier_id);

GRANT SELECT, INSERT ON bids TO authenticated;

-- ── 4. Триггер валидации ставки ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_bid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format     TEXT;
  v_start      INTEGER;
  v_end_time   TIMESTAMPTZ;
  v_best       INTEGER;
BEGIN
  SELECT format, auction_start_price, auction_end_time
    INTO v_format, v_start, v_end_time
  FROM orders WHERE id = NEW.order_id;

  -- Торги должны быть открыты
  IF v_end_time IS NOT NULL AND v_end_time < NOW() THEN
    RAISE EXCEPTION 'auction_ended';
  END IF;

  IF v_format = 'reduction' THEN
    SELECT MIN(amount) INTO v_best FROM bids WHERE order_id = NEW.order_id;
    IF v_best IS NULL THEN v_best := v_start; END IF;
    IF v_best IS NOT NULL AND NEW.amount >= v_best THEN
      RAISE EXCEPTION 'bid_too_high:%', v_best;
    END IF;

  ELSIF v_format = 'auction' THEN
    SELECT MAX(amount) INTO v_best FROM bids WHERE order_id = NEW.order_id;
    IF v_best IS NULL THEN v_best := v_start; END IF;
    IF v_best IS NOT NULL AND NEW.amount <= v_best THEN
      RAISE EXCEPTION 'bid_too_low:%', v_best;
    END IF;

  ELSE
    RAISE EXCEPTION 'not_auction';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_bid ON bids;
CREATE TRIGGER trg_validate_bid
  BEFORE INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION validate_bid();

-- ── 5. View: текущая лучшая ставка по заявкам ────────────────────────────
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

-- ── 6. Новые типы уведомлений ─────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done',
    'order_cancelled',
    'review_request',
    'auction_won', 'auction_ended'
  ));

-- ── 7. Функция завершения торгов ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_finished_auctions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order            RECORD;
  v_winner_carrier   UUID;
  v_winner_amount    INTEGER;
BEGIN
  FOR v_order IN
    SELECT id, format, client_id
    FROM orders
    WHERE format IN ('reduction', 'auction')
      AND status = 'active'
      AND auction_end_time IS NOT NULL
      AND auction_end_time < NOW()
  LOOP
    IF v_order.format = 'reduction' THEN
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
      FROM bids WHERE order_id = v_order.id
      ORDER BY amount ASC, created_at ASC LIMIT 1;
    ELSE
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
      FROM bids WHERE order_id = v_order.id
      ORDER BY amount DESC, created_at ASC LIMIT 1;
    END IF;

    IF v_winner_carrier IS NULL THEN
      -- Нет ставок → просрочить
      UPDATE orders SET status = 'expired' WHERE id = v_order.id;
    ELSE
      UPDATE orders SET
        status              = 'matched',
        accepted_carrier_id = v_winner_carrier,
        auction_winner_id   = v_winner_carrier,
        agreed_price        = v_winner_amount
      WHERE id = v_order.id;

      INSERT INTO notifications(user_id, type, link)
      VALUES (v_winner_carrier,  'auction_won',   '/orders/' || v_order.id);

      INSERT INTO notifications(user_id, type, link)
      VALUES (v_order.client_id, 'auction_ended', '/orders/' || v_order.id);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION settle_finished_auctions() TO service_role;

-- ── 8. pg_cron: каждые 5 минут ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'settle-auctions-5min',
      '*/5 * * * *',
      'SELECT settle_finished_auctions()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
