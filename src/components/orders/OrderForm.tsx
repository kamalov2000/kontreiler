'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { CONTAINER_TYPES, REF_CONTAINER_TYPES, CONTAINER_TARE_WEIGHT } from '@/lib/cities'
import { ContainerType, VatType, OrderFormat, Order, OrderStop, RateMethod, PointKind, ContainerAction } from '@/types/database'
import { buildRoutePoints, isRoundTrip, POINT_KIND_OPTIONS, CONTAINER_ACTION_OPTIONS } from '@/lib/route-points'
import { formatOrderNumber, normalizePhone, toDatetimeLocal } from '@/lib/utils'
import { toast } from 'sonner'
import { Calculator, Plus, Trash2, X, RefreshCw } from 'lucide-react'

// Сохранённый расчёт ставки — ровно те колонки orders, что пишет калькулятор.
type RateBreakdown = Pick<Order,
  | 'rate_method' | 'rate_delivery_cost' | 'rate_distance_km' | 'rate_per_km'
  | 'rate_overload_per_ton' | 'rate_overload_tons'
  | 'rate_extra_point_cost' | 'rate_extra_points_count'>

// Разбивки нет: у рыночного метода её не бывает, у остальных — цену ввели руками.
const EMPTY_BREAKDOWN: Omit<RateBreakdown, 'rate_method'> = {
  rate_delivery_cost: null,
  rate_distance_km: null,
  rate_per_km: null,
  rate_overload_per_ton: null,
  rate_overload_tons: null,
  rate_extra_point_cost: null,
  rate_extra_points_count: null,
}

const RATE_METHODS: { value: RateMethod; label: string }[] = [
  { value: 'composite_round',  label: 'Составная (туда-обратно)' },
  { value: 'composite_oneway', label: 'Составная (в один конец)' },
  { value: 'mkad',             label: 'МКАДный' },
  { value: 'market',           label: 'Рыночная' },
]

// Overline-метка секции формы (морской фрахт)
const overline = 'block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3'
// Волосяная карточка-секция
const sectionCard = 'rounded-card border border-hairline bg-surface p-4 space-y-4'

// Потолок пакета: больше полусотни рейсов одной публикацией — это уже импорт
// реестром, а не форма.
const MAX_TRIPS = 50

// Черновик дополнительной точки в форме. Пустая строка в kind/action = «не
// указано»: в БД уедет null.
type StopDraft = { address: string; comment: string; kind: PointKind | ''; action: ContainerAction | '' }
const EMPTY_STOP: StopDraft = { address: '', comment: '', kind: '', action: '' }

/**
 * Два необязательных поля точки маршрута: что за место и что там делают с
 * контейнером. Без них форма ведёт себя как раньше, поэтому подписаны как
 * необязательные и стоят под адресом, а не над ним.
 */
function PointTypeFields({
  idPrefix, kind, action, onKind, onAction,
}: {
  idPrefix: string
  kind: PointKind | ''
  action: ContainerAction | ''
  onKind: (v: PointKind | '') => void
  onAction: (v: ContainerAction | '') => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select
        id={`${idPrefix}Kind`}
        label="Тип места"
        value={kind}
        onChange={e => onKind(e.target.value as PointKind | '')}
        options={POINT_KIND_OPTIONS}
        placeholder="Не указан"
      />
      <Select
        id={`${idPrefix}Action`}
        label="Что с контейнером"
        value={action}
        onChange={e => onAction(e.target.value as ContainerAction | '')}
        options={CONTAINER_ACTION_OPTIONS}
        placeholder="Не указано"
      />
    </div>
  )
}

// Дефолтный expires_at: 7 дней от сейчас в формате datetime-local
function defaultExpiresAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(23, 59, 0, 0)
  return d.toISOString().slice(0, 16)
}

/**
 * Форма публикации. Одна и та же в двух режимах — отличаются только набором
 * форматов и тем, куда уводит после отправки:
 *   mode='order' → /orders/new,   форматы «Обычная» / «Срочная»
 *   mode='torg'  → /auctions/new, форматы «Редукцион» / «Аукцион»
 * Торги вынесены с формы заявки по просьбе рынка: клиенту, публикующему рейс,
 * четырёхпозиционный переключатель мешал, а торги — отдельный сценарий.
 */
export function OrderForm({ mode }: { mode: 'order' | 'torg' }) {
  const router = useRouter()
  const { user, isEmailVerified } = useUser()
  const { t } = useLanguage()
  const params = useSearchParams()
  const isTorgMode = mode === 'torg'

  // Route points
  const [fromCity, setFromCity] = useState(params.get('from') || '')
  const [fromCityAddress, setFromCityAddress] = useState('')
  const [viaCity, setViaCity] = useState('')
  const [viaCityAddress, setViaCityAddress] = useState('')
  const [toCity, setToCity] = useState(params.get('to') || '')
  const [toCityAddress, setToCityAddress] = useState('')

  // Типизация точек. Пустая строка = «не указано»: поля необязательные, и
  // незаполненный маршрут работает ровно как до их появления.
  const [fromPointKind, setFromPointKind] = useState<PointKind | ''>('')
  const [fromAction, setFromAction] = useState<ContainerAction | ''>('')
  const [viaPointKind, setViaPointKind] = useState<PointKind | ''>('')
  const [viaAction, setViaAction] = useState<ContainerAction | ''>('')
  const [toPointKind, setToPointKind] = useState<PointKind | ''>('')
  const [toAction, setToAction] = useState<ContainerAction | ''>('')

  // Container & dates
  const [containerType, setContainerType] = useState<ContainerType>(
    (params.get('container') as ContainerType) || '20ft'
  )
  const [readyDate, setReadyDate] = useState(params.get('date') || '')
  const [readyTime, setReadyTime] = useState('')
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt())

  // Price & VAT
  const [price, setPrice] = useState(params.get('price') || '')
  const [isNegotiable, setIsNegotiable] = useState(params.get('negotiable') === '1')
  const [vatType, setVatType] = useState<VatType>('none')

  // Weight (container 1)
  const [weightGross, setWeightGross] = useState('')
  const [weightNet, setWeightNet] = useState('')
  // Weight (container 2 — only for 20DC2)
  const [weightGross2, setWeightGross2] = useState('')
  const [weightNet2, setWeightNet2] = useState('')
  // Простой транспорта
  const [downtimeRate, setDowntimeRate] = useState('')
  // Тара (вес пустого контейнера) — редактируемая, дефолт из словаря по типу
  const [weightTare, setWeightTare] = useState(
    String(CONTAINER_TARE_WEIGHT[(params.get('container') as ContainerType) || '20ft'] ?? '')
  )

  // Трекинг рейса
  const [trackingEnabled, setTrackingEnabled] = useState(false)
  // Только для контрагентов
  const [counterpartiesOnly, setCounterpartiesOnly] = useState(false)

  // Дополнительные точки маршрута
  const [hasExtraStops, setHasExtraStops] = useState(false)
  const [stops, setStops] = useState<StopDraft[]>([EMPTY_STOP])

  // Калькулятор ставки
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcMethod, setCalcMethod] = useState<RateMethod>('composite_round')
  const [calcSubmission, setCalcSubmission] = useState('')
  const [calcKm, setCalcKm] = useState('')
  const [calcRateKm, setCalcRateKm] = useState('')
  const [calcUseOverload, setCalcUseOverload] = useState(false)
  const [calcOverloadPerTon, setCalcOverloadPerTon] = useState('')
  const [calcOverloadTons, setCalcOverloadTons] = useState('')
  const [calcUseExtraStop, setCalcUseExtraStop] = useState(false)
  const [calcExtraPointCost, setCalcExtraPointCost] = useState('')
  const [calcExtraPointsCount, setCalcExtraPointsCount] = useState('1')
  const [calcMarket, setCalcMarket] = useState('')
  // Применённый расчёт — уходит в заявку вместе с ценой и разворачивается в
  // колонки реестра. Ручная правка цены его сбрасывает: разбивка, не сходящаяся
  // с итогом, хуже отсутствующей.
  const [rateBreakdown, setRateBreakdown] = useState<RateBreakdown | null>(null)

  // Format (replaces is_urgent checkbox)
  const [format, setFormat] = useState<OrderFormat>(
    isTorgMode
      ? (params.get('type') === 'auction' ? 'auction' : 'reduction')
      : (params.get('urgent') === '1' ? 'urgent' : 'regular')
  )
  const [auctionStartPrice, setAuctionStartPrice] = useState('')
  const [auctionEndTime, setAuctionEndTime] = useState('')
  const [auctionMinPrice, setAuctionMinPrice] = useState('')
  const [auctionMaxPrice, setAuctionMaxPrice] = useState('')
  const [auctionStep, setAuctionStep] = useState('')
  const [auctionUseStep, setAuctionUseStep] = useState(false)
  const [auctionAutoWinner, setAuctionAutoWinner] = useState(true)
  const [auctionAutoExtend, setAuctionAutoExtend] = useState(true)

  const [requiresGenset, setRequiresGenset] = useState(false)
  const [hidePhone, setHidePhone] = useState(false)
  const [notes, setNotes] = useState(params.get('notes') || '')

  // Данные для документов — хранятся на заявке и подставляются в договор-заявку
  // и транспортную накладную. Раньше заполнялись только при первом скачивании
  // договора; здесь их можно внести сразу, а при дублировании они переносятся.
  const [cargoName, setCargoName] = useState('')
  const [containerNumber, setContainerNumber] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')

  // Пакет рейсов: сколько одинаковых заявок опубликовать одной кнопкой.
  // 1 — обычная одиночная заявка, поведение как раньше.
  const [tripCount, setTripCount] = useState('1')

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Дублирование: id исходной заявки. Пока она грузится, форму не показываем —
  // иначе поля на глазах перещёлкивались бы с пустых на заполненные.
  // fromAuction — то же предзаполнение, но из завершённых торгов: рейс переносим
  // в обычную заявку, чтобы дальше шёл штатный документооборот и он попал в реестр.
  const duplicateId = params.get('duplicate')
  const fromAuctionId = params.get('fromAuction')
  const sourceId = duplicateId || fromAuctionId
  const [prefilling, setPrefilling] = useState(!!sourceId)
  const isDuplicate = !!duplicateId || params.has('from')

  // Победитель торгов и сами торги — проставляются в заявку при отправке.
  const [auctionWinner, setAuctionWinner] = useState<{ id: string; label: string } | null>(null)
  const [sourceAuction, setSourceAuction] = useState<{ id: string; number: string } | null>(null)

  useEffect(() => {
    if (!sourceId) return
    let active = true

    async function loadSource() {
      const supabase = createClient()
      const [{ data: src }, { data: srcStops }] = await Promise.all([
        supabase.from('orders')
          .select('*, winner:users!auction_winner_id(id, name, company_name)')
          .eq('id', sourceId).single(),
        supabase.from('order_stops').select('*').eq('order_id', sourceId)
          .order('sort_order', { ascending: true }),
      ])
      if (!active) return
      if (!src) {
        toast.error(fromAuctionId
          ? 'Не удалось загрузить торги — заполните форму заново'
          : 'Не удалось загрузить исходную заявку — заполните форму заново')
        setPrefilling(false)
        return
      }
      const o = src as Order

      // Маршрут
      setFromCity(o.from_city)
      setFromCityAddress(o.from_city_address ?? '')
      setViaCity(o.via_city ?? '')
      setViaCityAddress(o.via_city_address ?? '')
      setToCity(o.to_city)
      setToCityAddress(o.to_city_address ?? '')
      setFromPointKind(o.from_point_kind ?? '')
      setFromAction(o.from_container_action ?? '')
      setViaPointKind(o.via_point_kind ?? '')
      setViaAction(o.via_container_action ?? '')
      setToPointKind(o.to_point_kind ?? '')
      setToAction(o.to_container_action ?? '')
      const extra = (srcStops ?? []) as OrderStop[]
      if (extra.length > 0) {
        setHasExtraStops(true)
        setStops(extra.map(s => ({
          address: s.address,
          comment: s.comment ?? '',
          kind: s.point_kind ?? '',
          action: s.container_action ?? '',
        })))
      }

      // Груз
      setContainerType(o.container_type)
      setRequiresGenset(!!o.requires_genset)
      setWeightGross(o.weight_gross != null ? String(o.weight_gross) : '')
      setWeightNet(o.weight_net != null ? String(o.weight_net) : '')
      setWeightGross2(o.weight_gross_2 != null ? String(o.weight_gross_2) : '')
      setWeightNet2(o.weight_net_2 != null ? String(o.weight_net_2) : '')
      // Тара могла быть отредактирована клиентом — переносим его значение,
      // а не типовое из словаря.
      setWeightTare(
        o.weight_tare != null
          ? String(o.weight_tare)
          : String(CONTAINER_TARE_WEIGHT[o.container_type] ?? '')
      )

      // Сроки. Срок действия копируем, только если он ещё не истёк: протухшая
      // дата сожгла бы новую заявку в момент публикации — тогда оставляем
      // дефолтные «+7 дней».
      setReadyDate(o.ready_date ?? '')
      setReadyTime(o.ready_time ?? '')
      if (o.expires_at && new Date(o.expires_at).getTime() > Date.now()) {
        setExpiresAt(toDatetimeLocal(o.expires_at))
      }

      // Формат и ставка. Формат источника переносим, только если он вообще
      // доступен в этом режиме: из торгов заявка создаётся как обычная, а
      // дублирование обычной заявки в форме торгов не должно её «расформатить».
      const srcAllowed = isTorgMode
        ? o.format === 'reduction' || o.format === 'auction'
        : o.format === 'regular' || o.format === 'urgent'
      if (srcAllowed) setFormat(o.format)

      if (fromAuctionId) {
        // Цена заявки = сумма победившей ставки. agreed_price её и хранит —
        // и при автовыборе победителя, и при ручном.
        setPrice(o.agreed_price != null ? String(o.agreed_price) : '')
        setIsNegotiable(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = (src as any).winner as { id: string; name: string | null; company_name: string | null } | null
        if (w) setAuctionWinner({ id: w.id, label: w.company_name?.trim() || w.name?.trim() || 'перевозчик' })
        setSourceAuction({ id: o.id, number: formatOrderNumber(o.order_number) || o.id.slice(0, 8) })
      } else {
        setPrice(o.price != null ? String(o.price) : '')
        setIsNegotiable(!!o.is_negotiable)
        // Расчёт переносим вместе с ценой: маршрут и метод у дубля те же.
        // Из торгов — нет: там цену определил рынок, а не калькулятор.
        if (o.rate_method) {
          setRateBreakdown({
            rate_method: o.rate_method,
            rate_delivery_cost: o.rate_delivery_cost,
            rate_distance_km: o.rate_distance_km,
            rate_per_km: o.rate_per_km,
            rate_overload_per_ton: o.rate_overload_per_ton,
            rate_overload_tons: o.rate_overload_tons,
            rate_extra_point_cost: o.rate_extra_point_cost,
            rate_extra_points_count: o.rate_extra_points_count,
          })
          setCalcMethod(o.rate_method)
          setCalcSubmission(o.rate_delivery_cost != null ? String(o.rate_delivery_cost) : '')
          setCalcKm(o.rate_distance_km != null ? String(o.rate_distance_km) : '')
          setCalcRateKm(o.rate_per_km != null ? String(o.rate_per_km) : '')
          setCalcUseOverload(o.rate_overload_per_ton != null)
          setCalcOverloadPerTon(o.rate_overload_per_ton != null ? String(o.rate_overload_per_ton) : '')
          setCalcOverloadTons(o.rate_overload_tons != null ? String(o.rate_overload_tons) : '')
          setCalcUseExtraStop(o.rate_extra_point_cost != null)
          setCalcExtraPointCost(o.rate_extra_point_cost != null ? String(o.rate_extra_point_cost) : '')
          setCalcExtraPointsCount(o.rate_extra_points_count != null ? String(o.rate_extra_points_count) : '1')
          if (o.rate_method === 'market' && o.price != null) setCalcMarket(String(o.price))
        }
      }
      setVatType(o.vat_type ?? 'none')
      setDowntimeRate(o.downtime_rate != null ? String(o.downtime_rate) : '')
      if (isTorgMode && (o.format === 'reduction' || o.format === 'auction')) {
        setAuctionStartPrice(o.auction_start_price != null ? String(o.auction_start_price) : '')
        setAuctionMinPrice(o.auction_min_price != null ? String(o.auction_min_price) : '')
        setAuctionMaxPrice(o.auction_max_price != null ? String(o.auction_max_price) : '')
        setAuctionUseStep(o.auction_step != null)
        setAuctionStep(o.auction_step != null ? String(o.auction_step) : '')
        setAuctionAutoWinner(o.auction_auto_winner)
        setAuctionAutoExtend(o.auction_auto_extend)
        // Время окончания торгов из прошлой заявки почти всегда в прошлом —
        // берём его только если оно ещё впереди.
        if (o.auction_end_time && new Date(o.auction_end_time).getTime() > Date.now()) {
          setAuctionEndTime(toDatetimeLocal(o.auction_end_time))
        }
      }

      // Дополнительно
      setNotes(o.notes ?? '')
      setHidePhone(!!o.hide_phone)
      setTrackingEnabled(!!o.tracking_enabled)
      setCounterpartiesOnly(!!o.counterparties_only)

      // Данные для документов
      setCargoName(o.cargo_name ?? '')
      setContainerNumber(o.container_number ?? '')
      setSenderPhone(o.sender_contact_phone ?? '')
      setReceiverPhone(o.receiver_contact_phone ?? '')

      setPrefilling(false)
    }

    loadSource()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId])

  // Кругорейс определяется сам по типам точек — ручного переключателя нет.
  // Считаем по тому же коду, что и карточка заявки с лентой.
  const routePoints = buildRoutePoints({
    from_city: fromCity, from_city_address: fromCityAddress || null,
    from_point_kind: fromPointKind || null, from_container_action: fromAction || null,
    via_city: viaCity || null, via_city_address: viaCityAddress || null,
    via_point_kind: viaPointKind || null, via_container_action: viaAction || null,
    to_city: toCity, to_city_address: toCityAddress || null,
    to_point_kind: toPointKind || null, to_container_action: toAction || null,
  }, hasExtraStops
    ? stops.filter(s => s.address.trim()).map(s => ({
        address: s.address.trim(), point_kind: s.kind || null, container_action: s.action || null,
      }))
    : [])
  const roundTrip = isRoundTrip(routePoints)

  const isRefContainer = REF_CONTAINER_TYPES.has(containerType)
  const isAuctionFormat = format === 'reduction' || format === 'auction'
  const is20DC2 = containerType === '20DC2'

  // Пакет — только у обычных заявок: у торгов лот один, у заявки из торгов
  // перевозчик уже назначен.
  const batchAllowed = !isTorgMode && !isAuctionFormat && !auctionWinner
  const tripsToCreate = batchAllowed ? (parseInt(tripCount, 10) || 0) : 1
  const isBatch = tripsToCreate > 1

  function handleContainerChange(v: ContainerType) {
    setContainerType(v)
    if (!REF_CONTAINER_TYPES.has(v)) setRequiresGenset(false)
    // Подставляем дефолтную тару нового типа (клиент может её изменить)
    setWeightTare(String(CONTAINER_TARE_WEIGHT[v] ?? ''))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fromCity) e.fromCity = t.order.errorPoint1
    if (!toCity)   e.toCity   = t.order.errorPoint3
    if (!readyDate) e.readyDate = t.order.errorDate
    if (!isAuctionFormat && !isNegotiable && !price) e.price = t.order.errorRate
    if (!expiresAt) e.expiresAt = t.order.errorValidity
    if (isAuctionFormat && !auctionStartPrice) e.auctionStartPrice = t.order.errorStartPrice
    if (isAuctionFormat && !auctionEndTime) e.auctionEndTime = t.order.errorEndTime
    if (weightGross && weightNet && parseInt(weightNet) > parseInt(weightGross)) {
      e.weightNet = 'Нетто не может превышать брутто'
    }
    if (batchAllowed && (!Number.isInteger(tripsToCreate) || tripsToCreate < 1 || tripsToCreate > MAX_TRIPS)) {
      e.tripCount = `От 1 до ${MAX_TRIPS} рейсов`
    }
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    if (!user) return
    if (!isEmailVerified) {
      toast.error('Подтвердите почту чтобы создавать заявки')
      return
    }
    setLoading(true)

    const supabase = createClient()
    // Пакет рейсов: N самостоятельных заявок с общим batch_id. Номер КТ-XXXXX
    // каждой выдаёт триггер в БД, дальше каждая живёт своей жизнью.
    const batchId = isBatch ? crypto.randomUUID() : null
    const payload = {
      client_id: user.id,
      format,
      batch_id: batchId,
      from_city: fromCity,
      from_city_address: fromCityAddress.trim() || null,
      from_point_kind: fromPointKind || null,
      from_container_action: fromAction || null,
      via_city: viaCity,
      via_city_address: viaCityAddress.trim() || null,
      via_point_kind: viaPointKind || null,
      via_container_action: viaAction || null,
      to_city: toCity,
      to_city_address: toCityAddress.trim() || null,
      to_point_kind: toPointKind || null,
      to_container_action: toAction || null,
      container_type: containerType,
      ready_date: readyDate,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      ready_time: readyTime || null,
      price: isAuctionFormat ? null : (isNegotiable ? null : parseInt(price)),
      is_negotiable: isAuctionFormat ? false : isNegotiable,
      is_urgent: format === 'urgent',
      vat_type: vatType,
      hide_phone: hidePhone,
      weight_gross: weightGross ? parseInt(weightGross) : null,
      weight_net:   weightNet   ? parseInt(weightNet)   : null,
      weight_gross_2: is20DC2 && weightGross2 ? parseInt(weightGross2) : null,
      weight_net_2:   is20DC2 && weightNet2   ? parseInt(weightNet2)   : null,
      weight_tare: !is20DC2 && weightTare ? parseInt(weightTare) : null,
      downtime_rate: downtimeRate ? parseInt(downtimeRate) : null,
      // Расчёт ставки — только у форматов с ценой: у торгов её определит рынок.
      ...(isAuctionFormat || isNegotiable || !rateBreakdown
        ? { rate_method: null, ...EMPTY_BREAKDOWN }
        : rateBreakdown),
      tracking_enabled: trackingEnabled,
      counterparties_only: counterpartiesOnly,
      requires_genset: requiresGenset,
      notes: notes.trim() || null,
      cargo_name: cargoName.trim() || null,
      // Номер контейнера у каждого рейса свой — в пакете его не размножаем,
      // клиент проставит номера позже на страницах заявок.
      container_number: isBatch ? null : (containerNumber.trim().toUpperCase() || null),
      sender_contact_phone: senderPhone.trim() ? normalizePhone(senderPhone.trim()) : null,
      receiver_contact_phone: receiverPhone.trim() ? normalizePhone(receiverPhone.trim()) : null,
      arrival_time: null,
      auction_start_price: isAuctionFormat ? parseInt(auctionStartPrice) : null,
      auction_end_time: isAuctionFormat ? new Date(auctionEndTime).toISOString() : null,
      auction_min_price: isAuctionFormat && auctionMinPrice ? parseInt(auctionMinPrice) : null,
      auction_max_price: isAuctionFormat && auctionMaxPrice ? parseInt(auctionMaxPrice) : null,
      auction_step: isAuctionFormat && auctionUseStep && auctionStep ? parseInt(auctionStep) : null,
      auction_auto_winner: isAuctionFormat ? auctionAutoWinner : true,
      auction_auto_extend: isAuctionFormat ? auctionAutoExtend : true,
      // Перенос результатов торгов: победитель сразу назначен, искать
      // перевозчика больше не нужно. Ссылку на торги храним для истории.
      source_auction_id: sourceAuction?.id ?? null,
      accepted_carrier_id: auctionWinner?.id ?? null,
      status: auctionWinner ? 'matched' : 'active',
      agreed_price: auctionWinner && price ? parseInt(price) : null,
    }

    const { data: inserted, error } = await supabase
      .from('orders')
      .insert(Array.from({ length: tripsToCreate }, () => payload))
      .select('id')

    if (error || !inserted || inserted.length === 0) {
      toast.error(t.order.error)
      setLoading(false)
      return
    }

    // Вставить дополнительные точки — свой комплект каждому рейсу пакета
    if (hasExtraStops) {
      const validStops = stops.filter(s => s.address.trim())
      if (validStops.length > 0) {
        await supabase.from('order_stops').insert(
          inserted.flatMap(o => validStops.map((s, i) => ({
            order_id: o.id,
            address: s.address.trim(),
            comment: s.comment.trim() || null,
            point_kind: s.kind || null,
            container_action: s.action || null,
            sort_order: i,
          })))
        )
      }
    }

    toast.success(
      auctionWinner ? 'Заявка создана, перевозчик назначен'
        : isBatch ? `Опубликовано рейсов: ${inserted.length}`
        : t.order.posted
    )

    // Уведомляем перевозчиков с совпадающим сохранённым маршрутом — некритично,
    // ошибку глотаем и не блокируем переход. Для заявки из торгов перевозчик уже
    // назначен: рассылка по маршрутам зазывала бы на занятый рейс.
    // Для пакета зовём один раз: маршрут у всех рейсов одинаковый, десять
    // писем об одном и том же перевозчику не нужны.
    if (!auctionWinner) {
      fetch('/api/orders/route-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: inserted[0].id }),
      }).catch(() => {})
    }

    router.push(
      auctionWinner ? `/orders/${inserted[0].id}`
        : isAuctionFormat ? '/auctions'
        : '/dashboard'
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const minExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
  const minAuctionEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)

  const formatOptions: { value: OrderFormat; label: string; hint: string }[] = isTorgMode
    ? [
        { value: 'reduction', label: t.order.formatReduction, hint: t.order.formatReductionHint },
        { value: 'auction',   label: t.order.formatAuction,   hint: t.order.formatAuctionHint },
      ]
    : [
        { value: 'regular',   label: t.order.formatRegular,   hint: '' },
        { value: 'urgent',    label: t.order.formatUrgent,    hint: t.order.urgentHint },
      ]

  if (prefilling) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-lg">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">
            {isTorgMode ? 'Новые торги' : sourceAuction ? 'Заявка по результатам торгов' : isDuplicate ? t.order.duplicate : t.order.new}
          </h1>
          <ContainerMark size={20} className="text-accent self-center" />
        </div>
        {isDuplicate && <p className="text-sm text-ink-3 mb-6">{t.order.duplicateHint}</p>}
        {!isDuplicate && <div className="mb-6" />}

        {/* Перенос торгов в заявку: показываем, кого и по какой цене назначаем —
            клиент может поправить всё остальное перед публикацией. */}
        {sourceAuction && (
          <div className="mb-4 p-4 rounded-card border border-accent bg-accent-soft">
            <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-accent mb-1.5">
              По результатам торгов {sourceAuction.number}
            </div>
            {auctionWinner ? (
              <p className="text-sm text-ink-2">
                Перевозчик <strong className="text-ink">{auctionWinner.label}</strong> будет назначен
                на заявку сразу после публикации. Ставка подставлена в поле ставки — при
                необходимости поправьте.
              </p>
            ) : (
              <p className="text-sm text-warning">
                У этих торгов не определён победитель — заявка создастся без назначенного
                перевозчика.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Маршрут */}
          <div className={sectionCard}>
            <span className={overline}>Маршрут</span>

            {/* Превью маршрута. Отметка «Кругорейс» появляется сама, когда
                маршрут начинается и заканчивается терминалом, а между ними есть
                погрузка или выгрузка — переключателя для неё нет. */}
            {(fromCity || toCity) && (
              <div className="rounded-field border border-hairline bg-surface-sunken px-3 py-2.5 flex items-center gap-2.5">
                <RouteInline className="min-w-0 flex-1" from={fromCity || '—'} to={toCity || '—'} via={viaCity} />
                {roundTrip && (
                  <span className="inline-flex flex-none items-center gap-1 px-2 py-0.5 rounded-field bg-accent-soft text-accent text-[11px] font-semibold tracking-[0.05em] uppercase">
                    <RefreshCw size={11} /> Кругорейс
                  </span>
                )}
              </div>
            )}

            {/* Точка 1: Откуда */}
            <div className="space-y-2">
              <CityAutocomplete
                id="fromCity"
                label={t.order.point1Label}
                value={fromCity}
                onChange={v => { setFromCity(v); setErrors(p => ({ ...p, fromCity: '' })) }}
                placeholder={t.order.point1Placeholder}
                error={errors.fromCity}
              />
              <Input
                id="fromCityAddress"
                label={`${t.order.addressLabel} (${t.common.optional})`}
                value={fromCityAddress}
                onChange={e => setFromCityAddress(e.target.value)}
                placeholder={t.order.addressPlaceholder}
              />
              <PointTypeFields
                idPrefix="fromPoint"
                kind={fromPointKind} action={fromAction}
                onKind={setFromPointKind} onAction={setFromAction}
              />
            </div>

            {/* Точка 2: Промежуточная */}
            <div className="space-y-2">
              <CityAutocomplete
                id="viaCity"
                label={t.order.point2Label}
                value={viaCity}
                onChange={v => { setViaCity(v); setErrors(p => ({ ...p, viaCity: '' })) }}
                placeholder={t.order.point2Placeholder}
                error={errors.viaCity}
              />
              <Input
                id="viaCityAddress"
                label={`${t.order.addressLabel} (${t.common.optional})`}
                value={viaCityAddress}
                onChange={e => setViaCityAddress(e.target.value)}
                placeholder={t.order.addressPlaceholder}
              />
              <PointTypeFields
                idPrefix="viaPoint"
                kind={viaPointKind} action={viaAction}
                onKind={setViaPointKind} onAction={setViaAction}
              />
            </div>

            {/* Точка 3: Куда */}
            <div className="space-y-2">
              <CityAutocomplete
                id="toCity"
                label={t.order.point3Label}
                value={toCity}
                onChange={v => { setToCity(v); setErrors(p => ({ ...p, toCity: '' })) }}
                placeholder={t.order.point3Placeholder}
                error={errors.toCity}
              />
              <Input
                id="toCityAddress"
                label={`${t.order.addressLabel} (${t.common.optional})`}
                value={toCityAddress}
                onChange={e => setToCityAddress(e.target.value)}
                placeholder={t.order.addressPlaceholder}
              />
              <PointTypeFields
                idPrefix="toPoint"
                kind={toPointKind} action={toAction}
                onKind={setToPointKind} onAction={setToAction}
              />
            </div>

            {/* Дополнительные точки маршрута */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
                <input
                  type="checkbox"
                  checked={hasExtraStops}
                  onChange={e => setHasExtraStops(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline accent-accent"
                />
                <div>
                  <div className="text-sm font-medium text-ink">Есть дополнительные точки</div>
                  <div className="text-xs text-ink-3 mt-0.5">Промежуточные адреса погрузки / выгрузки</div>
                </div>
              </label>
              {hasExtraStops && (
                <div className="mt-3 space-y-3">
                  {stops.map((stop, i) => (
                    <div key={i} className="p-3 rounded-field border border-hairline bg-surface-sunken space-y-2 relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Точка {i + 1}</span>
                        {stops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setStops(prev => prev.filter((_, idx) => idx !== i))}
                            className="p-1 text-danger/70 hover:text-danger transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <Input
                        label="Адрес"
                        value={stop.address}
                        onChange={e => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, address: e.target.value } : s))}
                        placeholder="Улица, склад, терминал..."
                      />
                      <Input
                        label={`Комментарий (${t.common.optional})`}
                        value={stop.comment}
                        onChange={e => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, comment: e.target.value } : s))}
                        placeholder="Погрузка, выгрузка, таможня..."
                      />
                      <PointTypeFields
                        idPrefix={`stop${i}`}
                        kind={stop.kind} action={stop.action}
                        onKind={v => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, kind: v } : s))}
                        onAction={v => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, action: v } : s))}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setStops(prev => [...prev, EMPTY_STOP])}
                    className="flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    <Plus size={16} /> Добавить точку
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Груз */}
          <div className={sectionCard}>
            <span className={overline}>Груз</span>

            {/* Тип контейнера */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.containerType}</span>
              <div className="flex flex-wrap gap-2">
                {CONTAINER_TYPES.map(c => {
                  const active = containerType === c.value
                  return (
                    <label
                      key={c.value}
                      className={`px-2.5 py-1.5 rounded-field border font-mono text-[11.5px] font-medium uppercase cursor-pointer transition-colors ease-terminal ${
                        active
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-hairline bg-surface-sunken text-ink-2 hover:border-border-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name="containerType"
                        value={c.value}
                        checked={active}
                        onChange={() => handleContainerChange(c.value as ContainerType)}
                        className="sr-only"
                      />
                      {c.label}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Genset — только для REF */}
            {isRefContainer && (
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-field border border-warning bg-warning-soft transition-colors ease-terminal">
                <input
                  type="checkbox"
                  checked={requiresGenset}
                  onChange={e => setRequiresGenset(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline accent-warning"
                />
                <div>
                  <div className="text-sm font-medium text-warning">{t.order.genset}</div>
                  <div className="text-xs text-warning/80">{t.order.gensetHint}</div>
                </div>
              </label>
            )}

            {/* Вес груза */}
            <div>
              <span className={overline}>
                Вес груза <span className="text-ink-4 normal-case tracking-normal font-normal">({t.common.optional})</span>
              </span>
              {is20DC2 ? (
                <div className="mt-2 mb-2 px-3 py-2 rounded-field bg-surface-sunken text-xs text-ink-3">
                  Тара каждого контейнера: <strong className="font-mono tabular-nums text-ink-2">2 200 кг</strong> · Итого тара: <strong className="font-mono tabular-nums text-ink-2">4 400 кг</strong>
                </div>
              ) : (
                <div className="mt-2 mb-2">
                  <Input
                    id="weightTare"
                    type="number"
                    label={`Вес контейнера, тара (${containerType})`}
                    value={weightTare}
                    onChange={e => setWeightTare(e.target.value)}
                    placeholder="кг"
                    min="0"
                    className="font-mono tabular-nums"
                  />
                  <p className="text-xs text-ink-4 mt-1">
                    {isRefContainer
                      ? 'Ориентировочный вес — у рефконтейнеров зависит от модели холодильной установки. Скорректируйте при необходимости.'
                      : 'Подставлен типовой вес пустого контейнера. Можно изменить.'}
                  </p>
                </div>
              )}

              {is20DC2 ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-[11.5px] text-ink-3 font-semibold tracking-[0.06em] uppercase mb-1.5">Контейнер 1</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input id="weightGross" type="number" label={t.order.weightGross} value={weightGross}
                        onChange={e => setWeightGross(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                      <Input id="weightNet" type="number" label={t.order.weightNet} value={weightNet}
                        onChange={e => { setWeightNet(e.target.value); setErrors(p => ({ ...p, weightNet: '' })) }}
                        placeholder="кг" min="0" error={errors.weightNet} className="font-mono tabular-nums" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-ink-3 font-semibold tracking-[0.06em] uppercase mb-1.5">Контейнер 2</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input id="weightGross2" type="number" label={t.order.weightGross} value={weightGross2}
                        onChange={e => setWeightGross2(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                      <Input id="weightNet2" type="number" label={t.order.weightNet} value={weightNet2}
                        onChange={e => setWeightNet2(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <Input id="weightGross" type="number" label={t.order.weightGross} value={weightGross}
                    onChange={e => setWeightGross(e.target.value)} placeholder="кг" min="0" className="font-mono tabular-nums" />
                  <Input id="weightNet" type="number" label={t.order.weightNet} value={weightNet}
                    onChange={e => { setWeightNet(e.target.value); setErrors(p => ({ ...p, weightNet: '' })) }}
                    placeholder="кг" min="0" error={errors.weightNet} className="font-mono tabular-nums" />
                </div>
              )}
            </div>

            {/* Пакет рейсов: одна публикация — несколько контейнеров по одному
                маршруту. Раньше клиент делал это копированием заявки, и лента
                забивалась дублями. */}
            {batchAllowed && (
              <div>
                <div className="sm:max-w-[220px]">
                  <Input
                    id="tripCount"
                    type="number"
                    label="Количество рейсов"
                    value={tripCount}
                    onChange={e => { setTripCount(e.target.value); setErrors(p => ({ ...p, tripCount: '' })) }}
                    min="1"
                    max={String(MAX_TRIPS)}
                    error={errors.tripCount}
                    className="font-mono tabular-nums"
                  />
                </div>
                <p className="text-xs text-ink-4 mt-1.5">
                  {isBatch
                    ? `Будет создано ${tripsToCreate} отдельных заявок со своими номерами — в ленте они схлопнутся в одну карточку. Номера контейнеров и ЗПУ проставите позже, на страницах рейсов.`
                    : 'Несколько контейнеров по одному маршруту — укажите их число, и заявки создадутся пакетом.'}
                </p>
              </div>
            )}
          </div>

          {/* Сроки */}
          <div className={sectionCard}>
            <span className={overline}>Сроки</span>

            {/* Дата погрузки/выгрузки + время (пункты 7, 9) */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.loadingDate}</span>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="readyDate"
                  type="date"
                  label="Дата"
                  value={readyDate}
                  onChange={e => { setReadyDate(e.target.value); setErrors(p => ({ ...p, readyDate: '' })) }}
                  min={today}
                  error={errors.readyDate}
                  className="font-mono tabular-nums"
                />
                <Input
                  id="readyTime"
                  type="time"
                  label={`Время (${t.common.optional})`}
                  value={readyTime}
                  onChange={e => setReadyTime(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Срок действия — дата+время вручную (пункт 7) */}
            <div>
              <Input
                id="expiresAt"
                type="datetime-local"
                label={t.order.validity}
                value={expiresAt}
                onChange={e => { setExpiresAt(e.target.value); setErrors(p => ({ ...p, expiresAt: '' })) }}
                min={minExpiresAt}
                error={errors.expiresAt}
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-ink-4 mt-1">Укажите дату и время истечения заявки</p>
            </div>
          </div>

          {/* Формат и ставка */}
          <div className={sectionCard}>
            <span className={overline}>Формат и ставка</span>

            {/* Формат заявки */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.format}</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {formatOptions.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-field border cursor-pointer transition-colors ease-terminal ${
                      format === opt.value
                        ? 'border-accent bg-accent-soft'
                        : 'border-hairline hover:border-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={opt.value}
                      checked={format === opt.value}
                      onChange={() => {
                        setFormat(opt.value)
                        setErrors(p => ({ ...p, auctionStartPrice: '', auctionEndTime: '' }))
                      }}
                      className="sr-only"
                    />
                    <span className={`text-sm font-medium ${format === opt.value ? 'text-accent' : 'text-ink-2'}`}>
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span className="text-xs text-ink-3 leading-tight">{opt.hint}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Поля для аукциона/редукциона */}
            {isAuctionFormat && (
              <div className="space-y-3 p-4 rounded-field border border-warning bg-warning-soft">
                <Input
                  id="auctionStartPrice"
                  type="number"
                  label={t.order.auctionStartPrice}
                  value={auctionStartPrice}
                  onChange={e => { setAuctionStartPrice(e.target.value); setErrors(p => ({ ...p, auctionStartPrice: '' })) }}
                  placeholder="₽"
                  min="1"
                  error={errors.auctionStartPrice}
                  className="font-mono tabular-nums"
                />
                <Input
                  id="auctionEndTime"
                  type="datetime-local"
                  label={t.order.auctionEndTime}
                  value={auctionEndTime}
                  onChange={e => { setAuctionEndTime(e.target.value); setErrors(p => ({ ...p, auctionEndTime: '' })) }}
                  min={minAuctionEnd}
                  error={errors.auctionEndTime}
                  className="font-mono tabular-nums"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="auctionMinPrice"
                    type="number"
                    label={`Мин. цена (${t.common.optional})`}
                    value={auctionMinPrice}
                    onChange={e => setAuctionMinPrice(e.target.value)}
                    placeholder="₽"
                    min="1"
                    className="font-mono tabular-nums"
                  />
                  <Input
                    id="auctionMaxPrice"
                    type="number"
                    label={`Макс. цена (${t.common.optional})`}
                    value={auctionMaxPrice}
                    onChange={e => setAuctionMaxPrice(e.target.value)}
                    placeholder="₽"
                    min="1"
                    className="font-mono tabular-nums"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={auctionUseStep}
                    onChange={e => setAuctionUseStep(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline accent-accent"
                  />
                  Фиксированный шаг торгов
                </label>
                {auctionUseStep && (
                  <Input
                    id="auctionStep"
                    type="number"
                    label="Размер шага (₽)"
                    value={auctionStep}
                    onChange={e => setAuctionStep(e.target.value)}
                    placeholder="например 5000"
                    min="1"
                    className="font-mono tabular-nums"
                  />
                )}
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={auctionAutoWinner}
                    onChange={e => setAuctionAutoWinner(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline accent-accent"
                  />
                  Автоматически выбрать победителя по окончании
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={auctionAutoExtend}
                    onChange={e => setAuctionAutoExtend(e.target.checked)}
                    className="w-4 h-4 rounded border-hairline accent-accent"
                  />
                  Продлить на 1 час если нет ставок
                </label>
              </div>
            )}

            {/* Ставка + НДС — скрываем для аукционов */}
            {!isAuctionFormat && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={overline}>{t.order.rate}</span>
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-hover transition-colors px-2 py-1 rounded-field hover:bg-accent-soft"
                  >
                    <Calculator size={13} /> Рассчитать ставку
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isNegotiable}
                      onChange={e => {
                        setIsNegotiable(e.target.checked)
                        if (e.target.checked) { setPrice(''); setRateBreakdown(null) }
                        setErrors(p => ({ ...p, price: '' }))
                      }}
                      className="w-4 h-4 rounded border-hairline accent-accent"
                    />
                    <span className="text-sm text-ink-2">{t.order.negotiable}</span>
                  </label>
                </div>
                {!isNegotiable && (
                  <>
                    <Input
                      id="price"
                      type="number"
                      placeholder={t.order.rateInRubles}
                      value={price}
                      onChange={e => {
                        setPrice(e.target.value)
                        // Цену поправили руками — расчёт к ней уже не относится
                        setRateBreakdown(null)
                        setErrors(p => ({ ...p, price: '' }))
                      }}
                      min="0"
                      error={errors.price}
                      className="font-mono tabular-nums"
                    />
                    {rateBreakdown && (
                      <p className="mt-1.5 text-xs text-ink-4">
                        Расчёт сохранится вместе с заявкой:{' '}
                        {RATE_METHODS.find(m => m.value === rateBreakdown.rate_method)?.label.toLowerCase()}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* НДС */}
            <div>
              <span className={`${overline} mb-2`}>{t.order.vatType}</span>
              <div className="flex gap-2 flex-wrap">
                {(['none', 'vat5', 'vat15', 'vat20', 'vat0'] as VatType[]).map(v => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-field border cursor-pointer transition-colors ease-terminal text-sm ${
                    vatType === v
                      ? 'border-accent bg-accent-soft text-accent font-medium'
                      : 'border-hairline text-ink-2 hover:border-border-strong'
                  }`}>
                    <input
                      type="radio"
                      name="vatType"
                      value={v}
                      checked={vatType === v}
                      onChange={() => setVatType(v)}
                      className="sr-only"
                    />
                    {v === 'none' ? t.order.vatNone : v === 'vat5' ? t.order.vatVat5 : v === 'vat15' ? t.order.vatVat15 : v === 'vat20' ? t.order.vatVat20 : t.order.vatVat0}
                  </label>
                ))}
              </div>
            </div>

            {/* Простой транспорта */}
            <div>
              <Input
                id="downtimeRate"
                type="number"
                label={`Простой транспорта (₽/час) — ${t.common.optional}`}
                value={downtimeRate}
                onChange={e => setDowntimeRate(e.target.value)}
                placeholder="например: 500"
                min="0"
                className="font-mono tabular-nums"
              />
              <p className="text-xs text-ink-4 mt-1">Указывается после выполнения перевозки</p>
            </div>
          </div>

          {/* Данные для документов — необязательны при публикации, но если внести
              их сразу, договор-заявка и ТН соберутся без дозаполнения. */}
          <div className={sectionCard}>
            <span className={overline}>
              {t.order.docsTitle} <span className="text-ink-4 normal-case tracking-normal font-normal">({t.common.optional})</span>
            </span>
            <p className="text-xs text-ink-4 -mt-2">{t.order.docsHint}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                id="cargoName"
                label={t.order.cargoName}
                value={cargoName}
                onChange={e => setCargoName(e.target.value)}
                placeholder={t.order.cargoNamePlaceholder}
              />
              {/* В пакете номер у каждого рейса свой — общего поля быть не
                  может, номера проставляются позже на страницах заявок. */}
              {!isBatch && (
                <Input
                  id="containerNumber"
                  label={t.order.containerNumber}
                  value={containerNumber}
                  onChange={e => setContainerNumber(e.target.value)}
                  placeholder="MSKU1234567"
                  className="font-mono"
                />
              )}
              <Input
                id="senderPhone"
                type="tel"
                label={t.order.phoneLoading}
                value={senderPhone}
                onChange={e => setSenderPhone(e.target.value)}
                placeholder="+7 900 123-45-67"
                className="font-mono tabular-nums"
              />
              <Input
                id="receiverPhone"
                type="tel"
                label={t.order.phoneUnloading}
                value={receiverPhone}
                onChange={e => setReceiverPhone(e.target.value)}
                placeholder="+7 900 123-45-67"
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Дополнительно */}
          <div className={sectionCard}>
            <span className={overline}>Дополнительно</span>

            {/* Особые условия */}
            <div>
              <label className={`${overline} mb-1.5`} htmlFor="notes">
                {t.order.specialConditions} <span className="text-ink-4 normal-case tracking-normal font-normal">({t.common.optional})</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.order.specialConditionsPlaceholder}
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2.5 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
              />
              <p className="text-xs text-ink-4 mt-1">
                Комментарий к заявке — виден перевозчикам в ленте и в карточке заявки.
              </p>
            </div>

            {/* Скрыть номер телефона */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
              <input
                type="checkbox"
                checked={hidePhone}
                onChange={e => setHidePhone(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-hairline accent-accent"
              />
              <div>
                <div className="text-sm font-medium text-ink">Общаться только через чат (скрыть номер телефона)</div>
                <div className="text-xs text-ink-3 mt-0.5">Перевозчики не будут видеть ваш номер — только кнопку чата</div>
              </div>
            </label>

            {/* Трекинг рейса */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
              <input
                type="checkbox"
                checked={trackingEnabled}
                onChange={e => setTrackingEnabled(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-hairline accent-accent"
              />
              <div>
                <div className="text-sm font-medium text-ink">Онлайн-трекинг рейса</div>
                <div className="text-xs text-ink-3 mt-0.5">
                  Перевозчик будет отмечать этапы поездки (7 шагов), вы увидите статус в реальном времени
                </div>
              </div>
            </label>

            {/* Только для контрагентов */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-field border border-success bg-success-soft transition-colors ease-terminal">
              <input
                type="checkbox"
                checked={counterpartiesOnly}
                onChange={e => setCounterpartiesOnly(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-hairline accent-success"
              />
              <div>
                <div className="text-sm font-medium text-ink">Только для моих контрагентов</div>
                <div className="text-xs text-ink-2/80 mt-0.5">
                  Заявку увидят только перевозчики из вашего списка контрагентов
                </div>
              </div>
            </label>
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            {t.order.post}
          </Button>
        </form>
      </div>
      {/* Калькулятор ставки */}
      {calcOpen && (() => {
        const sub = parseInt(calcSubmission) || 0
        const km  = parseFloat(calcKm) || 0
        const rateKm = parseFloat(calcRateKm) || 0
        const overloadPerTon = calcUseOverload ? (parseInt(calcOverloadPerTon) || 0) : 0
        const overloadTons   = calcUseOverload ? (parseFloat(calcOverloadTons) || 0) : 0
        const pointCost   = calcUseExtraStop ? (parseInt(calcExtraPointCost) || 0) : 0
        const pointsCount = calcUseExtraStop ? (parseInt(calcExtraPointsCount) || 0) : 0
        const overload  = overloadPerTon * overloadTons
        const extraStop = pointCost * pointsCount

        // Плечо: туда-обратно считается в оба конца, остальные — в один.
        const legs = calcMethod === 'composite_round' ? 2 : 1
        const total = calcMethod === 'market'
          ? (parseInt(calcMarket) || 0)
          : Math.round(sub + km * rateKm * legs + overload + extraStop)

        const kmLabel = calcMethod === 'mkad' ? 'Км от МКАД' : 'Расстояние (км)'

        // Что уйдёт в заявку при «Применить». У рыночного метода разбивки нет —
        // и в БД её запрещает CHECK (orders_rate_market_empty).
        const breakdown: RateBreakdown = calcMethod === 'market'
          ? { rate_method: 'market', ...EMPTY_BREAKDOWN }
          : {
              rate_method: calcMethod,
              rate_delivery_cost: sub || null,
              rate_distance_km: km || null,
              rate_per_km: rateKm || null,
              rate_overload_per_ton: calcUseOverload ? overloadPerTon || null : null,
              rate_overload_tons:    calcUseOverload ? overloadTons   || null : null,
              rate_extra_point_cost:   calcUseExtraStop ? pointCost   || null : null,
              rate_extra_points_count: calcUseExtraStop ? pointsCount || null : null,
            }

        return (
          <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
            <div className="bg-surface rounded-modal shadow-overlay border border-hairline w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-hairline">
                <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                  <Calculator size={18} className="text-accent" /> Калькулятор ставки
                </h2>
                <button onClick={() => setCalcOpen(false)} className="p-1.5 rounded-field text-ink-3 hover:bg-surface-sunken transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {/* Метод */}
                <div>
                  <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-2">Метод расчёта</div>
                  <div className="grid grid-cols-2 gap-2">
                    {RATE_METHODS.map(m => (
                      <label key={m.value} className={`flex items-center gap-2 px-3 py-2 rounded-field border cursor-pointer text-sm transition-colors ease-terminal ${calcMethod === m.value ? 'border-accent bg-accent-soft text-accent font-medium' : 'border-hairline text-ink-2 hover:border-border-strong'}`}>
                        <input type="radio" name="calcMethod" checked={calcMethod === m.value} onChange={() => setCalcMethod(m.value)} className="sr-only" />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>

                {calcMethod !== 'market' ? (
                  <>
                    <Input label="Подача (₽)" type="number" value={calcSubmission} onChange={e => setCalcSubmission(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input label={kmLabel} type="number" value={calcKm} onChange={e => setCalcKm(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                      <Input label="Ставка за км (₽/км)" type="number" value={calcRateKm} onChange={e => setCalcRateKm(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                    </div>
                    {calcMethod === 'composite_round' && (
                      <p className="text-xs text-ink-4">Км × ставку × 2 (туда и обратно)</p>
                    )}

                    {/* Перегруз и доп. точки — ставка × количество: в реестре они
                        разворачиваются обратно в два числа, поэтому одной суммой
                        их брать нельзя. */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                        <input type="checkbox" checked={calcUseOverload} onChange={e => setCalcUseOverload(e.target.checked)} className="w-4 h-4 rounded border-hairline accent-accent" />
                        Перегруз
                      </label>
                      {calcUseOverload && (
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <Input label="₽ за тонну" type="number" value={calcOverloadPerTon} onChange={e => setCalcOverloadPerTon(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                          <Input label="Сверхнормативных тонн" type="number" value={calcOverloadTons} onChange={e => setCalcOverloadTons(e.target.value)} placeholder="0" min="0" step="0.1" className="font-mono tabular-nums" />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-ink-2">
                        <input type="checkbox" checked={calcUseExtraStop} onChange={e => setCalcUseExtraStop(e.target.checked)} className="w-4 h-4 rounded border-hairline accent-accent" />
                        Доп. точки
                      </label>
                      {calcUseExtraStop && (
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <Input label="₽ за точку" type="number" value={calcExtraPointCost} onChange={e => setCalcExtraPointCost(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                          <Input label="Количество точек" type="number" value={calcExtraPointsCount} onChange={e => setCalcExtraPointsCount(e.target.value)} placeholder="0" min="0" step="1" className="font-mono tabular-nums" />
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <Input label="Рыночная ставка (₽)" type="number" value={calcMarket} onChange={e => setCalcMarket(e.target.value)} placeholder="0" min="0" className="font-mono tabular-nums" />
                )}

                {/* Итог */}
                {total > 0 && (
                  <div className="px-4 py-3 rounded-field bg-accent-soft border border-accent flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-accent">Итого:</span>
                    <span className="font-mono tabular-nums text-lg font-medium text-accent">{total.toLocaleString('ru-RU')} ₽</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 p-5 border-t border-hairline">
                <Button
                  onClick={() => {
                    if (total <= 0) return
                    setPrice(String(total))
                    setIsNegotiable(false)
                    setRateBreakdown(breakdown)
                    setErrors(p => ({ ...p, price: '' }))
                    setCalcOpen(false)
                  }}
                  disabled={total <= 0}
                  className="flex-1"
                >
                  Применить
                </Button>
                <Button variant="secondary" onClick={() => setCalcOpen(false)}>Отмена</Button>
              </div>
            </div>
          </div>
        )
      })()}
    </AppLayout>
  )
}
