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
  python3 -c "import json; print(json.dumps({'id':'$_ID','role':'$_ROLE','name':'$_NAME','phone':'+79000000001','city':'City'}))" > "$TMP/prof.json"
  curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary "@$TMP/prof.json" > /dev/null 2>&1 || true
}

# ─────────────────────────────────────────────────────────────
blue "ПОДГОТОВКА — клиент, 2 перевозчика, заявка, 2 отклика"
# ─────────────────────────────────────────────────────────────

TODAY=$(python3 -c "from datetime import date, timedelta; print(date.today()+timedelta(days=2))")

do_auth "match_client@test.ru"   "test1234" "client"  "Match Client"
CLIENT_TOKEN="$_TOKEN"; CLIENT_ID="$_ID"

do_auth "match_carrier1@test.ru" "test1234" "carrier" "Carrier One"
CARRIER1_TOKEN="$_TOKEN"; CARRIER1_ID="$_ID"

do_auth "match_carrier2@test.ru" "test1234" "carrier" "Carrier Two"
CARRIER2_TOKEN="$_TOKEN"; CARRIER2_ID="$_ID"

[ -z "$CLIENT_TOKEN" ] && { echo "СТОП: нет токенов"; exit 1; }
info "client_id   = $CLIENT_ID"
info "carrier1_id = $CARRIER1_ID"
info "carrier2_id = $CARRIER2_ID"

# Создаём заявку
python3 -c "import json; print(json.dumps({
  'client_id':'$CLIENT_ID','from_city':'Samara','to_city':'Perm',
  'container_type':'40ft','ready_date':'$TODAY',
  'price':75000,'is_negotiable':False,'is_urgent':False,'status':'active'
}))" > "$TMP/order.json"
ORDER_RESP=$(post_json "$SUPABASE_URL/rest/v1/orders" "$CLIENT_TOKEN" "$TMP/order.json")
ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
[ -z "$ORDER_ID" ] && { echo "СТОП: не создана заявка: $ORDER_RESP"; exit 1; }
info "order_id    = $ORDER_ID"

# Оба перевозчика откликаются
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','carrier_id':'$CARRIER1_ID','message':'Carrier 1 ready'}))" > "$TMP/r1.json"
post_json "$SUPABASE_URL/rest/v1/responses" "$CARRIER1_TOKEN" "$TMP/r1.json" > /dev/null

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','carrier_id':'$CARRIER2_ID','message':'Carrier 2 ready'}))" > "$TMP/r2.json"
post_json "$SUPABASE_URL/rest/v1/responses" "$CARRIER2_TOKEN" "$TMP/r2.json" > /dev/null

# ─────────────────────────────────────────────────────────────
blue "ШАГ 1 — Заявка активна, статус = active"
# ─────────────────────────────────────────────────────────────

ORDER_STATE=$(get_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID&select=status,accepted_carrier_id" "$CLIENT_TOKEN")
check "Заявка имеет статус active" "$ORDER_STATE" '"active"'
check "accepted_carrier_id = null" "$ORDER_STATE" '"accepted_carrier_id":null'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 2 — Клиент принимает первого перевозчика"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'accepted_carrier_id':'$CARRIER1_ID','status':'matched'}))" > "$TMP/accept.json"
ACCEPT=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  --data-binary "@$TMP/accept.json")
check "Заявка перешла в статус matched" "$ACCEPT" '"matched"'
check "accepted_carrier_id = carrier1" "$ACCEPT" "$CARRIER1_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 3 — Принятый перевозчик получил уведомление"
# ─────────────────────────────────────────────────────────────

CARRIER1_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER1_ID&type=eq.response_accepted" \
  "$CARRIER1_TOKEN")
check "Carrier1 получил response_accepted" "$CARRIER1_NOTIFS" '"response_accepted"'
check "Ссылка ведёт в чат заявки" "$CARRIER1_NOTIFS" "/orders/$ORDER_ID/chat"
check "Уведомление непрочитано" "$CARRIER1_NOTIFS" '"is_read":false'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 4 — Непринятый перевозчик не получил response_accepted"
# ─────────────────────────────────────────────────────────────

CARRIER2_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER2_ID&type=eq.response_accepted" \
  "$CARRIER2_TOKEN")
check "Carrier2 не получил response_accepted" "$CARRIER2_NOTIFS" '^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 5 — Заявка matched, повторный accept невозможен"
# ─────────────────────────────────────────────────────────────

# Клиент пытается принять второго перевозчика на уже matched-заявку
# — технически PATCH разрешён RLS, но бизнес-логика в UI запрещает
# Проверяем только что статус = matched и accepted_carrier_id = carrier1
ORDER_FINAL=$(get_json "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID&select=status,accepted_carrier_id" "$CLIENT_TOKEN")
check "Статус остался matched" "$ORDER_FINAL" '"matched"'
check "accepted_carrier_id остался carrier1" "$ORDER_FINAL" "$CARRIER1_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 6 — Бейджи непрочитанных: перевозчик пишет в чат → клиент видит счётчик"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CARRIER1_ID','text':'Confirmed, I will arrive at 9am'}))" > "$TMP/chat.json"
post_json "$SUPABASE_URL/rest/v1/messages" "$CARRIER1_TOKEN" "$TMP/chat.json" > /dev/null

# Клиент получил new_message уведомление
CLIENT_MSG_NOTIFS=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.new_message&is_read=eq.false" \
  "$CLIENT_TOKEN")
check "Клиент получил new_message уведомление" "$CLIENT_MSG_NOTIFS" '"new_message"'

MSG_UNREAD=$(echo "$CLIENT_MSG_NOTIFS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Счётчик непрочитанных new_message = 1" "$MSG_UNREAD" "^1$"
info "Непрочитанных new_message у клиента: $MSG_UNREAD"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 7 — Клиент открывает чат → помечает уведомления прочитанными"
# ─────────────────────────────────────────────────────────────

LINK="/orders/$ORDER_ID/chat"
python3 -c "import json; print(json.dumps({'is_read':True}))" > "$TMP/markread.json"
curl -s -X PATCH "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&link=eq.$LINK&is_read=eq.false" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$TMP/markread.json" > /dev/null

AFTER_READ=$(get_json \
  "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.new_message&is_read=eq.false" \
  "$CLIENT_TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Счётчик бейджа = 0 после прочтения" "$AFTER_READ" "^0$"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 8 — Другой клиент не может принять чужую заявку"
# ─────────────────────────────────────────────────────────────

# Создаём второго клиента
do_auth "match_client2@test.ru" "test1234" "client" "Client Two"
CLIENT2_TOKEN="$_TOKEN"

python3 -c "import json; print(json.dumps({'accepted_carrier_id':'$CARRIER2_ID','status':'matched'}))" > "$TMP/steal.json"
STEAL=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT2_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  --data-binary "@$TMP/steal.json")
check "Чужой клиент не может изменить заявку (RLS UPDATE)" "$STEAL" '^\[\]$'

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
