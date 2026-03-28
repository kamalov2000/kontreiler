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

# Логин (или signup если нет) — возвращает токен и id через глобальные переменные
do_auth() {
  local _EMAIL="$1" _PASS="$2" _ROLE="$3" _NAME="$4" _PHONE="$5"
  python3 -c "import json; print(json.dumps({'email':'$_EMAIL','password':'$_PASS'}))" > "$TMP/auth.json"
  # Пробуем signup
  local _R
  _R=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/auth.json")
  # Если уже существует — логинимся
  if ! echo "$_R" | grep -q "access_token"; then
    _R=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
      -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/auth.json")
  fi
  _TOKEN=$(echo "$_R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null)
  _ID=$(echo "$_R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
  # Создаём профиль
  python3 -c "import json; print(json.dumps({'id':'$_ID','role':'$_ROLE','name':'$_NAME','phone':'$_PHONE','city':'City'}))" > "$TMP/prof.json"
  curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $_TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary "@$TMP/prof.json" > /dev/null 2>&1 || true
}

# ─────────────────────────────────────────────────────────────
blue "ПОДГОТОВКА — 3 пользователя + заявка + отклик"
# ─────────────────────────────────────────────────────────────

READY_DATE=$(python3 -c "from datetime import date, timedelta; print(date.today()+timedelta(days=3))")

do_auth "client@test.ru"  "test1234" "client"  "Client User"   "+7-495-111-22-33"
CLIENT_TOKEN="$_TOKEN"; CLIENT_ID="$_ID"

do_auth "carrier@test.ru" "test1234" "carrier" "Carrier User"  "+7-916-555-66-77"
CARRIER_TOKEN="$_TOKEN"; CARRIER_ID="$_ID"

do_auth "outsider@test.ru" "test1234" "carrier" "Outsider User" "+7-999-000-00-00"
OUTSIDER_TOKEN="$_TOKEN"; OUTSIDER_ID="$_ID"

if [ -z "$CLIENT_TOKEN" ] || [ -z "$CARRIER_TOKEN" ] || [ -z "$OUTSIDER_TOKEN" ]; then
  echo "  СТОП: не удалось получить токены. C=$CLIENT_TOKEN CAR=$CARRIER_TOKEN OUT=$OUTSIDER_TOKEN"
  exit 1
fi

info "client_id   = $CLIENT_ID"
info "carrier_id  = $CARRIER_ID"
info "outsider_id = $OUTSIDER_ID"

# Создаём заявку
python3 -c "
import json
print(json.dumps({
  'client_id':'$CLIENT_ID','from_city':'Moscow','to_city':'Novosibirsk',
  'container_type':'40ft','ready_date':'$READY_DATE',
  'price':85000,'is_negotiable':False,'is_urgent':True,'status':'active'
}))
" > "$TMP/order.json"

ORDER_RESP=$(post_json "$SUPABASE_URL/rest/v1/orders" "$CLIENT_TOKEN" "$TMP/order.json")
ORDER_ID=$(echo "$ORDER_RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
elif isinstance(d,dict): print(d.get('id',''))
" 2>/dev/null)

if [ -z "$ORDER_ID" ]; then
  echo "  СТОП: не создана заявка. Ответ: $ORDER_RESP"
  exit 1
fi
info "order_id    = $ORDER_ID"

# Перевозчик откликается
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','carrier_id':'$CARRIER_ID','message':'Ready'}))" > "$TMP/resp.json"
post_json "$SUPABASE_URL/rest/v1/responses" "$CARRIER_TOKEN" "$TMP/resp.json" > /dev/null

# ─────────────────────────────────────────────────────────────
blue "ШАГ 1 — Клиент отправляет сообщение в чат"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CLIENT_ID','text':'Hello carrier, when can you pick up?'}))" > "$TMP/msg1.json"
MSG1=$(post_json "$SUPABASE_URL/rest/v1/messages" "$CLIENT_TOKEN" "$TMP/msg1.json")

check "Клиент отправил сообщение" "$MSG1" "order_id"
check "Текст сообщения сохранён" "$MSG1" "Hello carrier"
check "sender_id = client_id" "$MSG1" "$CLIENT_ID"

MSG1_ID=$(echo "$MSG1" | python3 -c "
import sys,json; d=json.load(sys.stdin)
if isinstance(d,list) and d: print(d[0]['id'])
" 2>/dev/null)
info "msg1_id = $MSG1_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 2 — Перевозчик отвечает в тот же чат"
# ─────────────────────────────────────────────────────────────

python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CARRIER_ID','text':'I can be there tomorrow at 9am'}))" > "$TMP/msg2.json"
MSG2=$(post_json "$SUPABASE_URL/rest/v1/messages" "$CARRIER_TOKEN" "$TMP/msg2.json")

check "Перевозчик отправил ответ" "$MSG2" "order_id"
check "Текст ответа сохранён" "$MSG2" "tomorrow at 9am"
check "sender_id = carrier_id" "$MSG2" "$CARRIER_ID"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 3 — Оба участника читают историю чата"
# ─────────────────────────────────────────────────────────────

CHAT_CLIENT=$(get_json \
  "$SUPABASE_URL/rest/v1/messages?order_id=eq.$ORDER_ID&order=created_at.asc&select=*,sender:users%21sender_id(id,name,role)" \
  "$CLIENT_TOKEN")

check "Клиент видит сообщение 'Hello carrier'" "$CHAT_CLIENT" "Hello carrier"
check "Клиент видит ответ перевозчика" "$CHAT_CLIENT" "tomorrow at 9am"
MSG_COUNT_CLIENT=$(echo "$CHAT_CLIENT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Клиент видит ровно 2 сообщения" "$MSG_COUNT_CLIENT" "^2$"
info "Сообщений у клиента: $MSG_COUNT_CLIENT"

CHAT_CARRIER=$(get_json \
  "$SUPABASE_URL/rest/v1/messages?order_id=eq.$ORDER_ID&order=created_at.asc" \
  "$CARRIER_TOKEN")

check "Перевозчик видит сообщение клиента" "$CHAT_CARRIER" "Hello carrier"
check "Перевозчик видит своё сообщение" "$CHAT_CARRIER" "tomorrow at 9am"
MSG_COUNT_CARRIER=$(echo "$CHAT_CARRIER" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Перевозчик видит ровно 2 сообщения" "$MSG_COUNT_CARRIER" "^2$"

# ─────────────────────────────────────────────────────────────
blue "ШАГ 4 — RLS: Outsider не видит и не пишет в чужой чат"
# ─────────────────────────────────────────────────────────────

OUTSIDER_READ=$(get_json \
  "$SUPABASE_URL/rest/v1/messages?order_id=eq.$ORDER_ID" \
  "$OUTSIDER_TOKEN")

check "Outsider получает пустой массив (RLS SELECT блокирует)" "$OUTSIDER_READ" '^\[\]$'
info "Ответ outsider: $(echo "$OUTSIDER_READ" | head -c 80)"

# Outsider не может написать в чужой чат
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$OUTSIDER_ID','text':'Hacking into chat'}))" > "$TMP/hack.json"
OUTSIDER_WRITE=$(post_json "$SUPABASE_URL/rest/v1/messages" "$OUTSIDER_TOKEN" "$TMP/hack.json")
check "Outsider не может писать в чужой чат (RLS INSERT блокирует)" "$OUTSIDER_WRITE" '42501|PGRST301|^\[\]$'

# Outsider не может подделать sender_id клиента
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CLIENT_ID','text':'Spoofed as client'}))" > "$TMP/spoof.json"
SPOOF=$(post_json "$SUPABASE_URL/rest/v1/messages" "$OUTSIDER_TOKEN" "$TMP/spoof.json")
check "Outsider не может подделать sender_id (RLS CHECK блокирует)" "$SPOOF" '42501|PGRST301|^\[\]$'

# ─────────────────────────────────────────────────────────────
blue "ШАГ 5 — Граничные случаи"
# ─────────────────────────────────────────────────────────────

# Клиент не может отправить от имени перевозчика
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CARRIER_ID','text':'Fake from carrier'}))" > "$TMP/fake.json"
FAKE=$(post_json "$SUPABASE_URL/rest/v1/messages" "$CLIENT_TOKEN" "$TMP/fake.json")
check "Клиент не может отправить от имени перевозчика" "$FAKE" '42501|PGRST301|^\[\]$'

# Пустой текст должен блокироваться CHECK constraint
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CLIENT_ID','text':''}))" > "$TMP/empty.json"
EMPTY_MSG=$(post_json "$SUPABASE_URL/rest/v1/messages" "$CLIENT_TOKEN" "$TMP/empty.json")
check "Пустое сообщение отклонено (CHECK constraint)" "$EMPTY_MSG" '23514|23502|check'

# Третье сообщение — нормальная работа
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','sender_id':'$CLIENT_ID','text':'Perfect, see you then!'}))" > "$TMP/msg3.json"
MSG3=$(post_json "$SUPABASE_URL/rest/v1/messages" "$CLIENT_TOKEN" "$TMP/msg3.json")
check "Третье сообщение от клиента отправлено" "$MSG3" "Perfect"

# Финальный счёт — 3 сообщения
FINAL=$(get_json "$SUPABASE_URL/rest/v1/messages?order_id=eq.$ORDER_ID&order=created_at.asc" "$CLIENT_TOKEN")
FINAL_COUNT=$(echo "$FINAL" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Итого 3 сообщения в чате" "$FINAL_COUNT" "^3$"

# Outsider по-прежнему не видит
STILL_OUTSIDER=$(get_json "$SUPABASE_URL/rest/v1/messages?order_id=eq.$ORDER_ID" "$OUTSIDER_TOKEN")
check "Outsider по-прежнему не видит чат (итоговая проверка)" "$STILL_OUTSIDER" '^\[\]$'

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
