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

check_count() {
  local label="$1"; local result="$2"; local expected="$3"
  local count
  count=$(echo "$result" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  if [ "$count" = "$expected" ]; then green "$label (count=$count)"
  else red "$label"; echo "    └─ got count=$count, want $expected. Data: $(echo "$result" | head -c 200)"; fi
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
  python3 -c "import json; print(json.dumps({'id':'$_ID','role':'$_ROLE','name':'$_NAME','phone':'+79000000000','city':'City'}))" > "$TMP/prof.json"
  curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary "$TMP/prof.json" > /dev/null 2>&1 || true
  # retry with @
  curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary "@$TMP/prof.json" > /dev/null 2>&1 || true
}

get_unread_count() {
  local token="$1"
  get_json "$SUPABASE_URL/rest/v1/notifications?is_read=eq.false&select=id" "$token" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null
}

# ─────────────────────────────────────────────────────────────
blue "ПОДГОТОВКА — пользователи, заявка, рейс"
# ─────────────────────────────────────────────────────────────

TODAY=$(python3 -c "from datetime import date, timedelta; print(date.today()+timedelta(days=3))")

do_auth "notif_client@test.ru"  "test1234" "client"  "Notif Client"
CLIENT_TOKEN="$_TOKEN"; CLIENT_ID="$_ID"

do_auth "notif_carrier@test.ru" "test1234" "carrier" "Notif Carrier"
CARRIER_TOKEN="$_TOKEN"; CARRIER_ID="$_ID"

if [ -z "$CLIENT_TOKEN" ] || [ -z "$CARRIER_TOKEN" ]; then
  echo "  СТОП: не получены токены"; exit 1
fi
info "client_id  = $CLIENT_ID"
info "carrier_id = $CARRIER_ID"

# Создаём заявку
python3 -c "
import json; print(json.dumps({
  'client_id':'$CLIENT_ID','from_city':'Kazan','to_city':'Ufa',
  'container_type':'20ft','ready_date':'$TODAY',
  'price':50000,'is_negotiable':False,'is_urgent':False,'status':'active'
}))" > "$TMP/order.json"
ORDER_RESP=$(post_json "$SUPABASE_URL/rest/v1/orders" "$CLIENT_TOKEN" "$TMP/order.json")
ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
[ -z "$ORDER_ID" ] && { echo "  СТОП: не создана заявка: $ORDER_RESP"; exit 1; }
info "order_id   = $ORDER_ID"

# Создаём рейс
python3 -c "
import json; print(json.dumps({
  'carrier_id':'$CARRIER_ID','from_city':'Ekb','to_city':'Chelyabinsk',
  'container_type':'40ft','available_date':'$TODAY',
  'price':80000,'is_negotiable':False
}))" > "$TMP/truck.json"
TRUCK_RESP=$(post_json "$SUPABASE_URL/rest/v1/trucks" "$CARRIER_TOKEN" "$TMP/truck.json")
TRUCK_ID=$(echo "$TRUCK_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
[ -z "$TRUCK_ID" ] && { echo "  СТОП: не создан рейс: $TRUCK_RESP"; exit 1; }
info "truck_id   = $TRUCK_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 1 — Отклик на заявку → уведомление клиенту"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','carrier_id':'$CARRIER_ID','message':'I can do it'}))" > "$TMP/resp.json"
post_json "$SUPABASE_URL/rest/v1/responses" "$CARRIER_TOKEN" "$TMP/resp.json" > /dev/null

# Клиент видит уведомление о новом отклике
CLIENT_NOTIFS=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&order=created_at.desc" "$CLIENT_TOKEN")
check "Клиент получил уведомление new_response" "$CLIENT_NOTIFS" '"new_response"'
check "Ссылка ведёт на страницу заявки" "$CLIENT_NOTIFS" "/orders/$ORDER_ID"
check "Уведомление непрочитано" "$CLIENT_NOTIFS" '"is_read":false'

UNREAD=$(get_unread_count "$CLIENT_TOKEN")
check "Счётчик непрочитанных = 1" "$UNREAD" "^1$"
info "Непрочитанных у клиента: $UNREAD"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 2 — Сообщение в чате → уведомление перевозчику"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CLIENT_ID','text':'Hello, can you go tomorrow?'}))" > "$TMP/msg1.json"
post_json "$SUPABASE_URL/rest/v1/messages" "$CLIENT_TOKEN" "$TMP/msg1.json" > /dev/null

CARRIER_NOTIFS=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&order=created_at.desc" "$CARRIER_TOKEN")
check "Перевозчик получил уведомление new_message" "$CARRIER_NOTIFS" '"new_message"'
check "Ссылка ведёт на чат заявки" "$CARRIER_NOTIFS" "/orders/$ORDER_ID/chat"
check "Уведомление перевозчика непрочитано" "$CARRIER_NOTIFS" '"is_read":false'

CARRIER_UNREAD=$(get_unread_count "$CARRIER_TOKEN")
check "Счётчик у перевозчика = 1" "$CARRIER_UNREAD" "^1$"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 3 — Перевозчик отвечает → уведомление клиенту"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CARRIER_ID','text':'Yes, I can!'}))" > "$TMP/msg2.json"
post_json "$SUPABASE_URL/rest/v1/messages" "$CARRIER_TOKEN" "$TMP/msg2.json" > /dev/null

CLIENT_NOTIFS2=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.new_message&order=created_at.desc" "$CLIENT_TOKEN")
check "Клиент получил уведомление о сообщении перевозчика" "$CLIENT_NOTIFS2" '"new_message"'

# У клиента теперь 2 непрочитанных (new_response + new_message)
CLIENT_UNREAD2=$(get_unread_count "$CLIENT_TOKEN")
check "У клиента 2 непрочитанных" "$CLIENT_UNREAD2" "^2$"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 4 — Отклик на рейс → уведомление перевозчику"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','message':'Need this truck'}))" > "$TMP/tresp.json"
post_json "$SUPABASE_URL/rest/v1/truck_responses" "$CLIENT_TOKEN" "$TMP/tresp.json" > /dev/null

CARRIER_NOTIFS2=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&type=eq.new_truck_response" "$CARRIER_TOKEN")
check "Перевозчик получил уведомление new_truck_response" "$CARRIER_NOTIFS2" '"new_truck_response"'
check "Ссылка ведёт на страницу рейса" "$CARRIER_NOTIFS2" "/trucks/$TRUCK_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 5 — Сообщение в чате рейса → уведомления"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$CLIENT_ID','text':'Is the price negotiable?'}))" > "$TMP/tmsg1.json"
post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CLIENT_TOKEN" "$TMP/tmsg1.json" > /dev/null

CARRIER_TRUCK_NOTIFS=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&type=eq.new_truck_message" "$CARRIER_TOKEN")
check "Перевозчик получил уведомление new_truck_message" "$CARRIER_TRUCK_NOTIFS" '"new_truck_message"'
check "Ссылка содержит client id" "$CARRIER_TRUCK_NOTIFS" "client=$CLIENT_ID"

# Перевозчик отвечает в чате рейса
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$CARRIER_ID','text':'Yes, let us discuss'}))" > "$TMP/tmsg2.json"
post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CARRIER_TOKEN" "$TMP/tmsg2.json" > /dev/null

CLIENT_TRUCK_NOTIFS=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.new_truck_message" "$CLIENT_TOKEN")
check "Клиент получил уведомление new_truck_message" "$CLIENT_TRUCK_NOTIFS" '"new_truck_message"'
check "Ссылка ведёт в чат рейса" "$CLIENT_TRUCK_NOTIFS" "/trucks/$TRUCK_ID/chat"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 6 — Получатель не уведомляет сам себя"
# ─────────────────────────────────────────────────────────────

# Проверяем: у клиента нет уведомлений о своих собственных действиях
# (клиент сам создал заявку → нет уведомления; клиент сам откликнулся на рейс → нет уведомления о своём отклике)
SELF_NOTIFS=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.new_truck_response" "$CLIENT_TOKEN")
check "Клиент не получает уведомление о своём собственном отклике" "$SELF_NOTIFS" '^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 7 — Пометить одно уведомление прочитанным"
# ─────────────────────────────────────────────────────────────

FIRST_NOTIF_ID=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&is_read=eq.false&order=created_at.asc&limit=1" "$CLIENT_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
info "Помечаем прочитанным: $FIRST_NOTIF_ID"

python3 -c "import json; print(json.dumps({'is_read':True}))" > "$TMP/mark.json"
MARK=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/notifications?id=eq.$FIRST_NOTIF_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  --data-binary "@$TMP/mark.json")
check "Уведомление помечено прочитанным" "$MARK" '"is_read":true'

BEFORE_ALL=$(get_unread_count "$CLIENT_TOKEN")
info "Непрочитанных у клиента после отметки одного: $BEFORE_ALL"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 8 — Пометить все уведомления прочитанными"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'is_read':True}))" > "$TMP/markall.json"
curl -s -X PATCH "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&is_read=eq.false" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/markall.json" > /dev/null

AFTER_ALL=$(get_unread_count "$CLIENT_TOKEN")
check "Счётчик непрочитанных = 0 после markAllRead" "$AFTER_ALL" "^0$"
info "Непрочитанных у клиента: $AFTER_ALL"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 9 — RLS: пользователь не видит чужие уведомления"
# ─────────────────────────────────────────────────────────────

# Клиент запрашивает уведомления перевозчика — должен получить пустой массив
STOLEN=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID" "$CLIENT_TOKEN")
check "Клиент не видит уведомления перевозчика (RLS SELECT)" "$STOLEN" '^\[\]$'

# Клиент не может пометить чужое уведомление прочитанным
CARRIER_NOTIF_ID=$(get_json "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&limit=1" "$CARRIER_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)

if [ -n "$CARRIER_NOTIF_ID" ]; then
  python3 -c "import json; print(json.dumps({'is_read':True}))" > "$TMP/steal_mark.json"
  STEAL_MARK=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/notifications?id=eq.$CARRIER_NOTIF_ID" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT_TOKEN" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    --data-binary "@$TMP/steal_mark.json")
  check "Клиент не может изменить чужое уведомление (RLS UPDATE)" "$STEAL_MARK" '^\[\]$'
fi

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
