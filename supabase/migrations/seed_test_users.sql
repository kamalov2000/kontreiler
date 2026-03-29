-- =============================================================================
--  Тестовые пользователи — 4 клиента + 4 перевозчика
--  Пароль для всех: Test1234!
--  Запускать в Supabase Cloud → SQL Editor
-- =============================================================================

-- 0. Удаляем тестовых пользователей если уже существуют (idempotent)
--    Порядок важен: сначала зависимые таблицы, потом public.users, потом auth.users
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  test_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(id) INTO test_ids
  FROM auth.users
  WHERE email IN (
    'client1@test.ru', 'client2@test.ru', 'client3@test.ru', 'client4@test.ru',
    'carrier1@test.ru', 'carrier2@test.ru', 'carrier3@test.ru', 'carrier4@test.ru'
  );

  IF test_ids IS NULL THEN RETURN; END IF;

  DELETE FROM phone_verification_codes WHERE user_id = ANY(test_ids);
  DELETE FROM notifications            WHERE user_id = ANY(test_ids);
  DELETE FROM reviews    WHERE reviewer_id = ANY(test_ids) OR reviewee_id = ANY(test_ids);
  DELETE FROM saved_routes             WHERE carrier_id = ANY(test_ids);
  DELETE FROM messages   WHERE sender_id = ANY(test_ids);
  DELETE FROM responses  WHERE carrier_id = ANY(test_ids);
  DELETE FROM trucks     WHERE carrier_id = ANY(test_ids);
  DELETE FROM orders     WHERE client_id  = ANY(test_ids) OR accepted_carrier_id = ANY(test_ids);
  DELETE FROM public.users             WHERE id = ANY(test_ids);
  DELETE FROM auth.users               WHERE id = ANY(test_ids);
END;
$$;


-- 1. Создаём пользователей в auth.users
--    Триггер handle_new_user() автоматически создаст записи в public.users
-- -----------------------------------------------------------------------------

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES

-- ── Клиенты ──────────────────────────────────────────────────────────────────
(
  'c0000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'client1@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"client","name":"Иван Петров","phone":"+79001110001","city":"Москва"}',
  now(), now(), '', '', '', ''
),
(
  'c0000002-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'client2@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"client","name":"Ольга Смирнова","phone":"+79002220002","city":"Санкт-Петербург"}',
  now(), now(), '', '', '', ''
),
(
  'c0000003-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'client3@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"client","name":"ООО Ромашка","phone":"+79003330003","city":"Екатеринбург"}',
  now(), now(), '', '', '', ''
),
(
  'c0000004-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'client4@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"client","name":"Сергей Козлов","phone":"+79004440004","city":"Новосибирск"}',
  now(), now(), '', '', '', ''
),

-- ── Перевозчики ───────────────────────────────────────────────────────────────
(
  'a0000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'carrier1@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"carrier","name":"Алексей Волков","phone":"+79005550005","city":"Москва"}',
  now(), now(), '', '', '', ''
),
(
  'a0000002-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'carrier2@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"carrier","name":"ИП Захаров","phone":"+79006660006","city":"Казань"}',
  now(), now(), '', '', '', ''
),
(
  'a0000003-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'carrier3@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"carrier","name":"Дмитрий Морозов","phone":"+79007770007","city":"Владивосток"}',
  now(), now(), '', '', '', ''
),
(
  'a0000004-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'carrier4@test.ru',
  crypt('Test1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"carrier","name":"ТК Сибирь","phone":"+79008880008","city":"Новосибирск"}',
  now(), now(), '', '', '', ''
);


-- 2. Подтверждаем телефоны (чтобы могли откликаться на заявки)
-- -----------------------------------------------------------------------------
UPDATE public.users
SET is_phone_verified = true
WHERE id IN (
  'c0000001-0000-0000-0000-000000000001',
  'c0000002-0000-0000-0000-000000000002',
  'c0000003-0000-0000-0000-000000000003',
  'c0000004-0000-0000-0000-000000000004',
  'a0000001-0000-0000-0000-000000000001',
  'a0000002-0000-0000-0000-000000000002',
  'a0000003-0000-0000-0000-000000000003',
  'a0000004-0000-0000-0000-000000000004'
);


-- 3. Проверка
-- -----------------------------------------------------------------------------
SELECT u.role, u.name, u.phone, u.city, u.is_phone_verified, a.email
FROM public.users u
JOIN auth.users a ON a.id = u.id
WHERE u.id IN (
  'c0000001-0000-0000-0000-000000000001',
  'c0000002-0000-0000-0000-000000000002',
  'c0000003-0000-0000-0000-000000000003',
  'c0000004-0000-0000-0000-000000000004',
  'a0000001-0000-0000-0000-000000000001',
  'a0000002-0000-0000-0000-000000000002',
  'a0000003-0000-0000-0000-000000000003',
  'a0000004-0000-0000-0000-000000000004'
)
ORDER BY u.role, u.name;
