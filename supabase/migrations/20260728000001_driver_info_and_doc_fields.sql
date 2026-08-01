-- Блок «Данные по водителю и ТС» + блокировка скачивания документов.
--
-- 1) order_driver_info расширяется до полного набора для договора-заявки и ТН:
--    телефон водителя и паспортные данные (в интерфейсе паспорт НЕ показываем —
--    только в PDF), плюс updated_at, чтобы видеть момент замены водителя.
-- 2) orders получает поля документов, которые клиент дозаполняет один раз при
--    первом скачивании договора-заявки. Наименование груза и номер контейнера
--    подтягиваются и в ТН; телефоны контактных лиц — только в договор-заявку:
--    в бланке Приложения № 4 отдельной строки под них нет (при необходимости
--    их вписывают в реквизиты разделов 1 и 2 вручную).
-- 3) driver_info_seen — флаг «клиент видел последнюю замену водителя». Гасит
--    баннер «данные изменены, скачайте документы заново».

-- ── 1. Данные водителя и ТС ──────────────────────────────────────────────────

ALTER TABLE public.order_driver_info ADD COLUMN IF NOT EXISTS driver_phone  TEXT;
ALTER TABLE public.order_driver_info ADD COLUMN IF NOT EXISTS passport_data TEXT;
ALTER TABLE public.order_driver_info ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ФИО водителя, госномер тягача и телефон водителя обязательны — без них клиенту
-- не отдаются документы. NOT NULL на колонках поставить нельзя: таблица уже живёт
-- на проде и строки, заполненные до этой правки, телефона не содержат. Поэтому —
-- CHECK ... NOT VALID: он обязателен для всех новых и изменяемых строк, а старые
-- остаются как есть (и дозаполняются при первом же редактировании).
ALTER TABLE public.order_driver_info DROP CONSTRAINT IF EXISTS order_driver_info_required_chk;
ALTER TABLE public.order_driver_info ADD CONSTRAINT order_driver_info_required_chk
  CHECK (
    COALESCE(BTRIM(driver_name),  '') <> '' AND
    COALESCE(BTRIM(vehicle_plate), '') <> '' AND
    COALESCE(BTRIM(driver_phone),  '') <> ''
  ) NOT VALID;

-- updated_at сам по себе не обновляется — заменa водителя должна его двигать.
CREATE OR REPLACE FUNCTION public.touch_order_driver_info()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_driver_info_touch ON public.order_driver_info;
CREATE TRIGGER trg_order_driver_info_touch
  BEFORE UPDATE ON public.order_driver_info
  FOR EACH ROW EXECUTE FUNCTION public.touch_order_driver_info();

-- ── 2. Общие поля документов на заявке ───────────────────────────────────────

-- Наименование груза и номер контейнера → раздел 3 договора-заявки и ТН.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cargo_name            TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS container_number      TEXT;
-- Телефоны контактных лиц → раздел 2 договора-заявки (под пунктами отправления
-- и выгрузки). Телефон отправителя по умолчанию берётся из профиля клиента.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sender_contact_phone   TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receiver_contact_phone TEXT;

-- ── 3. Баннер «данные водителя изменены» ─────────────────────────────────────

-- TRUE = показывать нечего. Сбрасывается в FALSE сервером при замене водителя
-- (перевозчик по RLS заявку править не может), обратно в TRUE — клиентом,
-- когда он закрывает баннер крестиком.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_info_seen BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 4. Починка триггера отмены ───────────────────────────────────────────────

-- Первая ветка проверяла только НОВЫЙ статус, поэтому ЛЮБОЙ апдейт уже отменённой
-- заявки слал перевозчику повторное «заявка отменена». Раньше на отменённую заявку
-- почти ничего не писалось, теперь пишется (поля документов, флаг баннера) — добавляем
-- проверку прежнего статуса, чтобы уведомление уходило один раз, на самом переходе.
CREATE OR REPLACE FUNCTION public.notify_order_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled'
     AND OLD.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (OLD.accepted_carrier_id, 'order_cancelled', '/my-responses');
  END IF;
  IF OLD.status = 'matched' AND NEW.status = 'active' AND OLD.accepted_carrier_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, type, link)
    VALUES (OLD.accepted_carrier_id, 'order_cancelled', '/my-responses');
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. Уведомление о замене водителя ─────────────────────────────────────────

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done',
    'order_cancelled',
    'order_changed',
    'driver_info_changed',
    'review_request',
    'auction_won', 'auction_ended'
  ));
