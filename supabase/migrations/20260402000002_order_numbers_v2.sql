-- Новый формат номеров (пункты 5, 12):
-- Обычные/срочные: КТ-00001 (без года)
-- Аукцион: А-00001
-- Редукцион: Р-00001

CREATE SEQUENCE IF NOT EXISTS auction_seq START 1;
CREATE SEQUENCE IF NOT EXISTS reduction_seq START 1;

-- Обновляем функцию генерации номеров
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    IF NEW.format = 'auction' THEN
      NEW.order_number := 'А-' || LPAD(nextval('auction_seq')::TEXT, 5, '0');
    ELSIF NEW.format = 'reduction' THEN
      NEW.order_number := 'Р-' || LPAD(nextval('reduction_seq')::TEXT, 5, '0');
    ELSE
      NEW.order_number := 'КТ-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
