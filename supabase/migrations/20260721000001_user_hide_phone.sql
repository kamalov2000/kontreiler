-- Глобальный флаг приватности телефона на уровне пользователя.
-- Раньше скрыть номер мог только клиент и только per-order (orders.hide_phone).
-- Теперь любой пользователь (в т.ч. перевозчик) может скрыть свой номер глобально
-- через профиль. Флаг лежит рядом с телефоном в приватной user_private и читается
-- сервером (роут /api/contact-phone) под service_role при выдаче номера контрагенту.

ALTER TABLE user_private ADD COLUMN IF NOT EXISTS hide_phone BOOLEAN NOT NULL DEFAULT FALSE;
