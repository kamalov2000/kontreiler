-- ────────────────────────────────────────────────────────────────────
-- 1. Добавить тип 20DC2 в orders.container_type
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_container_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_container_type_check
  CHECK (container_type IN ('20ft','40ft','40HC','45ft','20REF','40REF','20TC','40TC','20DC2'));

-- ────────────────────────────────────────────────────────────────────
-- 2. Поля второго контейнера (для 20DC×2)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight_gross_2 INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight_net_2   INTEGER;

-- ────────────────────────────────────────────────────────────────────
-- 3. Простой транспорта (₽/час) — указывается по итогам рейса
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS downtime_rate INTEGER;

-- ────────────────────────────────────────────────────────────────────
-- 4. Таблица дополнительных точек маршрута
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  address     TEXT NOT NULL,
  comment     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_stops_select"
  ON order_stops FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "order_stops_insert"
  ON order_stops FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE id = order_id AND client_id = auth.uid())
  );

CREATE POLICY "order_stops_delete"
  ON order_stops FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM orders WHERE id = order_id AND client_id = auth.uid())
  );
