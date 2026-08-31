'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { PromoCallout } from '@/components/ui/PromoCallout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, OrderStop, SavedRoute } from '@/types/database'
import { buildRoutePoints, isRoundTrip } from '@/lib/route-points'
import { effectivePaymentTerms } from '@/lib/payment-terms'
import { CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { Filter, X, Bookmark, Search, ChevronDown, ChevronRight, Layers, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { formatOrderNumber, formatPrice, weightWithTareDisplay, vatLabel } from '@/lib/utils'

// «1 рейс / 2 рейса / 5 рейсов» — счётчик свободных рейсов в карточке пакета.
function tripWord(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'рейсов'
  const mod10 = n % 10
  if (mod10 === 1) return 'рейс'
  if (mod10 >= 2 && mod10 <= 4) return 'рейса'
  return 'рейсов'
}

function readyShort(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

const FEED_PREFIX_WORDS = ['заявка', 'заявку', 'заявки', 'заявке', 'заявкой', 'ордер', 'order']

function extractFeedQuery(raw: string): string {
  const q = raw.toLowerCase().trim()
  if (!q) return ''
  const spaceIdx = q.indexOf(' ')
  const firstWord = spaceIdx === -1 ? q : q.slice(0, spaceIdx)
  const rest = spaceIdx === -1 ? '' : q.slice(spaceIdx + 1).trim()
  if (firstWord.length >= 1 && FEED_PREFIX_WORDS.some(w => w.startsWith(firstWord))) return rest
  if (/^[#№]/.test(q)) return q.replace(/^[#№]\s*/, '').trim()
  return q
}

function matchesOrderSearch(order: Order, q: string): boolean {
  if (!q) return true
  const ql = extractFeedQuery(q)
  if (!ql) return true

  const num = order.order_number || ''
  const shortNum = formatOrderNumber(num).toLowerCase()

  if (/^\d+$/.test(ql)) {
    const padded = ql.padStart(5, '0')
    return num.endsWith('-' + padded) || shortNum.endsWith('-' + padded)
  }

  const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label?.toLowerCase() || ''

  return (
    num.toLowerCase().includes(ql) ||
    shortNum.includes(ql) ||
    (order.from_city?.toLowerCase().includes(ql) ?? false) ||
    (order.to_city?.toLowerCase().includes(ql) ?? false) ||
    (order.via_city?.toLowerCase().includes(ql) ?? false) ||
    (order.notes?.toLowerCase().includes(ql) ?? false) ||
    containerLabel.includes(ql) ||
    (order.container_type?.toLowerCase().includes(ql) ?? false)
  )
}

function FeedContent() {
  const { user, isEmailVerified } = useUser()
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [stopOrders, setStopOrders] = useState<Set<string>>(new Set())
  // Точки заявок — нужны для отметки «Кругорейс» (она считается по типам точек,
  // а часть точек лежит в order_stops).
  const [orderStops, setOrderStops] = useState<Record<string, OrderStop[]>>({})
  // Сколько всего рейсов в пакете, включая уже разобранные: в ленте видны
  // только активные, а показать надо «свободно N из M».
  const [batchTotals, setBatchTotals] = useState<Record<string, number>>({})
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  // Выбранные рейсы пакета — перевозчик откликается на один, несколько или все.
  const [batchSelection, setBatchSelection] = useState<Record<string, Set<string>>>({})
  // Заявки, на которые открыт отклик. Одна — обычная заявка, несколько — рейсы
  // одного пакета выбранной пачкой.
  const [respondTargets, setRespondTargets] = useState<Order[]>([])
  const [message, setMessage] = useState('')
  const [responding, setResponding] = useState(false)
  const [myResponses, setMyResponses] = useState<Set<string>>(new Set())
  // Клиенты, у которых этот перевозчик в контрагентах
  const [myClientCounterparties, setMyClientCounterparties] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [numberSearch, setNumberSearch] = useState('')
  const [clientRatings, setClientRatings] = useState<Record<string, { avg: number; count: number }>>({})

  // null — ещё не считали; 0 — активных машин нет
  const [activeTrucks, setActiveTrucks] = useState<number | null>(null)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [showRoutes, setShowRoutes] = useState(false)

  const fromFilter = searchParams.get('from') || ''
  const toFilter = searchParams.get('to') || ''
  const typeFilter = searchParams.get('type') || ''

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/feed?${params.toString()}`, { scroll: false })
  }

  function clearFilters() {
    router.push('/feed', { scroll: false })
  }

  const hasFilters = !!(fromFilter || toFilter || typeFilter)

  const fetchOrders = useCallback(async () => {
    const supabase = createClient()
    let query = supabase
      .from('orders')
      .select('*, client:users!client_id(id, name, city, is_verified, logo_url)')
      .eq('status', 'active')
      .order('is_urgent', { ascending: false })
      .order('created_at', { ascending: false })

    // Исключаем торги (редукцион/аукцион) — они на странице /auctions
    query = query.not('format', 'in', '(reduction,auction)')

    if (fromFilter) query = query.ilike('from_city', `%${fromFilter}%`)
    if (toFilter) query = query.ilike('to_city', `%${toFilter}%`)
    if (typeFilter) query = query.eq('container_type', typeFilter)

    const { data } = await query
    // Фильтруем просроченные по времени (expires_at и ready_date)
    const now = Date.now()
    const loaded = ((data || []) as Order[]).filter(o => {
      if (o.expires_at && new Date(o.expires_at).getTime() <= now) return false
      // Также скрываем заявки с прошедшей датой погрузки/выгрузки
      if (o.ready_date) {
        const endOfReadyDay = new Date(o.ready_date)
        endOfReadyDay.setDate(endOfReadyDay.getDate() + 1)
        if (endOfReadyDay.getTime() <= now) return false
      }
      return true
    })
    setOrders(loaded)
    setLoading(false)

    // Дополнительные точки: и отметка «+точки» в строке, и типы точек, по
    // которым считается кругорейс.
    const orderIds = loaded.map(o => o.id)
    if (orderIds.length > 0) {
      const { data: stopsData } = await supabase
        .from('order_stops')
        .select('*')
        .in('order_id', orderIds)
        .order('sort_order', { ascending: true })
      const rows = (stopsData || []) as OrderStop[]
      setStopOrders(new Set(rows.map(s => s.order_id)))
      const byOrder: Record<string, OrderStop[]> = {}
      for (const r of rows) (byOrder[r.order_id] ??= []).push(r)
      setOrderStops(byOrder)
    } else {
      setStopOrders(new Set())
      setOrderStops({})
    }

    // Размер пакетов целиком: в ленте видны только свободные рейсы, а строка
    // «свободно N из M» считает и уже разобранные.
    const batchIds = Array.from(new Set(loaded.map(o => o.batch_id).filter((v): v is string => !!v)))
    if (batchIds.length > 0) {
      const { data: batchRows } = await supabase
        .from('orders')
        .select('batch_id')
        .in('batch_id', batchIds)
      const totals: Record<string, number> = {}
      for (const r of (batchRows || []) as { batch_id: string }[]) {
        totals[r.batch_id] = (totals[r.batch_id] || 0) + 1
      }
      setBatchTotals(totals)
    } else {
      setBatchTotals({})
    }

    const clientIds = loaded.map(o => o.client_id).filter((v, i, a) => a.indexOf(v) === i)
    if (clientIds.length > 0) {
      const { data: ratings } = await supabase
        .from('user_avg_ratings')
        .select('user_id, avg_rating, review_count')
        .in('user_id', clientIds)
      if (ratings) {
        const map: Record<string, { avg: number; count: number }> = {}
        for (const r of ratings) map[r.user_id] = { avg: r.avg_rating, count: r.review_count }
        setClientRatings(map)
      }
    }
  }, [fromFilter, toFilter, typeFilter])

  const fetchMyResponses = useCallback(async () => {
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase
      .from('responses')
      .select('order_id')
      .eq('carrier_id', user.id)
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMyResponses(new Set(data.map((r: any) => r.order_id)))
    }
  }, [user])

  const fetchSavedRoutes = useCallback(async () => {
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase
      .from('saved_routes')
      .select('*')
      .eq('carrier_id', user.id)
      .order('created_at', { ascending: false })
    setSavedRoutes((data || []) as SavedRoute[])
  }, [user])

  useEffect(() => {
    fetchOrders()
    if (user) {
      fetchMyResponses()
      fetchSavedRoutes()
      // Загружаем клиентов у которых мы в контрагентах
      const supabase = createClient()
      supabase
        .from('counterparties')
        .select('owner_id')
        .eq('counterparty_id', user.id)
        .then(({ data }) => {
          if (data) setMyClientCounterparties(new Set(data.map((d: { owner_id: string }) => d.owner_id)))
        })
      // Есть ли у перевозчика свободная машина в выдаче. Нет — предлагаем
      // разместить: клиенты ищут машины сами, это второй канал заказов.
      supabase
        .from('trucks')
        .select('id', { count: 'exact', head: true })
        .eq('carrier_id', user.id)
        .eq('status', 'active')
        .then(({ count }) => setActiveTrucks(count ?? 0))
    }
  }, [fetchOrders, fetchMyResponses, fetchSavedRoutes, user])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('orders-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

  function applyRoute(route: SavedRoute) {
    const params = new URLSearchParams()
    params.set('from', route.from_city)
    params.set('to', route.to_city)
    if (route.container_type) params.set('type', route.container_type)
    router.push(`/feed?${params.toString()}`, { scroll: false })
    setShowRoutes(false)
  }

  async function handleRespond() {
    if (respondTargets.length === 0 || !user) return

    if (!isEmailVerified) {
      toast.error(t.feed.respondModal.noEmail)
      setRespondTargets([])
      return
    }

    setResponding(true)
    const supabase = createClient()
    // Пачка рейсов уходит одной вставкой: отклики на них независимы, но
    // «наполовину откликнулся» — состояние, которого лучше не иметь.
    const { error } = await supabase.from('responses').insert(
      respondTargets.map(o => ({
        order_id: o.id,
        carrier_id: user.id,
        message: message.trim() || null,
      }))
    )

    if (error) {
      if (error.code === '23505') {
        toast.error(t.feed.respondModal.alreadyError)
      } else {
        toast.error(t.feed.respondModal.error)
      }
    } else {
      toast.success(
        respondTargets.length > 1
          ? `Отклик отправлен по ${respondTargets.length} рейсам`
          : t.feed.respondModal.success
      )
      const ids = respondTargets.map(o => o.id)
      setMyResponses(prev => { const s = new Set(prev); for (const id of ids) s.add(id); return s })
      // Выбор в пакете снимаем: эти рейсы уже с откликом.
      setBatchSelection(prev => {
        const next: Record<string, Set<string>> = {}
        for (const [batchId, sel] of Object.entries(prev)) {
          const kept = new Set(Array.from(sel).filter(id => !ids.includes(id)))
          if (kept.size > 0) next[batchId] = kept
        }
        return next
      })

      // Письмо клиенту — по каждому рейсу отдельно: у каждого свой номер и
      // своя карточка, в которую он пойдёт смотреть отклик.
      for (const id of ids) {
        fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'new_response', orderId: id, carrierId: user.id }),
        }).catch(() => {})
      }

      setRespondTargets([])
      setMessage('')
    }
    setResponding(false)
  }

  function handleRespondClick(targets: Order | Order[]) {
    if (!isEmailVerified) {
      toast.error(t.feed.respondModal.noEmail)
      return
    }
    const list = Array.isArray(targets) ? targets : [targets]
    if (list.length === 0) return
    setRespondTargets(list)
    setMessage('')
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  function toggleTrip(batchId: string, orderId: string) {
    setBatchSelection(prev => {
      const sel = new Set(prev[batchId] ?? [])
      if (sel.has(orderId)) sel.delete(orderId)
      else sel.add(orderId)
      return { ...prev, [batchId]: sel }
    })
  }

  const visibleOrders = orders.filter(o => {
    // Скрываем заявки «только для контрагентов», если мы не контрагент
    if (o.counterparties_only && !myClientCounterparties.has(o.client_id)) return false
    return matchesOrderSearch(o, numberSearch)
  })

  // Заявки одного пакета схлопываются в одну строку — иначе десять контейнеров
  // по одному маршруту забивают ленту дублями. Пакет встаёт на место своего
  // первого рейса, порядок остальных строк не меняется.
  type FeedRow =
    | { kind: 'order'; key: string; order: Order }
    | { kind: 'batch'; key: string; batchId: string; orders: Order[] }

  const feedRows: FeedRow[] = []
  const batchRowIndex = new Map<string, number>()
  for (const o of visibleOrders) {
    if (!o.batch_id) {
      feedRows.push({ kind: 'order', key: o.id, order: o })
      continue
    }
    const at = batchRowIndex.get(o.batch_id)
    if (at == null) {
      batchRowIndex.set(o.batch_id, feedRows.length)
      feedRows.push({ kind: 'batch', key: o.batch_id, batchId: o.batch_id, orders: [o] })
    } else {
      const row = feedRows[at]
      if (row.kind === 'batch') row.orders.push(o)
    }
  }
  // Пакет из одного оставшегося рейса — уже не пакет: разворачивать нечего.
  const displayRows: FeedRow[] = feedRows.map(r =>
    r.kind === 'batch' && r.orders.length === 1
      ? { kind: 'order', key: r.orders[0].id, order: r.orders[0] }
      : r
  )


  // Строка обычной заявки. Вынесена в функцию, потому что лента рисует и
  // одиночные заявки, и схлопнутые пакеты рейсов.
  function renderOrderRow(order: Order) {
    const alreadyResponded = myResponses.has(order.id)
    const clientRating = clientRatings[order.client_id]
    const isCounterpartyOrder = myClientCounterparties.has(order.client_id)
    const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label || order.container_type
    return (
      <div
        key={order.id}
        onClick={() => router.push(`/orders/${order.id}`)}
        className="flex items-center gap-3.5 min-h-[56px] py-2 px-5 border-b border-hairline last:border-0 bg-surface cursor-pointer transition-colors ease-terminal hover:bg-accent-soft hover:shadow-row-active"
      >
        <span className="w-[84px] flex-none font-mono text-[13px] text-ink-3 flex items-center gap-1">
          {isCounterpartyOrder && <span title="Ваш контрагент" className="text-accent">★</span>}
          {order.order_number ? formatOrderNumber(order.order_number) : '—'}
        </span>
        <span className="flex-1 min-w-[160px] overflow-hidden flex items-center gap-1.5">
          {/* basis auto, а не flex-1: у маршрута приоритет на место в своей
              же колонке — ужимается сначала бейдж клиента (shrink-[3]) */}
          <RouteInline
            className="flex-[1_1_auto] min-w-0"
            from={order.from_city}
            to={order.to_city}
            via={order.via_city}
            urgent={order.format === 'urgent'}
          />
          {isRoundTrip(buildRoutePoints(order, orderStops[order.id] ?? [])) && (
            <span title="Кругорейс" className="text-ink-4 flex-none inline-flex items-center"><RefreshCw size={12} /></span>
          )}
          {stopOrders.has(order.id) && <span title="Есть доп. точки" className="text-ink-4 text-xs flex-none">＋точки</span>}
          {order.client && (
            <span className="text-xs text-ink-3 whitespace-nowrap inline-flex items-center gap-1.5 max-w-[168px] min-w-0 shrink-[20]">
              <CompanyAvatar src={order.client.logo_url} size={22} />
              {/* город клиента — только в тултипе: в строке он дублирует
                  маршрут и всё равно обрезался до «· Сан…» */}
              {order.client.name && <span className="truncate" title={`${order.client.name}${order.client.city ? ` · ${order.client.city}` : ''}`}>{order.client.name}</span>}
              <VerifiedBadge verified={order.client.is_verified} iconOnly />
            </span>
          )}
          {clientRating && (
            <span className="font-mono text-[12px] text-ink-3 flex-none whitespace-nowrap">★ {clientRating.avg.toFixed(1)}</span>
          )}
        </span>
        <span className="w-[116px] flex-none">
          <ContainerChip label={containerLabel} genset={order.requires_genset} wrap />
        </span>
        <span className="w-[84px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
          {weightWithTareDisplay(order)}
        </span>
        <span className="w-[64px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
          {readyShort(order.ready_date)}
        </span>
        <span className="w-[110px] flex-none flex flex-col items-end leading-tight">
          <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
            {formatPrice(order.price, order.is_negotiable)}
          </span>
          <span className="text-[10.5px] font-semibold tracking-[0.05em] uppercase text-ink-4">
            {vatLabel(order.vat_type)}
          </span>
        </span>
        <span className="w-[124px] flex-none flex justify-end" onClick={e => e.stopPropagation()}>
          {alreadyResponded ? (
            <span className="px-2.5 py-1 rounded-field bg-success-soft text-success text-[12px] font-medium whitespace-nowrap">
              {t.feed.alreadyResponded}
            </span>
          ) : (
            <button
              onClick={() => handleRespondClick(order)}
              className="min-h-[32px] px-3 rounded-card bg-accent text-white text-[13px] font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
            >
              {t.feed.respond}
            </button>
          )}
        </span>
      </div>
    )
  }

  // Строка пакета рейсов: маршрут, контейнер, ставка и дата одной карточкой
  // плюс «свободно N из M». Разворачивается в список рейсов с их номерами —
  // откликнуться можно на один, несколько или все сразу.
  function renderBatchRow(row: { batchId: string; orders: Order[] }) {
    const head = row.orders[0]
    const total = batchTotals[row.batchId] ?? row.orders.length
    const free = row.orders.length
    const expanded = expandedBatches.has(row.batchId)
    const selected = batchSelection[row.batchId] ?? new Set<string>()
    const respondable = row.orders.filter(o => !myResponses.has(o.id))
    const selectedOrders = respondable.filter(o => selected.has(o.id))
    const clientRating = clientRatings[head.client_id]
    const isCounterpartyOrder = myClientCounterparties.has(head.client_id)
    const containerLabel = CONTAINER_TYPES.find(c => c.value === head.container_type)?.label || head.container_type
    const roundTrip = isRoundTrip(buildRoutePoints(head, orderStops[head.id] ?? []))

    return (
      <div key={row.batchId} className="border-b border-hairline last:border-0">
        <div
          onClick={() => toggleBatch(row.batchId)}
          className="flex items-center gap-3.5 min-h-[56px] pt-2 px-5 bg-surface cursor-pointer transition-colors ease-terminal hover:bg-accent-soft"
        >
          <span className="w-[84px] flex-none font-mono text-[13px] text-ink-3 flex items-center gap-1">
            {expanded ? <ChevronDown size={14} className="text-ink-3" /> : <ChevronRight size={14} className="text-ink-3" />}
            {isCounterpartyOrder && <span title="Ваш контрагент" className="text-accent">★</span>}
            <Layers size={13} className="text-ink-3" />
            <span className="text-[12px] tabular-nums">{free}</span>
          </span>
          <span className="flex-1 min-w-[160px] overflow-hidden flex items-center gap-1.5">
            <RouteInline
              className="flex-[1_1_auto] min-w-0"
              from={head.from_city}
              to={head.to_city}
              via={head.via_city}
              urgent={head.format === 'urgent'}
            />
            {roundTrip && (
              <span title="Кругорейс" className="text-ink-4 flex-none inline-flex items-center"><RefreshCw size={12} /></span>
            )}
            {stopOrders.has(head.id) && <span title="Есть доп. точки" className="text-ink-4 text-xs flex-none">＋точки</span>}
            {head.client && (
              <span className="text-xs text-ink-3 whitespace-nowrap inline-flex items-center gap-1.5 max-w-[168px] min-w-0 shrink-[20]">
                <CompanyAvatar src={head.client.logo_url} size={22} />
                {head.client.name && <span className="truncate" title={`${head.client.name}${head.client.city ? ` · ${head.client.city}` : ''}`}>{head.client.name}</span>}
                <VerifiedBadge verified={head.client.is_verified} iconOnly />
              </span>
            )}
            {clientRating && (
              <span className="font-mono text-[12px] text-ink-3 flex-none whitespace-nowrap">★ {clientRating.avg.toFixed(1)}</span>
            )}
          </span>
          <span className="w-[116px] flex-none">
            <ContainerChip label={containerLabel} genset={head.requires_genset} wrap />
          </span>
          <span className="w-[84px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
            {weightWithTareDisplay(head)}
          </span>
          <span className="w-[64px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
            {readyShort(head.ready_date)}
          </span>
          <span className="w-[110px] flex-none flex flex-col items-end leading-tight">
            <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
              {formatPrice(head.price, head.is_negotiable)}
            </span>
            <span className="text-[10.5px] font-semibold tracking-[0.05em] uppercase text-ink-4">
              {vatLabel(head.vat_type)}
            </span>
          </span>
          <span className="w-[124px] flex-none flex justify-end" onClick={e => e.stopPropagation()}>
            {respondable.length > 0 ? (
              <button
                onClick={() => handleRespondClick(respondable)}
                className="min-h-[32px] px-3 rounded-card bg-accent text-white text-[13px] font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
              >
                На все ({respondable.length})
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-field bg-success-soft text-success text-[12px] font-medium whitespace-nowrap">
                {t.feed.alreadyResponded}
              </span>
            )}
          </span>
        </div>

        <div
          onClick={() => toggleBatch(row.batchId)}
          className="px-5 pb-2 pl-[100px] bg-surface cursor-pointer"
        >
          <span className="font-mono text-[12px] tabular-nums text-ink-3">
            Свободно {free} {tripWord(free)} из {total}
          </span>
        </div>

        {expanded && (
          <div className="bg-surface-sunken border-t border-hairline">
            {row.orders.map(o => {
              const responded = myResponses.has(o.id)
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-3 min-h-[44px] py-1.5 pl-10 pr-5 border-b border-hairline last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    disabled={responded}
                    onChange={() => toggleTrip(row.batchId, o.id)}
                    className="w-4 h-4 rounded border-hairline accent-accent disabled:opacity-40"
                  />
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-mono text-[13px] tabular-nums text-ink-2 hover:text-accent transition-colors"
                  >
                    {o.order_number ? formatOrderNumber(o.order_number) : '—'}
                  </Link>
                  <span className="font-mono text-[12px] tabular-nums text-ink-4 flex-1 truncate">
                    {o.container_number || 'номер контейнера не указан'}
                  </span>
                  {responded ? (
                    <span className="px-2 py-0.5 rounded-field bg-success-soft text-success text-[11.5px] font-medium whitespace-nowrap">
                      {t.feed.alreadyResponded}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRespondClick(o)}
                      className="min-h-[28px] px-2.5 rounded-card border border-hairline bg-surface text-ink-2 text-[12.5px] font-medium hover:border-border-strong transition-colors whitespace-nowrap"
                    >
                      {t.feed.respond}
                    </button>
                  )}
                </div>
              )
            })}
            {selectedOrders.length > 0 && (
              <div className="flex justify-end px-5 py-2.5">
                <Button size="sm" onClick={() => handleRespondClick(selectedOrders)}>
                  Откликнуться на выбранные ({selectedOrders.length})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">{t.feed.title}</h1>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] uppercase text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />Live
          </span>
          {!loading && (
            <span className="font-mono text-[13px] tabular-nums text-ink-3">{visibleOrders.length} активных</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedRoutes.length > 0 && (
            <button
              onClick={() => setShowRoutes(true)}
              className="flex items-center gap-2 px-3 h-9 rounded-card text-sm bg-surface border border-hairline text-ink-2 hover:border-border-strong transition-colors"
            >
              <Bookmark size={16} />
              {t.feed.myRoutes}
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 h-9 rounded-card text-sm transition-colors ${
              hasFilters ? 'bg-accent text-white' : 'bg-surface border border-hairline text-ink-2 hover:border-border-strong'
            }`}
          >
            <Filter size={16} />
            {t.feed.filters}
            {hasFilters && (
              <span className="w-4 h-4 rounded-full bg-white text-accent text-xs flex items-center justify-center font-bold">
                {[fromFilter, toFilter, typeFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* У перевозчика нет ни одной свободной машины в выдаче — предлагаем
          разместить. Ленту при этом не прячем: заявки ему нужны в любом случае. */}
      {activeTrucks === 0 && (
        <PromoCallout
          title="Разместить свободную машину"
          description="Клиенты найдут вас сами — это займёт пару минут"
          href="/trucks/new"
          cta="Разместить"
          className="mb-4"
        />
      )}

      {/* Quick search by order number */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
        <input
          type="text"
          value={numberSearch}
          onChange={e => setNumberSearch(e.target.value)}
          placeholder={t.feed.searchPlaceholder}
          className="w-full h-11 pl-9 pr-3 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
        />
        {numberSearch && (
          <button onClick={() => setNumberSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-surface rounded-card border border-hairline p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CityAutocomplete
              label={t.feed.from}
              value={fromFilter}
              onChange={v => updateFilter('from', v)}
              placeholder={t.common.anyCity}
            />
            <CityAutocomplete
              label={t.feed.to}
              value={toFilter}
              onChange={v => updateFilter('to', v)}
              placeholder={t.common.anyCity}
            />
            <Select
              label={t.feed.containerType}
              value={typeFilter}
              onChange={e => updateFilter('type', e.target.value)}
              options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              placeholder={t.common.anyType}
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 flex items-center gap-1 text-sm text-ink-3 hover:text-ink"
            >
              <X size={14} /> {t.feed.clearFilters}
            </button>
          )}
        </div>
      )}

      {/* Phone not verified warning */}
      {user && !isEmailVerified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 flex items-center justify-between gap-2">
          <span>{t.feed.verifyEmail}</span>
          <Link href="/profile" className="font-medium underline hover:text-amber-900 shrink-0">
            {t.feed.verifyLink}
          </Link>
        </div>
      )}

      <div className="border border-hairline rounded-card bg-surface overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Шапка колонок */}
          <div className="flex items-center gap-3.5 h-[34px] px-5 bg-surface-sunken border-b border-hairline text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
            <span className="w-[84px] flex-none">№</span>
            <span className="flex-1 min-w-[160px]">Маршрут</span>
            <span className="w-[140px] flex-none">Контейнер</span>
            <span className="w-[84px] flex-none text-right">Вес, кг</span>
            <span className="w-[64px] flex-none text-right">Погрузка</span>
            <span className="w-[110px] flex-none text-right">Ставка</span>
            <span className="w-[124px] flex-none" />
          </div>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 h-[56px] px-5 border-b border-hairline last:border-0">
                <span className="w-[84px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[140px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[110px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              </div>
            ))
          ) : visibleOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
              <ContainerMark size={28} className="text-ink-4" />
              <span className="text-[15px] text-ink-3 max-w-[320px]">
                {hasFilters || numberSearch ? 'По этим фильтрам заявок не найдено.' : 'Пока нет активных заявок на доске.'}
              </span>
              {(hasFilters || numberSearch) && (
                <button onClick={() => { clearFilters(); setNumberSearch('') }} className="text-sm font-medium text-accent hover:text-accent-hover">
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            displayRows.map(row => row.kind === 'order' ? renderOrderRow(row.order) : renderBatchRow(row))
          )}
        </div>
      </div>

      {/* Respond modal */}
      <Modal
        open={respondTargets.length > 0}
        onClose={() => { setRespondTargets([]); setMessage('') }}
        title={t.feed.respondModal.title}
      >
        {respondTargets.length > 0 && (() => {
          // Маршрут, контейнер и ставка у рейсов пакета общие — превью строим по
          // первому, а номера перечисляем все.
          const head = respondTargets[0]
          return (
          <div>
            {/* Превью заявки */}
            <div className="mb-4 flex flex-col gap-2 rounded-field border border-hairline bg-paper p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px] text-ink-3">
                  {head.order_number ? formatOrderNumber(head.order_number) : '—'}
                </span>
                <span className="text-ink-4">·</span>
                <ContainerChip
                  label={CONTAINER_TYPES.find(c => c.value === head.container_type)?.label || head.container_type}
                  genset={head.requires_genset}
                />
                {respondTargets.length > 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-accent-soft text-accent text-[11.5px] font-semibold">
                    <Layers size={11} /> рейсов: {respondTargets.length}
                  </span>
                )}
              </div>
              <RouteInline
                from={head.from_city}
                to={head.to_city}
                via={head.via_city}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] text-ink-3">
                  погрузка {readyShort(head.ready_date)} · {weightWithTareDisplay(head)} кг
                </span>
                <span className="font-mono text-[14px] font-medium tabular-nums text-ink">
                  {formatPrice(head.price, head.is_negotiable)}
                </span>
              </div>
              {/* Условия оплаты — здесь, а не колонкой в ленте: решение брать
                  рейс принимается в этом окне, а таблица и так плотная. */}
              {effectivePaymentTerms(head) && (
                <div className="text-[12px] text-ink-2">
                  Оплата: {effectivePaymentTerms(head)}
                </div>
              )}
              {respondTargets.length > 1 && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-hairline">
                  {respondTargets.map(o => (
                    <span key={o.id} className="font-mono text-[11.5px] tabular-nums text-ink-3">
                      {o.order_number ? formatOrderNumber(o.order_number) : '—'}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <label className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
                {t.feed.respondModal.commentLabel}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t.feed.respondModal.commentPlaceholder}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2.5 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 leading-relaxed resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
              />
              <span className="self-end font-mono text-[11px] tabular-nums text-ink-4">
                {message.length} / 500
              </span>
            </div>

            <p className="mb-4 text-sm text-ink-3">
              {t.feed.respondModal.hint}
            </p>

            <div className="flex gap-3">
              <Button className="flex-1" loading={responding} onClick={handleRespond}>
                {respondTargets.length > 1
                  ? `${t.feed.respondModal.confirm} (${respondTargets.length})`
                  : t.feed.respondModal.confirm}
              </Button>
              <Button variant="secondary" onClick={() => { setRespondTargets([]); setMessage('') }}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
          )
        })()}
      </Modal>

      {/* Saved routes picker modal */}
      <Modal
        open={showRoutes}
        onClose={() => setShowRoutes(false)}
        title={t.feed.routeModal.title}
      >
        <div className="-mx-1">
          {savedRoutes.map(r => (
            <button
              key={r.id}
              onClick={() => applyRoute(r)}
              className="w-full flex items-center gap-2.5 p-3 rounded-lg hover:bg-accent-soft transition-colors text-left"
            >
              <span className="w-2 h-2 rounded-full flex-none bg-accent" />
              <span className="flex-1 text-sm font-semibold text-ink">
                {r.from_city} → {r.to_city}
              </span>
              {r.container_type && (
                <span className="font-mono text-[11px] text-ink-3 whitespace-nowrap">
                  {r.container_type}
                </span>
              )}
            </button>
          ))}
          <p className="pt-3">
            <Link
              href="/profile"
              className="text-[13px] font-medium text-accent hover:text-accent-hover"
              onClick={() => setShowRoutes(false)}
            >
              {t.feed.routeModal.manage} →
            </Link>
          </p>
        </div>
      </Modal>
    </AppLayout>
  )
}

export default function FeedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
      </div>
    }>
      <FeedContent />
    </Suspense>
  )
}
