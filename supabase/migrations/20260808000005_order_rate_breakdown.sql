-- Расчёт ставки, сохранённый вместе с заявкой.
--
-- Калькулятор в форме заявки раньше считал и выбрасывал: в БД уходила только
-- итоговая цифра, и через месяц никто не мог сказать, из чего она сложилась.
-- Теперь применение калькулятора кладёт сюда сам расчёт — он же разворачивается
-- в колонки реестра перевозок (подача / км / ставка за км / плечо).
--
-- Поля заполняет клиент при создании заявки, поэтому колонками на orders, а не
-- отдельной таблицей: UPDATE у orders и так только у client_id.

DO $$ BEGIN
  CREATE TYPE public.rate_method AS ENUM (
    'composite_round',   -- составная, туда-обратно: подача + км × ставка × 2
    'composite_oneway',  -- составная, в один конец: подача + км × ставка
    'mkad',              -- МКАДный: подача + км от МКАД × ставка
    'market'             -- рыночная: цена введена руками, разбивки нет
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rate_method             public.rate_method,
  ADD COLUMN IF NOT EXISTS rate_delivery_cost      INTEGER,        -- подача, ₽
  ADD COLUMN IF NOT EXISTS rate_distance_km        NUMERIC(8,1),   -- км (для mkad — от МКАД)
  ADD COLUMN IF NOT EXISTS rate_per_km             NUMERIC(8,2),   -- ставка за км, ₽
  ADD COLUMN IF NOT EXISTS rate_overload_per_ton   INTEGER,        -- ₽ за сверхнормативную тонну
  ADD COLUMN IF NOT EXISTS rate_overload_tons      NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS rate_extra_point_cost   INTEGER,        -- ₽ за одну доп. точку
  ADD COLUMN IF NOT EXISTS rate_extra_points_count SMALLINT;

-- Отрицательных величин в расчёте не бывает. NOT VALID: старые заявки расчёта
-- не имеют вовсе (все поля NULL) и проверку всё равно проходят, но полный скан
-- таблицы при накатке не нужен.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rate_nonneg;
ALTER TABLE public.orders ADD CONSTRAINT orders_rate_nonneg CHECK (
  COALESCE(rate_delivery_cost, 0)      >= 0 AND
  COALESCE(rate_distance_km, 0)        >= 0 AND
  COALESCE(rate_per_km, 0)             >= 0 AND
  COALESCE(rate_overload_per_ton, 0)   >= 0 AND
  COALESCE(rate_overload_tons, 0)      >= 0 AND
  COALESCE(rate_extra_point_cost, 0)   >= 0 AND
  COALESCE(rate_extra_points_count, 0) >= 0
) NOT VALID;

-- У рыночного метода разбивки нет по определению: цена введена руками.
-- Иначе в реестре появилась бы строка с километражом, к итогу отношения не имеющим.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rate_market_empty;
ALTER TABLE public.orders ADD CONSTRAINT orders_rate_market_empty CHECK (
  rate_method IS DISTINCT FROM 'market' OR (
    rate_delivery_cost      IS NULL AND
    rate_distance_km        IS NULL AND
    rate_per_km             IS NULL AND
    rate_overload_per_ton   IS NULL AND
    rate_overload_tons      IS NULL AND
    rate_extra_point_cost   IS NULL AND
    rate_extra_points_count IS NULL
  )
) NOT VALID;

COMMENT ON COLUMN public.orders.rate_method IS
  'Метод расчёта ставки в калькуляторе. NULL — калькулятор не применялся.';
