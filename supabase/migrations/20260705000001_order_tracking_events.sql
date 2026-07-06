-- История этапов трекинга рейса.
--
-- Раньше в orders хранился только текущий этап (tracking_status) и одна метка
-- времени (tracking_updated_at) — поэтому в хронологии было видно время лишь у
-- текущего шага. Эта таблица фиксирует КАЖДЫЙ пройденный этап с датой/временем,
-- чтобы логисты клиента могли зафиксировать факт прибытия по каждой точке.
-- Записи создаёт только сервер (service_role) из /api/orders/tracking.

CREATE TABLE IF NOT EXISTS public.order_tracking_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  step       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_order
  ON public.order_tracking_events(order_id, created_at);

ALTER TABLE public.order_tracking_events ENABLE ROW LEVEL SECURITY;

-- Читают только участники сделки: владелец заявки или принятый перевозчик.
DROP POLICY IF EXISTS "trip participants read tracking events" ON public.order_tracking_events;
CREATE POLICY "trip participants read tracking events" ON public.order_tracking_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.client_id = auth.uid() OR o.accepted_carrier_id = auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE клиентам закрыты (нет политик) — пишет только сервер через service_role.
GRANT SELECT ON public.order_tracking_events TO authenticated;
GRANT ALL    ON public.order_tracking_events TO service_role;

-- Бэкфилл: у рейсов, уже находящихся в пути, зафиксируем хотя бы текущий этап
-- по имеющейся метке tracking_updated_at (историю прошлых шагов восстановить нельзя).
INSERT INTO public.order_tracking_events (order_id, step, created_at)
SELECT id, tracking_status, COALESCE(tracking_updated_at, now())
FROM public.orders
WHERE tracking_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_tracking_events e WHERE e.order_id = orders.id
  );

-- Для уже доставленных рейсов добавим финальную отметку «контейнер сдан».
INSERT INTO public.order_tracking_events (order_id, step, created_at)
SELECT id, 'delivered', COALESCE(tracking_updated_at, now())
FROM public.orders
WHERE status = 'delivered' AND tracking_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_tracking_events e WHERE e.order_id = orders.id AND e.step = 'delivered'
  );
