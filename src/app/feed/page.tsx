'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderCard } from '@/components/orders/OrderCard'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, SavedRoute } from '@/types/database'
import { CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { Filter, X, Bookmark, Search } from 'lucide-react'
import Link from 'next/link'
import { RatingBadge } from '@/components/ui/RatingBadge'
import { formatOrderNumber } from '@/lib/utils'

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

  return (
    num.toLowerCase().includes(ql) ||
    shortNum.includes(ql) ||
    (order.from_city?.toLowerCase().includes(ql) ?? false) ||
    (order.to_city?.toLowerCase().includes(ql) ?? false) ||
    (order.via_city?.toLowerCase().includes(ql) ?? false) ||
    (order.notes?.toLowerCase().includes(ql) ?? false)
  )
}

function FeedContent() {
  const { user, isEmailVerified } = useUser()
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [respondingTo, setRespondingTo] = useState<Order | null>(null)
  const [message, setMessage] = useState('')
  const [responding, setResponding] = useState(false)
  const [myResponses, setMyResponses] = useState<Set<string>>(new Set())
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
    // Фильтруем просроченные по времени (на случай если cron ещё не обработал)
    const now = Date.now()
    const loaded = ((data || []) as Order[]).filter(o =>
      !o.expires_at || new Date(o.expires_at).getTime() > now
    )
    setOrders(loaded)
    setLoading(false)

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

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t.feed.title}</h1>
        <div className="flex items-center gap-2">
          {savedRoutes.length > 0 && (
            <button
              onClick={() => setShowRoutes(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Bookmark size={16} />
              {t.feed.myRoutes}
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              hasFilters ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter size={16} />
            {t.feed.filters}
            {hasFilters && (
              <span className="w-4 h-4 rounded-full bg-white text-blue-600 text-xs flex items-center justify-center font-bold">
                {[fromFilter, toFilter, typeFilter].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Quick search by order number */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={numberSearch}
          onChange={e => setNumberSearch(e.target.value)}
          placeholder={t.feed.searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {numberSearch && (
          <button onClick={() => setNumberSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
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
              className="mt-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4">
          {orders
            .filter(o => matchesOrderSearch(o, numberSearch))
            .map(order => {
            const alreadyResponded = myResponses.has(order.id)
            const clientRating = clientRatings[order.client_id]
            return (
              <OrderCard
                key={order.id}
                order={order}
                extra={clientRating ? <RatingBadge avg={clientRating.avg} count={clientRating.count} /> : undefined}
                actions={
                  <>
                    <Link href={`/orders/${order.id}`}>
                      <Button size="sm" variant="secondary">{t.dashboard.details}</Button>
                    </Link>
                    {alreadyResponded ? (
                      <span className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium">
                        {t.feed.alreadyResponded}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleRespondClick(order)}
                      >
                        {t.feed.respond}
                      </Button>
                    )}
                  </>
                }
              />
            )
          })}
        </div>
      )}

      {/* Respond modal */}
      <Modal
        open={!!respondingTo}
        onClose={() => { setRespondingTo(null); setMessage('') }}
        title={t.feed.respondModal.title}
      >
        {respondingTo && (
          <div>
            <div className="mb-4 p-3 rounded-xl bg-gray-50">
              <div className="font-medium text-gray-900">
                {respondingTo.from_city}
                {respondingTo.via_city ? ` → ${respondingTo.via_city}` : ''}
                {' → '}{respondingTo.to_city}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {CONTAINER_TYPES.find(c => c.value === respondingTo.container_type)?.label}
              </div>
              {respondingTo.notes && (
                <div className="mt-2 text-sm text-gray-600 italic">
                  {respondingTo.notes}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.feed.respondModal.commentLabel}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t.feed.respondModal.commentPlaceholder}
                rows={3}
                maxLength={300}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <p className="text-sm text-gray-500 mb-4">
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
        <div className="space-y-2">
          {savedRoutes.map(r => (
            <button
              key={r.id}
              onClick={() => applyRoute(r)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-colors text-left"
            >
              <span className="font-medium text-gray-900">
                {r.from_city} → {r.to_city}
              </span>
              {r.container_type && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {r.container_type}
                </span>
              )}
            </button>
          ))}
          <p className="text-xs text-gray-400 pt-2">
            {t.feed.routeModal.manage}{' '}
            <Link href="/profile" className="text-blue-600 hover:underline" onClick={() => setShowRoutes(false)}>
              {t.feed.routeModal.profileLink}
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    }>
      <FeedContent />
    </Suspense>
  )
}
