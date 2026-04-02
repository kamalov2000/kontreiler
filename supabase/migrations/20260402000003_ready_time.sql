-- Добавляем время к дате погрузки/выгрузки (пункт 7, 9)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_time VARCHAR(5);
