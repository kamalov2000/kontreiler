#!/bin/bash

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
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
  curl -s "$1" \
    -H "apikey: $ANON_KEY" \
    ${2:+-H "Authorization: Bearer $2"}
}

do_auth() {
  local _EMAIL="$1" _PASS="$2" _ROLE="$3" _NAME="$4" _PHONE="$5"
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
  python3 -c "import json; print(json.dumps({'id':'$_ID','role':'$_ROLE','name':'$_NAME','phone':'$_PHONE','city':'City'}))" > "$TMP/prof.json"
  curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary "@$TMP/prof.json" > /dev/null 2>&1 || true
}

# ─────────────────────────────────────────────────────────────
blue "ПОДГОТОВКА — 3 пользователя"
# ─────────────────────────────────────────────────────────────

AVAIL_DATE=$(python3 -c "from datetime import date, timedelta; print(date.today()+timedelta(days=5))")

do_auth "truck_carrier@test.ru"  "test1234" "carrier" "Truck Carrier"  "+7-916-777-88-99"
CARRIER_TOKEN="$_TOKEN"; CARRIER_ID="$_ID"

do_auth "truck_client@test.ru"   "test1234" "client"  "Truck Client"   "+7-495-333-44-55"
CLIENT_TOKEN="$_TOKEN"; CLIENT_ID="$_ID"

do_auth "truck_outsider@test.ru" "test1234" "client"  "Truck Outsider" "+7-999-111-22-33"
OUTSIDER_TOKEN="$_TOKEN"; OUTSIDER_ID="$_ID"

if [ -z "$CARRIER_TOKEN" ] || [ -z "$CLIENT_TOKEN" ] || [ -z "$OUTSIDER_TOKEN" ]; then
  echo "  СТОП: не удалось получить токены."
  exit 1
fi

info "carrier_id  = $CARRIER_ID"
info "client_id   = $CLIENT_ID"
info "outsider_id = $OUTSIDER_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 1 — Перевозчик размещает машину"
# ─────────────────────────────────────────────────────────────

python3 -c "
import json
print(json.dumps({
  'carrier_id':'$CARRIER_ID','from_city':'Vladivostok','to_city':'Moscow',
  'container_type':'40ft','available_date':'$AVAIL_DATE',
  'price':150000,'is_negotiable':False
}))
" > "$TMP/truck.json"

TRUCK_RESP=$(post_json "$SUPABASE_URL/rest/v1/trucks" "$CARRIER_TOKEN" "$TMP/truck.json")
TRUCK_ID=$(echo "$TRUCK_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
elif isinstance(d,dict): print(d.get('id',''))
" 2>/dev/null)

check "Перевозчик создал рейс" "$TRUCK_RESP" "Vladivostok"
check "Рейс имеет статус active" "$TRUCK_RESP" '"active"'

if [ -z "$TRUCK_ID" ]; then
  echo "  СТОП: не создан рейс. Ответ: $TRUCK_RESP"
  exit 1
fi
info "truck_id = $TRUCK_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 2 — Клиент видит машину в ленте"
# ─────────────────────────────────────────────────────────────

FEED=$(get_json "$SUPABASE_URL/rest/v1/trucks?status=eq.active&select=*" "$CLIENT_TOKEN")
check "Клиент видит активные рейсы" "$FEED" "Vladivostok"
check "Созданный рейс есть в ленте" "$FEED" "$TRUCK_ID"

# Outsider (другой клиент) тоже видит (RLS открытый SELECT для всех authenticated)
FEED_OUT=$(get_json "$SUPABASE_URL/rest/v1/trucks?status=eq.active&select=*" "$OUTSIDER_TOKEN")
check "Все авторизованные видят рейсы" "$FEED_OUT" "Vladivostok"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 3 — Клиент откликается на рейс"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','message':'Interested in this route'}))" > "$TMP/tresp.json"
TRESP=$(post_json "$SUPABASE_URL/rest/v1/truck_responses" "$CLIENT_TOKEN" "$TMP/tresp.json")
TRESP_ID=$(echo "$TRESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)

check "Клиент отклинулся на рейс" "$TRESP" "truck_id"
check "Сообщение отклика сохранено" "$TRESP" "Interested"

info "truck_response_id = $TRESP_ID"

# Дубль — должен быть заблокирован UNIQUE
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','message':'Duplicate'}))"> "$TMP/tresp2.json"
DUPE=$(post_json "$SUPABASE_URL/rest/v1/truck_responses" "$CLIENT_TOKEN" "$TMP/tresp2.json")
check "Дубль отклика заблокирован (UNIQUE)" "$DUPE" "23505|duplicate"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 4 — RLS на truck_responses"
# ─────────────────────────────────────────────────────────────

# Перевозчик видит отклик на свою машину
CARRIER_SEES=$(get_json "$SUPABASE_URL/rest/v1/truck_responses?truck_id=eq.$TRUCK_ID" "$CARRIER_TOKEN")
check "Перевозчик видит отклик клиента" "$CARRIER_SEES" "$CLIENT_ID"

# Клиент видит свой отклик
CLIENT_SEES=$(get_json "$SUPABASE_URL/rest/v1/truck_responses?truck_id=eq.$TRUCK_ID&client_id=eq.$CLIENT_ID" "$CLIENT_TOKEN")
check "Клиент видит свой отклик" "$CLIENT_SEES" "Interested"

# Outsider не видит чужие отклики
OUTSIDER_SEES=$(get_json "$SUPABASE_URL/rest/v1/truck_responses?truck_id=eq.$TRUCK_ID" "$OUTSIDER_TOKEN")
check "Outsider не видит чужие отклики (RLS)" "$OUTSIDER_SEES" '^\[\]$'

# Outsider не может откликнуться от имени другого клиента
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','message':'Spoof'}))" > "$TMP/spoof_resp.json"
SPOOF_RESP=$(post_json "$SUPABASE_URL/rest/v1/truck_responses" "$OUTSIDER_TOKEN" "$TMP/spoof_resp.json")
check "Outsider не может подделать client_id (RLS)" "$SPOOF_RESP" '42501|PGRST301|^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 5 — Чат: клиент пишет первое сообщение"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$CLIENT_ID','text':'Hello, is the truck still available?'}))" > "$TMP/tmsg1.json"
TMSG1=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CLIENT_TOKEN" "$TMP/tmsg1.json")

check "Клиент отправил сообщение в чат" "$TMSG1" "truck_id"
check "Текст сообщения сохранён" "$TMSG1" "still available"

TMSG1_ID=$(echo "$TMSG1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
info "tmsg1_id = $TMSG1_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 6 — Перевозчик отвечает в чат"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$CARRIER_ID','text':'Yes, ready on the date!'}))" > "$TMP/tmsg2.json"
TMSG2=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CARRIER_TOKEN" "$TMP/tmsg2.json")

check "Перевозчик отправил ответ" "$TMSG2" "truck_id"
check "Текст ответа сохранён" "$TMSG2" "ready on the date"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 7 — Оба участника читают историю чата"
# ─────────────────────────────────────────────────────────────

CHAT_CLIENT=$(get_json \
  "$SUPABASE_URL/rest/v1/truck_messages?truck_id=eq.$TRUCK_ID&client_id=eq.$CLIENT_ID&order=created_at.asc" \
  "$CLIENT_TOKEN")

check "Клиент видит своё сообщение" "$CHAT_CLIENT" "still available"
check "Клиент видит ответ перевозчика" "$CHAT_CLIENT" "ready on the date"
MSG_COUNT=$(echo "$CHAT_CLIENT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Клиент видит ровно 2 сообщения" "$MSG_COUNT" "^2$"

CHAT_CARRIER=$(get_json \
  "$SUPABASE_URL/rest/v1/truck_messages?truck_id=eq.$TRUCK_ID&client_id=eq.$CLIENT_ID&order=created_at.asc" \
  "$CARRIER_TOKEN")

check "Перевозчик видит сообщение клиента" "$CHAT_CARRIER" "still available"
check "Перевозчик видит своё сообщение" "$CHAT_CARRIER" "ready on the date"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 8 — RLS: Outsider не читает и не пишет в чужой чат"
# ─────────────────────────────────────────────────────────────

OUTSIDER_READ=$(get_json \
  "$SUPABASE_URL/rest/v1/truck_messages?truck_id=eq.$TRUCK_ID" \
  "$OUTSIDER_TOKEN")
check "Outsider получает пустой массив (RLS SELECT)" "$OUTSIDER_READ" '^\[\]$'

python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$OUTSIDER_ID','text':'Hacking truck chat'}))" > "$TMP/thack.json"
OUTSIDER_WRITE=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$OUTSIDER_TOKEN" "$TMP/thack.json")
check "Outsider не может писать в чужой чат (RLS INSERT)" "$OUTSIDER_WRITE" '42501|PGRST301|^\[\]$'

# Outsider не может создать свой диалог с этой машиной (нет отклика)
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$OUTSIDER_ID','sender_id':'$OUTSIDER_ID','text':'Fake dialog'}))" > "$TMP/thack2.json"
OUTSIDER_FAKE=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$OUTSIDER_TOKEN" "$TMP/thack2.json")
check "Outsider не может открыть чат без отклика (RLS)" "$OUTSIDER_FAKE" '42501|PGRST301|^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 9 — Граничные случаи"
# ─────────────────────────────────────────────────────────────

# Пустое сообщение
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$CLIENT_ID','text':''}))" > "$TMP/tempty.json"
EMPTY=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CLIENT_TOKEN" "$TMP/tempty.json")
check "Пустое сообщение отклонено (CHECK constraint)" "$EMPTY" '23514|23502|check'

# Клиент не может подделать sender_id перевозчика
python3 -c "import json; print(json.dumps({'truck_id':'$TRUCK_ID','client_id':'$CLIENT_ID','sender_id':'$CARRIER_ID','text':'Spoof carrier'}))" > "$TMP/tspoof.json"
SPOOF_MSG=$(post_json "$SUPABASE_URL/rest/v1/truck_messages" "$CLIENT_TOKEN" "$TMP/tspoof.json")
check "Клиент не может подделать sender_id (RLS)" "$SPOOF_MSG" '42501|PGRST301|^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 10 — Перевозчик закрывает рейс"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'status':'closed'}))" > "$TMP/tclose.json"
CLOSE=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/trucks?id=eq.$TRUCK_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CARRIER_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  --data-binary "@$TMP/tclose.json")
check "Перевозчик закрыл рейс" "$CLOSE" '"closed"'

# Закрытый рейс не виден в ленте активных
FEED_AFTER=$(get_json "$SUPABASE_URL/rest/v1/trucks?status=eq.active&id=eq.$TRUCK_ID" "$CLIENT_TOKEN")
check "Закрытый рейс не виден в ленте активных" "$FEED_AFTER" '^\[\]$'

# Другой перевозчик не может закрыть чужой рейс
python3 -c "import json; print(json.dumps({'status':'closed'}))" > "$TMP/tclose2.json"
# Create another carrier for this test
do_auth "truck_carrier2@test.ru" "test1234" "carrier" "Carrier2" "+7-900-000-00-01"
CARRIER2_TOKEN="$_TOKEN"

# First need an active truck to test on — use original (already closed, so check INSERT restriction)
# Test: carrier2 cannot update carrier's truck
STEAL=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/trucks?id=eq.$TRUCK_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CARRIER2_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  --data-binary "@$TMP/tclose2.json")
check "Другой перевозчик не может изменить чужой рейс (RLS UPDATE)" "$STEAL" '^\[\]$'

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
