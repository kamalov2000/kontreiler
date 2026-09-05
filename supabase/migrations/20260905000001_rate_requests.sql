-- Запрос ставки без груза.
--
-- Клиент не всегда готов публиковать рейс: контейнер ещё в пути, дата плавает,
-- а знать, за сколько повезут, нужно уже сейчас. Раньше это выясняли звонками.
--
-- Отдельная сущность, а не формат заявки: у запроса нет даты погрузки, статусов
-- рейса, водителя, накладной и договора, и в реестр перевозок он не попадает.
-- Держать всё это в orders значило бы протащить пустые поля через ленту,
-- документы и выгрузки. Автопревращения запроса в заявку нет намеренно: цифры к
-- моменту появления груза расходятся, стороны созваниваются и заводят рейс
-- заново.

CREATE SEQUENCE IF NOT EXISTS rate_request_seq;

CREATE TABLE IF NOT EXISTS public.rate_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  number            TEXT UNIQUE,
  from_city         TEXT NOT NULL,
  from_city_address TEXT,
  via_city          TEXT,
  to_city           TEXT NOT NULL,
  to_city_address   TEXT,
  container_type    TEXT NOT NULL,
  weight_gross      INTEGER,
  requires_genset   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Сюда клиент пишет то, чего нет в полях: «готов через неделю, пока в пути».
  -- Даты у запроса нет специально — на момент запроса её никто не знает.
  comment           TEXT,
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  CONSTRAINT rate_requests_status_check CHECK (status IN ('open', 'closed'))
);

-- Срок жизни запроса не ограничен: клиент закрывает его сам, когда ставка
-- собрана. Тухнуть по таймеру он не должен — ответы приходят неделями.
CREATE INDEX IF NOT EXISTS idx_rate_requests_open
  ON public.rate_requests (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_rate_requests_client
  ON public.rate_requests (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.generate_rate_request_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL THEN
    NEW.number := 'ЗС-' || LPAD(nextval('rate_request_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rate_request_number ON public.rate_requests;
CREATE TRIGGER trg_rate_request_number
  BEFORE INSERT ON public.rate_requests
  FOR EACH ROW EXECUTE FUNCTION public.generate_rate_request_number();

-- ── Ставки перевозчиков ──────────────────────────────────────────────────
-- Перевозчик отвечает ценой и не видит, что предложили остальные. Это не
-- украшение интерфейса, а требование RLS ниже: увидев чужие ставки, он
-- подстроил бы свою, и смысл запроса потерялся бы.
CREATE TABLE IF NOT EXISTS public.rate_request_offers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.rate_requests(id) ON DELETE CASCADE,
  carrier_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  vat_type   TEXT NOT NULL DEFAULT 'none',
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rate_request_offers_uniq UNIQUE (request_id, carrier_id)
);

CREATE INDEX IF NOT EXISTS idx_rate_request_offers_request
  ON public.rate_request_offers (request_id, created_at DESC);

ALTER TABLE public.rate_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_request_offers ENABLE ROW LEVEL SECURITY;

-- Открытые запросы видны всем: перевозчику надо на что отвечать. Свои — всегда,
-- в том числе закрытые.
DROP POLICY IF EXISTS rate_requests_select ON public.rate_requests;
CREATE POLICY rate_requests_select ON public.rate_requests FOR SELECT TO authenticated USING (status = 'open' OR client_id = auth.uid());

DROP POLICY IF EXISTS rate_requests_insert ON public.rate_requests;
CREATE POLICY rate_requests_insert ON public.rate_requests FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid() AND public.current_user_role() = 'client');

DROP POLICY IF EXISTS rate_requests_update ON public.rate_requests;
CREATE POLICY rate_requests_update ON public.rate_requests FOR UPDATE TO authenticated USING (client_id = auth.uid());

DROP POLICY IF EXISTS rate_requests_delete ON public.rate_requests;
CREATE POLICY rate_requests_delete ON public.rate_requests FOR DELETE TO authenticated USING (client_id = auth.uid());

-- Ключевое место: перевозчик читает только свою ставку, автор запроса — все.
DROP POLICY IF EXISTS rate_request_offers_select ON public.rate_request_offers;
CREATE POLICY rate_request_offers_select ON public.rate_request_offers FOR SELECT TO authenticated USING (carrier_id = auth.uid() OR EXISTS (SELECT 1 FROM public.rate_requests r WHERE r.id = request_id AND r.client_id = auth.uid()));

DROP POLICY IF EXISTS rate_request_offers_insert ON public.rate_request_offers;
CREATE POLICY rate_request_offers_insert ON public.rate_request_offers FOR INSERT TO authenticated WITH CHECK (carrier_id = auth.uid() AND public.current_user_role() = 'carrier' AND EXISTS (SELECT 1 FROM public.rate_requests r WHERE r.id = request_id AND r.status = 'open'));

DROP POLICY IF EXISTS rate_request_offers_update ON public.rate_request_offers;
CREATE POLICY rate_request_offers_update ON public.rate_request_offers FOR UPDATE TO authenticated USING (carrier_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_requests       TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.rate_request_offers TO authenticated;
GRANT USAGE ON SEQUENCE rate_request_seq TO authenticated;
