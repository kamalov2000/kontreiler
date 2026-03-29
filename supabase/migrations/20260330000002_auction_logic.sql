-- Обновлённая validate_bid: шаг торгов + мин/макс цена
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

DROP TRIGGER IF EXISTS trg_validate_bid ON bids;
CREATE TRIGGER trg_validate_bid
  BEFORE INSERT ON bids
  FOR EACH ROW EXECUTE FUNCTION validate_bid();

-- Обновлённая функция завершения торгов
-- Учитывает: auction_auto_winner, auction_auto_extend, auction_step (валидация)
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

    -- Определяем победителя
    IF v_order.format = 'reduction' THEN
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
        FROM bids WHERE order_id = v_order.id ORDER BY amount ASC,  created_at ASC  LIMIT 1;
    ELSE
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
        FROM bids WHERE order_id = v_order.id ORDER BY amount DESC, created_at ASC  LIMIT 1;
    END IF;

    IF v_winner_carrier IS NULL THEN
      -- Нет ставок: автопродление на 1 час если включено
      IF v_order.auction_auto_extend THEN
        UPDATE orders
          SET auction_end_time = NOW() + interval '1 hour'
          WHERE id = v_order.id;
      ELSE
        UPDATE orders SET status = 'expired' WHERE id = v_order.id;
      END IF;

    ELSIF v_order.auction_auto_winner THEN
      -- Есть победитель и включён автовыбор
      UPDATE orders SET
        status              = 'matched',
        accepted_carrier_id = v_winner_carrier,
        auction_winner_id   = v_winner_carrier,
        agreed_price        = v_winner_amount
      WHERE id = v_order.id;

      INSERT INTO notifications (user_id, type, link)
        VALUES (v_winner_carrier, 'auction_won', '/orders/' || v_order.id);

    ELSE
      -- Есть победитель, но автовыбор выключен — просто закрываем торги
      -- Клиент увидит лучшую ставку и выберет вручную
      UPDATE orders SET status = 'closed' WHERE id = v_order.id;
    END IF;

  END LOOP;
END;
$$;
