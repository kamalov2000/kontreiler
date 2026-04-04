# Deploy Checklist — Контрейл

Пошаговая инструкция для деплоя на Supabase Cloud + Vercel.

---

## 1. Supabase Cloud — первичная настройка

### 1.1 Создать проект

1. Зайти на [supabase.com](https://supabase.com) → New Project
2. Запомнить/сохранить `Project URL` и оба ключа (`anon public`, `service_role secret`)

### 1.2 Применить миграции

Все миграции лежат в `supabase/migrations/`. Применять строго по порядку (по дате в имени файла).

**Вариант A — через Supabase CLI:**
```bash
# Настроить remote
supabase link --project-ref <YOUR_PROJECT_REF>

# Применить все pending миграции
supabase db push
```

**Вариант B — вручную через SQL Editor:**
Открыть Supabase Dashboard → SQL Editor → выполнить содержимое каждого файла в порядке:
```
20260326000000_init.sql
20260326000001_messages.sql
20260326000002_trucks.sql
20260326000003_truck_chat_rls_fix.sql
20260326000004_notifications.sql
20260326000005_order_matching.sql
20260326000006_lifecycle.sql
20260327000000_lifecycle_v2.sql
20260327000001_features.sql
20260327000002_security_fixes.sql
20260327000003_phone_security.sql
20260328000001_order_numbers_ratings.sql
20260328000002_auth_trigger.sql
20260329000001_improvements.sql
20260329000002_new_fields.sql
20260329000003_auctions.sql
20260329000004_truck_messages_carrier_id.sql
20260329000005_order_number_with_year.sql
20260329000006_carrier_details.sql
20260329000007_order_documents.sql
20260330000001_order_improvements.sql
20260330000002_auction_logic.sql
20260402000001_expire_orders.sql
20260402000002_order_numbers_v2.sql
20260402000003_ready_time.sql
20260404000001_cleanup.sql
```

> Файлы `all_migrations.sql`, `seed_test_orders.sql`, `seed_test_users.sql` — только для локальной разработки, на прод не применять.

---

## 2. Supabase Cloud — включить расширения и функции

### 2.1 pg_cron (автоистечение заявок и закрытие аукционов)

1. Dashboard → Database → Extensions
2. Найти **pg_cron** → Enable
3. После применения миграций cron-задачи создаются автоматически триггерами в SQL.
   Проверить что они появились: Dashboard → Database → Cron Jobs, должны быть:
   - `expire-orders` — `* * * * *` (каждую минуту)
   - `settle-auctions` — `*/5 * * * *` (каждые 5 минут)

### 2.2 Realtime

1. Dashboard → Database → Replication (или Table Editor → каждая таблица → Realtime)
2. Включить Realtime для таблиц:
   - `orders`
   - `messages`
   - `notifications`
   - `truck_messages`

### 2.3 Storage bucket

Миграция `20260329000007_order_documents.sql` создаёт bucket и политики автоматически.
Проверить: Dashboard → Storage → должен быть bucket `order-docs` (private, 10MB limit).

Если bucket не создался (Supabase Storage DDL не всегда выполняется через SQL Editor):
1. Dashboard → Storage → New Bucket
   - Name: `order-docs`
   - Public: **No** (private)
   - File size limit: `10485760` (10 MB)
2. Добавить политики вручную (из миграции `20260329000007_order_documents.sql`, блок `storage.objects`).

---

## 3. Supabase Cloud — Auth настройки

1. Dashboard → Authentication → URL Configuration:
   - **Site URL**: `https://ВАШ_ДОМЕН.vercel.app`
   - **Redirect URLs**: добавить `https://ВАШ_ДОМЕН.vercel.app/auth/callback`

2. Dashboard → Authentication → Email Templates:
   - Убедиться что **Enable email confirmations** включён (если нужна верификация почты)

3. Dashboard → Authentication → Providers → Email:
   - Убедиться что Email Provider включён

---

## 4. SMTP для email-уведомлений (транзакционные письма)

Приложение отправляет письма через `/api/email` при событиях: новый отклик, принятие, доставка, отмена.

1. Выбрать SMTP-провайдер: Resend, SendGrid, Postmark, и т.п.
2. Добавить переменные окружения в Vercel (см. секцию 5):
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
   - (конкретные названия зависят от реализации в `/src/lib/email.ts`)
3. Dashboard → Authentication → SMTP Settings (опционально) — можно настроить Supabase Auth emails через свой SMTP.

---

## 5. Vercel — деплой

### 5.1 Подключить репозиторий

1. [vercel.com](https://vercel.com) → New Project → Import Git Repository
2. Framework: **Next.js** (определяется автоматически)
3. Root Directory: оставить по умолчанию (`.`)

### 5.2 Переменные окружения

В Vercel → Settings → Environment Variables добавить:

| Переменная | Где взять | Обязательно |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret | ✅ |
| `SMTP_HOST` | Ваш SMTP-провайдер | при использовании email |
| `SMTP_PORT` | Ваш SMTP-провайдер | при использовании email |
| `SMTP_USER` | Ваш SMTP-провайдер | при использовании email |
| `SMTP_PASS` | Ваш SMTP-провайдер | при использовании email |
| `EMAIL_FROM` | Например: `noreply@ваш-домен.ru` | при использовании email |

> `SUPABASE_SERVICE_ROLE_KEY` используется только в серверных API routes (`/api/email`). Никогда не передавать в браузер.

### 5.3 Деплой

После добавления переменных → Deploy. Vercel автоматически запускает `next build`.

---

## 6. Проверка после деплоя

- [ ] Открыть сайт, убедиться что страница загружается
- [ ] Зарегистрироваться как клиент, создать тестовую заявку
- [ ] Зарегистрироваться как перевозчик, найти заявку в ленте
- [ ] Отклик → чат → принятие → статус matched
- [ ] Проверить что уведомления появляются (колокольчик)
- [ ] Проверить что email приходит при новом отклике
- [ ] Создать аукционную заявку, сделать ставку — убедиться что валидация работает
- [ ] Дождаться или вручную вызвать `expire_overdue_orders()` — убедиться что просроченные заявки меняют статус
- [ ] Загрузить документ к заявке — убедиться что файл сохраняется в Storage

---

## 7. Известные особенности

- **pg_cron на Supabase Free**: на Free-тире pg_cron работает, но проект засыпает после бездействия — cron не выполняется пока БД не разбужена первым запросом. На Pro-тире засыпания нет.
- **Realtime на Free**: ограничение 200 одновременных подключений.
- **Storage на Free**: 1 GB включено. Bucket `order-docs` с лимитом 10MB/файл.
- **Auth email**: Supabase на Free-тире шлёт письма через встроенный SMTP с лимитом 3 письма/час. Для production нужен свой SMTP.
