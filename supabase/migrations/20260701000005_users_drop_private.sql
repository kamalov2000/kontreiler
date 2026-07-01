-- CONTRACT-фаза: удаляем чувствительные колонки из общедоступной users
-- (данные уже перенесены в user_private миграцией 20260701000004).
--
-- ВАЖНО: применять на проде ТОЛЬКО после деплоя фронта, который читает/пишет
-- эти поля через user_private. Иначе старый фронт не сможет сохранить профиль.

ALTER TABLE users
  DROP COLUMN IF EXISTS kpp,
  DROP COLUMN IF EXISTS ogrn,
  DROP COLUMN IF EXISTS legal_address,
  DROP COLUMN IF EXISTS actual_address,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_account,
  DROP COLUMN IF EXISTS bank_corr_account,
  DROP COLUMN IF EXISTS bank_bik,
  DROP COLUMN IF EXISTS signatory_name,
  DROP COLUMN IF EXISTS signatory_position,
  DROP COLUMN IF EXISTS signatory_basis,
  DROP COLUMN IF EXISTS default_obligations;
