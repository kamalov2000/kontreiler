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

type Tab = 'reduction' | 'auction'

export default function AuctionsPage() {
  const { user } = useUser()
  const { t } = useLanguage()

  const [tab, setTab] = useState<Tab>('reduction')
  const [orders, setOrders] = useState<Order[]>([])
  const [bidMap, setBidMap] = useState<Record<string, BidRow>>({})
  const [loading, setLoading] = useState(true)

  // Bid modal
  const [biddingOrder, setBiddingOrder] = useState<Order | null>(null)
  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from('orders')
      .select('*, client:users!client_id(id, name, city)')
      .eq('format', tab)
      .eq('status', 'active')
      .order('auction_end_time', { ascending: true })

    const now = Date.now()
    const loaded = ((data || []) as Order[]).filter(o =>
      !o.auction_end_time || new Date(o.auction_end_time).getTime() > now
    )
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
    }
  }, [tab])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Realtime subscription to bids table
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('auctions-bids')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

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

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t.auctions.title}</h1>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
          {(['reduction', 'auction'] as Tab[]).map(type => (
            <button
              key={type}
              onClick={() => setTab(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === type
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {type === 'reduction' ? t.auctions.tabReduction : t.auctions.tabAuction}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            {tab === 'reduction' ? t.auctions.noReduction : t.auctions.noAuction}
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
                      {isCarrier && order.status === 'active' && (
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

      {/* Bid modal */}
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
                {biddingOrder.format === 'reduction'
                  ? ` — ${t.auctions.bidTooHigh.replace('должна', 'должна быть')}`
                  : ''}
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
              <Button
                onClick={placeBid}
                loading={bidLoading}
                className="flex-1"
              >
                {t.auctions.confirm}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setBiddingOrder(null); setBidAmount('') }}
                className="flex-1"
              >
                {t.common.cancel}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}
