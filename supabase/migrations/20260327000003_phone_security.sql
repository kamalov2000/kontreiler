-- Защита от брутфорса кодов верификации
ALTER TABLE phone_verification_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

-- Пользователь может удалить свои старые коды (чистка)
CREATE POLICY "Users delete own codes"
  ON phone_verification_codes FOR DELETE
  USING (auth.uid() = user_id);
