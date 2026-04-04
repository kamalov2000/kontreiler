-- Расширяем допустимые типы контейнеров для trucks до всех 8 типов
-- (форма /trucks/new уже предлагает все 8, БД принимала только 4)
ALTER TABLE trucks DROP CONSTRAINT IF EXISTS trucks_container_type_check;
ALTER TABLE trucks ADD CONSTRAINT trucks_container_type_check
  CHECK (container_type IN ('20ft','40ft','40HC','45ft','20REF','40REF','20TC','40TC'));
