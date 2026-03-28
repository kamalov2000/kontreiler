-- Защита от изменения чувствительных полей пользователем
-- Пользователь НЕ должен менять role, is_verified, is_phone_verified через клиент

DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role            = (SELECT u.role            FROM users u WHERE u.id = auth.uid())
    AND is_verified     = (SELECT u.is_verified     FROM users u WHERE u.id = auth.uid())
    AND is_phone_verified = (SELECT u.is_phone_verified FROM users u WHERE u.id = auth.uid())
  );
