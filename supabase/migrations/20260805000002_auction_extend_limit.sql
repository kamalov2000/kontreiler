-- Потолок автопродления торгов.
--
-- Баг: ветка «нет ставок + auction_auto_extend» в settle_finished_auctions()
-- двигала auction_end_time на час вперёд без всякого предела. Торг, на который
-- никто не сделал ставку, продлевался вечно: висел в 'active', не завершался,
-- а cron каждые 5 минут делал бессмысленный UPDATE. Проявилось только сейчас,
-- потому что до 2026-08-05 джоба settle-auctions-5min на проде вообще не была
-- запланирована (pg_cron не был установлен, блок за IF EXISTS молча пропускался).
--
-- Правило: не более 3 продлений. После третьего торг без ставок закрывается
-- статусом 'cancelled', клиент получает уведомление, что торги не состоялись.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auction_extend_count SMALLINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.settle_finished_auctions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
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
      -- Нет ставок. Продлеваем на час, но не более 3 раз подряд — иначе торг
      -- без ставок никогда не завершится.
      IF v_order.auction_auto_extend AND v_order.auction_extend_count < 3 THEN
        UPDATE orders
          SET auction_end_time  = NOW() + interval '1 hour',
              auction_extend_count = auction_extend_count + 1
          WHERE id = v_order.id;
      ELSIF v_order.auction_auto_extend THEN
        -- Лимит продлений исчерпан — торги не состоялись.
        UPDATE orders SET status = 'cancelled' WHERE id = v_order.id;
        INSERT INTO notifications(user_id, type, link, message)
        VALUES (
          v_order.client_id,
          'auction_ended',
          '/orders/' || v_order.id,
          'Торги не состоялись — никто не сделал ставку'
        );
      ELSE
        -- Автопродление выключено — прежнее поведение, просто просрочка.
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
      -- Есть победитель, но автовыбор выключен — закрываем торги, победителя
      -- клиент выбирает вручную из списка ставок на странице заявки.
      UPDATE orders SET status = 'closed' WHERE id = v_order.id;
    END IF;

  END LOOP;
END;
$$;
