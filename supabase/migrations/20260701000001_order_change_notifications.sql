-- Задача 8: уведомления о корректировках заявки клиентом
-- 1) Разрешаем тип уведомления 'order_changed'
-- 2) Добавляем колонку message для текста корректировки (какой критерий изменён)

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_response', 'new_message',
    'new_truck_response', 'new_truck_message',
    'response_accepted',
    'order_delivered', 'trip_done',
    'order_cancelled',
    'order_changed',
    'review_request',
    'auction_won', 'auction_ended'
  ));

-- Текст-описание уведомления (например, детали корректировки заявки).
-- NULL для обычных уведомлений — они формируют текст по типу на клиенте.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
