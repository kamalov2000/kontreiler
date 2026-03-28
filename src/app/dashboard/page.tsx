'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderCard } from '@/components/orders/OrderCard'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Order } from '@/types/database'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = 'active' | 'closed' | 'cancelled'

const TAB_LABEL: Record<Tab, string> = {
  active:    'Активные',
  closed:    'Архив',
  cancelled: 'Отменённые',
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [closingId, setClosingId] = useState<string | null>(null)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})

  async function fetchOrders() {
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase
      .from('orders')
      .select('*, responses(count)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = data.map((o: any) => ({
        ...o,
        response_count: o.responses?.[0]?.count ?? 0,
      }))
      setOrders(mapped)
    }
    setLoading(false)
  }

  async function fetchUnread() {
    if (!user) return
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('link')
      .eq('user_id', user.id)
      .eq('type', 'new_message')
      .eq('is_read', false)

    if (!data) return
    const map: Record<string, number> = {}
    for (const n of data) {
      const m = (n.link as string).match(/^\/orders\/([^/]+)\/chat$/)
      if (m) map[m[1]] = (map[m[1]] || 0) + 1
    }
    setUnreadMap(map)
  }

  useEffect(() => {
    if (userLoading) return
    if (!user) { setLoading(false); return }
    fetchOrders()
    fetchUnread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userLoading])

  // Realtime: refresh unread when notifications change
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-notif')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchUnread())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function closeOrder(orderId: string) {
    setClosingId(orderId)
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status: 'closed' })
      .eq('id', orderId)

    if (error) {
      toast.error('Ошибка при закрытии заявки')
    } else {
      toast.success('Заявка закрыта')
      fetchOrders()
    }
    setClosingId(null)
  }

  const filtered = orders.filter(o => {
    if (tab === 'active')    return !['closed', 'cancelled'].includes(o.status)
    if (tab === 'closed')    return o.status === 'closed'
    if (tab === 'cancelled') return o.status === 'cancelled'
    return false
  })

  const cancelledCount = orders.filter(o => o.status === 'cancelled').length

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Мои заявки</h1>
        <Link href="/orders/new">
          <Button size="md">
            <Plus size={16} className="mr-1" />
            Новая заявка
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {(['active', 'closed', 'cancelled'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'relative px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {TAB_LABEL[t]}
            {t === 'cancelled' && cancelledCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-100 text-red-600 text-[10px] font-bold px-1">
                {cancelledCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {tab === 'active' ? (
            <>
              <p className="mb-4">У вас нет активных заявок</p>
              <Link href="/orders/new">
                <Button>Разместить первую заявку</Button>
              </Link>
            </>
          ) : tab === 'cancelled' ? (
            <p>Отменённых заявок нет</p>
          ) : (
            <p>Закрытых заявок нет</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(order => {
            const unread = unreadMap[order.id] || 0
            const isMatched = order.status === 'matched'

            return (
              <OrderCard
                key={order.id}
                order={order}
                showResponses={true}
                actions={
                  <>
                    {isMatched && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold">
                        ✓ Перевозчик выбран
                      </span>
                    )}
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="secondary" size="sm">
                        {isMatched ? 'Детали' : `Отклики (${order.response_count || 0})`}
                      </Button>
                    </Link>
                    {(order.response_count || 0) > 0 && (
                      <Link href={`/orders/${order.id}/chat`} className="relative inline-flex">
                        <Button variant="ghost" size="sm" className="text-blue-600">
                          💬 Чат
                        </Button>
                        {unread > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                            {unread}
                          </span>
                        )}
                      </Link>
                    )}
                    {order.status === 'active' && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={closingId === order.id}
                        onClick={() => closeOrder(order.id)}
                      >
                        Закрыть
                      </Button>
                    )}
                  </>
                }
              />
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
