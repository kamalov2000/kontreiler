'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, SavedRoute } from '@/types/database'
import { CONTAINER_TYPES, CONTAINER_TARE_WEIGHT } from '@/lib/cities'
import { toast } from 'sonner'
import { Filter, X, Bookmark, Search } from 'lucide-react'
import Link from 'next/link'
import { formatOrderNumber, formatPrice } from '@/lib/utils'

function vatShort(v: string): string {
  if (v === 'vat20') return 'с НДС 20%'
  if (v === 'vat15') return 'с НДС 15%'
  if (v === 'vat5') return 'с НДС 5%'
  if (v === 'vat0') return 'НДС 0%'
  return 'без НДС'
}
function weightDisplay(o: Order): string {
  if (!o.weight_gross) return '—'
  const tare = CONTAINER_TARE_WEIGHT[o.container_type] ?? 0
  return (o.weight_gross + tare).toLocaleString('ru-RU')
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
  const [respondingTo, setRespondingTo] = useState<Order | null>(null)
  const [message, setMessage] = useState('')
  const [responding, setResponding] = useState(false)
  const [myResponses, setMyResponses] = useState<Set<string>>(new Set())
  // Клиенты, у которых этот перевозчик в контрагентах
  const [myClientCounterparties, setMyClientCounterparties] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [numberSearch, setNumberSearch] = useState('')
  const [clientRatings, setClientRatings] = useState<Record<string, { avg: number; count: number }>>({})

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
      .select('*, client:users!client_id(id, name, city)')
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

    // Load which orders have additional stops
    const orderIds = loaded.map(o => o.id)
    if (orderIds.length > 0) {
      const { data: stopsData } = await supabase
        .from('order_stops')
        .select('order_id')
        .in('order_id', orderIds)
      if (stopsData && stopsData.length > 0) {
        setStopOrders(new Set(stopsData.map(s => s.order_id)))
      } else {
        setStopOrders(new Set())
      }
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
    if (!respondingTo || !user) return

    if (!isEmailVerified) {
      toast.error(t.feed.respondModal.noEmail)
      setRespondingTo(null)
      return
    }

    setResponding(true)
    const supabase = createClient()
    const { error } = await supabase.from('responses').insert({
      order_id: respondingTo.id,
      carrier_id: user.id,
      message: message.trim() || null,
    })

    if (error) {
      if (error.code === '23505') {
        toast.error(t.feed.respondModal.alreadyError)
      } else {
        toast.error(t.feed.respondModal.error)
      }
    } else {
      toast.success(t.feed.respondModal.success)
      setMyResponses(prev => { const s = new Set(prev); s.add(respondingTo.id); return s })

      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_response',
          orderId: respondingTo.id,
          carrierId: user.id,
        }),
      }).catch(() => {})

      setRespondingTo(null)
      setMessage('')
    }
    setResponding(false)
  }

  function handleRespondClick(order: Order) {
    if (!isEmailVerified) {
      toast.error(t.feed.respondModal.noEmail)
      return
    }
    setRespondingTo(order)
    setMessage('')
  }

  const visibleOrders = orders.filter(o => {
    // Скрываем заявки «только для контрагентов», если мы не контрагент
    if (o.counterparties_only && !myClientCounterparties.has(o.client_id)) return false
    return matchesOrderSearch(o, numberSearch)
  })

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
        <div className="min-w-[860px]">
          {/* Шапка колонок */}
          <div className="flex items-center gap-3.5 h-[34px] px-5 bg-surface-sunken border-b border-hairline text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
            <span className="w-[84px] flex-none">№</span>
            <span className="flex-1">Маршрут</span>
            <span className="w-[104px] flex-none">Контейнер</span>
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
                <span className="w-[104px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
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
            visibleOrders.map(order => {
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
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <RouteInline
                      className="flex-1"
                      from={order.from_city}
                      to={order.to_city}
                      via={order.via_city}
                      urgent={order.format === 'urgent'}
                    />
                    {stopOrders.has(order.id) && <span title="Есть доп. точки" className="text-ink-4 text-xs flex-none">＋точки</span>}
                    {clientRating && (
                      <span className="font-mono text-[12px] text-ink-3 flex-none whitespace-nowrap">★ {clientRating.avg.toFixed(1)}</span>
                    )}
                  </span>
                  <span className="w-[104px] flex-none">
                    <ContainerChip label={containerLabel} genset={order.requires_genset} />
                  </span>
                  <span className="w-[84px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
                    {weightDisplay(order)}
                  </span>
                  <span className="w-[64px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
                    {readyShort(order.ready_date)}
                  </span>
                  <span className="w-[110px] flex-none flex flex-col items-end leading-tight">
                    <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
                      {formatPrice(order.price, order.is_negotiable)}
                    </span>
                    <span className="text-[10.5px] font-semibold tracking-[0.05em] uppercase text-ink-4">
                      {vatShort(order.vat_type)}
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
            })
          )}
        </div>
      </div>

      {/* Respond modal */}
      <Modal
        open={!!respondingTo}
        onClose={() => { setRespondingTo(null); setMessage('') }}
        title={t.feed.respondModal.title}
      >
        {respondingTo && (
          <div>
            {/* Превью заявки */}
            <div className="mb-4 flex flex-col gap-2 rounded-field border border-hairline bg-paper p-3.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-ink-3">
                  {respondingTo.order_number ? formatOrderNumber(respondingTo.order_number) : '—'}
                </span>
                <span className="text-ink-4">·</span>
                <ContainerChip
                  label={CONTAINER_TYPES.find(c => c.value === respondingTo.container_type)?.label || respondingTo.container_type}
                  genset={respondingTo.requires_genset}
                />
              </div>
              <RouteInline
                from={respondingTo.from_city}
                to={respondingTo.to_city}
                via={respondingTo.via_city}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] text-ink-3">
                  погрузка {readyShort(respondingTo.ready_date)} · {weightDisplay(respondingTo)} кг
                </span>
                <span className="font-mono text-[14px] font-medium tabular-nums text-ink">
                  {formatPrice(respondingTo.price, respondingTo.is_negotiable)}
                </span>
              </div>
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
                {t.feed.respondModal.confirm}
              </Button>
              <Button variant="secondary" onClick={() => { setRespondingTo(null); setMessage('') }}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        )}
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
