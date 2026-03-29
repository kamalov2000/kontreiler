// Статусы заявок (fallback для компонентов без i18n)
export const ORDER_STATUS_LABEL: Record<string, string> = {
  active:     'Новая',
  matched:    'Перевозчик найден',
  in_transit: 'В пути',
  delivered:  'Доставлено',
  closed:     'Закрыта',
  cancelled:  'Отменена',
  expired:    'Просрочена',
}

export const ORDER_STATUS_CLASS: Record<string, string> = {
  active:     'bg-gray-100 text-gray-600',
  matched:    'bg-blue-100 text-blue-700',
  in_transit: 'bg-indigo-100 text-indigo-700',
  delivered:  'bg-green-100 text-green-700',
  closed:     'bg-gray-200 text-gray-500',
  cancelled:  'bg-red-100 text-red-600',
  expired:    'bg-orange-100 text-orange-700',
}

// Статусы рейсов (машин)
export const TRUCK_STATUS_LABEL: Record<string, string> = {
  active: 'Свободна',
  busy:   'Занята',
  done:   'Рейс выполнен',
  closed: 'Закрыта',
}

export const TRUCK_STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  busy:   'bg-amber-100 text-amber-700',
  done:   'bg-gray-100 text-gray-500',
  closed: 'bg-gray-200 text-gray-400',
}
