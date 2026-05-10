-- Контрагенты: пользователь добавляет партнёров (клиент → перевозчики, перевозчик → клиенты)
CREATE TABLE IF NOT EXISTS counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counterparty_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, counterparty_id)
);

-- RLS
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own counterparties"
  ON counterparties FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can see who added them"
  ON counterparties FOR SELECT
  USING (counterparty_id = auth.uid());

-- Флаг "только для моих контрагентов" на заявке
ALTER TABLE orders ADD COLUMN IF NOT EXISTS counterparties_only BOOLEAN DEFAULT FALSE;
