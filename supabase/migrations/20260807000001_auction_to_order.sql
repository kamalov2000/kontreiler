-- Перенос завершённых торгов в обычную заявку.
--
-- Клиент создаёт по результатам торгов заявку формата regular, где победитель
-- сразу проставлен принятым перевозчиком. Дальше по ней идёт штатный
-- документооборот (договор-заявка, ТН) и она попадает в реестр перевозок —
-- сами торги в реестр не входят.

-- ── 1. Связь заявки с исходными торгами ─────────────────────────────────────
-- Нужна и для истории («создано по результатам А-00012»), и чтобы кнопка
-- переноса не давала создать вторую заявку по тем же торгам.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_auction_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_source_auction
  ON public.orders(source_auction_id)
  WHERE source_auction_id IS NOT NULL;

-- ── 2. matched_at должен ставиться и при INSERT ─────────────────────────────
-- Раньше перевозчик появлялся на заявке только через UPDATE (клиент принимал
-- отклик), поэтому триггер висел на BEFORE UPDATE. Заявка из торгов рождается
-- уже с accepted_carrier_id — без этой правки matched_at остался бы NULL, и
-- send_driver_info_reminders() никогда не напомнил бы о данных водителя
-- (она отсчитывает 3 и 12 часов именно от matched_at).
CREATE OR REPLACE FUNCTION public.set_order_matched_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.accepted_carrier_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.accepted_carrier_id IS DISTINCT FROM OLD.accepted_carrier_id) THEN
    NEW.matched_at := NOW();
    NEW.driver_info_reminder_count := 0;
    NEW.driver_info_reminder_last_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_matched_at ON public.orders;
CREATE TRIGGER trg_set_order_matched_at
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_matched_at();

-- ── 3. Уведомление перевозчику — тоже и при INSERT ──────────────────────────
-- Иначе победитель торгов не узнает о созданной по ним заявке: в ленте её нет
-- (она уже занята), отклика он не оставлял, а ссылка на заявку приходит именно
-- этим уведомлением.
CREATE OR REPLACE FUNCTION notify_response_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.accepted_carrier_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.accepted_carrier_id IS NULL) THEN
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

DROP TRIGGER IF EXISTS trg_notify_response_accepted ON public.orders;
CREATE TRIGGER trg_notify_response_accepted
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION notify_response_accepted();
