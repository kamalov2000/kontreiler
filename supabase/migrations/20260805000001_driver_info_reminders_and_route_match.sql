-- Напоминания перевозчику внести данные водителя/ТС + уведомления по
-- сохранённым маршрутам.
--
-- 1) matched_at + счётчик напоминаний на orders — чтобы cron знал, когда
--    перевозчика приняли и сколько напоминаний уже отправлено.
-- 2) response_accepted теперь несёт message: сразу при принятии перевозчику
--    явно говорят, что документы клиенту недоступны без данных водителя (для
--    regular/urgent — торги/редукцион этим гейтом не связаны).
-- 3) send_driver_info_reminders() — pg_cron-функция по аналогии с
--    expire_overdue_orders/settle_finished_auctions: раз в 15 минут проверяет,
--    у кого истекли 3ч (первое напоминание) или 12ч с первого (второе,
--    последнее — дальше не спамим). Уведомление в notifications пишет сама
--    функция (как везде); письмо шлёт отдельный API-роут, потому что Postgres
--    не может дёрнуть Resend напрямую — функция вызывает его через pg_net.
-- 4) 'route_match' — тип уведомления для /api/orders/route-match (см. код).

-- ── 1. Момент матча + счётчик напоминаний ────────────────────────────────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_info_reminder_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_info_reminder_last_sent_at TIMESTAMPTZ;

-- matched_at фиксируется в момент, когда accepted_carrier_id становится
-- заполненным — первый accept, «Перевыбрать» или ручной выбор победителя
-- торгов. Счётчик напоминаний сбрасывается при каждом новом матче: у нового
-- перевозчика — свои 3ч/12ч с нуля.
CREATE OR REPLACE FUNCTION public.set_order_matched_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.accepted_carrier_id IS NOT NULL
     AND NEW.accepted_carrier_id IS DISTINCT FROM OLD.accepted_carrier_id THEN
    NEW.matched_at := NOW();
    NEW.driver_info_reminder_count := 0;
    NEW.driver_info_reminder_last_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_matched_at ON public.orders;
CREATE TRIGGER trg_set_order_matched_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_matched_at();

-- ── 2. Новые типы уведомлений ─────────────────────────────────────────────────

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done',
    'order_cancelled',
    'order_changed',
    'driver_info_changed', 'driver_info_reminder',
    'review_request',
    'auction_won', 'auction_ended',
    'route_match'
  ));

-- ── 3. response_accepted: явный текст про блокировку документов ─────────────

CREATE OR REPLACE FUNCTION notify_response_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.accepted_carrier_id IS NULL AND NEW.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link, message)
    VALUES (
      NEW.accepted_carrier_id,
      'response_accepted',
      '/orders/' || NEW.id || '/chat',
      CASE WHEN NEW.format IN ('regular', 'urgent')
        THEN 'Клиент не сможет оформить документы, пока вы не внесёте данные по водителю и транспортному средству'
        ELSE NULL
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Напоминания о данных водителя (pg_cron + pg_net) ──────────────────────
--
-- pg_net нужен, чтобы функция могла дёрнуть /api/cron/driver-info-reminders и
-- отправить письмо через Resend (Postgres сам письма не шлёт — все остальные
-- письма в проекте тоже уходят только из Next.js API-роутов). На хостинге
-- Supabase pg_net обычно уже доступен как расширение.
--
-- ВАЖНО — ручной шаг перед первым запуском (секрет нельзя коммитить в
-- миграцию): выполнить один раз на проде под своим случайным значением и
-- задать то же значение в переменной окружения CRON_SECRET на Vercel:
--   select vault.create_secret('<ваш-случайный-секрет>', 'cron_secret');
-- Если секрет не задан — cron всё равно исправно пишет уведомления в
-- notifications (надёжный канал), только письмо тогда не уйдёт (эндпоинт
-- ответит 401) — деградация в духе остального проекта (см. RESEND_API_KEY).

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.send_driver_info_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order  RECORD;
  v_batch  JSONB := '[]'::jsonb;
  v_secret TEXT;
BEGIN
  FOR v_order IN
    SELECT o.id, o.accepted_carrier_id
    FROM public.orders o
    WHERE o.format IN ('regular', 'urgent')
      AND o.status IN ('matched', 'in_transit')
      AND o.accepted_carrier_id IS NOT NULL
      AND o.matched_at IS NOT NULL
      AND o.driver_info_reminder_count < 2
      AND NOT EXISTS (
        SELECT 1 FROM public.order_driver_info di
        WHERE di.order_id = o.id
          AND COALESCE(BTRIM(di.driver_name),  '') <> ''
          AND COALESCE(BTRIM(di.vehicle_plate), '') <> ''
          AND COALESCE(BTRIM(di.driver_phone),  '') <> ''
      )
      AND (
        (o.driver_info_reminder_count = 0 AND o.matched_at                        < NOW() - INTERVAL '3 hours')
        OR
        (o.driver_info_reminder_count = 1 AND o.driver_info_reminder_last_sent_at < NOW() - INTERVAL '12 hours')
      )
  LOOP
    INSERT INTO notifications(user_id, type, link, message)
    VALUES (
      v_order.accepted_carrier_id,
      'driver_info_reminder',
      '/orders/' || v_order.id,
      'Клиент не сможет оформить документы, пока вы не внесёте данные по водителю и транспортному средству'
    );

    UPDATE public.orders
      SET driver_info_reminder_count = driver_info_reminder_count + 1,
          driver_info_reminder_last_sent_at = NOW()
      WHERE id = v_order.id;

    v_batch := v_batch || jsonb_build_object('orderId', v_order.id, 'carrierId', v_order.accepted_carrier_id);
  END LOOP;

  IF jsonb_array_length(v_batch) = 0 THEN
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;

  PERFORM net.http_post(
    url     := 'https://kontreiler.vercel.app/api/cron/driver-info-reminders',
    body    := jsonb_build_object('orders', v_batch),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', COALESCE(v_secret, ''))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_driver_info_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('driver-info-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('driver-info-reminders', '*/15 * * * *', 'SELECT public.send_driver_info_reminders()');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
