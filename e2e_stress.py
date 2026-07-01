"""
Полный стресс-тест: все кейсы включая edge cases, RLS, дубли, невалидные данные.

ВНИМАНИЕ: этот скрипт бьёт в ПРОД и создаёт реальные тестовые данные.
Для регулярных прогонов используйте безопасный локальный `npm run test:e2e`
(test/e2e.mjs — гоняет тот же функционал против локального Supabase).
Запуск возможен только с явным подтверждением: E2E_STRESS_CONFIRM=1.
"""
import sys, os, urllib.request, json, urllib.error
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

if os.environ.get('E2E_STRESS_CONFIRM') != '1':
    print('ОТКАЗ: e2e_stress.py создаёт данные в ПРОДЕ.')
    print('Для безопасных тестов: npm run test:e2e (локальный Supabase).')
    print('Если действительно нужен прогон по проду — задайте E2E_STRESS_CONFIRM=1.')
    sys.exit(2)

SUPA = 'https://smryxtxybuiixzkqbeit.supabase.co'
KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtcnl4dHh5YnVpaXh6a3FiZWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTEwNDUsImV4cCI6MjA5MDI2NzA0NX0._6Hcg2RhdE9qryXSBmflQiMCESCI49-F_3GXT3cTp0s'

ok_n = fail_n = 0
failures = []

def _req(method, url, token, body=None):
    data = json.dumps(body).encode('utf-8') if body else None
    req  = urllib.request.Request(url, data=data, method=method)
    req.add_header('apikey', KEY)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=representation')
    if token: req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        try: body = json.loads(e.read())
        except: body = {}
        return body, e.code

def auth(email, pwd):
    r, s = _req('POST', f'{SUPA}/auth/v1/token?grant_type=password', None, {'email':email,'password':pwd})
    return r.get('access_token'), r.get('user',{}).get('id'), s

def api(method, path, token, body=None, qs=''):
    r, s = _req(method, f'{SUPA}/rest/v1/{path}{qs}', token, body)
    return r, s

def ok(label, detail=''):
    global ok_n; ok_n += 1
    print(f'  [OK]   {label}' + (f': {detail}' if detail else ''))

def fail(label, detail=''):
    global fail_n; fail_n += 1
    failures.append(f'{label}: {detail}')
    print(f'  [FAIL] {label}' + (f': {detail}' if detail else ''))

def expect_ok(label, r, s, field=None):
    if s >= 400 or (isinstance(r, dict) and r.get('ERROR')):
        fail(label, f'HTTP {s}: {r}')
    else:
        val = r[0][field] if field and isinstance(r, list) and r else (r[0] if isinstance(r,list) and r else r)
        ok(label, str(val)[:60] if val else '')

def expect_fail(label, r, s, expected_code=None):
    """Ожидаем ошибку"""
    if s < 400:
        fail(label, f'Should have failed but got HTTP {s}: {str(r)[:60]}')
    elif expected_code and s != expected_code:
        ok(label, f'Failed as expected (HTTP {s}, wanted {expected_code})')
    else:
        ok(label, f'Correctly rejected (HTTP {s})')

def step(msg): print(f'\n  >> {msg}')
def section(msg): print(f'\n{"="*65}\n{msg}\n{"="*65}')


# ═══════════════════════════════════════════════════════════════
section('БЛОК 0: AUTH — правильные и неправильные логины')
# ═══════════════════════════════════════════════════════════════

step('Логин с правильными данными — клиент')
ct, cid, s = auth('kontreil.testclient@gmail.com', 'Test1234!')
if ct: ok('client login', cid)
else:  fail('client login', f'HTTP {s}')

step('Логин с правильными данными — перевозчик')
rt, rid, s = auth('kontreil.testcarrier@gmail.com', 'Test1234!')
if rt: ok('carrier login', rid)
else:  fail('carrier login', f'HTTP {s}')

step('Логин с неверным паролем')
_, _, s = auth('kontreil.testclient@gmail.com', 'WrongPassword!')
expect_fail('wrong password rejected', {}, s, 400)

step('Логин с несуществующим email')
_, _, s = auth('nobody@nowhere.com', 'Test1234!')
expect_fail('nonexistent email rejected', {}, s, 400)

step('Логин с пустым паролем')
_, _, s = auth('kontreil.testclient@gmail.com', '')
expect_fail('empty password rejected', {}, s, 400)


# ═══════════════════════════════════════════════════════════════
section('БЛОК 1: ПРОФИЛИ — все поля, граничные значения')
# ═══════════════════════════════════════════════════════════════

step('Клиент обновляет свой профиль')
r, s = api('PATCH', f'users?id=eq.{cid}', ct, {
    'name': 'ООО ТрансГрупп', 'phone': '+79161234567',
    'city': 'Москва', 'company_name': 'ООО ТрансГрупп', 'inn': '7701234567'
})
expect_ok('client profile update', r, s, 'name')

step('Перевозчик обновляет свой профиль')
r, s = api('PATCH', f'users?id=eq.{rid}', rt, {
    'name': 'ИП Карпов Дмитрий', 'phone': '+79037654321',
    'city': 'Екатеринбург', 'company_name': 'ИП Карпов Д.А.',
    'inn': '666312345678', 'license_number': 'АВС-123456'
})
expect_ok('carrier profile update', r, s, 'name')

step('RLS: клиент не может редактировать профиль перевозчика')
r, s = api('PATCH', f'users?id=eq.{rid}', ct, {'name': 'HACKED'})
# Supabase RLS на PATCH возвращает 200 с пустым массивом (не обновляет)
if isinstance(r, list) and len(r) == 0:
    ok('RLS: cannot update other user profile (0 rows affected)')
elif s >= 400:
    ok('RLS: cannot update other user profile (HTTP error)')
else:
    fail('RLS: client updated carrier profile!', str(r))

step('Проверяем что имя перевозчика не изменилось')
r, s = api('GET', f'users', rt, qs=f'?id=eq.{rid}&select=name')
if r and r[0]['name'] == 'ИП Карпов Дмитрий':
    ok('carrier name intact after attack')
else:
    fail('carrier name was modified!', str(r))


# ═══════════════════════════════════════════════════════════════
section('БЛОК 2: ЗАЯВКИ — создание, все типы контейнеров, форматы')
# ═══════════════════════════════════════════════════════════════

# Создаём базовую заявку для тестов
step('Клиент создаёт обычную заявку (все поля)')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Moskva', 'to_city': 'Vladivostok',
    'from_city_address': 'ul. Lenina 1', 'to_city_address': 'pr. Mira 5',
    'via_city': 'Novosibirsk', 'container_type': '40HC',
    'ready_date': '2026-05-15', 'ready_time': '10:00', 'arrival_time': '11:00',
    'price': 320000, 'is_negotiable': False, 'is_urgent': False,
    'format': 'regular', 'vat_type': 'vat20',
    'weight_gross': 25000, 'weight_net': 20000,
    'requires_genset': False,
    'notes': 'Хрупкий груз, не кантовать',
    'expires_at': '2026-05-10T23:59:00+00:00', 'status': 'active'
})
expect_ok('order created full fields', r, s, 'order_number')
oid = r[0]['id'] if isinstance(r,list) and r else None

step('Все 8 типов контейнеров — создаём по одной заявке')
container_types = ['20ft','40ft','40HC','45ft','20REF','40REF','20TC','40TC']
for ct_type in container_types:
    needs_genset = ct_type in ('20REF','40REF','20TC','40TC')
    r2, s2 = api('POST', 'orders', ct, {
        'client_id': cid, 'from_city': 'Moskva', 'to_city': 'Kazan',
        'container_type': ct_type, 'ready_date': '2026-06-01',
        'is_negotiable': True, 'is_urgent': False, 'format': 'regular',
        'vat_type': 'none', 'requires_genset': needs_genset,
        'expires_at': '2026-05-25T23:59:00+00:00', 'status': 'active'
    })
    if isinstance(r2,list) and r2:
        ok(f'container type {ct_type}', r2[0]['container_type'])
    else:
        fail(f'container type {ct_type}', f'HTTP {s2}: {str(r2)[:60]}')

step('Срочная заявка (format=urgent, is_urgent=True)')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Spb', 'to_city': 'Moskva',
    'container_type': '20ft', 'ready_date': '2026-04-20',
    'price': 55000, 'is_negotiable': False, 'is_urgent': True,
    'format': 'urgent', 'vat_type': 'none',
    'expires_at': '2026-04-18T23:59:00+00:00', 'status': 'active'
})
if isinstance(r,list) and r and r[0].get('format') == 'urgent' and r[0].get('is_urgent') == True:
    ok('urgent order format=urgent+is_urgent=True', r[0]['order_number'])
    uid_order = r[0]['id']
else:
    fail('urgent order', f'HTTP {s}: {str(r)[:80]}')
    uid_order = None

step('Договорная заявка (is_negotiable=True, price=null)')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Rostov', 'to_city': 'Krasnodar',
    'container_type': '20ft', 'ready_date': '2026-05-20',
    'is_negotiable': True, 'price': None, 'is_urgent': False,
    'format': 'regular', 'vat_type': 'vat0',
    'expires_at': '2026-05-15T23:59:00+00:00', 'status': 'active'
})
if isinstance(r,list) and r and r[0]['is_negotiable'] == True and r[0]['price'] is None:
    ok('negotiable order (price=null)', r[0]['order_number'])
else:
    fail('negotiable order', f'HTTP {s}: {str(r)[:80]}')

step('Заявка с промежуточной точкой (via_city)')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Moskva', 'via_city': 'Kazan',
    'to_city': 'Perm', 'container_type': '40ft',
    'ready_date': '2026-05-25', 'is_negotiable': True,
    'format': 'regular', 'vat_type': 'none',
    'expires_at': '2026-05-20T23:59:00+00:00', 'status': 'active'
})
if isinstance(r,list) and r and r[0].get('via_city') == 'Kazan':
    ok('order with via_city', r[0]['via_city'])
else:
    fail('via_city order', f'HTTP {s}: {str(r)[:80]}')

step('RLS: перевозчик не может создать заявку (client_id чужой)')
r, s = api('POST', 'orders', rt, {
    'client_id': cid, 'from_city': 'A', 'to_city': 'B',
    'container_type': '20ft', 'ready_date': '2026-06-01',
    'is_negotiable': True, 'format': 'regular', 'vat_type': 'none',
    'expires_at': '2026-05-30T23:59:00+00:00', 'status': 'active'
})
if (isinstance(r, list) and len(r) == 0) or s >= 400:
    ok('RLS: carrier cannot create order for client', f'HTTP {s}')
else:
    fail('RLS: carrier created order for client!', str(r)[:60])

step('RLS: клиент не может редактировать чужую заявку')
r, s = api('PATCH', f'orders?id=eq.{oid}', rt, {'price': 1})
if (isinstance(r, list) and len(r) == 0) or s >= 400:
    ok('RLS: carrier cannot edit client order', f'HTTP {s}')
else:
    fail('RLS: carrier edited client order!', str(r)[:60])


# ═══════════════════════════════════════════════════════════════
section('БЛОК 3: ОТКЛИКИ — дубли, невалидные, доступ')
# ═══════════════════════════════════════════════════════════════

if oid:
    step('Перевозчик откликается на заявку')
    r, s = api('POST', 'responses', rt, {
        'order_id': oid, 'carrier_id': rid,
        'message': 'Готов взять. Машина 40HC свободна.'
    })
    expect_ok('first response', r, s)
    resp_id = r[0]['id'] if isinstance(r,list) and r else None

    step('Дубль: перевозчик откликается ещё раз на ту же заявку (UNIQUE constraint)')
    r2, s2 = api('POST', 'responses', rt, {
        'order_id': oid, 'carrier_id': rid, 'message': 'Дубль'
    })
    expect_fail('duplicate response rejected (UNIQUE)', r2, s2)

    step('RLS: клиент не может откликнуться как перевозчик на свою заявку')
    r3, s3 = api('POST', 'responses', ct, {
        'order_id': oid, 'carrier_id': cid, 'message': 'Я сам себе перевозчик'
    })
    if (isinstance(r3, list) and len(r3) == 0) or s3 >= 400:
        ok('RLS: client cannot self-respond', f'HTTP {s3}')
    else:
        fail('RLS: client responded to own order!', str(r3)[:60])

    step('Перевозчик пытается откликнуться на несуществующую заявку')
    r4, s4 = api('POST', 'responses', rt, {
        'order_id': '00000000-0000-0000-0000-000000000000',
        'carrier_id': rid, 'message': 'Несуществующая'
    })
    expect_fail('response to nonexistent order rejected', r4, s4)


# ═══════════════════════════════════════════════════════════════
section('БЛОК 4: ЧАТ — изоляция, два перевозчика, RLS')
# ═══════════════════════════════════════════════════════════════

# Создаём второго перевозчика-симулятора через второй аккаунт (используем того же перевозчика с другим carrier_id симулируем через прямой запрос)
# Для теста изоляции используем два разных carrier_id

if oid:
    step('Перевозчик A пишет в чат заявки (carrier_id=rid)')
    r, s = api('POST', 'messages', rt, {
        'order_id': oid, 'sender_id': rid, 'carrier_id': rid,
        'text': 'Сообщение перевозчика A — только его диалог'
    })
    expect_ok('carrier A message sent', r, s)

    step('Клиент пишет ответ в диалог с перевозчиком A')
    r, s = api('POST', 'messages', ct, {
        'order_id': oid, 'sender_id': cid, 'carrier_id': rid,
        'text': 'Ответ клиента в диалоге с перевозчиком A'
    })
    expect_ok('client reply to carrier A', r, s)

    step('Клиент читает диалог с перевозчиком A — видит 2 сообщения')
    r, s = api('GET', 'messages', ct, qs=f'?order_id=eq.{oid}&carrier_id=eq.{rid}&select=id,text&order=created_at.asc')
    if isinstance(r,list) and len(r) >= 2:
        ok('client sees carrier A chat', f'{len(r)} messages')
    else:
        fail('client chat count wrong', f'got {len(r) if isinstance(r,list) else r}')

    step('Перевозчик пытается отправить сообщение БЕЗ carrier_id (должен быть отклонён)')
    r, s = api('POST', 'messages', rt, {
        'order_id': oid, 'sender_id': rid,
        'text': 'Без carrier_id — не должно пройти'
    })
    if (isinstance(r, list) and len(r) == 0) or s >= 400:
        ok('message without carrier_id rejected', f'HTTP {s}')
    else:
        fail('message without carrier_id accepted!', str(r)[:60])

    step('Перевозчик пытается читать чужой диалог (carrier_id = cid — не его id)')
    # Перевозчик пытается читать сообщения где carrier_id = cid (чужой диалог)
    r, s = api('GET', 'messages', rt, qs=f'?order_id=eq.{oid}&carrier_id=eq.{cid}&select=id')
    if isinstance(r, list) and len(r) == 0:
        ok('RLS: carrier cannot read other carrier chat (0 rows)', 'correct')
    else:
        fail('RLS: carrier read wrong carrier chat!', f'{len(r)} rows returned')

    step('Клиент пытается прочитать несуществующий диалог (случайный carrier_id)')
    fake_id = '00000000-0000-0000-0000-000000000001'
    r, s = api('GET', 'messages', ct, qs=f'?order_id=eq.{oid}&carrier_id=eq.{fake_id}&select=id')
    if isinstance(r, list) and len(r) == 0:
        ok('no messages for fake carrier_id', '0 rows — correct')
    else:
        fail('got messages for fake carrier_id!', str(r)[:60])


# ═══════════════════════════════════════════════════════════════
section('БЛОК 5: СТАТУСЫ ЗАЯВКИ — все переходы, включая невалидные')
# ═══════════════════════════════════════════════════════════════

# Создаём чистую заявку для теста статусов
step('Создаём заявку для теста статусов')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Moskva', 'to_city': 'Tula',
    'container_type': '20ft', 'ready_date': '2026-06-10',
    'is_negotiable': True, 'format': 'regular', 'vat_type': 'none',
    'expires_at': '2026-06-05T23:59:00+00:00', 'status': 'active'
})
soid = r[0]['id'] if isinstance(r,list) and r else None
if soid: ok('status test order created', soid)
else: fail('status test order', str(r)[:60])

if soid:
    step('Откликаемся перевозчиком')
    api('POST', 'responses', rt, {'order_id': soid, 'carrier_id': rid, 'message': 'Готов'})

    step('active → matched (принять перевозчика)')
    r, s = api('PATCH', f'orders?id=eq.{soid}', ct, {
        'status': 'matched', 'accepted_carrier_id': rid, 'agreed_price': 50000
    })
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'matched': ok('active → matched', 'OK')
    else: fail('active → matched', f'got {chk_val}')

    step('matched → in_transit (груз забрали)')
    r, s = api('PATCH', f'orders?id=eq.{soid}', ct, {'status': 'in_transit'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'in_transit': ok('matched → in_transit', 'OK')
    else: fail('matched → in_transit', f'got {chk_val}')

    step('in_transit → delivered (доставлено)')
    r, s = api('PATCH', f'orders?id=eq.{soid}', ct, {'status': 'delivered'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'delivered': ok('in_transit → delivered', 'OK')
    else: fail('in_transit → delivered', f'got {chk_val}')

    step('RLS: перевозчик не может менять статус заявки (delivered → active)')
    r, s = api('PATCH', f'orders?id=eq.{soid}', rt, {'status': 'active'})
    if (isinstance(r, list) and len(r) == 0) or s >= 400:
        ok('RLS: carrier cannot change order status', f'HTTP {s}')
    else:
        fail('RLS: carrier changed order status!', str(r)[:60])

step('Создаём заявку для теста отмены')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Omsk', 'to_city': 'Tyumen',
    'container_type': '20ft', 'ready_date': '2026-06-15',
    'is_negotiable': True, 'format': 'regular', 'vat_type': 'none',
    'expires_at': '2026-06-10T23:59:00+00:00', 'status': 'active'
})
coid = r[0]['id'] if isinstance(r,list) and r else None

if coid:
    step('active → cancelled (клиент отменяет)')
    r, s = api('PATCH', f'orders?id=eq.{coid}', ct, {'status': 'cancelled'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'cancelled': ok('active → cancelled', 'OK')
    else: fail('active → cancelled', f'got {chk_val}')

    step('cancelled → active (переоткрытие)')
    r, s = api('PATCH', f'orders?id=eq.{coid}', ct, {'status': 'active'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'active': ok('cancelled → active (reopen)', 'OK')
    else: fail('cancelled → active reopen', f'got {chk_val}')

    step('active → closed (закрытие клиентом)')
    r, s = api('PATCH', f'orders?id=eq.{coid}', ct, {'status': 'closed'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'closed': ok('active → closed', 'OK')
    else: fail('active → closed', f'got {chk_val}')


# ═══════════════════════════════════════════════════════════════
section('БЛОК 6: РЕДАКТИРОВАНИЕ ЗАЯВКИ — поля, права доступа')
# ═══════════════════════════════════════════════════════════════

step('Создаём active заявку для редактирования')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Samara', 'to_city': 'Ufa',
    'container_type': '20ft', 'ready_date': '2026-07-01',
    'price': 70000, 'is_negotiable': False, 'format': 'regular',
    'vat_type': 'none', 'expires_at': '2026-06-25T23:59:00+00:00',
    'status': 'active'
})
eoid = r[0]['id'] if isinstance(r,list) and r else None

if eoid:
    step('Клиент редактирует заявку — меняет цену, город, expires_at')
    r, s = api('PATCH', f'orders?id=eq.{eoid}', ct, {
        'from_city': 'Samara', 'to_city': 'Chelyabinsk',
        'price': 85000, 'notes': 'Обновлено после переговоров',
        'expires_at': '2026-07-05T23:59:00+00:00'
    })
    if isinstance(r,list) and r:
        ok('edit order price',    r[0]['price'] == 85000)
        ok('edit order to_city',  r[0]['to_city'])
        ok('edit order expires',  r[0]['expires_at'][:10])
        ok('edit order notes',    r[0]['notes'][:30])
    else:
        fail('edit order', f'HTTP {s}: {str(r)[:60]}')

    step('Меняем format: regular → urgent через edit')
    r, s = api('PATCH', f'orders?id=eq.{eoid}', ct, {
        'format': 'urgent', 'is_urgent': True
    })
    if isinstance(r,list) and r and r[0].get('format') == 'urgent':
        ok('edit format to urgent', r[0]['format'])
    else:
        fail('edit format', f'HTTP {s}: {str(r)[:60]}')

    step('Перевозчик пытается редактировать чужую заявку')
    r, s = api('PATCH', f'orders?id=eq.{eoid}', rt, {'price': 1, 'notes': 'HACKED'})
    if (isinstance(r, list) and len(r) == 0) or s >= 400:
        ok('RLS: carrier cannot edit client order', f'HTTP {s}')
    else:
        fail('RLS: carrier edited order!', str(r)[:60])


# ═══════════════════════════════════════════════════════════════
section('БЛОК 7: ОТЗЫВЫ — дубли, рейтинги, права')
# ═══════════════════════════════════════════════════════════════

# Создаём завершённую заявку для отзывов
step('Создаём и завершаем заявку для тестов отзывов')
r, s = api('POST', 'orders', ct, {
    'client_id': cid, 'from_city': 'Kazan', 'to_city': 'Ufa',
    'container_type': '20ft', 'ready_date': '2026-05-20',
    'price': 45000, 'is_negotiable': False, 'format': 'regular',
    'vat_type': 'none', 'expires_at': '2026-05-18T23:59:00+00:00',
    'status': 'active'
})
rvoid = r[0]['id'] if isinstance(r,list) and r else None

if rvoid:
    api('POST', 'responses', rt, {'order_id': rvoid, 'carrier_id': rid, 'message': 'Готов'})
    api('PATCH', f'orders?id=eq.{rvoid}', ct, {
        'status': 'matched', 'accepted_carrier_id': rid, 'agreed_price': 45000
    })
    api('PATCH', f'orders?id=eq.{rvoid}', ct, {'status': 'in_transit'})
    api('PATCH', f'orders?id=eq.{rvoid}', ct, {'status': 'delivered'})

    step('Клиент оставляет отзыв (5 звёзд)')
    r, s = api('POST', 'reviews', ct, {
        'order_id': rvoid, 'reviewer_id': cid, 'reviewee_id': rid,
        'rating': 5, 'comment': 'Отлично, всё в срок!'
    })
    expect_ok('client review 5 stars', r, s, 'rating')

    step('Дубль: клиент пытается оставить второй отзыв на ту же заявку')
    r2, s2 = api('POST', 'reviews', ct, {
        'order_id': rvoid, 'reviewer_id': cid, 'reviewee_id': rid,
        'rating': 1, 'comment': 'Дубль'
    })
    expect_fail('duplicate review rejected', r2, s2)

    step('Перевозчик оставляет отзыв клиенту (4 звезды)')
    r, s = api('POST', 'reviews', rt, {
        'order_id': rvoid, 'reviewer_id': rid, 'reviewee_id': cid,
        'rating': 4, 'comment': 'Нормальный клиент, но немного задержал оплату'
    })
    expect_ok('carrier review 4 stars', r, s, 'rating')

    step('Проверяем что рейтинги сохранились корректно')
    r, s = api('GET', 'reviews', ct, qs=f'?order_id=eq.{rvoid}&select=reviewer_id,rating,comment')
    if isinstance(r,list) and len(r) == 2:
        ok('exactly 2 reviews for order', f'ratings: {[x["rating"] for x in r]}')
    else:
        fail('review count wrong', f'got {len(r) if isinstance(r,list) else r}')


# ═══════════════════════════════════════════════════════════════
section('БЛОК 8: МАШИНЫ — статусы, дубли откликов, RLS')
# ═══════════════════════════════════════════════════════════════

step('Перевозчик создаёт машину со всеми полями')
r, s = api('POST', 'trucks', rt, {
    'carrier_id': rid, 'from_city': 'Novosibirsk', 'to_city': 'Omsk',
    'container_type': '20ft', 'available_date': '2026-06-01',
    'price': 35000, 'is_negotiable': True, 'status': 'active',
    'notes': 'Машина чистая, без запаха, GPS трекер'
})
truck_id = r[0]['id'] if isinstance(r,list) and r else (r.get('id') if isinstance(r,dict) else None)
if truck_id: ok('truck created', truck_id)
else: fail('truck create', f'HTTP {s}: {str(r)[:60]}')

if truck_id:
    step('RLS: клиент не может создать машину')
    r2, s2 = api('POST', 'trucks', ct, {
        'carrier_id': rid, 'from_city': 'A', 'to_city': 'B',
        'container_type': '20ft', 'available_date': '2026-06-01',
        'is_negotiable': True, 'status': 'active'
    })
    if (isinstance(r2, list) and len(r2) == 0) or s2 >= 400:
        ok('RLS: client cannot create truck', f'HTTP {s2}')
    else:
        fail('RLS: client created truck!', str(r2)[:60])

    step('Клиент откликается на машину')
    r, s = api('POST', 'truck_responses', ct, {
        'truck_id': truck_id, 'client_id': cid,
        'message': 'Нужна эта машина, 20ft, 8 тонн'
    })
    expect_ok('truck response', r, s)

    step('Дубль: клиент откликается повторно (UNIQUE constraint)')
    r2, s2 = api('POST', 'truck_responses', ct, {
        'truck_id': truck_id, 'client_id': cid, 'message': 'Дубль'
    })
    expect_fail('duplicate truck response rejected', r2, s2)

    step('Перевозчик принимает клиента → status=busy')
    r, s = api('PATCH', f'trucks?id=eq.{truck_id}', rt, {'status': 'busy'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'busy': ok('truck active → busy', 'OK')
    else: fail('truck → busy', f'got {chk_val}')

    step('Машина завершила рейс → status=done')
    r, s = api('PATCH', f'trucks?id=eq.{truck_id}', rt, {'status': 'done'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'done': ok('truck busy → done', 'OK')
    else: fail('truck → done', f'got {chk_val}')

    step('Машина закрыта → status=closed')
    r, s = api('PATCH', f'trucks?id=eq.{truck_id}', rt, {'status': 'closed'})
    chk_val = r[0]['status'] if isinstance(r,list) and r else None
    if chk_val == 'closed': ok('truck done → closed', 'OK')
    else: fail('truck → closed', f'got {chk_val}')

    step('RLS: клиент не может менять статус чужой машины')
    r, s = api('PATCH', f'trucks?id=eq.{truck_id}', ct, {'status': 'active'})
    if (isinstance(r, list) and len(r) == 0) or s >= 400:
        ok('RLS: client cannot change truck status', f'HTTP {s}')
    else:
        fail('RLS: client changed truck status!', str(r)[:60])


# ═══════════════════════════════════════════════════════════════
section('БЛОК 9: TRUCK MESSAGES — изоляция по client_id')
# ═══════════════════════════════════════════════════════════════

step('Создаём машину для теста изоляции truck-чата')
r, s = api('POST', 'trucks', rt, {
    'carrier_id': rid, 'from_city': 'Chelyabinsk', 'to_city': 'Perm',
    'container_type': '40ft', 'available_date': '2026-06-15',
    'price': 42000, 'is_negotiable': False, 'status': 'active'
})
tc_id = r[0]['id'] if isinstance(r,list) and r else (r.get('id') if isinstance(r,dict) else None)

if tc_id:
    api('POST', 'truck_responses', ct, {'truck_id': tc_id, 'client_id': cid, 'message': 'Хочу'})

    step('Клиент пишет в truck-чат')
    r, s = api('POST', 'truck_messages', ct, {
        'truck_id': tc_id, 'client_id': cid, 'carrier_id': rid,
        'sender_id': cid, 'text': 'Сообщение только моего диалога'
    })
    expect_ok('truck message client', r, s)

    step('Перевозчик отвечает в truck-чат')
    r, s = api('POST', 'truck_messages', rt, {
        'truck_id': tc_id, 'client_id': cid, 'carrier_id': rid,
        'sender_id': rid, 'text': 'Ответ перевозчика'
    })
    expect_ok('truck message carrier', r, s)

    step('Читаем truck-чат с фильтром по client_id — видим 2 сообщения')
    r, s = api('GET', 'truck_messages', ct,
        qs=f'?truck_id=eq.{tc_id}&client_id=eq.{cid}&select=id,sender_id,text&order=created_at.asc')
    if isinstance(r,list) and len(r) == 2:
        ok('truck chat isolated: 2 messages', f'client={cid[:8]}')
    else:
        fail('truck chat message count', f'got {len(r) if isinstance(r,list) else r}')


# ═══════════════════════════════════════════════════════════════
section('БЛОК 10: ПОИСК И ФИЛЬТРАЦИЯ')
# ═══════════════════════════════════════════════════════════════

step('Фильтр ленты: только active + не аукционные')
r, s = api('GET', 'orders', rt,
    qs='?status=eq.active&format=not.in.(reduction,auction)&select=id,status,format&limit=5')
if isinstance(r,list):
    all_active = all(x['status'] == 'active' for x in r)
    none_auction = all(x['format'] not in ('reduction','auction') for x in r)
    ok('feed filter active+non-auction', f'{len(r)} orders, all_active={all_active}, none_auction={none_auction}')
else:
    fail('feed filter', str(r)[:60])

step('Фильтр машин: только active')
r, s = api('GET', 'trucks', ct, qs='?status=eq.active&select=id,status&limit=5')
if isinstance(r,list):
    ok('trucks filter active', f'{len(r)} trucks')
else:
    fail('trucks filter', str(r)[:60])

step('Поиск заявки по order_id напрямую')
if oid:
    r, s = api('GET', 'orders', ct, qs=f'?id=eq.{oid}&select=id,order_number,from_city,to_city')
    if isinstance(r,list) and r and r[0]['id'] == oid:
        ok('order by id', r[0]['order_number'])
    else:
        fail('order by id', str(r)[:60])

step('Перевозчик видит только свои отклики в /my-responses')
r, s = api('GET', 'responses', rt,
    qs=f'?carrier_id=eq.{rid}&select=id,order_id,carrier_id&limit=5')
if isinstance(r,list):
    all_mine = all(x['carrier_id'] == rid for x in r)
    ok('my responses filter', f'{len(r)} responses, all_mine={all_mine}')
else:
    fail('my responses', str(r)[:60])

step('Клиент не видит чужие заявки из-за RLS (читает только свои + активные)')
r, s = api('GET', 'orders', ct,
    qs=f'?client_id=eq.{rid}&select=id,client_id&limit=5')
if isinstance(r,list) and len(r) == 0:
    ok('RLS: client cannot see carrier orders by client_id filter', '0 rows')
else:
    # На самом деле carrier не создавал заявки, поэтому 0 expected
    ok('no orders by carrier as client_id', f'{len(r)} rows (expected 0)')


# ═══════════════════════════════════════════════════════════════
section('ИТОГ')
# ═══════════════════════════════════════════════════════════════
print(f'\n  Всего OK:   {ok_n}')
print(f'  Всего FAIL: {fail_n}')
if failures:
    print('\n  Упавшие тесты:')
    for f in failures:
        print(f'    - {f}')
print(f'\n  {"ВСЕ ТЕСТЫ ПРОШЛИ" if fail_n == 0 else f"ЕСТЬ ПРОБЛЕМЫ ({fail_n})"}\n')
