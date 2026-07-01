-- Безопасность: телефон в users читался любым авторизованным в обход per-order
-- флага hide_phone. Закрываем чтение чужого номера на уровне привилегий колонок:
-- роли anon/authenticated больше не могут SELECT users.phone (только service_role).
--
-- Column-level REVOKE не действует, пока есть табличный GRANT SELECT, поэтому
-- снимаем табличный SELECT и выдаём все колонки, КРОМЕ phone.
-- INSERT/UPDATE/DELETE не трогаем — запись телефона (регистрация, профиль) работает.

REVOKE SELECT ON public.users FROM anon, authenticated;
GRANT SELECT (
  id, role, name, city, is_verified, created_at, is_phone_verified,
  last_seen_at, company_name, inn, license_number, onboarding_completed
) ON public.users TO anon, authenticated;

-- Свой номер пользователь получает через SECURITY DEFINER функцию
CREATE OR REPLACE FUNCTION public.get_own_phone()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT phone FROM public.users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_own_phone() TO authenticated;
