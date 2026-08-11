-- Дополнительные услуги по рейсу: простой и перегруз.
--
-- Сумма после подписания не меняется — растёт только за счёт допуслуг, поэтому
-- в реестре они идут отдельными колонками, а итог считается по ставке с их
-- учётом. Значения вносятся вручную обеими сторонами после рейса: простой —
-- предмет согласования, автоматически из трекинга его не считаем.
--
-- Отдельной таблицей, а не колонками на orders: политика UPDATE у orders —
-- только client_id, перевозчик заявку не правит вовсе. А эти поля заполняет
-- любая из сторон сделки (как в order_driver_info).

CREATE TABLE IF NOT EXISTS public.order_extra_services (
  order_id        UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Согласованная ставка простоя. Подставляется из orders.downtime_rate, но
  -- хранится здесь: у большинства заявок она не заполнена при создании, а
  -- править orders перевозчик не может.
  downtime_rate   INTEGER,
  downtime_hours  NUMERIC(7,2),
  overweight_rate INTEGER,   -- ₽ за сверхнормативную тонну
  overweight_tons NUMERIC(7,2),
  updated_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_extra_services_nonneg CHECK (
    COALESCE(downtime_rate, 0)   >= 0 AND
    COALESCE(downtime_hours, 0)  >= 0 AND
    COALESCE(overweight_rate, 0) >= 0 AND
    COALESCE(overweight_tons, 0) >= 0
  )
);

ALTER TABLE public.order_extra_services ENABLE ROW LEVEL SECURITY;

-- Читают и правят обе стороны сделки. Статус (delivered/closed) держит интерфейс:
-- в RLS его не зашиваем, чтобы возврат статуса назад не ломал уже внесённые суммы.
DROP POLICY IF EXISTS extra_services_select ON public.order_extra_services;
CREATE POLICY extra_services_select ON public.order_extra_services FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.client_id = auth.uid() OR o.accepted_carrier_id = auth.uid())));

DROP POLICY IF EXISTS extra_services_insert ON public.order_extra_services;
CREATE POLICY extra_services_insert ON public.order_extra_services FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.client_id = auth.uid() OR o.accepted_carrier_id = auth.uid())));

DROP POLICY IF EXISTS extra_services_update ON public.order_extra_services;
CREATE POLICY extra_services_update ON public.order_extra_services FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.client_id = auth.uid() OR o.accepted_carrier_id = auth.uid())));

GRANT SELECT, INSERT, UPDATE ON public.order_extra_services TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_order_extra_services()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_extra_services_touch ON public.order_extra_services;
CREATE TRIGGER trg_order_extra_services_touch
  BEFORE UPDATE ON public.order_extra_services
  FOR EACH ROW EXECUTE FUNCTION public.touch_order_extra_services();
