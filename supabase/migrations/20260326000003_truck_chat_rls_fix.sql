-- Fix: truck_messages INSERT must require an existing truck_response for the client
DROP POLICY "Truck chat participants can send messages" ON truck_messages;

CREATE POLICY "Truck chat participants can send messages"
  ON truck_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      -- Перевозчик этой машины
      EXISTS (
        SELECT 1 FROM trucks
        WHERE trucks.id = truck_id
          AND trucks.carrier_id = auth.uid()
      )
      OR
      -- Клиент, который уже откликнулся на эту машину
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
