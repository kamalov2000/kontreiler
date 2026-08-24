-- Типизация точек маршрута — ради верных адресов в электронной транспортной
-- накладной.
--
-- До этого маршрут был просто тремя городами, и накладная слепо ставила первую
-- точку в раздел 8 «Приём груза», последнюю — в раздел 10 «Выдача груза».
-- В контейнерном кругорейсе это неверно: первая точка — терминал выдачи
-- порожняка, где груз никто не принимал, последняя — терминал сдачи, где груз
-- давно выгружен.
--
-- Оба поля необязательные. Незаполненная точка = прежнее поведение накладной,
-- поэтому миграция ничего не ломает у старых заявок.
--
--   point_kind        — что за место: terminal | warehouse
--   container_action  — что делают с контейнером:
--                       pickup_empty   взять порожний
--                       load           погрузка
--                       unload         выгрузка
--                       dropoff_empty  сдать порожний
--                       dropoff_loaded сдать гружёный

-- ── Три основные точки заявки ────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS from_point_kind       TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS from_container_action TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS via_point_kind        TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS via_container_action  TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS to_point_kind         TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS to_container_action   TEXT;

-- Проверки отдельными констрейнтами на колонку: так по имени в ошибке сразу
-- видно, какая именно точка приехала с мусором.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_from_point_kind_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_from_point_kind_check CHECK (from_point_kind IN ('terminal','warehouse'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_via_point_kind_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_via_point_kind_check CHECK (via_point_kind IN ('terminal','warehouse'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_to_point_kind_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_to_point_kind_check CHECK (to_point_kind IN ('terminal','warehouse'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_from_container_action_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_from_container_action_check CHECK (from_container_action IN ('pickup_empty','load','unload','dropoff_empty','dropoff_loaded'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_via_container_action_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_via_container_action_check CHECK (via_container_action IN ('pickup_empty','load','unload','dropoff_empty','dropoff_loaded'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_to_container_action_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_to_container_action_check CHECK (to_container_action IN ('pickup_empty','load','unload','dropoff_empty','dropoff_loaded'));

-- ── Дополнительные точки ─────────────────────────────────────────────────
ALTER TABLE public.order_stops ADD COLUMN IF NOT EXISTS point_kind       TEXT;
ALTER TABLE public.order_stops ADD COLUMN IF NOT EXISTS container_action TEXT;

ALTER TABLE public.order_stops DROP CONSTRAINT IF EXISTS order_stops_point_kind_check;
ALTER TABLE public.order_stops ADD CONSTRAINT order_stops_point_kind_check CHECK (point_kind IN ('terminal','warehouse'));
ALTER TABLE public.order_stops DROP CONSTRAINT IF EXISTS order_stops_container_action_check;
ALTER TABLE public.order_stops ADD CONSTRAINT order_stops_container_action_check CHECK (container_action IN ('pickup_empty','load','unload','dropoff_empty','dropoff_loaded'));
