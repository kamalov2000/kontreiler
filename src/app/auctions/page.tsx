'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { RouteInline } from '@/components/ui/RouteInline'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order } from '@/types/database'
import { CONTAINER_TYPES, CONTAINER_TARE_WEIGHT } from '@/lib/cities'
import { formatOrderNumber } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type BidRow = {
  order_id: string
  best_amount: number | null
  participant_count: number
  bid_count: number
}

type FormatTab = 'reduction' | 'auction'
type StatusTab = 'active' | 'closed' | 'cancelled'

const STATUS_LABEL: Record<StatusTab, string> = {
  active:    'Активные',
  closed:    'Завершённые',
  cancelled: 'Отменённые',
}

// Вес груза с тарой контейнера, моно-строкой
function weightDisplay(o: Order): string {
  if (!o.weight_gross) return '—'
  const tare = CONTAINER_TARE_WEIGHT[o.container_type] ?? 0
  return (o.weight_gross + tare).toLocaleString('ru-RU')
}

function readyShort(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

// Обратный отсчёт до конца торгов — моноширинный, с секундами.
function AuctionCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const diff = new Date(endsAt).getTime() - now
  if (diff <= 0) {
    return <span className="font-mono text-[13px] tabular-nums text-ink-4">—</span>
  }

  const totalSeconds = Math.floor(diff / 1000)
  const days    = Math.floor(totalSeconds / 86400)
  const hours   = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const label = days > 0
    ? `${days}д ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const isUrgent = diff < 24 * 60 * 60 * 1000

  return (
    <span className={cn(
      'font-mono text-[13px] tabular-nums whitespace-nowrap',
      isUrgent ? 'text-danger font-medium' : 'text-warning'
    )}>
      {label}
    </span>
  )
}

export default function AuctionsPage() {
  const { user } = useUser()
  const { t } = useLanguage()

  const [formatTab, setFormatTab] = useState<FormatTab>('reduction')
  const [statusTab, setStatusTab] = useState<StatusTab>('active')
  const [orders, setOrders] = useState<Order[]>([])
  const [bidMap, setBidMap] = useState<Record<string, BidRow>>({})
  const [loading, setLoading] = useState(true)

  const [biddingOrder, setBiddingOrder] = useState<Order | null>(null)
  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('orders')
      .select('*, client:users!client_id(id, name, city)')
      .eq('format', formatTab)
      .order('auction_end_time', { ascending: true })

    // Пункт 11: фильтруем по статусу (active/closed/cancelled)
    if (statusTab === 'active') {
      query = query.eq('status', 'active')
    } else if (statusTab === 'closed') {
      // Завершённые = matched или expired (торги закончились)
      query = query.in('status', ['matched', 'expired', 'delivered', 'in_transit'])
    } else {
      query = query.eq('status', 'cancelled')
    }

    const { data } = await query

    // Фильтруем просроченные по времени если активный таб
    const now = Date.now()
    const loaded = ((data || []) as Order[]).filter(o => {
      if (statusTab !== 'active') return true
      return !o.auction_end_time || new Date(o.auction_end_time).getTime() > now
    })
    setOrders(loaded)
    setLoading(false)

    if (loaded.length > 0) {
      const ids = loaded.map(o => o.id)
      const { data: bids } = await supabase
        .from('order_best_bids')
        .select('*')
        .in('order_id', ids)
      if (bids) {
        const map: Record<string, BidRow> = {}
        for (const b of bids) map[b.order_id] = b
        setBidMap(map)
      }
    } else {
      setBidMap({})
    }
  }, [formatTab, statusTab])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (statusTab !== 'active') return
    const supabase = createClient()
    const channel = supabase
      .channel('auctions-bids')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders, statusTab])

  async function placeBid() {
    if (!biddingOrder || !bidAmount || !user) return
    const amount = parseInt(bidAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Введите корректную сумму')
      return
    }
    setBidLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('bids')
      .insert({ order_id: biddingOrder.id, carrier_id: user.id, amount })

    setBidLoading(false)
    if (error) {
      const msg = error.message || ''
      if (msg.includes('bid_too_high')) {
        toast.error(t.auctions.bidTooHigh)
      } else if (msg.includes('bid_too_low')) {
        toast.error(t.auctions.bidTooLow)
      } else if (msg.includes('auction_ended')) {
        toast.error(t.auctions.auctionEnded)
      } else if (msg.includes('bid_wrong_step')) {
        const step = msg.split(':')[1]
        toast.error(`Шаг торгов: ${parseInt(step).toLocaleString('ru-RU')} ₽`)
      } else {
        toast.error(msg || 'Ошибка при ставке')
      }
      return
    }
    toast.success(t.auctions.bidSuccess)
    setBiddingOrder(null)
    setBidAmount('')
    fetchOrders()
  }

  const isCarrier = user?.role === 'carrier'

  const noOrdersMsg = {
    reduction: { active: t.auctions.noReduction, closed: 'Нет завершённых редукционов', cancelled: 'Нет отменённых редукционов' },
    auction:   { active: t.auctions.noAuction,   closed: 'Нет завершённых аукционов',   cancelled: 'Нет отменённых аукционов' },
  }

  // Текущая ставка (или старт) — ключевой моно-акцент экрана
  function currentAmount(order: Order): number | null {
    const best = bidMap[order.id]?.best_amount
    if (best != null) return best
    return order.auction_start_price ?? null
  }

  return (
    <AppLayout>
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">{t.auctions.title}</h1>
        {statusTab === 'active' && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] uppercase text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />Live
          </span>
        )}
        {!loading && (
          <span className="font-mono text-[13px] tabular-nums text-ink-3">{orders.length}</span>
        )}
      </div>

      {/* Тип торгов + статус — сегментированные переключатели доски */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="inline-flex p-0.5 rounded-field border border-hairline bg-surface-sunken">
          {(['reduction', 'auction'] as FormatTab[]).map(type => (
            <button
              key={type}
              onClick={() => setFormatTab(type)}
              className={cn(
                'px-3.5 h-8 rounded-[5px] text-[13px] font-medium transition-colors ease-terminal',
                formatTab === type
                  ? 'bg-surface text-ink border border-hairline'
                  : 'text-ink-3 hover:text-ink border border-transparent'
              )}
            >
              {type === 'reduction' ? t.auctions.tabReduction : t.auctions.tabAuction}
            </button>
          ))}
        </div>

        <div className="inline-flex p-0.5 rounded-field border border-hairline bg-surface-sunken">
          {(['active', 'closed', 'cancelled'] as StatusTab[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={cn(
                'px-3 h-8 rounded-[5px] text-[13px] font-medium transition-colors ease-terminal',
                statusTab === s
                  ? 'bg-surface text-ink border border-hairline'
                  : 'text-ink-3 hover:text-ink border border-transparent'
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Доска торгов */}
      <div className="border border-hairline rounded-card bg-surface overflow-x-auto">
        <div className="min-w-[880px]">
          {/* Шапка колонок */}
          <div className="flex items-center gap-3.5 h-[34px] px-5 bg-surface-sunken border-b border-hairline text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
            <span className="w-[84px] flex-none">№</span>
            <span className="flex-1">Маршрут</span>
            <span className="w-[104px] flex-none">Контейнер</span>
            <span className="w-[80px] flex-none text-right">Вес, кг</span>
            <span className="w-[64px] flex-none text-right">Погрузка</span>
            <span className="w-[112px] flex-none text-right">Тек. ставка</span>
            <span className="w-[96px] flex-none text-right">До конца</span>
            <span className="w-[150px] flex-none" />
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3.5 h-[56px] px-5 border-b border-hairline last:border-0">
                <span className="w-[84px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[104px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[112px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              </div>
            ))
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
              <ContainerMark size={28} className="text-ink-4" />
              <span className="text-[15px] text-ink-3 max-w-[320px]">
                {noOrdersMsg[formatTab][statusTab]}
              </span>
            </div>
          ) : (
            orders.map(order => {
              const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label || order.container_type
              const amount = currentAmount(order)
              const bid = bidMap[order.id]
              const isLiveBest = bid?.best_amount != null
              return (
                <div
                  key={order.id}
                  className="flex items-center gap-3.5 min-h-[56px] py-2 px-5 border-b border-hairline last:border-0 bg-surface transition-colors ease-terminal hover:bg-accent-soft hover:shadow-row-active"
                >
                  <span className="w-[84px] flex-none font-mono text-[13px] text-ink-3">
                    {order.order_number ? formatOrderNumber(order.order_number) : '—'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <RouteInline
                      from={order.from_city}
                      to={order.to_city}
                      via={order.via_city}
                    />
                  </span>
                  <span className="w-[104px] flex-none">
                    <ContainerChip label={containerLabel} genset={order.requires_genset} />
                  </span>
                  <span className="w-[80px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
                    {weightDisplay(order)}
                  </span>
                  <span className="w-[64px] flex-none text-right font-mono text-[13px] tabular-nums text-ink-3">
                    {readyShort(order.ready_date)}
                  </span>
                  {/* Текущая/минимальная ставка — ключевой моно-акцент */}
                  <span className="w-[112px] flex-none flex flex-col items-end leading-tight">
                    <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
                      {amount != null ? `${amount.toLocaleString('ru-RU')} ₽` : '—'}
                    </span>
                    <span className="text-[10.5px] font-semibold tracking-[0.05em] uppercase text-ink-4">
                      {isLiveBest
                        ? `${bid.bid_count} ${t.auctions.bidCount}`
                        : 'старт'}
                    </span>
                  </span>
                  {/* Обратный отсчёт до конца торгов */}
                  <span className="w-[96px] flex-none text-right">
                    {statusTab === 'active' && order.auction_end_time
                      ? <AuctionCountdown endsAt={order.auction_end_time} />
                      : <span className="font-mono text-[13px] tabular-nums text-ink-4">—</span>}
                  </span>
                  <span className="w-[150px] flex-none flex items-center gap-2 justify-end">
                    {isCarrier && statusTab === 'active' && (
                      <Button
                        size="sm"
                        onClick={() => { setBiddingOrder(order); setBidAmount('') }}
                      >
                        {t.auctions.placeBid}
                      </Button>
                    )}
                    <Link href={`/orders/${order.id}`}>
                      <Button size="sm" variant="secondary">{t.auctions.details}</Button>
                    </Link>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {biddingOrder && (
        <Modal
          open={true}
          onClose={() => { setBiddingOrder(null); setBidAmount('') }}
          title={t.auctions.placeBid}
        >
          <div className="space-y-4">
            <div>
              <RouteInline from={biddingOrder.from_city} to={biddingOrder.to_city} via={biddingOrder.via_city} />
            </div>

            {/* Текущая ставка / старт — выразительно моно */}
            <div className="flex items-center justify-between px-3.5 py-3 rounded-field border border-hairline bg-surface-sunken">
              <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
                {bidMap[biddingOrder.id]?.best_amount ? t.auctions.bestBid : t.auctions.startPrice}
              </span>
              <span className="font-mono text-[17px] font-medium tabular-nums text-ink">
                {bidMap[biddingOrder.id]?.best_amount
                  ? `${bidMap[biddingOrder.id].best_amount?.toLocaleString('ru-RU')} ₽`
                  : `${biddingOrder.auction_start_price?.toLocaleString('ru-RU')} ₽`}
              </span>
            </div>

            <Input
              id="bidAmount"
              type="number"
              label={t.auctions.yourBid}
              value={bidAmount}
              onChange={e => setBidAmount(e.target.value)}
              placeholder={t.auctions.bidPlaceholder}
              min="1"
            />
            <div className="flex gap-3">
              <Button onClick={placeBid} loading={bidLoading} className="flex-1">
                {t.auctions.confirm}
              </Button>
              <Button variant="secondary" onClick={() => { setBiddingOrder(null); setBidAmount('') }} className="flex-1">
                {t.common.cancel}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}
