import { ContainerAction, Order, OrderStop, PointKind } from '@/types/database'

/**
 * Типизация точек маршрута: чем является место и что там делают с контейнером.
 *
 * Зачем: маршрут из трёх городов не говорит, где груз приняли, а где выдали.
 * В контейнерном кругорейсе первая точка — терминал выдачи порожняка (груз там
 * не принимали), последняя — терминал сдачи порожняка (груз давно выгружен), и
 * накладная, подставлявшая первую точку в раздел 8, а последнюю в раздел 10,
 * врала. Считается не по типу места, а по тому, где груз оказался у перевозчика
 * и где ушёл от него: на терминале это тоже бывает (импорт — взять гружёный,
 * экспорт — сдать гружёный).
 *
 * Оба поля необязательные. Пока их не заполнили, всё считает и показывает
 * прежняя логика — по первой и последней точке.
 */

export const POINT_KIND_LABEL: Record<PointKind, string> = {
  terminal:  'Терминал',
  warehouse: 'Склад',
}

export const CONTAINER_ACTION_LABEL: Record<ContainerAction, string> = {
  pickup_empty:   'Взять порожний',
  pickup_loaded:  'Взять гружёный',
  load:           'Погрузка',
  unload:         'Выгрузка',
  dropoff_empty:  'Сдать порожний',
  dropoff_loaded: 'Сдать гружёный',
}

export const POINT_KIND_OPTIONS: { value: PointKind; label: string }[] = [
  { value: 'terminal',  label: POINT_KIND_LABEL.terminal },
  { value: 'warehouse', label: POINT_KIND_LABEL.warehouse },
]

/**
 * Место точки в маршруте. Набор осмысленных действий у каждого свой: на первой
 * точке контейнер только берут, на последней — только сдают, между ними грузят и
 * выгружают. Раньше во всех трёх выпадали все шесть действий, и в заявке легко
 * оказывалось «сдать гружёный» в графе «откуда».
 */
export type RoutePosition = 'pickup' | 'midpoint' | 'dropoff'

const ACTIONS_BY_POSITION: Record<RoutePosition, ContainerAction[]> = {
  pickup:   ['pickup_empty', 'pickup_loaded'],
  midpoint: ['load', 'unload'],
  dropoff:  ['dropoff_empty', 'dropoff_loaded'],
}

/**
 * Действия для точки на своём месте маршрута. `current` — то, что уже записано
 * в заявке: если значение из старого, неограниченного набора, оно остаётся в
 * списке, иначе select показал бы пустоту и молча потерял его при сохранении.
 */
export function containerActionOptions(
  position: RoutePosition,
  current?: ContainerAction | '' | null,
): { value: ContainerAction; label: string }[] {
  const values = [...ACTIONS_BY_POSITION[position]]
  if (current && !values.includes(current)) values.push(current)
  return values.map(v => ({ value: v, label: CONTAINER_ACTION_LABEL[v] }))
}

/** Порожний контейнер: груза нет ни до, ни после — в разделы 8 и 10 не идёт. */
const EMPTY_ACTIONS = new Set<ContainerAction>(['pickup_empty', 'dropoff_empty'])

/** Где груз попадает к перевозчику — раздел 8 «Приём груза». */
const TAKE_ACTIONS = new Set<ContainerAction>(['load', 'pickup_loaded'])

/** Где груз уходит от перевозчика — раздел 10 «Выдача груза». */
const GIVE_ACTIONS = new Set<ContainerAction>(['unload', 'dropoff_loaded'])

/** Точка маршрута, приведённая к одному виду: и основная, и дополнительная. */
export interface RoutePoint {
  /** Короткая подпись — город (основные точки) или адрес (дополнительные). */
  label: string
  /** Полный адрес для подстановки в документы. */
  address: string
  kind: PointKind | null
  action: ContainerAction | null
}

type RouteOrder = Pick<Order,
  | 'from_city' | 'from_city_address' | 'from_point_kind' | 'from_container_action'
  | 'via_city'  | 'via_city_address'  | 'via_point_kind'  | 'via_container_action'
  | 'to_city'   | 'to_city_address'   | 'to_point_kind'   | 'to_container_action'>

type RouteStop = Pick<OrderStop, 'address' | 'point_kind' | 'container_action'>

/**
 * Маршрут одним списком в порядке проезда: откуда → промежуточная →
 * дополнительные точки → куда. Тот же порядок, в котором маршрут печатается в
 * накладной.
 */
export function buildRoutePoints(order: RouteOrder, stops: RouteStop[] = []): RoutePoint[] {
  const points: RoutePoint[] = [{
    label:   order.from_city,
    address: [order.from_city, order.from_city_address].filter(Boolean).join(', '),
    kind:    order.from_point_kind ?? null,
    action:  order.from_container_action ?? null,
  }]

  if (order.via_city) {
    points.push({
      label:   order.via_city,
      address: [order.via_city, order.via_city_address].filter(Boolean).join(', '),
      kind:    order.via_point_kind ?? null,
      action:  order.via_container_action ?? null,
    })
  }

  for (const s of stops) {
    points.push({
      label:   s.address,
      address: s.address,
      kind:    s.point_kind ?? null,
      action:  s.container_action ?? null,
    })
  }

  points.push({
    label:   order.to_city,
    address: [order.to_city, order.to_city_address].filter(Boolean).join(', '),
    kind:    order.to_point_kind ?? null,
    action:  order.to_container_action ?? null,
  })

  return points
}

/**
 * Задано ли хоть одно действие с контейнером. Накладная переключается на новую
 * логику разделов 8 и 10 именно по этому признаку: одни только типы мест
 * (терминал/склад) не говорят, где груз приняли.
 */
export function hasContainerActions(points: RoutePoint[]): boolean {
  return points.some(p => p.action != null)
}

/**
 * Кругорейс: маршрут начинается и заканчивается терминалом, а между ними есть
 * погрузка или выгрузка — ровно так ходит контейнер, взятый порожним и туда же
 * возвращённый. Определяется автоматически, ручного переключателя нет.
 */
export function isRoundTrip(points: RoutePoint[]): boolean {
  if (points.length < 3) return false
  const first = points[0]
  const last  = points[points.length - 1]
  if (first.kind !== 'terminal' || last.kind !== 'terminal') return false
  return points.slice(1, -1).some(p => p.action === 'load' || p.action === 'unload')
}

/**
 * Точка приёма груза — раздел 8 накладной. Это либо погрузка на складе
 * (экспорт), либо выдача гружёного контейнера на терминале (импорт): в обоих
 * случаях именно здесь груз оказывается у перевозчика.
 */
export function loadPoint(points: RoutePoint[]): RoutePoint | null {
  return points.find(p => p.action != null && TAKE_ACTIONS.has(p.action)) ?? null
}

/**
 * Точка выдачи груза — раздел 10 накладной. Выгрузка на складе (импорт) или
 * сдача гружёного контейнера на терминале (экспорт).
 */
export function unloadPoint(points: RoutePoint[]): RoutePoint | null {
  return points.find(p => p.action != null && GIVE_ACTIONS.has(p.action)) ?? null
}

/** Точки с порожним контейнером: груза нет, в разделы 8 и 10 не идут. */
export function emptyContainerPoints(points: RoutePoint[]): RoutePoint[] {
  return points.filter(p => p.action != null && EMPTY_ACTIONS.has(p.action))
}

/** Подпись точки для интерфейса: «Терминал · Взять порожний». */
export function pointTypeLabel(point: Pick<RoutePoint, 'kind' | 'action'>): string {
  return [
    point.kind ? POINT_KIND_LABEL[point.kind] : null,
    point.action ? CONTAINER_ACTION_LABEL[point.action] : null,
  ].filter(Boolean).join(' · ')
}

/**
 * Маршрут строкой для раздела 5 «Особые условия». Типизированные точки идут с
 * пояснением, что там происходит, — так терминалы, выброшенные из разделов 8 и
 * 10, всё равно остаются в документе.
 */
export function routeDescription(points: RoutePoint[]): string {
  return points
    .map(p => {
      const type = pointTypeLabel(p)
      return type ? `${p.label} (${type.toLowerCase()})` : p.label
    })
    .filter(Boolean)
    .join(' — ')
}
