'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { OrderCard } from '@/components/orders/OrderCard'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order } from '@/types/database'
import { toast } from 'sonner'
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

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t.auctions.title}</h1>

        {/* Тип торгов: Редукцион / Аукцион */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-3 w-fit">
          {(['reduction', 'auction'] as FormatTab[]).map(type => (
            <button
              key={type}
              onClick={() => setFormatTab(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                formatTab === type
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {type === 'reduction' ? t.auctions.tabReduction : t.auctions.tabAuction}
            </button>
          ))}
        </div>

        {/* Пункт 11: статусные вкладки */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
          {(['active', 'closed', 'cancelled'] as StatusTab[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusTab === s
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            {noOrdersMsg[formatTab][statusTab]}
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className="relative">
                <OrderCard
                  order={order}
                  bidData={bidMap[order.id] ?? null}
                  actions={
                    <div className="flex gap-2 flex-wrap">
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
                    </div>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {biddingOrder && (
        <Modal
          open={true}
          onClose={() => { setBiddingOrder(null); setBidAmount('') }}
          title={t.auctions.placeBid}
        >
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              {biddingOrder.from_city} → {biddingOrder.to_city}
            </div>
            {bidMap[biddingOrder.id]?.best_amount ? (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                {t.auctions.bestBid}: <strong>{bidMap[biddingOrder.id].best_amount?.toLocaleString('ru-RU')} ₽</strong>
              </div>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm">
                {t.auctions.startPrice}: <strong>{biddingOrder.auction_start_price?.toLocaleString('ru-RU')} ₽</strong>
              </div>
            )}
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
