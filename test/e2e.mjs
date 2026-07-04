/**
 * E2E / интеграционные тесты уровня API+данных (Supabase REST + RLS).
 *
 * Гоняют функционал «туда-сюда» без браузера, поэтому НЕ ломаются при редизайне UI.
 * Создают собственных тестовых пользователей и данные, в конце всё удаляют.
 *
 * По умолчанию — против ЛОКАЛЬНОГО стека (безопасно). Для прода задать env:
 *   E2E_URL, E2E_ANON_KEY, E2E_SERVICE_KEY   (и запускать осознанно!)
 *
 * Запуск:  npm run test:e2e
 */
import { createClient } from '@supabase/supabase-js'

// ── Конфиг (локальные ключи Supabase — стандартные demo-ключи, не секрет) ──
const URL = process.env.E2E_URL || 'http://127.0.0.1:54121'
const ANON = process.env.E2E_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.E2E_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const IS_PROD = !URL.includes('127.0.0.1') && !URL.includes('localhost')

// ── Мини-фреймворк ──
let passed = 0, failed = 0, warned = 0
const fails = []
function ok(label, detail = '') { passed++; console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`) }
function bad(label, detail = '') { failed++; fails.push(`${label}${detail ? `: ${detail}` : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`) }
function warn(label, detail = '') { warned++; console.log(`  \x1b[33m⚠\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`) }
function section(t) { console.log(`\n\x1b[1m\x1b[36m${t}\x1b[0m`) }
function assert(cond, label, detail = '') { cond ? ok(label, detail) : bad(label, detail) }

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

async function makeUser(role, extra = {}) {
  const email = `e2e_${role}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`
  const password = 'Test1234!e2e'
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role, name: `E2E ${role}`, city: 'Москва', ...extra },
  })
  if (error) throw new Error(`createUser(${role}): ${error.message}`)
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signErr } = await client.auth.signInWithPassword({ email, password })
  if (signErr) throw new Error(`signIn(${role}): ${signErr.message}`)
  return { id: data.user.id, email, client }
}

const created = { userIds: [], orderIds: [], truckIds: [] }

async function cleanup() {
  section('Очистка тестовых данных')
  for (const oid of created.orderIds) {
    await admin.from('reviews').delete().eq('order_id', oid)
    await admin.from('messages').delete().eq('order_id', oid)
    await admin.from('responses').delete().eq('order_id', oid)
    await admin.from('bids').delete().eq('order_id', oid)
    await admin.from('order_stops').delete().eq('order_id', oid)
    await admin.from('orders').delete().eq('id', oid)
  }
  for (const tid of created.truckIds) {
    await admin.from('truck_messages').delete().eq('truck_id', tid)
    await admin.from('truck_responses').delete().eq('truck_id', tid)
    await admin.from('trucks').delete().eq('id', tid)
  }
  for (const uid of created.userIds) {
    await admin.from('notifications').delete().eq('user_id', uid)
    await admin.from('users').delete().eq('id', uid)   // профиль (FK без ON DELETE CASCADE)
    await admin.auth.admin.deleteUser(uid).catch(() => {})
  }
  ok('Данные удалены', `${created.orderIds.length} заявок, ${created.userIds.length} пользователей`)
}

async function main() {
  console.log(`\x1b[1mE2E против:\x1b[0m ${URL} ${IS_PROD ? '\x1b[31m(ПРОД!)\x1b[0m' : '(локально)'}`)
  if (IS_PROD && !process.env.E2E_ALLOW_PROD) {
    console.log('\x1b[31mОтказ: запуск против прода без E2E_ALLOW_PROD=1\x1b[0m')
    process.exit(2)
  }

  // ── Setup ──
  section('1. Регистрация пользователей и автосоздание профиля (триггер)')
  const client = await makeUser('client')
  const carrier = await makeUser('carrier')
  const carrier2 = await makeUser('carrier')
  created.userIds.push(client.id, carrier.id, carrier2.id)

  const { data: profs } = await admin.from('users').select('id, role').in('id', [client.id, carrier.id])
  assert(profs?.find(p => p.id === client.id)?.role === 'client', 'Профиль клиента создан триггером с ролью client')
  assert(profs?.find(p => p.id === carrier.id)?.role === 'carrier', 'Профиль перевозчика создан триггером с ролью carrier')

  // ── Создание заявки ──
  section('2. Клиент создаёт заявку')
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
  const readyDate = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: order, error: orderErr } = await client.client.from('orders').insert({
    client_id: client.id, format: 'regular',
    from_city: 'Москва', to_city: 'Санкт-Петербург',
    container_type: '40HC', ready_date: readyDate, expires_at: future,
    price: 85000, is_negotiable: false, vat_type: 'vat20',
    tracking_enabled: true, hide_phone: true,
  }).select().single()
  assert(!orderErr && order, 'Заявка создана', orderErr?.message)
  if (!order) { await cleanup(); return finish() }
  created.orderIds.push(order.id)
  assert(!!order.order_number, 'Номер заявки присвоен триггером', order.order_number)
  assert(order.status === 'active', 'Статус по умолчанию active')

  // negative: перевозчик не может создать заявку от имени клиента (RLS WITH CHECK)
  const { error: forgeErr } = await carrier.client.from('orders').insert({
    client_id: client.id, format: 'regular', from_city: 'A', to_city: 'B',
    container_type: '20ft', ready_date: readyDate, expires_at: future, price: 1, vat_type: 'none',
  }).select().single()
  assert(!!forgeErr, 'RLS: перевозчик НЕ может создать заявку от чужого имени', forgeErr?.code)

  // ── Лента ──
  section('3. Перевозчик видит заявку в ленте')
  const { data: feed } = await carrier.client.from('orders').select('id').eq('status', 'active').eq('id', order.id)
  assert(feed?.length === 1, 'Активная заявка видна перевозчику')

  // ── Отклик ──
  section('4. Отклик перевозчика + уведомление клиенту')
  const { error: respErr } = await carrier.client.from('responses').insert({
    order_id: order.id, carrier_id: carrier.id, message: 'Готов взять рейс',
  })
  assert(!respErr, 'Отклик создан', respErr?.message)

  const { error: dupErr } = await carrier.client.from('responses').insert({
    order_id: order.id, carrier_id: carrier.id,
  })
  assert(dupErr?.code === '23505', 'Повторный отклик отклонён (unique)', dupErr?.code)

  await new Promise(r => setTimeout(r, 300)) // ждём триггер уведомления
  const { data: notif1 } = await admin.from('notifications').select('*')
    .eq('user_id', client.id).eq('type', 'new_response')
  assert((notif1?.length || 0) >= 1, 'Клиент получил уведомление new_response')

  // RLS: чужой перевозчик не видит отклик
  const { data: c2see } = await carrier2.client.from('responses').select('id').eq('order_id', order.id)
  assert((c2see?.length || 0) === 0, 'RLS: посторонний перевозчик не видит чужие отклики')
  // Клиент видит отклики на свою заявку
  const { data: clientSee } = await client.client.from('responses').select('id').eq('order_id', order.id)
  assert((clientSee?.length || 0) === 1, 'Клиент видит отклики на свою заявку')

  // ── Приём перевозчика ──
  section('5. Клиент принимает перевозчика')
  const { error: acceptErr } = await client.client.from('orders')
    .update({ accepted_carrier_id: carrier.id, status: 'matched', agreed_price: 80000 })
    .eq('id', order.id)
  assert(!acceptErr, 'Перевозчик принят, статус matched', acceptErr?.message)

  // negative: посторонний перевозчик не может менять чужую заявку (RLS update → 0 строк)
  await carrier2.client.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
  const { data: still } = await admin.from('orders').select('status').eq('id', order.id).single()
  assert(still?.status === 'matched', 'RLS: посторонний не может изменить чужую заявку')

  // ── Чат ──
  section('6. Чат участников сделки + изоляция')
  const { error: msgErr } = await client.client.from('messages').insert({
    order_id: order.id, sender_id: client.id, carrier_id: carrier.id, text: 'Здравствуйте!',
  })
  assert(!msgErr, 'Клиент отправил сообщение', msgErr?.message)

  const { data: carrierMsgs } = await carrier.client.from('messages').select('*')
    .eq('order_id', order.id).eq('carrier_id', carrier.id)
  assert((carrierMsgs?.length || 0) === 1, 'Принятый перевозчик видит сообщение')

  const { data: c2msgs } = await carrier2.client.from('messages').select('*').eq('order_id', order.id)
  assert((c2msgs?.length || 0) === 0, 'RLS: посторонний перевозчик не видит чат сделки')

  await new Promise(r => setTimeout(r, 300))
  const { data: notif2 } = await admin.from('notifications').select('*')
    .eq('user_id', carrier.id).eq('type', 'new_message')
  assert((notif2?.length || 0) >= 1, 'Перевозчик получил уведомление new_message')

  // ── Задача 8: корректировка заявки → уведомление order_changed с деталями ──
  section('7. Корректировка заявки → уведомление order_changed (задача 8)')
  await client.client.from('orders').update({ price: 90000 }).eq('id', order.id)

  // RLS: клиент НЕ может напрямую создать уведомление другому пользователю
  // (в приложении это делает сервер через service_role — /api/orders/notify-change)
  const { error: rlsErr } = await client.client.from('notifications').insert({
    user_id: carrier.id, type: 'order_changed', link: `/orders/${order.id}`, message: 'x', is_read: false,
  })
  assert(!!rlsErr, 'RLS: клиент не может напрямую вставить уведомление другому', rlsErr?.code)

  // Серверный путь (service_role): тип order_changed и колонка message работают
  const message = 'Клиент скорректировал заявку КТ-00000:\n• Ставка: 85 000 ₽ → 90 000 ₽'
  const { error: ocErr } = await admin.from('notifications').insert({
    user_id: carrier.id, type: 'order_changed', link: `/orders/${order.id}`, message, is_read: false,
  })
  assert(!ocErr, 'order_changed + message принимается (CHECK + колонка) на сервере', ocErr?.message)
  const { data: oc } = await admin.from('notifications').select('message')
    .eq('user_id', carrier.id).eq('type', 'order_changed').single()
  assert(!!oc?.message && oc.message.includes('90 000'), 'Текст корректировки сохранён и содержит детали')

  // ── Доставка + отзыв ──
  section('8. В пути → доставлено → отзыв')
  await client.client.from('orders').update({ status: 'in_transit' }).eq('id', order.id)
  const { error: delErr } = await client.client.from('orders').update({ status: 'delivered' }).eq('id', order.id)
  assert(!delErr, 'Статус доставлено выставлен клиентом', delErr?.message)

  const { error: revErr } = await client.client.from('reviews').insert({
    order_id: order.id, reviewer_id: client.id, reviewee_id: carrier.id, rating: 5, comment: 'Отлично',
  })
  assert(!revErr, 'Отзыв клиента о перевозчике создан', revErr?.message)

  // RLS: посторонний не может оставить отзыв по чужому заказу (накрутка рейтинга)
  const { error: fakeRev } = await carrier2.client.from('reviews').insert({
    order_id: order.id, reviewer_id: carrier2.id, reviewee_id: carrier.id, rating: 1,
  })
  assert(!!fakeRev, 'RLS: посторонний не может оставить отзыв по чужому заказу', fakeRev?.code)

  // ── Телефон вынесен в user_private — закрыт от чужих (own-row RLS) ──
  section('9. Телефон в user_private, закрыт от посторонних')
  await admin.from('user_private').upsert({ id: client.id, phone: '+79990001122' }, { onConflict: 'id' })

  // Колонки phone в общей таблице users больше нет — прямой утечки не существует
  const { error: colErr } = await admin.from('users').select('phone').eq('id', client.id).maybeSingle()
  assert(!!colErr, 'Колонка phone удалена из общей users (нет прямого чтения)', colErr?.message?.slice(0, 45))

  // Посторонний НЕ может прочитать чужой телефон из user_private
  const { data: leakedPhone } = await carrier2.client.from('user_private').select('phone').eq('id', client.id).maybeSingle()
  assert(!leakedPhone?.phone, 'Посторонний НЕ читает чужой телефон из user_private (RLS)')

  // Свой телефон доступен владельцу через SECURITY DEFINER get_own_phone()
  const { data: ownPhone } = await client.client.rpc('get_own_phone')
  assert(ownPhone === '+79990001122', 'Свой телефон доступен владельцу через get_own_phone()')

  // ── Приватные реквизиты: банковские данные закрыты RLS ──
  section('10. Приватные реквизиты (user_private) закрыты RLS')
  const { error: privWriteErr } = await client.client.from('user_private')
    .upsert({ id: client.id, bank_account: '40702810000000000001', bank_bik: '044525974' }, { onConflict: 'id' })
  assert(!privWriteErr, 'Владелец может записать свои реквизиты', privWriteErr?.message)

  const { data: ownPriv } = await client.client.from('user_private').select('bank_account').eq('id', client.id).maybeSingle()
  assert(ownPriv?.bank_account === '40702810000000000001', 'Владелец читает свои реквизиты')

  const { data: leakPriv } = await carrier2.client.from('user_private').select('bank_account').eq('id', client.id).maybeSingle()
  assert(!leakPriv, 'RLS: посторонний НЕ читает чужие банковские реквизиты')

  const { data: usersCols } = await admin.from('users').select('*').eq('id', client.id).single()
  assert(!('bank_account' in (usersCols || {})), 'Банковских полей больше нет в общей таблице users')

  // ── Storage: документы заказа доступны только участникам ──
  section('11. Документы заказа (Storage) изолированы по участникам')
  const docPath = `${order.id}/e2e_${Date.now()}.pdf`
  const pdf = Buffer.from('%PDF-1.4 e2e test')
  const { error: upErr } = await client.client.storage.from('order-docs')
    .upload(docPath, pdf, { contentType: 'application/pdf' })
  assert(!upErr, 'Участник (клиент) загрузил документ', upErr?.message)

  const { data: carrierDl } = await carrier.client.storage.from('order-docs').download(docPath)
  assert(!!carrierDl, 'Откликнувшийся перевозчик может скачать документ')

  const { data: c2dl, error: c2dlErr } = await carrier2.client.storage.from('order-docs').download(docPath)
  assert(!c2dl || !!c2dlErr, 'RLS: посторонний НЕ может скачать чужой документ')

  const { data: c2del } = await carrier2.client.storage.from('order-docs').remove([docPath])
  assert(!c2del || c2del.length === 0, 'RLS: посторонний НЕ может удалить чужой документ')

  await admin.storage.from('order-docs').remove([docPath]).catch(() => {})

  // ── Схема: дрейф миграций прод↔локаль (ловит «пропавшую таблицу») ──
  section('12. Схема: все ожидаемые таблицы/вью на месте (ловит дрейф миграций)')
  const EXPECTED_RELS = [
    'users', 'user_private', 'orders', 'order_stops', 'order_documents',
    'responses', 'messages', 'reviews', 'bids', 'trucks', 'truck_responses',
    'truck_messages', 'notifications', 'saved_routes', 'company_members',
    'counterparties', 'user_avg_ratings', 'order_best_bids',
  ]
  for (const rel of EXPECTED_RELS) {
    const { error } = await admin.from(rel).select('*', { head: true, count: 'exact' })
    assert(!error, `Объект «${rel}» существует и доступен`, error?.message)
  }

  // ── Регресс 0007: users.select(*) не должен падать у авторизованного ──
  section('13. users.select(*) доступен авторизованному (регресс приватности)')
  const { data: uStar, error: uStarErr } = await client.client
    .from('users').select('*').eq('id', client.id).single()
  assert(!uStarErr && uStar?.id === client.id, 'Авторизованный читает свой профиль через select(*)', uStarErr?.message)
  const { error: embErr } = await client.client
    .from('orders').select('*, client:users!client_id(*)').eq('id', order.id).single()
  assert(!embErr, 'Эмбед client:users!client_id(*) в orders работает', embErr?.message)

  // ── Контрагенты: добавление / чтение / дубль / удаление ──
  section('14. Контрагенты: добавление, чтение, дубль, удаление')
  const { data: cp, error: cpErr } = await client.client.from('counterparties')
    .insert({ owner_id: client.id, counterparty_id: carrier.id, note: 'e2e' }).select().single()
  assert(!cpErr && !!cp?.id, 'Клиент добавляет перевозчика в контрагенты', cpErr?.message)
  const { data: cpList } = await client.client.from('counterparties')
    .select('*, counterparty:users!counterparty_id(id, name)').eq('owner_id', client.id)
  assert(!!cpList?.some(c => c.counterparty_id === carrier.id), 'Контрагент читается с эмбедом users')
  const { data: whoAdded } = await carrier.client.from('counterparties')
    .select('owner_id').eq('counterparty_id', carrier.id)
  assert(!!whoAdded?.some(w => w.owner_id === client.id), 'Перевозчик видит, кто его добавил (SELECT policy)')
  const { error: cpDupErr } = await client.client.from('counterparties')
    .insert({ owner_id: client.id, counterparty_id: carrier.id })
  assert(!!cpDupErr, 'Повторное добавление контрагента отклонено (UNIQUE)')
  if (cp?.id) {
    const { error: delErr } = await client.client.from('counterparties').delete().eq('id', cp.id)
    assert(!delErr, 'Клиент удаляет своего контрагента', delErr?.message)
  }

  // ── Профиль: сохранение публичных (users) + приватных (user_private) реквизитов ──
  section('15. Профиль: сохранение реквизитов для договор-заявки')
  const { error: pubErr } = await client.client.from('users')
    .update({ name: 'ООО Ромашка', city: 'Казань', company_name: 'ООО Ромашка', inn: '7701234567' })
    .eq('id', client.id)
  assert(!pubErr, 'Клиент сохраняет публичные реквизиты (users)', pubErr?.message)
  const { error: privErr2 } = await client.client.from('user_private')
    .upsert({ id: client.id, phone: '+79990002233', kpp: '770101001', ogrn: '1027700132195', bank_name: 'Т-Банк', signatory_name: 'Иванов И.И.' }, { onConflict: 'id' })
  assert(!privErr2, 'Клиент сохраняет реквизиты договора (user_private)', privErr2?.message)
  const { data: ownPhone2 } = await client.client.rpc('get_own_phone')
  assert(ownPhone2 === '+79990002233', 'Телефон из профиля сохранился в user_private')
  const { data: back } = await client.client.from('user_private')
    .select('kpp, signatory_name').eq('id', client.id).single()
  assert(back?.kpp === '770101001' && back?.signatory_name === 'Иванов И.И.', 'Реквизиты договора читаются обратно')

  // ── Отмена заявки владельцем (позитивный путь) ──
  section('16. Отмена заявки владельцем')
  const { data: cancelOrder } = await client.client.from('orders').insert({
    client_id: client.id, format: 'regular', from_city: 'Москва', to_city: 'Тула',
    container_type: '20ft', ready_date: readyDate, expires_at: future, price: 50000, vat_type: 'none',
  }).select().single()
  created.orderIds.push(cancelOrder.id)
  const { error: cancErr } = await client.client.from('orders')
    .update({ status: 'cancelled' }).eq('id', cancelOrder.id)
  assert(!cancErr, 'Владелец отменяет свою заявку', cancErr?.message)
  const { data: cancCheck } = await admin.from('orders').select('status').eq('id', cancelOrder.id).single()
  assert(cancCheck?.status === 'cancelled', 'Заявка в статусе cancelled')

  // ── Грузовик: публикация → отклик клиента → приёмка перевозчиком ──
  section('17. Грузовик: публикация, отклик, приёмка')
  const { data: truck, error: truckErr } = await carrier.client.from('trucks').insert({
    carrier_id: carrier.id, from_city: 'Москва', to_city: 'Казань',
    container_type: '20ft', available_date: readyDate, price: 60000, is_negotiable: true,
  }).select().single()
  assert(!truckErr, 'Перевозчик публикует свободный грузовик', truckErr?.message)
  if (truck?.id) created.truckIds.push(truck.id)
  assert(truck?.status === 'active', 'Грузовик по умолчанию active')

  // RLS: чужой перевозчик не может публиковать грузовик от имени другого
  const { error: truckForge } = await carrier2.client.from('trucks').insert({
    carrier_id: carrier.id, from_city: 'A', to_city: 'B',
    container_type: '20ft', available_date: readyDate,
  }).select().single()
  assert(!!truckForge, 'RLS: нельзя опубликовать грузовик от чужого имени', truckForge?.code)

  const { error: trErr } = await client.client.from('truck_responses').insert({
    truck_id: truck.id, client_id: client.id, message: 'Возьмёте мой груз?',
  })
  assert(!trErr, 'Клиент откликнулся на грузовик', trErr?.message)

  const { error: trAccErr } = await carrier.client.from('trucks')
    .update({ status: 'busy' }).eq('id', truck.id)
  assert(!trAccErr, 'Перевозчик принял заказ (грузовик → busy)', trAccErr?.message)
  const { data: trCheck } = await admin.from('trucks').select('status').eq('id', truck.id).single()
  assert(trCheck?.status === 'busy', 'Грузовик в статусе busy')

  await cleanup()
  finish()
}

function finish() {
  console.log(`\n\x1b[1mИтог:\x1b[0m \x1b[32m${passed} passed\x1b[0m, ` +
    `${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}` +
    `${warned ? `, \x1b[33m${warned} warn\x1b[0m` : ''}`)
  if (failed) { console.log('\nПровалы:'); fails.forEach(f => console.log('  - ' + f)) }
  process.exit(failed ? 1 : 0)
}

main().catch(async (e) => {
  console.error('\n\x1b[31mФатальная ошибка:\x1b[0m', e.message)
  try { await cleanup() } catch {}
  process.exit(1)
})
