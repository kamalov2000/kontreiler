-- ── 1. Последовательности для нумерации ────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS truck_seq START 1;

-- ── 2. Колонки номеров ──────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS truck_number TEXT UNIQUE;

-- ── 3. Триггер: номер заявки КТ-ГГГГ-NNNNN ─────────────────────────────
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'КТ-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_number ON orders;
CREATE TRIGGER trg_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- ── 4. Триггер: номер машины МШ-ГГГГ-NNNNN ─────────────────────────────
CREATE OR REPLACE FUNCTION generate_truck_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.truck_number IS NULL THEN
    NEW.truck_number := 'МШ-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('truck_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_truck_number ON trucks;
CREATE TRIGGER trg_truck_number
  BEFORE INSERT ON trucks
  FOR EACH ROW EXECUTE FUNCTION generate_truck_number();

-- ── 5. View: средние рейтинги пользователей ─────────────────────────────
CREATE OR REPLACE VIEW user_avg_ratings AS
SELECT
  reviewee_id                          AS user_id,
  ROUND(AVG(rating)::numeric, 1)       AS avg_rating,
  COUNT(*)::integer                    AS review_count
FROM reviews
GROUP BY reviewee_id;

-- Доступ аутентифицированным пользователям
GRANT SELECT ON user_avg_ratings TO authenticated;
