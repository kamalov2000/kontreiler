-- Поля для верификации перевозчика
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS inn TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number TEXT;

-- Обновлённая политика UPDATE: разрешаем менять новые поля, но не is_verified / role
DROP POLICY IF EXISTS "users_update_own" ON users;

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    role            = (SELECT u.role             FROM users u WHERE u.id = auth.uid()) AND
    is_verified     = (SELECT u.is_verified      FROM users u WHERE u.id = auth.uid()) AND
    is_phone_verified = (SELECT u.is_phone_verified FROM users u WHERE u.id = auth.uid())
  );
