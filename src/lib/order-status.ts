// Статус заявки текстом и «эффективный» статус — общий источник правды для
// пилюли статуса (StatusPill), списка «Мои заявки» и реестра перевозок.

// Человекочитаемые названия статусов. Совпадают с подписями на пилюлях, чтобы
// в выгрузке стоял тот же текст, что пользователь видит в интерфейсе.
export const ORDER_STATUS_LABEL: Record<string, string> = {
  active:     'Новая',
  matched:    'Назначена',
  in_transit: 'В пути',
  delivered:  'Доставлено',
  expired:    'Просрочена',
  cancelled:  'Отменена',
  closed:     'Закрыта',
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status
}

// В БД заявка остаётся 'active' и после того, как истёк срок отклика или прошла
// дата погрузки — переводит её в 'expired' только архивация. Поэтому статус для
// показа досчитываем на лету.
export function effectiveOrderStatus(
  order: { status: string; expires_at?: string | null; ready_date?: string | null },
  now: number = Date.now(),
): string {
  if (order.status !== 'active') return order.status
  if (order.expires_at && new Date(order.expires_at).getTime() <= now) return 'expired'
  if (order.ready_date) {
    const endOfReadyDay = new Date(order.ready_date)
    endOfReadyDay.setDate(endOfReadyDay.getDate() + 1)
    if (endOfReadyDay.getTime() <= now) return 'expired'
  }
  return 'active'
}
