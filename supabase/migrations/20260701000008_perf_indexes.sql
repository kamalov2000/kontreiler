-- Индексы под горячие пути чтения. До этого на orders/responses/reviews
-- по этим фильтрам шёл seq scan (были только PK и unique-constraints).
-- Готовим к росту нагрузки; на текущем объёме данных блокировка построения ничтожна.

-- Лента (/feed) и торги (/auctions): WHERE status='active' ORDER BY is_urgent DESC, created_at DESC.
-- Частичный индекс — только по активным заявкам, отдаёт уже отсортированный результат без sort.
CREATE INDEX IF NOT EXISTS idx_orders_active_feed
  ON public.orders (is_urgent DESC, created_at DESC)
  WHERE status = 'active';

-- Дашборд клиента (/dashboard): WHERE client_id = X ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_orders_client
  ON public.orders (client_id, created_at DESC);

-- Мои отклики (/my-responses): WHERE carrier_id = X ORDER BY created_at DESC.
-- Существующий unique(order_id, carrier_id) ведёт по order_id и этот фильтр не покрывает.
CREATE INDEX IF NOT EXISTS idx_responses_carrier
  ON public.responses (carrier_id, created_at DESC);

-- Рейтинг: агрегация отзывов по получателю (stats, profile, карточка заявки).
-- WHERE reviewee_id = X [ORDER BY created_at DESC] / IN (...).
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee
  ON public.reviews (reviewee_id, created_at DESC);
