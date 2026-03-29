-- Изменить формат номера заявки с КТ-XXXXX на КТ-ГГГГ-XXXXX
-- Пример: КТ-2026-00001

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'КТ-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('order_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
