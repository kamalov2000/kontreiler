-- =============================================================================
--  Тестовые заявки — 8 штук разных форматов и статусов
--  Требует: seed_test_users.sql уже применён
--  Запускать в Supabase Cloud → SQL Editor
-- =============================================================================

-- Очистка предыдущих тестовых заявок
DELETE FROM bids      WHERE order_id IN (SELECT id FROM orders WHERE client_id::text LIKE 'c0000%');
DELETE FROM responses WHERE order_id IN (SELECT id FROM orders WHERE client_id::text LIKE 'c0000%');
DELETE FROM messages  WHERE order_id IN (SELECT id FROM orders WHERE client_id::text LIKE 'c0000%');
DELETE FROM orders    WHERE client_id::text LIKE 'c0000%';

-- 1. Обычная заявка — активная (Москва → Владивосток)
INSERT INTO orders (
  client_id, format, from_city, from_city_address, via_city, via_city_address,
  to_city, to_city_address, container_type, ready_date,
  expires_at, price, is_negotiable, is_urgent, vat_type,
  weight_gross, weight_net, requires_genset, notes, status
) VALUES (
  'c0000001-0000-0000-0000-000000000001',
  'regular',
  'Москва', 'ул. Складская, 15',
  'Екатеринбург', 'Терминал Уралтранс, ул. Логистическая 3',
  'Владивосток', 'Порт Владивосток, причал 7',
  '40ft',
  (now() + interval '3 days')::date,
  now() + interval '7 days',
  185000, false, false, 'vat20',
  24000, 21500, false,
  'Хрупкий груз, не кантовать',
  'active'
);

-- 2. Срочная заявка — активная (СПб → Новосибирск)
INSERT INTO orders (
  client_id, format, from_city, from_city_address,
  to_city, to_city_address, container_type, ready_date,
  expires_at, price, is_negotiable, is_urgent, vat_type,
  weight_gross, weight_net, requires_genset, status
) VALUES (
  'c0000002-0000-0000-0000-000000000002',
  'urgent',
  'Санкт-Петербург', 'ул. Портовая, 22',
  'Новосибирск', 'СВХ Новосибирск, Западная промзона',
  '20ft',
  (now() + interval '1 day')::date,
  now() + interval '2 days',
  95000, false, true, 'none',
  18000, 16200, false,
  'active'
);

-- 3. Редукцион — активный (Екатеринбург → Казань)
INSERT INTO orders (
  client_id, format, from_city, from_city_address,
  to_city, to_city_address, container_type, ready_date,
  expires_at, is_negotiable, is_urgent, vat_type,
  weight_gross, requires_genset,
  auction_start_price, auction_end_time, status
) VALUES (
  'c0000003-0000-0000-0000-000000000003',
  'reduction',
  'Екатеринбург', 'Сортировочная 5',
  'Казань', 'Терминал Казань-Южный',
  '40HC',
  (now() + interval '5 days')::date,
  now() + interval '10 days',
  false, false, 'vat0',
  26000, false,
  120000, now() + interval '24 hours',
  'active'
);

-- 4. Аукцион — активный (Новосибирск → Москва)
INSERT INTO orders (
  client_id, format, from_city, from_city_address,
  to_city, to_city_address, container_type, ready_date,
  expires_at, is_negotiable, is_urgent, vat_type,
  requires_genset,
  auction_start_price, auction_end_time, status
) VALUES (
  'c0000004-0000-0000-0000-000000000004',
  'auction',
  'Новосибирск', 'ул. Ватутина, 34',
  'Москва', 'Склад Южные ворота, МО',
  '40REF',
  (now() + interval '4 days')::date,
  now() + interval '14 days',
  false, false, 'vat20',
  true,
  80000, now() + interval '48 hours',
  'active'
);

-- 5. Заявка со статусом matched (перевозчик найден)
INSERT INTO orders (
  client_id, accepted_carrier_id, format, from_city,
  to_city, container_type, ready_date,
  price, is_negotiable, is_urgent, vat_type,
  agreed_price, requires_genset, status
) VALUES (
  'c0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  'regular',
  'Москва',
  'Санкт-Петербург',
  '20ft',
  (now() + interval '2 days')::date,
  55000, false, false, 'none',
  53000, false,
  'matched'
);

-- 6. Заявка «В пути»
INSERT INTO orders (
  client_id, accepted_carrier_id, format, from_city,
  to_city, container_type, ready_date,
  price, is_negotiable, is_urgent, vat_type,
  agreed_price, requires_genset, status
) VALUES (
  'c0000002-0000-0000-0000-000000000002',
  'a0000002-0000-0000-0000-000000000002',
  'regular',
  'Санкт-Петербург',
  'Екатеринбург',
  '40ft',
  (now() - interval '1 day')::date,
  110000, false, false, 'vat20',
  108000, false,
  'in_transit'
);

-- 7. Доставлено
INSERT INTO orders (
  client_id, accepted_carrier_id, format, from_city,
  to_city, container_type, ready_date,
  price, is_negotiable, is_urgent, vat_type,
  agreed_price, requires_genset, status
) VALUES (
  'c0000003-0000-0000-0000-000000000003',
  'a0000003-0000-0000-0000-000000000003',
  'regular',
  'Екатеринбург',
  'Владивосток',
  '40HC',
  (now() - interval '5 days')::date,
  220000, false, false, 'vat20',
  215000, false,
  'delivered'
);

-- 8. Просроченная заявка
INSERT INTO orders (
  client_id, format, from_city,
  to_city, container_type, ready_date,
  expires_at, price, is_negotiable, is_urgent, vat_type,
  requires_genset, status
) VALUES (
  'c0000004-0000-0000-0000-000000000004',
  'regular',
  'Новосибирск',
  'Красноярск',
  '20ft',
  (now() - interval '3 days')::date,
  now() - interval '1 day',
  45000, false, false, 'none',
  false,
  'expired'
);

-- Добавляем отклики перевозчиков на активные заявки
INSERT INTO responses (order_id, carrier_id, message)
SELECT o.id, 'a0000001-0000-0000-0000-000000000001', 'Готов выполнить рейс, есть свободная машина'
FROM orders o WHERE o.client_id = 'c0000001-0000-0000-0000-000000000001' AND o.status = 'active' LIMIT 1;

INSERT INTO responses (order_id, carrier_id, message)
SELECT o.id, 'a0000002-0000-0000-0000-000000000002', 'Могу выехать завтра утром'
FROM orders o WHERE o.client_id = 'c0000001-0000-0000-0000-000000000001' AND o.status = 'active' LIMIT 1;

-- Ставки на редукцион
INSERT INTO bids (order_id, carrier_id, amount)
SELECT o.id, 'a0000001-0000-0000-0000-000000000001', 115000
FROM orders o WHERE o.format = 'reduction' AND o.status = 'active' LIMIT 1;

INSERT INTO bids (order_id, carrier_id, amount)
SELECT o.id, 'a0000002-0000-0000-0000-000000000002', 112000
FROM orders o WHERE o.format = 'reduction' AND o.status = 'active' LIMIT 1;

-- Ставки на аукцион
INSERT INTO bids (order_id, carrier_id, amount)
SELECT o.id, 'a0000003-0000-0000-0000-000000000003', 85000
FROM orders o WHERE o.format = 'auction' AND o.status = 'active' LIMIT 1;

-- Проверка
SELECT
  o.order_number,
  o.format,
  o.status,
  o.from_city || ' → ' || o.to_city AS route,
  o.price,
  o.auction_start_price,
  (SELECT COUNT(*) FROM responses r WHERE r.order_id = o.id) AS responses,
  (SELECT COUNT(*) FROM bids b WHERE b.order_id = o.id) AS bids
FROM orders o
WHERE o.client_id::text LIKE 'c0000%'
ORDER BY o.created_at;
