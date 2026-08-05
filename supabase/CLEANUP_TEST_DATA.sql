-- ════════════════════════════════════════════════════════════════════════
-- ОЧИСТКА ТЕСТОВЫХ ДАННЫХ — НЕ ПРИМЕНЕНО, dry-run
--
-- Периметр: 22 аккаунта —
--   • @test.ru               (9)  — сид первой волны
--   • @kontreil-demo.ru      (11) — сид-демо
--   • kontreil.testclient@gmail.com, kontreil.testcarrier@gmail.com (2) —
--     ручные тест-аккаунты; под шаблон почты не подходят, поэтому заданы
--     списком явно.
--
-- ОСТАЮТСЯ (реальные пользователи, скрипт их не трогает):
--   kamalov.alb2000@yandex.ru, vstk@mail.ru, cheklazercool@yandex.ru,
--   prudnikov.vyacheslav@gmail.com, vprudnikovp@yandex.ru
--
-- Скрипт завершается ROLLBACK. Чтобы применить по-настоящему — заменить
-- последнюю строку на COMMIT. До этого его можно гонять сколько угодно:
-- он ничего не меняет, только печатает, что удалилось бы.
--
-- Порядок удаления задан явно: FK на users в основном NO ACTION (не CASCADE),
-- поэтому «просто DELETE FROM auth.users» упал бы с нарушением FK.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE tu    ON COMMIT DROP AS
  SELECT id FROM auth.users
   WHERE email LIKE '%@test.ru'
      OR email LIKE '%@kontreil-demo.ru'
      OR email IN ('kontreil.testclient@gmail.com', 'kontreil.testcarrier@gmail.com');

CREATE TEMP TABLE tord  ON COMMIT DROP AS
  SELECT id FROM orders WHERE client_id IN (SELECT id FROM tu);

CREATE TEMP TABLE ttruck ON COMMIT DROP AS
  SELECT id FROM trucks WHERE carrier_id IN (SELECT id FROM tu);

-- ── 1. Дети заявок ──────────────────────────────────────────────────────
DELETE FROM order_tracking_events WHERE order_id IN (SELECT id FROM tord);
DELETE FROM order_driver_info     WHERE order_id IN (SELECT id FROM tord);
DELETE FROM order_stops           WHERE order_id IN (SELECT id FROM tord);
DELETE FROM order_tn_versions     WHERE order_id IN (SELECT id FROM tord) OR created_by IN (SELECT id FROM tu);
DELETE FROM order_documents       WHERE order_id IN (SELECT id FROM tord) OR uploaded_by IN (SELECT id FROM tu);
DELETE FROM messages              WHERE order_id IN (SELECT id FROM tord)
                                     OR sender_id IN (SELECT id FROM tu)
                                     OR carrier_id IN (SELECT id FROM tu);
DELETE FROM bids                  WHERE order_id IN (SELECT id FROM tord) OR carrier_id IN (SELECT id FROM tu);
DELETE FROM responses             WHERE order_id IN (SELECT id FROM tord) OR carrier_id IN (SELECT id FROM tu);
DELETE FROM reviews               WHERE order_id IN (SELECT id FROM tord)
                                     OR reviewer_id IN (SELECT id FROM tu)
                                     OR reviewee_id IN (SELECT id FROM tu);

-- ── 2. Дети машин ───────────────────────────────────────────────────────
DELETE FROM truck_messages  WHERE truck_id IN (SELECT id FROM ttruck)
                               OR sender_id IN (SELECT id FROM tu)
                               OR client_id IN (SELECT id FROM tu)
                               OR carrier_id IN (SELECT id FROM tu);
DELETE FROM truck_responses WHERE truck_id IN (SELECT id FROM ttruck) OR client_id IN (SELECT id FROM tu);

-- ── 3. Сами заявки и машины ─────────────────────────────────────────────
-- accepted_carrier_id / auction_winner_id — NO ACTION, поэтому обнуляем
-- ссылки на удаляемых перевозчиков на ЧУЖИХ заявках (сейчас таких 0,
-- но пусть скрипт останется корректным и на будущих данных).
UPDATE orders SET accepted_carrier_id = NULL
  WHERE accepted_carrier_id IN (SELECT id FROM tu) AND id NOT IN (SELECT id FROM tord);
UPDATE orders SET auction_winner_id = NULL
  WHERE auction_winner_id IN (SELECT id FROM tu) AND id NOT IN (SELECT id FROM tord);

DELETE FROM orders WHERE id IN (SELECT id FROM tord);
DELETE FROM trucks WHERE id IN (SELECT id FROM ttruck);

-- ── 4. Данные пользователей ─────────────────────────────────────────────
DELETE FROM counterparties  WHERE owner_id IN (SELECT id FROM tu) OR counterparty_id IN (SELECT id FROM tu);
DELETE FROM company_members WHERE owner_id IN (SELECT id FROM tu);
DELETE FROM saved_routes    WHERE carrier_id IN (SELECT id FROM tu);
DELETE FROM notifications   WHERE user_id IN (SELECT id FROM tu);
DELETE FROM user_private    WHERE id IN (SELECT id FROM tu);

-- ── 5. Storage — ТОЛЬКО через API, не отсюда ────────────────────────────
-- Supabase запрещает прямой DELETE из storage.objects (триггер
-- storage.protect_delete: «Direct deletion from storage tables is not
-- allowed»). Поэтому 6 файлов надо снести отдельно, ДО или ПОСЛЕ этого
-- скрипта — см. CLEANUP_TEST_STORAGE.sh рядом. Если этого не сделать,
-- в бакетах останутся сироты: строки order_documents уйдут, файлы нет.

-- ── 6. Пользователи ─────────────────────────────────────────────────────
DELETE FROM public.users  WHERE id IN (SELECT id FROM tu);
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM tu);
DELETE FROM auth.sessions   WHERE user_id IN (SELECT id FROM tu);
DELETE FROM auth.users      WHERE id IN (SELECT id FROM tu);

-- ── Контроль: что осталось ──────────────────────────────────────────────
SELECT 'users'  AS tbl, count(*) AS остаток FROM public.users
UNION ALL SELECT 'orders',        count(*) FROM orders
UNION ALL SELECT 'trucks',        count(*) FROM trucks
UNION ALL SELECT 'responses',     count(*) FROM responses
UNION ALL SELECT 'bids',          count(*) FROM bids
UNION ALL SELECT 'messages',      count(*) FROM messages
UNION ALL SELECT 'notifications', count(*) FROM notifications
ORDER BY 1;

-- ⚠️  Заменить на COMMIT, чтобы применить.
ROLLBACK;
