import { createServiceClient } from '@/lib/supabase/service'

type ServiceClient = ReturnType<typeof createServiceClient>

// Блокировка действует только для обычных и срочных заявок. Торги и редукцион
// (auction/reduction) оформляются по своей схеме — их не трогаем. Обратный
// сценарий (машины перевозчика, /trucks) сюда вообще не заходит: там стороны
// договариваются напрямую, а документы делаются потом через обычную заявку.
const GATED_FORMATS = ['regular', 'urgent']

export const DRIVER_GATE_MESSAGE =
  'Документы станут доступны после того как перевозчик внесёт данные по водителю и транспортному средству'

/**
 * Можно ли формировать документы по заявке.
 *
 * Блокировка — только для клиента. Перевозчику пустой бланк нужен заранее:
 * распечатать и дозаполнить руками в дороге.
 *
 * Единственный источник правды — сервер: кнопки в интерфейсе задизейблены, но
 * запрос к /api/generate-tn и /api/generate-contract можно послать и напрямую,
 * поэтому проверка дублируется здесь и отдаёт 403.
 */
export async function isDocGenerationBlocked(
  service: ServiceClient,
  orderId: string,
  format: string | null | undefined,
  isClient: boolean
): Promise<boolean> {
  if (!isClient) return false
  if (!GATED_FORMATS.includes(format ?? '')) return false

  const { data } = await service
    .from('order_driver_info')
    .select('driver_name, vehicle_plate, driver_phone')
    .eq('order_id', orderId)
    .maybeSingle()

  return !(
    data?.driver_name?.trim() &&
    data?.vehicle_plate?.trim() &&
    data?.driver_phone?.trim()
  )
}
