-- ════════════════════════════════════════════════════════════════════════
-- ПРОД-МИГРАЦИЯ 2026-07-28 — данные водителя и ТС + блокировка документов
-- Применять на проде одним куском (идемпотентно). Соответствует файлу:
--   supabase/migrations/20260728000001_driver_info_and_doc_fields.sql
--
-- Все изменения аддитивные: старый фронт от них не ломается.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Данные водителя и ТС ─────────────────────────────────────────────

ALTER TABLE public.order_driver_info ADD COLUMN IF NOT EXISTS driver_phone  TEXT;
ALTER TABLE public.order_driver_info ADD COLUMN IF NOT EXISTS passport_data TEXT;
ALTER TABLE public.order_driver_info ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ФИО водителя, госномер тягача и телефон водителя обязательны — без них клиенту
-- не отдаются документы. NOT NULL поставить нельзя: строки, заполненные до этой
-- правки, телефона не содержат. NOT VALID = обязателен для всех новых и
-- изменяемых строк, старые не трогает.
ALTER TABLE public.order_driver_info DROP CONSTRAINT IF EXISTS order_driver_info_required_chk;
ALTER TABLE public.order_driver_info ADD CONSTRAINT order_driver_info_required_chk
  CHECK (
    COALESCE(BTRIM(driver_name),  '') <> '' AND
    COALESCE(BTRIM(vehicle_plate), '') <> '' AND
    COALESCE(BTRIM(driver_phone),  '') <> ''
  ) NOT VALID;

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

-- ── 2. Общие поля документов на заявке ──────────────────────────────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cargo_name             TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS container_number       TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sender_contact_phone   TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receiver_contact_phone TEXT;

-- ── 3. Баннер «данные водителя изменены» ────────────────────────────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_info_seen BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 4. Починка триггера отмены ──────────────────────────────────────────

-- Проверялся только НОВЫЙ статус, поэтому любой апдейт уже отменённой заявки
-- слал перевозчику повторное «заявка отменена». Теперь на отменённую заявку
-- пишутся поля документов — добавляем проверку прежнего статуса.
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

-- ── 5. Уведомление о замене водителя ────────────────────────────────────

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
