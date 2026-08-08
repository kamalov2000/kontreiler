-- Роль в политиках вставки: заявку создаёт только client, машину — только carrier.
--
-- До этого политики сверяли лишь владельца (auth.uid() = client_id / carrier_id),
-- а ролевую границу держал один middleware. Когда он пропускал /orders/new
-- перевозчику, тот спокойно публиковал заявку, и она уходила в общую ленту.
-- Теперь граница продублирована в БД: правка роутинга больше не открывает дыру.

-- Роль текущего пользователя одним обращением. SECURITY DEFINER — чтобы политика
-- не зависела от RLS на users (иначе проверка ломается при любом ужесточении
-- доступа к профилям), STABLE — чтобы планировщик звал её один раз на стейтмент.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Заявки (включая торги: format проверяется отдельно, роль — общая)
DROP POLICY IF EXISTS "Clients can create orders" ON public.orders;
CREATE POLICY "Clients can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id AND public.current_user_role() = 'client');

-- Свободные машины
DROP POLICY IF EXISTS "Carrier can create own trucks" ON public.trucks;
CREATE POLICY "Carrier can create own trucks" ON public.trucks FOR INSERT TO authenticated WITH CHECK (auth.uid() = carrier_id AND public.current_user_role() = 'carrier');
