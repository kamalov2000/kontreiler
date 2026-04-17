export const TRACKING_STEPS = [
  {
    value: 'heading_to_pickup',
    label: 'В пути на постановку контейнера',
    shortLabel: 'К постановке',
    icon: '🚛',
    description: 'Тягач выехал на терминал забрать контейнер',
  },
  {
    value: 'at_pickup_terminal',
    label: 'На терминале постановки контейнера',
    shortLabel: 'Постановка',
    icon: '📦',
    description: 'Прибыл на терминал, идёт постановка контейнера',
  },
  {
    value: 'heading_to_cargo',
    label: 'В пути на выгрузку / погрузку',
    shortLabel: 'К грузу',
    icon: '🚛',
    description: 'Контейнер поставлен, едет к месту погрузки или выгрузки',
  },
  {
    value: 'at_cargo_point',
    label: 'На выгрузке / погрузке',
    shortLabel: 'Погрузка / Выгрузка',
    icon: '⚙️',
    description: 'Идёт погрузка или выгрузка груза',
  },
  {
    value: 'waiting_documents',
    label: 'Ожидание документов',
    shortLabel: 'Документы',
    icon: '📄',
    description: 'Груз обработан, ожидаются документы',
  },
  {
    value: 'heading_to_delivery',
    label: 'В пути на терминал сдачи контейнера',
    shortLabel: 'К сдаче',
    icon: '🚛',
    description: 'Едет сдавать контейнер на терминал',
  },
  {
    value: 'at_delivery_terminal',
    label: 'На терминале сдачи контейнера',
    shortLabel: 'Сдача контейнера',
    icon: '🏁',
    description: 'Прибыл на терминал сдачи — рейс завершается',
  },
] as const

export type TrackingStep = typeof TRACKING_STEPS[number]['value']

export function getTrackingStepIndex(status: string | null): number {
  if (!status) return -1
  return TRACKING_STEPS.findIndex(s => s.value === status)
}

export function getNextTrackingStep(current: string | null): TrackingStep | null {
  if (!current) return 'heading_to_pickup'
  const idx = TRACKING_STEPS.findIndex(s => s.value === current)
  if (idx === -1 || idx === TRACKING_STEPS.length - 1) return null
  return TRACKING_STEPS[idx + 1].value as TrackingStep
}

export function isLastTrackingStep(status: string | null): boolean {
  return status === 'at_delivery_terminal'
}
