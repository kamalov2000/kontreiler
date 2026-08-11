-- Согласование простоя: перевозчик заявляет часы, клиент подтверждает.
--
-- Простой — единственная строка реестра, которую перевозчик добавляет уже после
-- рейса, поэтому она и есть предмет спора. Порядок такой: часы вносит только
-- перевозчик, подтверждает или снимает подтверждение только клиент. Оспорил —
-- флаг снят, поле снова редактируемо перевозчиком, круг замкнулся.
--
-- Поля лежат на order_extra_services, а не на orders (как было в постановке):
-- UPDATE у orders разрешён только client_id, а часы вносит перевозчик. Заводить
-- ради этого вторую политику на самую чувствительную таблицу проекта — плохой
-- размен; здесь downtime_hours уже живёт (см. 20260808000004).

ALTER TABLE public.order_extra_services
  ADD COLUMN IF NOT EXISTS downtime_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS downtime_confirmed_at TIMESTAMPTZ;

-- RLS пускает к строке обе стороны сделки целиком — разделение «кто какое поле
-- правит» держит триггер. В UI то же самое продублировано, но полагаться на UI
-- в вопросе денег нельзя.
CREATE OR REPLACE FUNCTION public.guard_downtime_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client  UUID;
  v_carrier UUID;
  v_uid     UUID := auth.uid();
BEGIN
  SELECT o.client_id, o.accepted_carrier_id INTO v_client, v_carrier
  FROM public.orders o WHERE o.id = NEW.order_id;

  IF TG_OP = 'UPDATE' THEN
    -- Проверки прав — только для запросов от пользователя. Сервер (service_role,
    -- крон) правит без ограничений: auth.uid() там пуст. Правила ниже про
    -- целостность данных действуют для всех, включая сервер.
    IF v_uid IS NOT NULL THEN
      -- Часы и ставку простоя правит только перевозчик.
      IF (NEW.downtime_hours IS DISTINCT FROM OLD.downtime_hours
          OR NEW.downtime_rate IS DISTINCT FROM OLD.downtime_rate)
         AND v_uid IS DISTINCT FROM v_carrier THEN
        RAISE EXCEPTION 'Простой заявляет перевозчик' USING ERRCODE = '42501';
      END IF;

      -- Подтверждает и оспаривает только клиент.
      IF NEW.downtime_confirmed IS DISTINCT FROM OLD.downtime_confirmed
         AND v_uid IS DISTINCT FROM v_client THEN
        RAISE EXCEPTION 'Простой подтверждает заказчик' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Изменились цифры — согласие клиента к ним больше не относится.
    IF NEW.downtime_hours IS DISTINCT FROM OLD.downtime_hours
       OR NEW.downtime_rate IS DISTINCT FROM OLD.downtime_rate THEN
      NEW.downtime_confirmed := FALSE;
    END IF;
  ELSE
    -- Первая запись подтверждённой быть не может: подтверждать ещё нечего.
    IF v_uid IS NOT NULL AND NEW.downtime_confirmed AND v_uid IS DISTINCT FROM v_client THEN
      NEW.downtime_confirmed := FALSE;
    END IF;
  END IF;

  NEW.downtime_confirmed_at := CASE WHEN NEW.downtime_confirmed THEN
    COALESCE(CASE WHEN TG_OP = 'UPDATE' AND OLD.downtime_confirmed THEN OLD.downtime_confirmed_at END, NOW())
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_downtime_confirmation ON public.order_extra_services;
CREATE TRIGGER trg_downtime_confirmation
  BEFORE INSERT OR UPDATE ON public.order_extra_services
  FOR EACH ROW EXECUTE FUNCTION public.guard_downtime_confirmation();

COMMENT ON COLUMN public.order_extra_services.downtime_confirmed IS
  'Клиент согласился с заявленными часами простоя. Снимается автоматически при любой правке часов или ставки.';
