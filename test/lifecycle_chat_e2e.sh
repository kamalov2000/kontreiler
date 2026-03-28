#!/bin/bash

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
TMP=$(mktemp -d)
PASS=0; FAIL=0

green() { echo -e "\033[32m  ✓ $1\033[0m"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m  ✗ $1\033[0m"; FAIL=$((FAIL+1)); }
blue()  { echo -e "\n\033[34m▶ $1\033[0m"; }
info()  { echo "    $1"; }

check() {
  local label="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -qE "$expected"; then green "$label"
  else red "$label"; echo "    └─ $(echo "$result" | head -c 300)"; fi
}

check_absent() {
  local label="$1"; local result="$2"; local pattern="$3"
  if echo "$result" | grep -qE "$pattern"; then red "$label"; echo "    └─ $(echo "$result" | head -c 300)"
  else green "$label"; fi
}

post_json() {
  curl -s -X POST "$1" \
    -H "apikey: $ANON_KEY" \
    ${2:+-H "Authorization: Bearer $2"} \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "Prefer: return=representation" \
    --data-binary "@$3"
}

get_json() {
  curl -s "$1" -H "apikey: $ANON_KEY" ${2:+-H "Authorization: Bearer $2"}
}

patch_json() {
  curl -s -X PATCH "$1" \
    -H "apikey: $ANON_KEY" \
    ${2:+-H "Authorization: Bearer $2"} \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    --data-binary "@$3"
}

do_auth() {
  local _EMAIL="$1" _PASS="$2" _ROLE="$3" _NAME="$4"
  python3 -c "import json; print(json.dumps({'email':'$_EMAIL','password':'$_PASS'}))" > "$TMP/auth.json"
  local _R
  _R=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/auth.json")
  if ! echo "$_R" | grep -q "access_token"; then
    _R=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
      -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/auth.json")
  fi
  _TOKEN=$(echo "$_R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)
  _ID=$(echo "$_R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
  python3 -c "import json; print(json.dumps({'id':'$_ID','role':'$_ROLE','name':'$_NAME','phone':'+79000000099','city':'City'}))" > "$TMP/prof.json"
  curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary "@$TMP/prof.json" > /dev/null 2>&1 || true
}

TODAY=$(python3 -c "from datetime import date, timedelta; print(date.today()+timedelta(days=2))")

# ─────────────────────────────────────────────────────────────
blue "ПОДГОТОВКА — клиент, перевозчик, заявка, отклик"
# ─────────────────────────────────────────────────────────────

do_auth "lc_client@test.ru"  "test1234" "client"  "LC Client"
CLIENT_TOKEN="$_TOKEN"; CLIENT_ID="$_ID"

do_auth "lc_carrier@test.ru" "test1234" "carrier" "LC Carrier"
CARRIER_TOKEN="$_TOKEN"; CARRIER_ID="$_ID"

[ -z "$CLIENT_TOKEN" ] && { echo "СТОП: нет токенов"; exit 1; }
info "client_id  = $CLIENT_ID"
info "carrier_id = $CARRIER_ID"

# Создаём заявку
python3 -c "import json; print(json.dumps({
  'client_id':'$CLIENT_ID','from_city':'Moscow','to_city':'Novosibirsk',
  'container_type':'20ft','ready_date':'$TODAY',
  'price':50000,'is_negotiable':False,'is_urgent':False,'status':'active'
}))" > "$TMP/order.json"
ORDER_RESP=$(post_json "$SUPABASE_URL/rest/v1/orders" "$CLIENT_TOKEN" "$TMP/order.json")
ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
[ -z "$ORDER_ID" ] && { echo "СТОП: не создана заявка: $ORDER_RESP"; exit 1; }
info "order_id   = $ORDER_ID"

# Перевозчик откликается
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','carrier_id':'$CARRIER_ID','message':'Готов'}))"\
  > "$TMP/resp.json"
post_json "$SUPABASE_URL/rest/v1/responses" "$CARRIER_TOKEN" "$TMP/resp.json" > /dev/null

# Клиент принимает перевозчика (matched)
python3 -c "import json; print(json.dumps({'accepted_carrier_id':'$CARRIER_ID','status':'matched'}))" > "$TMP/match.json"
patch_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/match.json" > /dev/null

# ─────────────────────────────────────────────────────────────
blue "ШАГ 1 — Заявка в статусе matched"
# ─────────────────────────────────────────────────────────────

STATE=$(get_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID&select=status,accepted_carrier_id" "$CLIENT_TOKEN")
check "Заявка matched" "$STATE" '"matched"'
check "accepted_carrier_id заполнен" "$STATE" "$CARRIER_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 2 — Клиент меняет статус на in_transit"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'status':'in_transit'}))" > "$TMP/transit.json"
TRANSIT=$(patch_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/transit.json")
check "Заявка in_transit" "$TRANSIT" '"in_transit"'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 3 — Клиент меняет статус на delivered"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'status':'delivered'}))" > "$TMP/delivered.json"
DELIVERED=$(patch_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/delivered.json")
check "Заявка delivered" "$DELIVERED" '"delivered"'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 4 — Перевозчик получил уведомление order_delivered"
# ─────────────────────────────────────────────────────────────

CARRIER_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&type=eq.order_delivered" \
  "$CARRIER_TOKEN")
check "Перевозчик получил order_delivered" "$CARRIER_NOTIFS" '"order_delivered"'
check "Ссылка ведёт на заявку" "$CARRIER_NOTIFS" "/orders/$ORDER_ID"
check "Уведомление непрочитано" "$CARRIER_NOTIFS" '"is_read":false'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 5 — Закрытая заявка не видна в ленте (feed)"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'status':'closed'}))" > "$TMP/close_order.json"
patch_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/close_order.json" > /dev/null

FEED=$(get_json "$SUPABASE_URL/rest/v1/orders?status=eq.active" "$CARRIER_TOKEN")
check_absent "Закрытая заявка не в ленте active" "$FEED" "$ORDER_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 6 — Цикл рейса перевозчика: active → busy → done"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({
  'carrier_id':'$CARRIER_ID','from_city':'Moscow','to_city':'Kazan',
  'container_type':'40ft','available_date':'$TODAY',
  'price':30000,'is_negotiable':False,'status':'active'
}))" > "$TMP/truck.json"
TRUCK_RESP=$(post_json "$SUPABASE_URL/rest/v1/trucks" "$CARRIER_TOKEN" "$TMP/truck.json")
TRUCK_ID=$(echo "$TRUCK_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
[ -z "$TRUCK_ID" ] && { echo "СТОП: не создана машина: $TRUCK_RESP"; exit 1; }
info "truck_id   = $TRUCK_ID"

# Клиент откликается на рейс
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','message':'Беру'}))"\
  > "$TMP/tresp.json"
post_json "$SUPABASE_URL/rest/v1/truck_responses" "$CLIENT_TOKEN" "$TMP/tresp.json" > /dev/null

# Машина видна в ленте trucks (active)
TRUCKS_FEED=$(get_json "$SUPABASE_URL/rest/v1/trucks?status=eq.active" "$CLIENT_TOKEN")
check "Машина видна в ленте (active)" "$TRUCKS_FEED" "$TRUCK_ID"

# Перевозчик переводит в busy
python3 -c "import json; print(json.dumps({'status':'busy'}))" > "$TMP/busy.json"
BUSY=$(patch_json "$SUPABASE_URL/rest/v1/trucks?id=eq.$TRUCK_ID" "$CARRIER_TOKEN" "$TMP/busy.json")
check "Машина busy" "$BUSY" '"busy"'

# Машина больше не видна в ленте active
TRUCKS_FEED2=$(get_json "$SUPABASE_URL/rest/v1/trucks?status=eq.active" "$CLIENT_TOKEN")
check_absent "Занятая машина не в ленте active" "$TRUCKS_FEED2" "$TRUCK_ID"

# Перевозчик переводит в done
python3 -c "import json; print(json.dumps({'status':'done'}))" > "$TMP/done.json"
DONE=$(patch_json "$SUPABASE_URL/rest/v1/trucks?id=eq.$TRUCK_ID" "$CARRIER_TOKEN" "$TMP/done.json")
check "Машина done" "$DONE" '"done"'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 7 — Клиент получил уведомление trip_done"
# ─────────────────────────────────────────────────────────────

CLIENT_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.trip_done" \
  "$CLIENT_TOKEN")
check "Клиент получил trip_done" "$CLIENT_NOTIFS" '"trip_done"'
check "Ссылка ведёт на рейс" "$CLIENT_NOTIFS" "/trucks/$TRUCK_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 8 — Чат рейса: оба видят сообщения друг друга"
# ─────────────────────────────────────────────────────────────

# Создаём новый рейс со статусом active для теста чата
python3 -c "import json; print(json.dumps({
  'carrier_id':'$CARRIER_ID','from_city':'SPb','to_city':'Ekb',
  'container_type':'40HC','available_date':'$TODAY',
  'price':40000,'is_negotiable':False,'status':'active'
}))" > "$TMP/truck2.json"
TRUCK2_RESP=$(post_json "$SUPABASE_URL/rest/v1/trucks" "$CARRIER_TOKEN" "$TMP/truck2.json")
TRUCK2_ID=$(echo "$TRUCK2_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
[ -z "$TRUCK2_ID" ] && { echo "СТОП: не создана машина 2"; exit 1; }
info "truck2_id  = $TRUCK2_ID"

# Клиент откликается
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK2_ID','client_id':'$CLIENT_ID','message':'Интересует'}))"\
  > "$TMP/tresp2.json"
post_json "$SUPABASE_URL/rest/v1/truck_responses" "$CLIENT_TOKEN" "$TMP/tresp2.json" > /dev/null

# Клиент пишет сообщение
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK2_ID','client_id':'$CLIENT_ID','sender_id':'$CLIENT_ID','text':'Привет от клиента'}))"\
  > "$TMP/msg_client.json"
MSG1=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CLIENT_TOKEN" "$TMP/msg_client.json")
check "Клиент отправил сообщение" "$MSG1" '"Привет от клиента"'

# Перевозчик пишет сообщение
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK2_ID','client_id':'$CLIENT_ID','sender_id':'$CARRIER_ID','text':'Привет от перевозчика'}))"\
  > "$TMP/msg_carrier.json"
MSG2=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CARRIER_TOKEN" "$TMP/msg_carrier.json")
check "Перевозчик отправил сообщение" "$MSG2" '"Привет от перевозчика"'

# Оба видят оба сообщения (выборка без JOIN)
MSGS=$(get_json \
  "$SUPABASE_URL/rest/v1/truck_messages?truck_id=eq.$TRUCK2_ID&client_id=eq.$CLIENT_ID&select=*&order=created_at.asc" \
  "$CLIENT_TOKEN")
check "Клиент видит своё сообщение" "$MSGS" '"Привет от клиента"'
check "Клиент видит сообщение перевозчика" "$MSGS" '"Привет от перевозчика"'

MSGS2=$(get_json \
  "$SUPABASE_URL/rest/v1/truck_messages?truck_id=eq.$TRUCK2_ID&client_id=eq.$CLIENT_ID&select=*&order=created_at.asc" \
  "$CARRIER_TOKEN")
check "Перевозчик видит сообщение клиента" "$MSGS2" '"Привет от клиента"'
check "Перевозчик видит своё сообщение" "$MSGS2" '"Привет от перевозчика"'

# Сторонний пользователь не видит сообщения
do_auth "lc_outsider@test.ru" "test1234" "client" "Outsider"
OUTSIDER_TOKEN="$_TOKEN"
MSGS_OUTSIDER=$(get_json \
  "$SUPABASE_URL/rest/v1/truck_messages?truck_id=eq.$TRUCK2_ID&client_id=eq.$CLIENT_ID" \
  "$OUTSIDER_TOKEN")
check_absent "Посторонний не видит сообщения" "$MSGS_OUTSIDER" '"Привет от'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 9 — Уведомления new_truck_message в чате рейса"
# ─────────────────────────────────────────────────────────────

# Клиент должен получить уведомление о сообщении перевозчика
CLIENT_TRUCK_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.new_truck_message&is_read=eq.false" \
  "$CLIENT_TOKEN")
check "Клиент получил new_truck_message от перевозчика" "$CLIENT_TRUCK_NOTIFS" '"new_truck_message"'

# Перевозчик должен получить уведомление о сообщении клиента
CARRIER_TRUCK_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&type=eq.new_truck_message&is_read=eq.false" \
  "$CARRIER_TOKEN")
check "Перевозчик получил new_truck_message от клиента" "$CARRIER_TRUCK_NOTIFS" '"new_truck_message"'

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
