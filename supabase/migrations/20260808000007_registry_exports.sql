-- Журнал выгруженных реестров — ради сквозного номера в шапке документа.
--
-- «Реестр № 14 от 08.08.2026»: номер сквозной по каждому перевозчику,
-- инкрементом. Клиент реестр тоже выгружает, поэтому нумерация ведётся по
-- выгружающему (carrier_id = его id), а не по контрагенту: у каждой компании
-- своя непрерывная последовательность собственных документов.

CREATE TABLE IF NOT EXISTS public.registry_exports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  period_from DATE NOT NULL,
  period_to   DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT registry_exports_number_uniq UNIQUE (carrier_id, number)
);

CREATE INDEX IF NOT EXISTS idx_registry_exports_carrier
  ON public.registry_exports (carrier_id, created_at DESC);

ALTER TABLE public.registry_exports ENABLE ROW LEVEL SECURITY;

-- Свой журнал видит только владелец. Пишет в него не пользователь напрямую,
-- а функция ниже — иначе номер можно было бы поставить любой.
DROP POLICY IF EXISTS registry_exports_select ON public.registry_exports;
CREATE POLICY registry_exports_select ON public.registry_exports FOR SELECT TO authenticated USING (carrier_id = auth.uid());

GRANT SELECT ON public.registry_exports TO authenticated;

-- Выдаёт следующий номер и сразу фиксирует выгрузку.
-- Блокировка по владельцу, а не UNIQUE + повтор: две вкладки, нажавшие
-- «Выгрузить» одновременно, иначе получат один номер на двоих и один из файлов
-- уйдёт клиенту как дубль.
CREATE OR REPLACE FUNCTION public.next_registry_number(p_from DATE, p_to DATE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_number INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется авторизация' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('registry_exports:' || v_uid::TEXT));

  SELECT COALESCE(MAX(number), 0) + 1 INTO v_number
  FROM public.registry_exports WHERE carrier_id = v_uid;

  INSERT INTO public.registry_exports (carrier_id, number, period_from, period_to)
  VALUES (v_uid, v_number, p_from, p_to);

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.next_registry_number(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_registry_number(DATE, DATE) TO authenticated;
