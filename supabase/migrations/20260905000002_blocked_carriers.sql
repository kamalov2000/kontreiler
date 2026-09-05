-- «Стелс»: чёрный список перевозчиков.
--
-- Отметка «только контрагентам» на заявке — это всё или ничего: либо рынок,
-- либо белый список. Клиенту чаще нужно обратное и точечное — показывать всем,
-- кроме пары конкретных фирм.
--
-- Список ведётся по клиенту, а не по каждой заявке: тот, от кого прячутся,
-- прячется от всех своих рейсов, а не от одного. Отмечать это в каждой заявке
-- заново было бы работой без смысла.
--
-- Прячем на уровне RLS, а не фильтром в интерфейсе: скрытие, которое обходится
-- запросом к API, скрытием не является.

CREATE TABLE IF NOT EXISTS public.blocked_carriers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blocked_carriers_uniq UNIQUE (owner_id, blocked_id),
  CONSTRAINT blocked_carriers_not_self CHECK (owner_id <> blocked_id)
);

-- Индекс под проверку в политике заявок: она выполняется на каждую строку ленты.
CREATE INDEX IF NOT EXISTS idx_blocked_carriers_lookup
  ON public.blocked_carriers (blocked_id, owner_id);

ALTER TABLE public.blocked_carriers ENABLE ROW LEVEL SECURITY;

-- Свой список видит и правит только владелец. Заблокированный о себе не знает —
-- иначе скрытие превращается в публичную пощёчину.
DROP POLICY IF EXISTS blocked_carriers_select ON public.blocked_carriers;
CREATE POLICY blocked_carriers_select ON public.blocked_carriers FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS blocked_carriers_insert ON public.blocked_carriers;
CREATE POLICY blocked_carriers_insert ON public.blocked_carriers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS blocked_carriers_delete ON public.blocked_carriers;
CREATE POLICY blocked_carriers_delete ON public.blocked_carriers FOR DELETE TO authenticated USING (owner_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.blocked_carriers TO authenticated;

-- Проверка «прячется ли этот клиент от меня» — обязательно SECURITY DEFINER.
-- Подзапрос к blocked_carriers прямо из политики не работает: на него тоже
-- ложится RLS этой таблицы, скрытый перевозчик своей строки не видит, EXISTS
-- возвращает false — и скрытие молча перестаёт действовать. Ровно на этом
-- первая версия и попалась.
CREATE OR REPLACE FUNCTION public.is_hidden_from(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_carriers b
    WHERE b.owner_id = p_owner AND b.blocked_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_hidden_from(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hidden_from(UUID) TO authenticated;

-- Заявки скрытых от них клиентов исчезают из выдачи целиком: ни в ленте, ни по
-- прямой ссылке. Два исключения, без которых скрытие ломало бы работу:
--   * владелец видит свои заявки всегда (сам себя в список внести нельзя);
--   * принятый перевозчик видит рейс, который уже везёт, — блокировка после
--     сделки не должна отнимать у него заявку, документы и чат.
DROP POLICY IF EXISTS "Active orders visible to all" ON public.orders;
CREATE POLICY "Active orders visible to all" ON public.orders FOR SELECT TO authenticated USING (client_id = auth.uid() OR accepted_carrier_id = auth.uid() OR NOT public.is_hidden_from(client_id));

-- То же и для запроса ставки: прятаться половинчато смысла нет.
DROP POLICY IF EXISTS rate_requests_select ON public.rate_requests;
CREATE POLICY rate_requests_select ON public.rate_requests FOR SELECT TO authenticated USING (client_id = auth.uid() OR (status = 'open' AND NOT public.is_hidden_from(client_id)));
