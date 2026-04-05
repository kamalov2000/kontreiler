-- ── 1. Расширить допустимые значения НДС (добавить vat5 и vat15) ─────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_vat_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_vat_type_check
  CHECK (vat_type IN ('none', 'vat5', 'vat15', 'vat20', 'vat0'));

-- ── 2. Поле скрытия телефона клиента ─────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hide_phone BOOLEAN DEFAULT FALSE;
