-- Перенос телефона из общей public.users в приватную public.user_private.
--
-- Раньше телефон лежал в users. Попытка скрыть его column-level REVOKE
-- (20260701000007) ломала select('*') → приложение зависало, и грант вернули
-- целиком (20260703000001), из-за чего телефон снова читался любым
-- авторизованным. Правильная модель — та же, что для банковских реквизитов:
-- держать phone в user_private (own-row RLS), а чужой отдавать только через
-- сервер (/api/contact-phone) с проверкой участия и hide_phone. Без хаков с
-- column-level грантами, полностью совместимо с select('*').

-- 1. Колонка в приватной таблице
ALTER TABLE public.user_private ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Переносим существующие телефоны (создаём строку user_private при нужде)
INSERT INTO public.user_private (id, phone)
SELECT id, phone FROM public.users WHERE phone IS NOT NULL
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;

-- 3. get_own_phone() читает свой телефон уже из user_private
CREATE OR REPLACE FUNCTION public.get_own_phone()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT phone FROM public.user_private WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_own_phone() TO authenticated;

-- 4. Триггер регистрации кладёт телефон из метаданных в user_private,
--    а профиль users создаёт без phone
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, role, name, city)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'role', 'client'),
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'city'
  )
  ON CONFLICT (id) DO NOTHING;

  IF NULLIF(new.raw_user_meta_data->>'phone', '') IS NOT NULL THEN
    INSERT INTO public.user_private (id, phone)
    VALUES (new.id, new.raw_user_meta_data->>'phone')
    ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Убираем phone из общей таблицы — больше не читается прямым select('*')
ALTER TABLE public.users DROP COLUMN IF EXISTS phone;
