-- ── Denormalize carrier_id into truck_messages ────────────────────────────
-- Supabase Realtime cannot evaluate EXISTS subqueries inside RLS policies
-- when delivering postgres_changes events. Adding carrier_id as a direct
-- column lets us use simple equality checks that Realtime can handle.

ALTER TABLE truck_messages
  ADD COLUMN IF NOT EXISTS carrier_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Backfill existing rows from the trucks table
UPDATE truck_messages tm
SET carrier_id = t.carrier_id
FROM trucks t
WHERE t.id = tm.truck_id
  AND tm.carrier_id IS NULL;

-- Make NOT NULL (safe after backfill; new rows always supply it)
ALTER TABLE truck_messages ALTER COLUMN carrier_id SET NOT NULL;

-- Add index for Realtime filter lookups
CREATE INDEX IF NOT EXISTS idx_truck_messages_carrier_id ON truck_messages(carrier_id);

-- Replace old SELECT policy (used EXISTS subquery → broken with Realtime)
DROP POLICY IF EXISTS "Truck chat participants can view messages" ON truck_messages;

CREATE POLICY "Truck chat participants can view messages"
  ON truck_messages FOR SELECT USING (
    auth.uid() = client_id OR auth.uid() = carrier_id
  );

-- Replace old INSERT policy to also drop the EXISTS subquery for the carrier
DROP POLICY IF EXISTS "Truck chat participants can send messages" ON truck_messages;

CREATE POLICY "Truck chat participants can send messages"
  ON truck_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      -- Перевозчик этой машины
      auth.uid() = carrier_id
      OR
      -- Клиент, который откликнулся
      (
        auth.uid() = client_id
        AND EXISTS (
          SELECT 1 FROM truck_responses
          WHERE truck_responses.truck_id = truck_messages.truck_id
            AND truck_responses.client_id = auth.uid()
        )
      )
    )
  );
