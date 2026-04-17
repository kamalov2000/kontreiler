-- Трекинг перевозки: перевозчик отмечает этапы рейса в реальном времени
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_enabled    BOOLEAN    DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_status     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_updated_at TIMESTAMPTZ;
