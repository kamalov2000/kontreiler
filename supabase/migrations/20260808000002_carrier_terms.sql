-- Условия работы перевозчика — короткая сводка, которую видит клиент в карточке
-- отклика и на странице машины.
--
-- Колонками на users, а не отдельной таблицей carrier_terms: эти условия
-- публичные (в отличие от реквизитов в user_private), а карточка отклика и
-- страница машины уже тянут перевозчика через `users!carrier_id(*)` — так поля
-- приезжают без единой правки запросов и без лишнего join на каждый отклик.
-- RLS уже правильная: читают все аутентифицированные, правит только владелец.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_container_types TEXT[],      -- какие контейнеры возит
  ADD COLUMN IF NOT EXISTS terms_overweight_fee  INTEGER,     -- доплата за перевес, ₽/тонна
  ADD COLUMN IF NOT EXISTS terms_min_rate        INTEGER,     -- минимальная ставка за рейс, ₽
  ADD COLUMN IF NOT EXISTS terms_cargo_excluded  TEXT,        -- какие грузы не берёт
  ADD COLUMN IF NOT EXISTS terms_comment         TEXT;        -- комментарий, 1-2 строки

COMMENT ON COLUMN public.users.terms_container_types IS 'Типы контейнеров из CONTAINER_TYPES; NULL/пусто = не указано';
COMMENT ON COLUMN public.users.terms_overweight_fee  IS 'Доплата за перевес, ₽ за тонну';
COMMENT ON COLUMN public.users.terms_min_rate        IS 'Минимальная ставка за рейс, ₽';
