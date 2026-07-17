-- Навесной генератор (Genset) у машины перевозчика.
-- Нужен для перевозки рефконтейнеров: если у прицепа есть Genset, машина может
-- везти REF-контейнер без внешнего питания. Показываем бейджем в ленте и на карточке.

ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS has_genset boolean NOT NULL DEFAULT false;
