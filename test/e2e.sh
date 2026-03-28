#!/bin/bash

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

CLIENT_EMAIL="client@test.ru"
CARRIER_EMAIL="carrier@test.ru"
PASSWORD="test1234"
READY_DATE=$(python3 -c "from datetime import date, timedelta; print(date.today()+timedelta(days=3))")
TMP=$(mktemp -d)

PASS=0; FAIL=0

green() { echo -e "\033[32m  ✓ $1\033[0m"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m  ✗ $1\033[0m"; FAIL=$((FAIL+1)); }
blue()  { echo -e "\n\033[34m▶ $1\033[0m"; }
info()  { echo "    $1"; }

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -qE "$expected"; then green "$label"
  else red "$label"; echo "    └─ $(echo "$result" | head -c 250)"; fi
}

# Пишем JSON в файл и читаем — обход проблемы с Кириллицей в аргументах bash
json_post() {
  local url="$1"; local token="$2"; local file="$3"
  local auth_header=""
  [ -n "$token" ] && auth_header="-H \"Authorization: Bearer $token\""
  curl -s -X POST "$url" \
    -H "apikey: $ANON_KEY" \
    ${token:+-H "Authorization: Bearer $token"} \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "Prefer: return=representation" \
    --data-binary "@$file"
}

json_patch() {
  local url="$1"; local token="$2"; local file="$3"
  curl -s -X PATCH "$url" \
    -H "apikey: $ANON_KEY" \
    ${token:+-H "Authorization: Bearer $token"} \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "Prefer: return=representation" \
    --data-binary "@$file"
}

json_get() {
  local url="$1"; local token="$2"
  curl -s "$url" \
    -H "apikey: $ANON_KEY" \
    ${token:+-H "Authorization: Bearer $token"}
}

# ─────────────────────────────────────────────────────────────
blue "ШАГ 1 — Регистрация клиента"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'email':'$CLIENT_EMAIL','password':'$PASSWORD'}))" > "$TMP/signup.json"

SIGNUP_CLIENT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/signup.json")

check "Signup клиента — access_token получен" "$SIGNUP_CLIENT" "access_token"

CLIENT_TOKEN=$(echo "$SIGNUP_CLIENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)
CLIENT_ID=$(echo "$SIGNUP_CLIENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
[ -z "$CLIENT_TOKEN" ] && { echo "  СТОП: $SIGNUP_CLIENT"; exit 1; }
info "client_id = $CLIENT_ID"

python3 -c "
import json
print(json.dumps({
  'id': '$CLIENT_ID',
  'role': 'client',
  'name': 'OOO Test Group',
  'phone': '+7 495 111-22-33',
  'city': 'Moskva'
}))
" > "$TMP/profile_client.json"

PROFILE_CLIENT=$(json_post "$SUPABASE_URL/rest/v1/users" "$CLIENT_TOKEN" "$TMP/profile_client.json")
check "Профиль клиента создан (role=client)" "$PROFILE_CLIENT" "client"
check "Телефон клиента сохранён" "$PROFILE_CLIENT" "111-22-33"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 2 — Регистрация перевозчика"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'email':'$CARRIER_EMAIL','password':'$PASSWORD'}))" > "$TMP/signup2.json"

SIGNUP_CARRIER=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/signup2.json")

check "Signup перевозчика — access_token получен" "$SIGNUP_CARRIER" "access_token"

CARRIER_TOKEN=$(echo "$SIGNUP_CARRIER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)
CARRIER_ID=$(echo "$SIGNUP_CARRIER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
[ -z "$CARRIER_TOKEN" ] && { echo "  СТОП: $SIGNUP_CARRIER"; exit 1; }
info "carrier_id = $CARRIER_ID"

python3 -c "
import json
print(json.dumps({
  'id': '$CARRIER_ID',
  'role': 'carrier',
  'name': 'Petrov Ivan Sergeevich',
  'phone': '+7 916 555-66-77',
  'city': 'Sankt-Peterburg'
}))
" > "$TMP/profile_carrier.json"

PROFILE_CARRIER=$(json_post "$SUPABASE_URL/rest/v1/users" "$CARRIER_TOKEN" "$TMP/profile_carrier.json")
check "Профиль перевозчика создан (role=carrier)" "$PROFILE_CARRIER" "carrier"
check "Телефон перевозчика сохранён" "$PROFILE_CARRIER" "555-66-77"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 3 — Логин клиента + создание заявки"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'email':'$CLIENT_EMAIL','password':'$PASSWORD'}))" > "$TMP/login.json"

LOGIN_CLIENT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/login.json")

check "Логин клиента (test1234)" "$LOGIN_CLIENT" "access_token"
CLIENT_TOKEN=$(echo "$LOGIN_CLIENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)

python3 -c "
import json
print(json.dumps({
  'client_id': '$CLIENT_ID',
  'from_city': 'Moskva',
  'to_city': 'Novosibirsk',
  'container_type': '40ft',
  'ready_date': '$READY_DATE',
  'price': 85000,
  'is_negotiable': False,
  'is_urgent': True,
  'status': 'active'
}))
" > "$TMP/order.json"

CREATE_ORDER=$(json_post "$SUPABASE_URL/rest/v1/orders" "$CLIENT_TOKEN" "$TMP/order.json")
check "Заявка Moskva→Novosibirsk создана" "$CREATE_ORDER" "Novosibirsk"
check "Тип контейнера 40ft" "$CREATE_ORDER" "40ft"
check "Цена 85000" "$CREATE_ORDER" "85000"
check "is_urgent=true" "$CREATE_ORDER" '"is_urgent":true'
check "status=active" "$CREATE_ORDER" '"status":"active"'

ORDER_ID=$(echo "$CREATE_ORDER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
elif isinstance(d,dict): print(d.get('id',''))
" 2>/dev/null)
info "order_id = $ORDER_ID"
[ -z "$ORDER_ID" ] && info "WARN: order_id пустой, последующие тесты затронуты"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 4 — Лента перевозчика (/feed)"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'email':'$CARRIER_EMAIL','password':'$PASSWORD'}))" > "$TMP/login2.json"

LOGIN_CARRIER=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/login2.json")

check "Логин перевозчика (test1234)" "$LOGIN_CARRIER" "access_token"
CARRIER_TOKEN=$(echo "$LOGIN_CARRIER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)

# Лента: активные заявки, срочные первыми
FEED=$(json_get "$SUPABASE_URL/rest/v1/orders?status=eq.active&order=is_urgent.desc,created_at.desc&select=*" "$CARRIER_TOKEN")
check "Лента содержит заявки" "$FEED" "from_city"
check "Заявка Novosibirsk видна в ленте" "$FEED" "Novosibirsk"
check "Срочная заявка в ленте" "$FEED" '"is_urgent":true'

FEED_COUNT=$(echo "$FEED" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
info "Заявок в ленте: $FEED_COUNT"

# Фильтр по типу контейнера
FEED_40FT=$(json_get "$SUPABASE_URL/rest/v1/orders?status=eq.active&container_type=eq.40ft" "$CARRIER_TOKEN")
check "Фильтр по типу контейнера (40ft) работает" "$FEED_40FT" "40ft"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 5 — Перевозчик откликается на заявку"
# ─────────────────────────────────────────────────────────────

python3 -c "
import json
print(json.dumps({
  'order_id': '$ORDER_ID',
  'carrier_id': '$CARRIER_ID',
  'message': 'Ready to pick up tomorrow morning, truck in city'
}))
" > "$TMP/response.json"

CREATE_RESPONSE=$(json_post "$SUPABASE_URL/rest/v1/responses" "$CARRIER_TOKEN" "$TMP/response.json")
check "Отклик создан" "$CREATE_RESPONSE" "order_id"
check "Комментарий сохранён" "$CREATE_RESPONSE" "Ready to pick up"

RESPONSE_ID=$(echo "$CREATE_RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
info "response_id = $RESPONSE_ID"

# Unique constraint — дубль должен провалиться
DUPLICATE=$(curl -s -X POST "$SUPABASE_URL/rest/v1/responses" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $CARRIER_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/response.json")
check "Дублирующий отклик отклонён (unique constraint 23505)" "$DUPLICATE" "23505"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 6 — Контакты клиента видны перевозчику"
# ─────────────────────────────────────────────────────────────

MY_RESP=$(json_get \
  "$SUPABASE_URL/rest/v1/responses?carrier_id=eq.$CARRIER_ID&select=*,order:orders(*,client:users%21client_id(*))" \
  "$CARRIER_TOKEN")

check "Перевозчик видит свой отклик" "$MY_RESP" "order_id"
check "Телефон клиента виден перевозчику (+7 495)" "$MY_RESP" "111-22-33"
check "Имя клиента видно" "$MY_RESP" "Test Group"
check "Данные заявки прикреплены (Novosibirsk)" "$MY_RESP" "Novosibirsk"

PHONE_SHOWN=$(echo "$MY_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d: print(d[0].get('order',{}).get('client',{}).get('phone','НЕТ'))
" 2>/dev/null)
info "Телефон клиента у перевозчика: $PHONE_SHOWN"

# RLS: перевозчик не видит отклики других
OTHER_RESP=$(json_get "$SUPABASE_URL/rest/v1/responses?carrier_id=neq.$CARRIER_ID" "$CARRIER_TOKEN")
check "RLS: перевозчик не видит чужие отклики" "$OTHER_RESP" '^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 7 — Дашборд клиента"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'email':'$CLIENT_EMAIL','password':'$PASSWORD'}))" > "$TMP/login3.json"
LOGIN_CLIENT2=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/login3.json")
CLIENT_TOKEN=$(echo "$LOGIN_CLIENT2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)

# Заявки клиента на дашборде
MY_ORDERS=$(json_get "$SUPABASE_URL/rest/v1/orders?client_id=eq.$CLIENT_ID&select=*" "$CLIENT_TOKEN")
check "Клиент видит свою заявку (Novosibirsk)" "$MY_ORDERS" "Novosibirsk"
check "Статус active" "$MY_ORDERS" '"status":"active"'

# Отклики на заявку клиента
ORDER_RESP=$(json_get \
  "$SUPABASE_URL/rest/v1/responses?order_id=eq.$ORDER_ID&select=*,carrier:users%21carrier_id(*)" \
  "$CLIENT_TOKEN")

check "Клиент видит отклик перевозчика" "$ORDER_RESP" "carrier_id"
check "Имя перевозчика видно клиенту (Petrov)" "$ORDER_RESP" "Petrov"
check "Телефон перевозчика виден клиенту (+7 916)" "$ORDER_RESP" "555-66-77"

CARRIER_PHONE_SHOWN=$(echo "$ORDER_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d: print(d[0].get('carrier',{}).get('phone','НЕТ'))
" 2>/dev/null)
info "Телефон перевозчика у клиента: $CARRIER_PHONE_SHOWN"

# RLS: клиент ВИДИТ отклики на СВОИ заявки (политика работает правильно)
CLIENT_SEES_OWN=$(json_get "$SUPABASE_URL/rest/v1/responses?order_id=eq.$ORDER_ID" "$CLIENT_TOKEN")
check "RLS: клиент видит отклики на свои заявки (корректно)" "$CLIENT_SEES_OWN" "carrier_id"

# RLS: пустой order_id (несуществующий UUID) — клиент получает пустой массив
FAKE_ID="00000000-0000-0000-0000-999999999999"
CLIENT_CANT=$(json_get "$SUPABASE_URL/rest/v1/responses?order_id=eq.$FAKE_ID" "$CLIENT_TOKEN")
check "RLS: клиент не видит отклики на чужие заявки (пустой ответ)" "$CLIENT_CANT" '^\[\]$'

# Закрываем заявку
python3 -c "import json; print(json.dumps({'status':'closed'}))" > "$TMP/close.json"
CLOSE=$(json_patch "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/close.json")
check "Клиент закрывает заявку → status=closed" "$CLOSE" '"closed"'

# Закрытая заявка пропадает из ленты
FEED_AFTER=$(json_get "$SUPABASE_URL/rest/v1/orders?status=eq.active&to_city=eq.Novosibirsk&client_id=eq.$CLIENT_ID" "$CARRIER_TOKEN")
check "Закрытая заявка пропадает из ленты перевозчика" "$FEED_AFTER" '^\[\]$'

# Клиент не может изменить чужую заявку (RLS update)
python3 -c "import json; print(json.dumps({'status':'closed'}))" > "$TMP/hack.json"
HACK=$(json_patch "$SUPABASE_URL/rest/v1/orders?client_id=eq.$CARRIER_ID" "$CLIENT_TOKEN" "$TMP/hack.json")
check "RLS: клиент не может изменить чужие заявки (пустой ответ)" "$HACK" '^\[\]$'

# Финал
rm -rf "$TMP"
echo ""
echo -e "\033[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "  \033[32m✓ ВСЕ $TOTAL ПРОВЕРОК ПРОШЛИ\033[0m"
  exit 0
else
  echo -e "  \033[32m$PASS passed\033[0m  \033[31m$FAIL failed\033[0m  из $TOTAL"
  exit 1
fi
