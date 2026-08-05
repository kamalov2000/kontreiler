#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Очистка файлов тестовых данных в Storage — ПАРА к CLEANUP_TEST_DATA.sql
#
# Из SQL это сделать нельзя: Supabase блокирует прямой DELETE из
# storage.objects (триггер storage.protect_delete). Только Storage API.
#
# Пути зафиксированы на момент 2026-08-05 (периметр из 22 аккаунтов; добавление
# двух gmail-аккаунтов новых файлов не принесло). Перед запуском перепроверь
# запросом ниже, вдруг за это время добавились новые:
#
#   WITH tu AS (SELECT id FROM auth.users WHERE email LIKE '%@test.ru'
#                 OR email LIKE '%@kontreil-demo.ru'
#                 OR email IN ('kontreil.testclient@gmail.com','kontreil.testcarrier@gmail.com')),
#        tord AS (SELECT id FROM orders WHERE client_id IN (SELECT id FROM tu))
#   SELECT bucket_id, name FROM storage.objects
#    WHERE (bucket_id='order-docs'    AND split_part(name,'/',1) IN (SELECT id::text FROM tord))
#       OR (bucket_id='company-logos' AND split_part(name,'/',1) IN (SELECT id::text FROM tu));
#
# По умолчанию НИЧЕГО НЕ УДАЛЯЕТ: печатает, что будет удалено.
# Запуск с реальным удалением:  APPLY=1 ./CLEANUP_TEST_STORAGE.sh
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

: "${SUPABASE_URL:=https://smryxtxybuiixzkqbeit.supabase.co}"
: "${SERVICE_KEY:?Задай SERVICE_KEY=<service_role ключ> в окружении}"
APPLY="${APPLY:-0}"

delete_from_bucket() {
  local bucket="$1"; shift
  local files=("$@")
  local payload
  payload=$(printf '%s\n' "${files[@]}" | python3 -c 'import json,sys; print(json.dumps({"prefixes":[l.strip() for l in sys.stdin if l.strip()]}))')

  echo "── bucket: $bucket"
  printf '   %s\n' "${files[@]}"

  if [ "$APPLY" != "1" ]; then
    echo "   (dry-run, ничего не удалено — запусти с APPLY=1)"
    return
  fi

  curl -sS -X DELETE "$SUPABASE_URL/storage/v1/object/$bucket" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload"
  echo
}

delete_from_bucket order-docs \
  "14b28105-0694-402e-bfb2-1ef3a566983b/1775293209601.pdf" \
  "2abb62cd-3404-4d0d-a07f-0936afe564a0/1784541422448.pdf" \
  "5e7dbb67-592b-4e05-8a16-a5c92e10f173/1774818504829.pdf" \
  "b0f67bf3-e569-4c8a-9de1-59b59df5af24/tn-1785577538674.pdf"

delete_from_bucket company-logos \
  "a0000001-0000-0000-0000-000000000001/logo.webp" \
  "c0000002-0000-0000-0000-000000000002/logo.webp"
