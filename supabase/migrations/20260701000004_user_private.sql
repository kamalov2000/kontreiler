-- Безопасность: чувствительные реквизиты (банк, подписант, юр-адреса, обязательства)
-- выносим из общедоступной таблицы users в приватную user_private с RLS «только своя строка».
-- Раньше любой авторизованный мог прочитать чужие банковские реквизиты напрямую из users.
--
-- Это EXPAND-фаза (создать + скопировать). Колонки из users дропаются отдельной
-- миграцией 20260701000005 — уже ПОСЛЕ деплоя фронта, читающего user_private,
-- чтобы не сломать работающий сайт.

CREATE TABLE IF NOT EXISTS user_private (
  id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kpp                 TEXT,
  ogrn                TEXT,
  legal_address       TEXT,
  actual_address      TEXT,
  bank_name           TEXT,
  bank_account        TEXT,
  bank_corr_account   TEXT,
  bank_bik            TEXT,
  signatory_name      TEXT,
  signatory_position  TEXT,
  signatory_basis     TEXT,
  default_obligations TEXT
);

ALTER TABLE user_private ENABLE ROW LEVEL SECURITY;

-- Доступ строго к своей строке
DROP POLICY IF EXISTS "own private select" ON user_private;
CREATE POLICY "own private select" ON user_private FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "own private insert" ON user_private;
CREATE POLICY "own private insert" ON user_private FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "own private update" ON user_private;
CREATE POLICY "own private update" ON user_private FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_private TO authenticated, service_role;

-- Переносим существующие данные
INSERT INTO user_private (
  id, kpp, ogrn, legal_address, actual_address,
  bank_name, bank_account, bank_corr_account, bank_bik,
  signatory_name, signatory_position, signatory_basis, default_obligations
)
SELECT
  id, kpp, ogrn, legal_address, actual_address,
  bank_name, bank_account, bank_corr_account, bank_bik,
  signatory_name, signatory_position, signatory_basis, default_obligations
FROM users
ON CONFLICT (id) DO NOTHING;
