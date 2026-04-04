-- Fix: клиент не должен иметь возможность откликнуться на свою заявку
-- RLS политика проверяла только auth.uid() = carrier_id, но не роль пользователя

DROP POLICY IF EXISTS "Carriers can create responses" ON responses;

CREATE POLICY "Carriers can create responses"
  ON responses FOR INSERT WITH CHECK (
    auth.uid() = carrier_id
    AND EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'carrier'
    )
    AND NOT EXISTS (
      SELECT 1 FROM orders WHERE id = order_id AND client_id = auth.uid()
    )
  );
