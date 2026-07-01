-- =============================================================================
--  Автосоздание профиля при регистрации + INSERT policy как fallback
-- =============================================================================

-- Триггер: создаёт запись в users при регистрации через Supabase Auth
-- SECURITY DEFINER — обходит RLS, работает даже при включённом email-подтверждении
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, role, name, phone, city)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- INSERT policy — fallback для случая когда триггер отработал без данных
-- и фронт делает повторный upsert
-- (policy уже создаётся в init.sql — пересоздаём идемпотентно, чтобы миграции
--  реплеились с нуля через `supabase db reset`)
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
