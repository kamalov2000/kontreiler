-- Безопасность: фиксируем search_path для всех SECURITY DEFINER-функций.
-- Иначе вызывающий может подменить путь поиска и заставить функцию (работающую с
-- правами владельца) обратиться к своему объекту вместо public.* — Supabase помечает
-- это как "function_search_path_mutable". Тела функций не меняем.

ALTER FUNCTION public.expire_overdue_orders()      SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()            SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_new_message()         SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_new_response()        SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_new_truck_message()   SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_new_truck_response()  SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_order_cancelled()     SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_order_delivered()     SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_response_accepted()   SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_review_request()      SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_trip_done()           SET search_path = public, pg_temp;
ALTER FUNCTION public.settle_finished_auctions()   SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_bid()               SET search_path = public, pg_temp;
