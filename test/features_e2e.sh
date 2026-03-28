#!/bin/bash
# Тест всех 7 новых фич: верификация телефона, email, отзывы, сохранённые маршруты,
# notes, agreed_price, статистика

SUPABASE_URL="http://127.0.0.1:54321"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
APP_URL="http://localhost:3000"

TS=$(date +%s)
CLIENT_EMAIL="feat_client_${TS}@test.ru"
CARRIER_EMAIL="feat_carrier_${TS}@test.ru"
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
  else red "$label"; echo "    └─ $(echo "$result" | head -c 300)"; fi
}

json_post() {
  local url="$1"; local token="$2"; local file="$3"
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

json_post_svc() {
  local url="$1"; local file="$2"
  curl -s -X POST "$url" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "Prefer: return=representation" \
    --data-binary "@$file"
}

# ─── Регистрация ────────────────────────────────────────────────────────
blue "SETUP — Регистрация пользователей"

python3 -c "import json; print(json.dumps({'email':'$CLIENT_EMAIL','password':'$PASSWORD'}))" > "$TMP/sc.json"
SIGNUP_C=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/sc.json")
check "Signup клиента" "$SIGNUP_C" "access_token"
CLIENT_TOKEN=$(echo "$SIGNUP_C" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
CLIENT_ID=$(echo "$SIGNUP_C" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user',{}).get('id',''))" 2>/dev/null)

python3 -c "import json; print(json.dumps({'email':'$CARRIER_EMAIL','password':'$PASSWORD'}))" > "$TMP/sc2.json"
SIGNUP_K=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" --data-binary "@$TMP/sc2.json")
check "Signup перевозчика" "$SIGNUP_K" "access_token"
CARRIER_TOKEN=$(echo "$SIGNUP_K" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
CARRIER_ID=$(echo "$SIGNUP_K" | python3 -c "import sys,json; print(json.load(sys.stdin).get('user',{}).get('id',''))" 2>/dev/null)

# Создаём профили
python3 -c "import json; print(json.dumps({'id':'$CLIENT_ID','role':'client','name':'FeatureTest Client','phone':'+79001112233','city':'Moskva'}))" > "$TMP/pc.json"
json_post "$SUPABASE_URL/rest/v1/users" "$CLIENT_TOKEN" "$TMP/pc.json" > /dev/null

python3 -c "import json; print(json.dumps({'id':'$CARRIER_ID','role':'carrier','name':'FeatureTest Carrier','phone':'+79009998877','city':'Kazan'}))" > "$TMP/pk.json"
json_post "$SUPABASE_URL/rest/v1/users" "$CARRIER_TOKEN" "$TMP/pk.json" > /dev/null

info "client_id=$CLIENT_ID  carrier_id=$CARRIER_ID"

# ─── 1. Верификация телефона ─────────────────────────────────────────────
blue "ФИЧА 1 — Верификация телефона"

# Проверяем что колонка is_phone_verified существует
USER_DATA=$(json_get "$SUPABASE_URL/rest/v1/users?id=eq.$CLIENT_ID&select=is_phone_verified,last_seen_at" "$CLIENT_TOKEN")
check "Колонка is_phone_verified существует" "$USER_DATA" "is_phone_verified"
check "Начальное значение is_phone_verified=false" "$USER_DATA" '"is_phone_verified":false'
check "Колонка last_seen_at существует" "$USER_DATA" "last_seen_at"

# Отправляем код через API (dev mode)
SEND_RESULT=$(curl -s -X POST "$APP_URL/api/phone/send" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$CLIENT_ID\",\"phone\":\"+79001112233\"}")
check "API /api/phone/send возвращает ok" "$SEND_RESULT" '"ok":true'

# Получаем код из БД напрямую через service role
CODE_ROW=$(json_get "$SUPABASE_URL/rest/v1/phone_verification_codes?user_id=eq.$CLIENT_ID&select=code,phone,used&order=created_at.desc&limit=1" "")
CODE=$(echo "$CODE_ROW" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['code'] if d else '')" 2>/dev/null)
# Используем service key для чтения кода
CODE_ROW_SVC=$(curl -s "$SUPABASE_URL/rest/v1/phone_verification_codes?user_id=eq.$CLIENT_ID&select=code,phone&order=created_at.desc&limit=1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")
CODE=$(echo "$CODE_ROW_SVC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['code'] if d else '')" 2>/dev/null)
info "Код из БД: $CODE"
check "Код создан в phone_verification_codes" "$CODE_ROW_SVC" '"code"'

# Верифицируем код через API
if [ -n "$CODE" ]; then
  VERIFY_RESULT=$(curl -s -X POST "$APP_URL/api/phone/verify" \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$CLIENT_ID\",\"phone\":\"+79001112233\",\"code\":\"$CODE\"}")
  check "API /api/phone/verify с правильным кодом" "$VERIFY_RESULT" '"ok":true'

  VERIFIED_USER=$(json_get "$SUPABASE_URL/rest/v1/users?id=eq.$CLIENT_ID&select=is_phone_verified" "$CLIENT_TOKEN")
  check "is_phone_verified стал true" "$VERIFIED_USER" '"is_phone_verified":true'
else
  red "Не удалось получить код — проверьте что приложение запущено (npm run dev)"
fi

# Неверный код
WRONG_VERIFY=$(curl -s -X POST "$APP_URL/api/phone/verify" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$CLIENT_ID\",\"phone\":\"+79001112233\",\"code\":\"000000\"}")
check "Неверный код — ошибка" "$WRONG_VERIFY" '"error"'

# Верифицируем перевозчика тоже (через прямое обновление для теста)
python3 -c "import json; print(json.dumps({'is_phone_verified':True}))" > "$TMP/verify_carrier.json"
curl -s -X PATCH "$SUPABASE_URL/rest/v1/users?id=eq.$CARRIER_ID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"is_phone_verified":true}' > /dev/null

# ─── 2. Комментарий к заявке (notes) ─────────────────────────────────────
blue "ФИЧА 5 — Поле notes для заявок"

python3 -c "
import json
print(json.dumps({
  'client_id': '$CLIENT_ID',
  'from_city': 'Moskva',
  'to_city': 'Vladivostok',
  'container_type': '40HC',
  'ready_date': '$READY_DATE',
  'price': 150000,
  'is_negotiable': False,
  'is_urgent': False,
  'notes': 'Refrizherator, temperatura -18C, opasnyi gruz'
}))
" > "$TMP/order_notes.json"

ORDER_WITH_NOTES=$(json_post "$SUPABASE_URL/rest/v1/orders" "$CLIENT_TOKEN" "$TMP/order_notes.json")
check "Заявка с notes создана" "$ORDER_WITH_NOTES" "Vladivostok"
check "Поле notes сохранено" "$ORDER_WITH_NOTES" "Refrizherator"

ORDER_ID=$(echo "$ORDER_WITH_NOTES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null)
info "order_id=$ORDER_ID"

# Читаем notes через API
NOTES_CHECK=$(json_get "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID&select=notes" "$CLIENT_TOKEN")
check "notes читается из заявки" "$NOTES_CHECK" "Refrizherator"

# ─── 6. Фиксация agreed_price ────────────────────────────────────────────
blue "ФИЧА 6 — Фиксация цены сделки (agreed_price)"

# Перевозчик откликается
python3 -c "import json; print(json.dumps({'order_id':'$ORDER_ID','carrier_id':'$CARRIER_ID','message':'Gotov'}))" > "$TMP/resp.json"
RESP=$(json_post "$SUPABASE_URL/rest/v1/responses" "$CARRIER_TOKEN" "$TMP/resp.json")
check "Перевозчик откликнулся" "$RESP" "order_id"

# Клиент принимает с указанием цены
python3 -c "import json; print(json.dumps({'accepted_carrier_id':'$CARRIER_ID','status':'matched','agreed_price':145000}))" > "$TMP/accept.json"
ACCEPT=$(json_patch "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/accept.json")
check "Перевозчик принят с agreed_price" "$ACCEPT" '"matched"'
check "agreed_price=145000 сохранён" "$ACCEPT" '145000'

PRICE_CHECK=$(json_get "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID&select=agreed_price,accepted_carrier_id" "$CLIENT_TOKEN")
check "agreed_price читается из заявки" "$PRICE_CHECK" '145000'

# ─── 3. Отзывы ──────────────────────────────────────────────────────────
blue "ФИЧА 3 — Рейтинг и отзывы"

# Проводим заявку до статуса delivered
python3 -c "import json; print(json.dumps({'status':'in_transit'}))" > "$TMP/s1.json"
json_patch "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/s1.json" > /dev/null
python3 -c "import json; print(json.dumps({'status':'delivered'}))" > "$TMP/s2.json"
DELIVERED=$(json_patch "$SUPABASE_URL/rest/v1/orders?id=eq.$ORDER_ID" "$CLIENT_TOKEN" "$TMP/s2.json")
check "Статус стал delivered" "$DELIVERED" '"delivered"'

# Проверяем что review_request уведомление создалось
NOTIF=$(json_get "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CLIENT_ID&type=eq.review_request" "$CLIENT_TOKEN")
check "Уведомление review_request для клиента создано" "$NOTIF" "review_request"
NOTIF_K=$(json_get "$SUPABASE_URL/rest/v1/notifications?user_id=eq.$CARRIER_ID&type=eq.review_request" "$CARRIER_TOKEN")
check "Уведомление review_request для перевозчика создано" "$NOTIF_K" "review_request"

# Клиент оставляет отзыв на перевозчика
python3 -c "
import json
print(json.dumps({
  'order_id': '$ORDER_ID',
  'reviewer_id': '$CLIENT_ID',
  'reviewee_id': '$CARRIER_ID',
  'rating': 5,
  'comment': 'Excellent carrier, on time'
}))
" > "$TMP/review1.json"

REVIEW1=$(json_post "$SUPABASE_URL/rest/v1/reviews" "$CLIENT_TOKEN" "$TMP/review1.json")
check "Клиент оставил отзыв перевозчику" "$REVIEW1" '"rating":5'
check "Комментарий сохранён" "$REVIEW1" "Excellent"

REVIEW1_ID=$(echo "$REVIEW1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null)

# Перевозчик оставляет отзыв клиенту
python3 -c "
import json
print(json.dumps({
  'order_id': '$ORDER_ID',
  'reviewer_id': '$CARRIER_ID',
  'reviewee_id': '$CLIENT_ID',
  'rating': 4,
  'comment': 'Good client'
}))
" > "$TMP/review2.json"

REVIEW2=$(json_post "$SUPABASE_URL/rest/v1/reviews" "$CARRIER_TOKEN" "$TMP/review2.json")
check "Перевозчик оставил отзыв клиенту" "$REVIEW2" '"rating":4'

# RLS: нельзя оставить второй отзыв (UNIQUE order_id + reviewer_id)
REVIEW_DUP=$(json_post "$SUPABASE_URL/rest/v1/reviews" "$CLIENT_TOKEN" "$TMP/review1.json")
check "RLS: повторный отзыв отклонён (UNIQUE constraint)" "$REVIEW_DUP" "23505"

# Отзывы видны всем аутентифицированным
REVIEWS_READ=$(json_get "$SUPABASE_URL/rest/v1/reviews?order_id=eq.$ORDER_ID" "$CARRIER_TOKEN")
check "Отзывы видны через RLS" "$REVIEWS_READ" '"rating"'
REVIEW_COUNT=$(echo "$REVIEWS_READ" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Оба отзыва сохранены (count=2)" "$REVIEW_COUNT" "^2$"

# ─── 4. Сохранённые маршруты ─────────────────────────────────────────────
blue "ФИЧА 4 — Сохранённые маршруты"

python3 -c "import json; print(json.dumps({'carrier_id':'$CARRIER_ID','from_city':'Kazan','to_city':'Moskva','container_type':'40ft'}))" > "$TMP/route1.json"
ROUTE1=$(json_post "$SUPABASE_URL/rest/v1/saved_routes" "$CARRIER_TOKEN" "$TMP/route1.json")
check "Сохранённый маршрут создан" "$ROUTE1" "Kazan"
check "container_type сохранён" "$ROUTE1" "40ft"

python3 -c "import json; print(json.dumps({'carrier_id':'$CARRIER_ID','from_city':'Kazan','to_city':'Vladivostok'}))" > "$TMP/route2.json"
ROUTE2=$(json_post "$SUPABASE_URL/rest/v1/saved_routes" "$CARRIER_TOKEN" "$TMP/route2.json")
check "Второй маршрут без container_type создан" "$ROUTE2" "Vladivostok"

ROUTES=$(json_get "$SUPABASE_URL/rest/v1/saved_routes?carrier_id=eq.$CARRIER_ID&select=*" "$CARRIER_TOKEN")
ROUTE_COUNT=$(echo "$ROUTES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
check "Перевозчик видит 2 сохранённых маршрута" "$ROUTE_COUNT" "^2$"

# RLS: клиент не видит маршруты перевозчика
ROUTES_CLIENT=$(json_get "$SUPABASE_URL/rest/v1/saved_routes?carrier_id=eq.$CARRIER_ID" "$CLIENT_TOKEN")
check "RLS: клиент не видит маршруты перевозчика" "$ROUTES_CLIENT" '^\[\]$'

# ─── Email API тест ──────────────────────────────────────────────────────
blue "ФИЧА 2 — Email уведомления (API)"

EMAIL_TEST=$(curl -s -X POST "$APP_URL/api/email" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"response_accepted\",\"orderId\":\"$ORDER_ID\",\"carrierId\":\"$CARRIER_ID\"}")
check "API /api/email отвечает ok" "$EMAIL_TEST" '"ok":true'

# ─── 7. Статистика ──────────────────────────────────────────────────────
blue "ФИЧА 7 — Статистика (данные в БД)"

# Проверяем что данные для статистики клиента есть
STATS_DATA=$(json_get "$SUPABASE_URL/rest/v1/orders?accepted_carrier_id=eq.$CARRIER_ID&status=eq.delivered&select=id,agreed_price" "$CLIENT_TOKEN")
check "Данные для статистики (delivered orders) доступны" "$STATS_DATA" '"id"'

STATS_PAGE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/stats" -H "Cookie: $(curl -s -c - "$APP_URL" 2>/dev/null)")
info "HTTP статус страницы /stats: $STATS_PAGE"

# ─── Итог ────────────────────────────────────────────────────────────────
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
