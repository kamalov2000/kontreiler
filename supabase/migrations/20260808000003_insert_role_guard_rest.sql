-- Роль в остальных политиках вставки — продолжение 20260808000001.
--
-- Там роль появилась у orders и trucks, но той же дырой оставались ещё три
-- таблицы: политики сверяли только владельца строки, а роль не смотрели вовсе.
-- То есть клиент мог поставить ставку в торгах и сохранить маршрут ленты, а
-- перевозчик — откликнуться на чужую машину как заказчик.
--
-- current_user_role() создана в 20260808000001 (STABLE SECURITY DEFINER).

-- Ставки в торгах делает перевозчик; заказчик торги создаёт и выбирает победителя
DROP POLICY IF EXISTS "Carrier can insert own bids" ON public.bids;
CREATE POLICY "Carrier can insert own bids" ON public.bids FOR INSERT TO authenticated WITH CHECK (auth.uid() = carrier_id AND public.current_user_role() = 'carrier');

-- Сохранённые маршруты ленты — перевозчицкая функция
DROP POLICY IF EXISTS "Carriers insert saved routes" ON public.saved_routes;
CREATE POLICY "Carriers insert saved routes" ON public.saved_routes FOR INSERT TO authenticated WITH CHECK (auth.uid() = carrier_id AND public.current_user_role() = 'carrier');

-- Отклик на свободную машину оставляет заказчик
DROP POLICY IF EXISTS "Client can create truck response" ON public.truck_responses;
CREATE POLICY "Client can create truck response" ON public.truck_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id AND public.current_user_role() = 'client');
