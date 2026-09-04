-- Действие «взять гружёный» — импортный круг.
--
-- Изначально набор действий описывал экспорт: взял порожний на терминале →
-- погрузился на складе → сдал. Но импорт ходит наоборот: контейнер приезжает в
-- порт уже гружёным, перевозчик забирает его гружёным и везёт на склад под
-- выгрузку. Без этого действия начало импортного круга описать было нечем.
--
-- Заодно это меняет разделы накладной: точка «взять гружёный» — это и есть
-- приём груза (раздел 8), а «сдать гружёный» — его выдача (раздел 10).
-- Порожние терминалы (pickup_empty, dropoff_empty) в эти разделы не идут:
-- груза в контейнере нет.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_from_container_action_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_from_container_action_check CHECK (from_container_action IN ('pickup_empty','pickup_loaded','load','unload','dropoff_empty','dropoff_loaded'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_via_container_action_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_via_container_action_check CHECK (via_container_action IN ('pickup_empty','pickup_loaded','load','unload','dropoff_empty','dropoff_loaded'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_to_container_action_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_to_container_action_check CHECK (to_container_action IN ('pickup_empty','pickup_loaded','load','unload','dropoff_empty','dropoff_loaded'));

ALTER TABLE public.order_stops DROP CONSTRAINT IF EXISTS order_stops_container_action_check;
ALTER TABLE public.order_stops ADD CONSTRAINT order_stops_container_action_check CHECK (container_action IN ('pickup_empty','pickup_loaded','load','unload','dropoff_empty','dropoff_loaded'));
