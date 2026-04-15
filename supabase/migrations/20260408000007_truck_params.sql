-- Добавить параметры машины: грузоподъёмность, тип прицепа, дальние рейсы
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS payload      INTEGER;          -- грузоподъёмность, тонн
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS trailer_type TEXT;             -- тип прицепа
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS long_distance BOOLEAN DEFAULT FALSE; -- готовность к дальним рейсам
