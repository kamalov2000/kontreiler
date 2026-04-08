-- ────────────────────────────────────────────────────────────────────
-- Таблица сотрудников компании
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select"
  ON company_members FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "company_members_insert"
  ON company_members FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "company_members_delete"
  ON company_members FOR DELETE
  USING (owner_id = auth.uid());
