-- Данные водителя и транспортного средства по заявке.
-- Нужны для транспортной накладной (ТН): разделы 6, 7, 8, 10, 12.
-- Заполняет перевозчик после того, как клиент его принял (status = matched).
-- Все поля, кроме связи с заявкой, необязательны — перевозчик может пропустить
-- модалку и дозаполнить позже кнопкой «Добавить данные водителя».

CREATE TABLE IF NOT EXISTS public.order_driver_info (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_name   TEXT,
  vehicle_brand TEXT,
  vehicle_plate TEXT,
  trailer_plate TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Одна строка на заявку: перевозчик редактирует её, а не плодит дубли.
  CONSTRAINT order_driver_info_order_uniq UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_driver_info_order ON public.order_driver_info(order_id);

ALTER TABLE public.order_driver_info ENABLE ROW LEVEL SECURITY;

-- Читают обе стороны сделки: клиент-владелец заявки и принятый перевозчик.
DROP POLICY IF EXISTS "driver_info_select_participants" ON public.order_driver_info;
CREATE POLICY "driver_info_select_participants" ON public.order_driver_info
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.client_id = auth.uid() OR o.accepted_carrier_id = auth.uid())));

-- Создаёт только принятый перевозчик и только по своей заявке.
DROP POLICY IF EXISTS "driver_info_insert_carrier" ON public.order_driver_info;
CREATE POLICY "driver_info_insert_carrier" ON public.order_driver_info
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.accepted_carrier_id = auth.uid()));

-- Правит тоже только он (заменить водителя/машину до подачи).
DROP POLICY IF EXISTS "driver_info_update_carrier" ON public.order_driver_info;
CREATE POLICY "driver_info_update_carrier" ON public.order_driver_info
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.accepted_carrier_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.accepted_carrier_id = auth.uid()));

-- На проде гранты выдаёт платформа Supabase, но на свежем db reset их нет
-- (см. 20260701000002_grants.sql) — выдаём явно.
GRANT SELECT, INSERT, UPDATE ON public.order_driver_info TO authenticated;
GRANT ALL ON public.order_driver_info TO service_role;
