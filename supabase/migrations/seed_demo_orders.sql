-- =============================================================================
--  Демо-данные для показа: заявки, торги, история, отзывы, машины
--  Требует: seed_test_users.sql уже применён (8 аккаунтов c0000*/a0000*)
--
--  Периметр: ТОЛЬКО данные тестовых пользователей c0000*/a0000*.
--  Заявки, машины и отклики реальных пользователей не трогаются.
--
--  Заменяет собой seed_test_orders.sql (тот делал 8 заявок и не давал
--  ни живой ленты, ни торгов со ставками, ни рейтингов).
--
--  Даты везде относительные (now() + interval), поэтому файл можно
--  гонять повторно — данные всегда «свежие».
-- =============================================================================

BEGIN;

-- ── 0. Периметр ──────────────────────────────────────────────────────────────
CREATE TEMP TABLE tu ON COMMIT DROP AS
  SELECT id FROM auth.users
   WHERE id::text LIKE 'c0000%' OR id::text LIKE 'a0000%';

CREATE TEMP TABLE tord ON COMMIT DROP AS
  SELECT id FROM orders WHERE client_id IN (SELECT id FROM tu);

CREATE TEMP TABLE ttruck ON COMMIT DROP AS
  SELECT id FROM trucks WHERE carrier_id IN (SELECT id FROM tu);

-- ── 1. Чистка старых тестовых данных ─────────────────────────────────────────
-- Дети заявок с FK NO ACTION — руками; остальное уйдёт по ON DELETE CASCADE.
DELETE FROM reviews   WHERE order_id IN (SELECT id FROM tord)
                         OR reviewer_id IN (SELECT id FROM tu)
                         OR reviewee_id IN (SELECT id FROM tu);
DELETE FROM responses WHERE order_id IN (SELECT id FROM tord)
                         OR carrier_id IN (SELECT id FROM tu);
DELETE FROM bids      WHERE carrier_id IN (SELECT id FROM tu);

-- Ссылки на удаляемые торги с чужих заявок (сейчас таких нет, но пусть будет)
UPDATE orders SET source_auction_id = NULL
  WHERE source_auction_id IN (SELECT id FROM tord) AND id NOT IN (SELECT id FROM tord);
UPDATE orders SET accepted_carrier_id = NULL
  WHERE accepted_carrier_id IN (SELECT id FROM tu) AND id NOT IN (SELECT id FROM tord);
UPDATE orders SET auction_winner_id = NULL
  WHERE auction_winner_id IN (SELECT id FROM tu) AND id NOT IN (SELECT id FROM tord);

DELETE FROM truck_responses WHERE truck_id IN (SELECT id FROM ttruck)
                               OR client_id IN (SELECT id FROM tu);
DELETE FROM truck_messages  WHERE truck_id IN (SELECT id FROM ttruck)
                               OR sender_id IN (SELECT id FROM tu)
                               OR client_id IN (SELECT id FROM tu)
                               OR carrier_id IN (SELECT id FROM tu);

DELETE FROM orders WHERE id IN (SELECT id FROM tord);
DELETE FROM trucks WHERE id IN (SELECT id FROM ttruck);
DELETE FROM notifications WHERE user_id IN (SELECT id FROM tu);


-- ── 2. Активная лента ────────────────────────────────────────────────────────
-- 8 заявок, которые перевозчик видит в разделе «Заявки».
-- order_number проставит триггер trg_order_number.

INSERT INTO orders (
  id, client_id, format, status,
  from_city, from_city_address, via_city, via_city_address, to_city, to_city_address,
  container_type, container_number, cargo_name,
  ready_date, ready_time, arrival_time, expires_at,
  price, is_negotiable, is_urgent, vat_type,
  weight_gross, weight_net, weight_tare, requires_genset, downtime_rate, notes
) VALUES

-- 1. Дальнее плечо, крупный чек — витрина ленты
('d0000001-0000-0000-0000-000000000001', 'c0000003-0000-0000-0000-000000000003',
 'regular', 'active',
 'Владивосток', 'ВМТП, причал 14', NULL, NULL, 'Москва', 'ТЛЦ «Белый Раст», ул. Логистическая, 1',
 '40HC', 'FESU7712045', 'Чай в коробах',
 (now() + interval '6 days')::date, '09:00', '18:00', now() + interval '9 days',
 392000, false, false, 'vat20',
 28400, 24500, 3900, false, 5000,
 'Пломба на выгрузке вскрывается в присутствии представителя.'),

-- 2. Срочная, короткое плечо
('d0000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001',
 'urgent', 'active',
 'Санкт-Петербург', 'Порт Бронка, КПП-2', NULL, NULL, 'Москва', 'ТЛЦ «Электроугли», корп. 3',
 '40ft', 'MSKU4419083', 'Бытовая техника',
 (now() + interval '1 day')::date, '07:30', NULL, now() + interval '2 days',
 92000, false, true, 'vat20',
 22300, 18550, 3750, false, 4000,
 'Выгрузка день в день, машина нужна под погрузку к 07:30.'),

-- 3. Реф с генератором
('d0000003-0000-0000-0000-000000000003', 'c0000002-0000-0000-0000-000000000002',
 'urgent', 'active',
 'Новороссийск', 'НУТЭП, ворота 4', NULL, NULL, 'Москва', 'Селятино, хладотерминал',
 '40REF', 'TCNU8830561', 'Рыба мороженая',
 (now() + interval '2 days')::date, '08:00', '20:00', now() + interval '4 days',
 165000, false, true, 'vat20',
 29100, 24500, 4600, true, 6000,
 'Режим −18 °C, генератор обязателен. Термолента на выгрузке.'),

-- 4. Обычная, с промежуточной точкой
('d0000004-0000-0000-0000-000000000004', 'c0000004-0000-0000-0000-000000000004',
 'regular', 'active',
 'Москва', 'ТЛЦ «Ворсино», склад 7', 'Воронеж', 'СВХ «Воронеж-Терминал»', 'Краснодар', 'СВХ «Кубань», ул. Портовая, 18',
 '40ft', 'TKRU5502288', 'Стройматериалы',
 (now() + interval '3 days')::date, '10:00', NULL, now() + interval '7 days',
 118000, true, false, 'vat20',
 26750, 23000, 3750, false, 4000,
 'Заезд в Воронеж — догруз, стоянка не более 3 часов.'),

-- 5. Средняя дистанция
('d0000005-0000-0000-0000-000000000005', 'c0000002-0000-0000-0000-000000000002',
 'regular', 'active',
 'Санкт-Петербург', 'Первый контейнерный терминал', NULL, NULL, 'Екатеринбург', 'ТЛЦ «Уральский», Аппаратная',
 '40ft', 'MSKU6620174', 'Плитка керамическая',
 (now() + interval '4 days')::date, '09:00', NULL, now() + interval '8 days',
 178000, false, false, 'vat20',
 27750, 24000, 3750, false, 4500,
 NULL),

-- 6. Двадцатка без НДС — короткий рейс
('d0000006-0000-0000-0000-000000000006', 'c0000003-0000-0000-0000-000000000003',
 'regular', 'active',
 'Екатеринбург', 'ст. Аппаратная, контейнерная площадка', NULL, NULL, 'Казань', 'Свияжский ММПЦ',
 '20ft', 'FESU2214907', 'Автозапчасти',
 (now() + interval '5 days')::date, '11:00', NULL, now() + interval '9 days',
 64000, true, false, 'none',
 20250, 18000, 2250, false, 3000,
 'Возможен торг при готовности выехать раньше.'),

-- 7. Сибирь
('d0000007-0000-0000-0000-000000000007', 'c0000004-0000-0000-0000-000000000004',
 'regular', 'active',
 'Новосибирск', 'ст. Клещиха, площадка 2', NULL, NULL, 'Красноярск', 'ст. Базаиха',
 '20ft', 'TCNU1108336', 'Оборудование в ящиках',
 (now() + interval '2 days')::date, '08:30', NULL, now() + interval '6 days',
 78000, false, false, 'vat0',
 21050, 18800, 2250, false, 3500,
 'Груз негабарит по высоте — уточните перед подачей.'),

-- 8. Москва → Сибирь, крупный
('d0000008-0000-0000-0000-000000000008', 'c0000001-0000-0000-0000-000000000001',
 'regular', 'active',
 'Москва', 'ТЛЦ «Ворсино», склад 12', NULL, NULL, 'Новосибирск', 'ст. Клещиха, площадка 1',
 '40HC', 'TKRU9043712', 'Полипропилен в биг-бэгах',
 (now() + interval '3 days')::date, '09:30', NULL, now() + interval '7 days',
 285000, true, false, 'vat20',
 27800, 23900, 3900, false, 5000,
 NULL);


-- ── 3. Торги: 2 редукциона + 2 аукциона, со ставками ─────────────────────────
-- Редукцион — ставки идут ВНИЗ от старта, аукцион — ВВЕРХ (см. validate_bid()).

INSERT INTO orders (
  id, client_id, format, status,
  from_city, from_city_address, to_city, to_city_address,
  container_type, container_number, cargo_name,
  ready_date, expires_at,
  auction_start_price, auction_min_price, auction_max_price, auction_step,
  auction_end_time, auction_auto_winner, auction_auto_extend,
  is_negotiable, is_urgent, vat_type,
  weight_gross, weight_net, weight_tare, requires_genset, downtime_rate, notes
) VALUES

-- Редукцион 1 — заканчивается сегодня, самый «живой»
('d0000011-0000-0000-0000-000000000011', 'c0000001-0000-0000-0000-000000000001',
 'reduction', 'active',
 'Москва', 'ТЛЦ «Ворсино», склад 4', 'Екатеринбург', 'ТЛЦ «Уральский»',
 '40ft', 'MSKU3317742', 'Бумага в рулонах',
 (now() + interval '4 days')::date, now() + interval '8 days',
 165000, 130000, NULL, 1000,
 now() + interval '20 hours', true, true,
 false, false, 'vat20',
 27350, 23600, 3750, false, 4500,
 'Снижение шагом 1 000 ₽. Нижняя граница — 130 000 ₽.'),

-- Редукцион 2 — подлиннее
('d0000012-0000-0000-0000-000000000012', 'c0000003-0000-0000-0000-000000000003',
 'reduction', 'active',
 'Екатеринбург', 'ст. Аппаратная', 'Новосибирск', 'ст. Клещиха, площадка 2',
 '40HC', 'FESU5590128', 'Трубы стальные',
 (now() + interval '6 days')::date, now() + interval '10 days',
 210000, 175000, NULL, 500,
 now() + interval '2 days', true, true,
 false, false, 'vat20',
 28900, 25000, 3900, false, 5000,
 NULL),

-- Аукцион 1 — дальнее плечо
('d0000013-0000-0000-0000-000000000013', 'c0000002-0000-0000-0000-000000000002',
 'auction', 'active',
 'Санкт-Петербург', 'Порт Бронка', 'Владивосток', 'ВМТП, тыловой терминал',
 '40HC', 'TCNU7745019', 'Оборудование промышленное',
 (now() + interval '7 days')::date, now() + interval '12 days',
 340000, NULL, 480000, 5000,
 now() + interval '30 hours', true, true,
 false, false, 'vat20',
 29400, 25500, 3900, false, 6000,
 'Шаг 5 000 ₽, потолок 480 000 ₽.'),

-- Аукцион 2 — реф
('d0000014-0000-0000-0000-000000000014', 'c0000004-0000-0000-0000-000000000004',
 'auction', 'active',
 'Новосибирск', 'ст. Клещиха, площадка 1', 'Москва', 'Селятино, хладотерминал',
 '40REF', 'TKRU6612390', 'Продукты глубокой заморозки',
 (now() + interval '5 days')::date, now() + interval '11 days',
 240000, NULL, 320000, 2000,
 now() + interval '3 days', true, true,
 false, false, 'vat20',
 29100, 24500, 4600, true, 6000,
 'Режим −18 °C на всём плече, генератор обязателен.');


-- Ставки. Порядок вставки важен: validate_bid() сверяется с текущей лучшей.
-- Редукцион 1: 165 000 → 158 000 → 152 000 → 147 000 (шаги кратны 1 000)
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000011-0000-0000-0000-000000000011', 'a0000001-0000-0000-0000-000000000001', 158000, now() - interval '5 hours');
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000011-0000-0000-0000-000000000011', 'a0000002-0000-0000-0000-000000000002', 152000, now() - interval '3 hours');
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000011-0000-0000-0000-000000000011', 'a0000004-0000-0000-0000-000000000004', 147000, now() - interval '40 minutes');

-- Редукцион 2: 210 000 → 203 000 → 198 500 (шаги кратны 500)
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000012-0000-0000-0000-000000000012', 'a0000004-0000-0000-0000-000000000004', 203000, now() - interval '8 hours');
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000012-0000-0000-0000-000000000012', 'a0000002-0000-0000-0000-000000000002', 198500, now() - interval '90 minutes');

-- Аукцион 1: 340 000 → 355 000 → 375 000 → 390 000 (шаги кратны 5 000)
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000013-0000-0000-0000-000000000013', 'a0000003-0000-0000-0000-000000000003', 355000, now() - interval '6 hours');
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000013-0000-0000-0000-000000000013', 'a0000001-0000-0000-0000-000000000001', 375000, now() - interval '2 hours');
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000013-0000-0000-0000-000000000013', 'a0000003-0000-0000-0000-000000000003', 390000, now() - interval '25 minutes');

-- Аукцион 2: 240 000 → 252 000 → 268 000 (шаги кратны 2 000)
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000014-0000-0000-0000-000000000014', 'a0000004-0000-0000-0000-000000000004', 252000, now() - interval '11 hours');
INSERT INTO bids (order_id, carrier_id, amount, created_at) VALUES
 ('d0000014-0000-0000-0000-000000000014', 'a0000001-0000-0000-0000-000000000001', 268000, now() - interval '4 hours');


-- ── 4. Отклики на активные заявки ────────────────────────────────────────────
-- Чтобы у клиента экран «Мои заявки» тоже был живой.
INSERT INTO responses (order_id, carrier_id, message, created_at) VALUES
 ('d0000001-0000-0000-0000-000000000001', 'a0000003-0000-0000-0000-000000000003',
  'Работаем по этому направлению постоянно, машина во Владивостоке. Готов подать под погрузку в указанную дату.', now() - interval '7 hours'),
 ('d0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
  'Возьмём, но подача на день позже. Если устроит — согласуем.', now() - interval '4 hours'),
 ('d0000002-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001',
  'Машина в Петербурге, к 07:30 подадим.', now() - interval '2 hours'),
 ('d0000003-0000-0000-0000-000000000003', 'a0000002-0000-0000-0000-000000000002',
  'Реф с генератором свободен, режим держим. Готовы выехать.', now() - interval '9 hours'),
 ('d0000005-0000-0000-0000-000000000005', 'a0000002-0000-0000-0000-000000000002',
  'Есть машина, но цена интересна от 185 000. Готов обсудить.', now() - interval '1 hour'),
 ('d0000008-0000-0000-0000-000000000008', 'a0000004-0000-0000-0000-000000000004',
  'Направление наше, идём регулярно. Возьмём по вашей цене.', now() - interval '30 minutes'),
 ('d0000008-0000-0000-0000-000000000008', 'a0000002-0000-0000-0000-000000000002',
  'Можем подать 40HC, подтвердите вес брутто.', now() - interval '15 minutes');


-- ── 5. Заявки в работе: matched / in_transit ─────────────────────────────────
INSERT INTO orders (
  id, client_id, accepted_carrier_id, format, status,
  from_city, from_city_address, to_city, to_city_address,
  container_type, container_number, cargo_name,
  ready_date, price, agreed_price, is_negotiable, is_urgent, vat_type,
  weight_gross, weight_net, weight_tare, requires_genset, downtime_rate,
  tracking_enabled, tracking_status, created_at
) VALUES

('d0000021-0000-0000-0000-000000000021', 'c0000001-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000001', 'regular', 'matched',
 'Москва', 'ТЛЦ «Ворсино», склад 4', 'Санкт-Петербург', 'Шушары, ул. Ленсоветовская, 30',
 '20ft', 'MSKU7781204', 'Упаковочный картон',
 (now() + interval '2 days')::date, 58000, 55000, false, false, 'vat20',
 20450, 18200, 2250, false, 3000,
 false, NULL, now() - interval '2 days'),

('d0000022-0000-0000-0000-000000000022', 'c0000003-0000-0000-0000-000000000003',
 'a0000002-0000-0000-0000-000000000002', 'regular', 'matched',
 'Екатеринбург', 'ст. Аппаратная', 'Казань', 'Свияжский ММПЦ',
 '40ft', 'TCNU3390871', 'Мебельные комплектующие',
 (now() + interval '1 day')::date, 96000, 93000, false, false, 'vat20',
 26250, 22500, 3750, false, 4000,
 false, NULL, now() - interval '1 day'),

('d0000023-0000-0000-0000-000000000023', 'c0000002-0000-0000-0000-000000000002',
 'a0000003-0000-0000-0000-000000000003', 'regular', 'in_transit',
 'Санкт-Петербург', 'Первый контейнерный терминал', 'Екатеринбург', 'ТЛЦ «Уральский»',
 '40ft', 'FESU4402913', 'Электроника',
 (now() - interval '2 days')::date, 182000, 176000, false, false, 'vat20',
 25750, 22000, 3750, false, 4500,
 true, 'В пути, прошёл Нижний Новгород', now() - interval '5 days'),

('d0000024-0000-0000-0000-000000000024', 'c0000004-0000-0000-0000-000000000004',
 'a0000004-0000-0000-0000-000000000004', 'urgent', 'in_transit',
 'Новосибирск', 'ст. Клещиха', 'Омск', 'ул. Семафорная, 12',
 '20ft', 'TKRU2218805', 'Запчасти для спецтехники',
 (now() - interval '1 day')::date, 47000, 47000, false, true, 'none',
 19850, 17600, 2250, false, 2500,
 true, 'Загружен, вышел с терминала', now() - interval '3 days'),

('d0000025-0000-0000-0000-000000000025', 'c0000001-0000-0000-0000-000000000001',
 'a0000003-0000-0000-0000-000000000003', 'regular', 'in_transit',
 'Владивосток', 'ВМТП, причал 9', 'Хабаровск', 'ул. Индустриальная, 4',
 '40HC', 'MSKU9917336', 'Автошины',
 (now() - interval '1 day')::date, 88000, 85000, false, false, 'vat20',
 26900, 23000, 3900, false, 3500,
 true, 'В пути', now() - interval '4 days');


-- ── 6. История: доставленные заявки под отзывы ───────────────────────────────
INSERT INTO orders (
  id, client_id, accepted_carrier_id, format, status,
  from_city, to_city, container_type, container_number, cargo_name,
  ready_date, price, agreed_price, is_negotiable, is_urgent, vat_type,
  weight_gross, weight_net, weight_tare, requires_genset, created_at
) VALUES
('d0000031-0000-0000-0000-000000000031', 'c0000001-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000001', 'regular', 'delivered',
 'Москва', 'Нижний Новгород', '20ft', 'MSKU1120448', 'Бытовая химия',
 (now() - interval '18 days')::date, 42000, 40000, false, false, 'vat20',
 20050, 17800, 2250, false, now() - interval '22 days'),

('d0000032-0000-0000-0000-000000000032', 'c0000002-0000-0000-0000-000000000002',
 'a0000002-0000-0000-0000-000000000002', 'regular', 'delivered',
 'Санкт-Петербург', 'Казань', '40ft', 'TCNU5583120', 'Текстиль',
 (now() - interval '15 days')::date, 148000, 143000, false, false, 'vat20',
 25350, 21600, 3750, false, now() - interval '20 days'),

('d0000033-0000-0000-0000-000000000033', 'c0000003-0000-0000-0000-000000000003',
 'a0000004-0000-0000-0000-000000000004', 'regular', 'delivered',
 'Екатеринбург', 'Новосибирск', '40HC', 'FESU7701255', 'Металлопрокат',
 (now() - interval '12 days')::date, 196000, 190000, false, false, 'vat20',
 28800, 24900, 3900, false, now() - interval '17 days'),

('d0000034-0000-0000-0000-000000000034', 'c0000004-0000-0000-0000-000000000004',
 'a0000003-0000-0000-0000-000000000003', 'urgent', 'delivered',
 'Новосибирск', 'Владивосток', '40HC', 'TKRU3348901', 'Оборудование',
 (now() - interval '9 days')::date, 310000, 305000, false, true, 'vat20',
 28100, 24200, 3900, false, now() - interval '15 days'),

('d0000035-0000-0000-0000-000000000035', 'c0000001-0000-0000-0000-000000000001',
 'a0000002-0000-0000-0000-000000000002', 'regular', 'delivered',
 'Москва', 'Ростов-на-Дону', '40ft', 'MSKU4471028', 'Кофе в зёрнах',
 (now() - interval '7 days')::date, 124000, 120000, false, false, 'vat20',
 26750, 23000, 3750, false, now() - interval '12 days'),

('d0000036-0000-0000-0000-000000000036', 'c0000002-0000-0000-0000-000000000002',
 'a0000001-0000-0000-0000-000000000001', 'regular', 'delivered',
 'Санкт-Петербург', 'Москва', '20ft', 'TCNU9902147', 'Комплектующие',
 (now() - interval '5 days')::date, 51000, 49000, false, false, 'none',
 20250, 18000, 2250, false, now() - interval '9 days'),

-- Просроченная и отменённая — чтобы фильтры реестра было на чём показать
('d0000037-0000-0000-0000-000000000037', 'c0000003-0000-0000-0000-000000000003',
 NULL, 'regular', 'expired',
 'Екатеринбург', 'Пермь', '20ft', NULL, 'Стройсмеси',
 (now() - interval '6 days')::date, 39000, NULL, false, false, 'vat20',
 20250, 18000, 2250, false, now() - interval '11 days'),

('d0000038-0000-0000-0000-000000000038', 'c0000004-0000-0000-0000-000000000004',
 NULL, 'regular', 'cancelled',
 'Новосибирск', 'Барнаул', '40ft', NULL, 'Мебель',
 (now() - interval '4 days')::date, 54000, NULL, false, false, 'none',
 24750, 21000, 3750, false, now() - interval '8 days');

UPDATE orders SET expires_at = now() - interval '2 days'
 WHERE id = 'd0000037-0000-0000-0000-000000000037';


-- ── 7. Отзывы — рейтинги в профилях перевозчиков и клиентов ──────────────────
INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES
-- клиент → перевозчик
('d0000031-0000-0000-0000-000000000031', 'c0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
 5, 'Подача вовремя, документы сразу оригиналами. Работаем дальше.', now() - interval '17 days'),
('d0000032-0000-0000-0000-000000000032', 'c0000002-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000002',
 5, 'Всё чётко, водитель на связи весь рейс.', now() - interval '14 days'),
('d0000033-0000-0000-0000-000000000033', 'c0000003-0000-0000-0000-000000000003', 'a0000004-0000-0000-0000-000000000004',
 4, 'На выгрузке задержались на полдня, но предупредили заранее.', now() - interval '11 days'),
('d0000034-0000-0000-0000-000000000034', 'c0000004-0000-0000-0000-000000000004', 'a0000003-0000-0000-0000-000000000003',
 5, 'Дальнее плечо отвезли без единого замечания.', now() - interval '8 days'),
('d0000035-0000-0000-0000-000000000035', 'c0000001-0000-0000-0000-000000000001', 'a0000002-0000-0000-0000-000000000002',
 5, 'Второй рейс с ними, претензий нет.', now() - interval '6 days'),
('d0000036-0000-0000-0000-000000000036', 'c0000002-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001',
 4, 'Нормально доехали, по цене чуть дороже рынка.', now() - interval '4 days'),
-- перевозчик → клиент
('d0000031-0000-0000-0000-000000000031', 'a0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001',
 5, 'Погрузка без простоя, оплата в срок.', now() - interval '17 days'),
('d0000033-0000-0000-0000-000000000033', 'a0000004-0000-0000-0000-000000000004', 'c0000003-0000-0000-0000-000000000003',
 5, 'Всё по документам, вопросов не возникло.', now() - interval '11 days'),
('d0000034-0000-0000-0000-000000000034', 'a0000003-0000-0000-0000-000000000003', 'c0000004-0000-0000-0000-000000000004',
 4, 'Долго согласовывали адрес выгрузки, в остальном хорошо.', now() - interval '8 days'),
('d0000035-0000-0000-0000-000000000035', 'a0000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001',
 5, 'Постоянный заказчик, всё прозрачно.', now() - interval '6 days');


-- ── 8. Машины тестовых перевозчиков ──────────────────────────────────────────
-- truck_number проставляется триггером.
INSERT INTO trucks (
  carrier_id, from_city, to_city, container_type, available_date,
  price, is_negotiable, payload, trailer_type, long_distance, has_genset, status, notes
) VALUES
('a0000001-0000-0000-0000-000000000001', 'Москва', 'Санкт-Петербург', '40ft',
 (now() + interval '1 day')::date, 88000, false, 26, 'контейнеровоз', false, false, 'active',
 'Свободна после выгрузки в Химках.'),
('a0000001-0000-0000-0000-000000000001', 'Москва', 'Воронеж', '20ft',
 (now() + interval '3 days')::date, 46000, true, 20, 'контейнеровоз', false, false, 'active',
 NULL),
('a0000002-0000-0000-0000-000000000002', 'Казань', 'Москва', '40ft',
 (now() + interval '2 days')::date, 97000, false, 25, 'площадка', false, false, 'active',
 'Обратный рейс, готовы к торгу.'),
('a0000003-0000-0000-0000-000000000003', 'Владивосток', 'Хабаровск', '40HC',
 (now() + interval '3 days')::date, 95000, false, 28, 'контейнеровоз', true, false, 'active',
 NULL),
('a0000003-0000-0000-0000-000000000003', 'Владивосток', 'Новосибирск', '40ft',
 (now() + interval '5 days')::date, 268000, true, 26, 'контейнеровоз', true, false, 'active',
 'Дальнее плечо, идём регулярно два раза в месяц.'),
('a0000004-0000-0000-0000-000000000004', 'Новосибирск', 'Екатеринбург', '40REF',
 (now() + interval '2 days')::date, 145000, false, 24, 'реф', true, true, 'active',
 'Генератор свой, режим от −25 °C.'),
('a0000004-0000-0000-0000-000000000004', 'Новосибирск', 'Красноярск', '20ft',
 (now() + interval '1 day')::date, 52000, false, 20, 'контейнеровоз', false, false, 'active',
 NULL);


-- ── 9. Уборка автоуведомлений по закрытым рейсам ─────────────────────────────
-- Триггер notify_response_accepted вешает «внесите данные по водителю» на любую
-- вставку с accepted_carrier_id. Для доставленных это мусор — убираем,
-- по активным (matched/in_transit) оставляем: там оно уместно.
DELETE FROM notifications n
 USING orders o
 WHERE n.user_id IN (SELECT id FROM tu)
   AND n.type = 'response_accepted'
   AND n.link = '/orders/' || o.id || '/chat'
   AND o.status IN ('delivered', 'closed', 'cancelled', 'expired');


-- ── Контроль ─────────────────────────────────────────────────────────────────
SELECT 'активных в ленте'  AS показатель, count(*)::text AS значение FROM orders WHERE status='active' AND format IN ('regular','urgent')
UNION ALL SELECT 'торгов активных',  count(*)::text FROM orders WHERE status='active' AND format IN ('reduction','auction')
UNION ALL SELECT 'ставок',           count(*)::text FROM bids b JOIN orders o ON o.id=b.order_id WHERE o.id::text LIKE 'd0000%'
UNION ALL SELECT 'откликов',         count(*)::text FROM responses r JOIN orders o ON o.id=r.order_id WHERE o.id::text LIKE 'd0000%'
UNION ALL SELECT 'отзывов',          count(*)::text FROM reviews WHERE order_id::text LIKE 'd0000%'
UNION ALL SELECT 'машин тестовых',   count(*)::text FROM trucks WHERE carrier_id::text LIKE 'a0000%'
UNION ALL SELECT 'заявок всего у тестовых', count(*)::text FROM orders WHERE client_id::text LIKE 'c0000%';

SELECT o.format, o.status, o.order_number,
       o.from_city || ' → ' || o.to_city AS маршрут,
       coalesce(o.price, o.auction_start_price) AS цена,
       bb.best_amount AS лучшая_ставка, bb.bid_count AS ставок
  FROM orders o
  LEFT JOIN order_best_bids bb ON bb.order_id = o.id
 WHERE o.id::text LIKE 'd0000%'
 ORDER BY o.format, o.status, o.order_number;

SELECT u.name AS перевозчик, r.avg_rating AS рейтинг, r.review_count AS отзывов
  FROM user_avg_ratings r JOIN users u ON u.id = r.user_id
 WHERE u.id::text LIKE 'a0000%' ORDER BY 1;

COMMIT;
