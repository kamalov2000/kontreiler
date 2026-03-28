-- Создаём тестовых пользователей через auth.users, затем профили в public.users
-- Пользователь 1: Клиент
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'client@test.ru',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}', false
) ON CONFLICT (id) DO NOTHING;

-- Пользователь 2: Перевозчик
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'carrier@test.ru',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}', false
) ON CONFLICT (id) DO NOTHING;

-- Профили пользователей
INSERT INTO public.users (id, role, name, phone, city, is_verified) VALUES
  ('00000000-0000-0000-0000-000000000001', 'client', 'ООО Ромашка Груп', '+7 495 123-45-67', 'Москва', true),
  ('00000000-0000-0000-0000-000000000002', 'carrier', 'Иванов Сергей Петрович', '+7 916 987-65-43', 'Санкт-Петербург', false)
ON CONFLICT (id) DO NOTHING;

-- Тестовые заявки
INSERT INTO public.orders (id, client_id, from_city, to_city, container_type, ready_date, price, is_negotiable, is_urgent, status) VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    'Москва', 'Екатеринбург',
    '40ft', CURRENT_DATE + 2,
    85000, false, true, 'active'
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    'Санкт-Петербург', 'Новосибирск',
    '20ft', CURRENT_DATE + 5,
    NULL, true, false, 'active'
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    'Краснодар', 'Казань',
    '40HC', CURRENT_DATE + 3,
    120000, false, false, 'active'
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    'Воронеж', 'Владивосток',
    '45ft', CURRENT_DATE + 7,
    NULL, true, true, 'active'
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001',
    'Нижний Новгород', 'Ростов-на-Дону',
    '20ft', CURRENT_DATE + 1,
    55000, false, false, 'active'
  );
