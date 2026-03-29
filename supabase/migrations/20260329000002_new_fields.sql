-- ── 1. Новые поля заявки ────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight_gross INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight_net   INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_type TEXT DEFAULT 'none'
  CHECK (vat_type IN ('none', 'vat20', 'vat0'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requires_genset BOOLEAN DEFAULT FALSE;

-- ── 2. Расширенный список типов контейнеров ──────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_container_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_container_type_check
  CHECK (container_type IN ('20ft', '40ft', '40HC', '45ft', '20REF', '40REF', '20TC', '40TC'));

-- Аналогично для таблицы trucks (если нужно в будущем — добавьте вручную)
