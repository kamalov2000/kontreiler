-- Плановое время прибытия ТС
ALTER TABLE orders ADD COLUMN IF NOT EXISTS arrival_time TIME;

-- Аукцион: мин/макс цена и шаг торгов
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_min_price    INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_max_price    INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_step         INTEGER;  -- NULL = свободный ввод
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_auto_winner  BOOLEAN DEFAULT TRUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auction_auto_extend  BOOLEAN DEFAULT TRUE; -- автопродление на 1ч без ставок
