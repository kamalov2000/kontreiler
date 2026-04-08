-- ────────────────────────────────────────────────────────────────────
-- Расширенный профиль компании для генерации договора-заявки
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS kpp                 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ogrn                TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_address        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS actual_address       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_corr_account    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_bik             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signatory_name       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signatory_position   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signatory_basis      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_obligations  TEXT;
