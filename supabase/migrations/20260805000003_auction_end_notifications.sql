-- Уведомления клиенту во ВСЕХ ветках завершения торгов.
--
-- Было: из четырёх исходов торга клиент узнавал только об одном
-- (несостоявшиеся торги, добавлено в 20260805000002). Две ветки молчали:
--
--   • нет ставок + автопродление выключено → 'expired', тишина;
--   • есть ставки + автовыбор выключен     → 'closed',  тишина.
--
-- Вторая — хуже: именно в ней клиент ОБЯЗАН зайти и выбрать победителя
-- руками из списка ставок, иначе заявка так и висит закрытой. Кнопка
-- «Выбрать победителем» на /orders/[id] есть, но раньше о ней никто не
-- сообщал — сделка молча замирала.
--
-- Тип уведомления везде 'auction_ended' (уже в notifications_type_check,
-- в NotificationBell отрисован как «Торги завершены»), различие — в message.

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
      -- Ставок нет ни одной.
      IF v_order.auction_auto_extend AND v_order.auction_extend_count < 3 THEN
        -- Продлеваем, но не более 3 раз — иначе торг без ставок висит вечно.
        UPDATE orders
          SET auction_end_time     = NOW() + interval '1 hour',
              auction_extend_count = auction_extend_count + 1
          WHERE id = v_order.id;

      ELSIF v_order.auction_auto_extend THEN
        -- Лимит продлений исчерпан.
        UPDATE orders SET status = 'cancelled' WHERE id = v_order.id;
        INSERT INTO notifications(user_id, type, link, message)
        VALUES (v_order.client_id, 'auction_ended', '/orders/' || v_order.id,
                'Торги не состоялись — никто не сделал ставку');

      ELSE
        -- Автопродление выключено: срок вышел, ставок не поступило.
        UPDATE orders SET status = 'expired' WHERE id = v_order.id;
        INSERT INTO notifications(user_id, type, link, message)
        VALUES (v_order.client_id, 'auction_ended', '/orders/' || v_order.id,
                'Торги завершены — ставок не поступило. Заявку можно переоткрыть или создать заново');
      END IF;

    ELSIF v_order.auction_auto_winner THEN
      -- Есть победитель, автовыбор включён — назначаем сами.
      UPDATE orders SET
        status              = 'matched',
        accepted_carrier_id = v_winner_carrier,
        auction_winner_id   = v_winner_carrier,
        agreed_price        = v_winner_amount
      WHERE id = v_order.id;

      INSERT INTO notifications (user_id, type, link)
        VALUES (v_winner_carrier, 'auction_won', '/orders/' || v_order.id);

      INSERT INTO notifications (user_id, type, link, message)
        VALUES (v_order.client_id, 'auction_ended', '/orders/' || v_order.id,
                'Торги завершены — победитель определён автоматически');

    ELSE
      -- Есть ставки, но автовыбор выключен: победителя клиент выбирает сам.
      -- Без этого уведомления заявка молча зависает в 'closed'.
      UPDATE orders SET status = 'closed' WHERE id = v_order.id;
      INSERT INTO notifications (user_id, type, link, message)
        VALUES (v_order.client_id, 'auction_ended', '/orders/' || v_order.id,
                'Торги завершены — выберите победителя из списка ставок');
    END IF;

  END LOOP;
END;
$$;
