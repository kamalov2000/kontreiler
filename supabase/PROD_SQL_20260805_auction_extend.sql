-- ════════════════════════════════════════════════════════════════════════
-- ПРОД-МИГРАЦИЯ 2026-08-05 (2) — потолок автопродления торгов
-- Применять на проде одним куском (идемпотентно). Соответствует файлу:
--   supabase/migrations/20260805000002_auction_extend_limit.sql
--
-- Дополнительно (только в этом файле, не в миграции): разовый прогон семи
-- торгов, зависших в бесконечном продлении.
-- ════════════════════════════════════════════════════════════════════════

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

    IF v_order.format = 'reduction' THEN
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
        FROM bids WHERE order_id = v_order.id ORDER BY amount ASC,  created_at ASC  LIMIT 1;
    ELSE
      SELECT carrier_id, amount INTO v_winner_carrier, v_winner_amount
        FROM bids WHERE order_id = v_order.id ORDER BY amount DESC, created_at ASC  LIMIT 1;
    END IF;

    IF v_winner_carrier IS NULL THEN
      IF v_order.auction_auto_extend AND v_order.auction_extend_count < 3 THEN
        UPDATE orders
          SET auction_end_time  = NOW() + interval '1 hour',
              auction_extend_count = auction_extend_count + 1
          WHERE id = v_order.id;
      ELSIF v_order.auction_auto_extend THEN
        UPDATE orders SET status = 'cancelled' WHERE id = v_order.id;
        INSERT INTO notifications(user_id, type, link, message)
        VALUES (
          v_order.client_id,
          'auction_ended',
          '/orders/' || v_order.id,
          'Торги не состоялись — никто не сделал ставку'
        );
      ELSE
        UPDATE orders SET status = 'expired' WHERE id = v_order.id;
      END IF;

    ELSIF v_order.auction_auto_winner THEN
      UPDATE orders SET
        status              = 'matched',
        accepted_carrier_id = v_winner_carrier,
        auction_winner_id   = v_winner_carrier,
        agreed_price        = v_winner_amount
      WHERE id = v_order.id;

      INSERT INTO notifications (user_id, type, link)
        VALUES (v_winner_carrier, 'auction_won', '/orders/' || v_order.id);

    ELSE
      UPDATE orders SET status = 'closed' WHERE id = v_order.id;
    END IF;

  END LOOP;
END;
$$;

-- ── Разовый прогон зависших торгов ──────────────────────────────────────
--
-- Семь торгов без ставок болтались в бесконечном продлении месяцами — свой
-- лимит они давно исчерпали. Проставляем им счётчик на потолок и возвращаем
-- auction_end_time в прошлое, чтобы функция подхватила их прямо сейчас и
-- закрыла штатной логикой (а не отдельным ручным UPDATE).

UPDATE public.orders
  SET auction_extend_count = 3,
      auction_end_time     = NOW() - interval '1 minute'
  WHERE format IN ('reduction', 'auction')
    AND status = 'active'
    AND auction_auto_extend
    AND auction_end_time > NOW()
    AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.order_id = orders.id);

SELECT public.settle_finished_auctions();
