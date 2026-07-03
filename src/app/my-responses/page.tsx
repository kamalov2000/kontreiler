'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Response } from '@/types/database'
import { formatDateTime, formatPrice, formatOrderNumber } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'
import { Search, X } from 'lucide-react'
import { RevealPhone } from '@/components/ui/RevealPhone'
import { RouteInline } from '@/components/ui/RouteInline'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { Button } from '@/components/ui/Button'

type StatusFilter = 'all' | 'accepted' | 'pending' | 'rejected'

export default function MyResponsesPage() {
  const { user, loading: userLoading } = useUser()
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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

    async function fetch() {
      const supabase = createClient()
      const { data } = await supabase
        .from('responses')
        .select('*, order:orders(*, client:users!client_id(*))')
        .eq('carrier_id', user!.id)
        .order('created_at', { ascending: false })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setResponses((data || []) as any[])
      setLoading(false)
    }

    fetch()
    fetchUnread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userLoading])

  // Realtime: refresh unread count on notification change
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    const channel = supabase
      .channel('my-responses-notif')
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = useMemo(() => responses.filter((r: any) => {
    const order = r.order
    if (!order) return false

    // Status filter
    if (statusFilter === 'accepted' && order.accepted_carrier_id !== user?.id) return false
    if (statusFilter === 'rejected' && !(order.accepted_carrier_id && order.accepted_carrier_id !== user?.id)) return false
    if (statusFilter === 'pending' && (order.accepted_carrier_id || ['cancelled', 'closed'].includes(order.status))) return false

    // Search
    if (search) {
      const q = search.toLowerCase()
      const route = `${order.from_city} ${order.via_city || ''} ${order.to_city}`.toLowerCase()
      const containerLabel = CONTAINER_TYPES.find((c: { value: string; label: string }) => c.value === order.container_type)?.label?.toLowerCase() || ''
      if (!route.includes(q) && !containerLabel.includes(q) && !(order.order_number || '').toLowerCase().includes(q)) return false
    }

    return true
  }), [responses, statusFilter, search, user])

  const statusBadgeOptions = [
    { value: 'all',      label: 'Все' },
    { value: 'accepted', label: 'Принятые' },
    { value: 'pending',  label: 'Ожидание' },
    { value: 'rejected', label: 'Отклонённые' },
  ]

  return (
    <AppLayout>
      <div className="flex items-baseline gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">Мои отклики</h1>
        {!loading && (
          <span className="font-mono text-[13px] tabular-nums text-ink-3">{filtered.length} откликов</span>
        )}
      </div>

      {/* Поиск и фильтр */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по маршруту, городу, номеру заявки..."
            className="w-full h-11 pl-9 pr-8 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-surface-sunken rounded-field p-1 shrink-0">
          {statusBadgeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value as StatusFilter)}
              className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors ease-terminal whitespace-nowrap ${
                statusFilter === opt.value ? 'bg-surface text-ink border border-hairline' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-hairline rounded-card bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="w-[96px] h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
                <span className="w-[120px] h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              </div>
              <div className="mt-4 h-16 rounded-field bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
            </div>
          ))}
        </div>
      ) : responses.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface flex flex-col items-center gap-3 text-center py-16 px-6">
          <ContainerMark size={28} className="text-ink-4" />
          <span className="text-[15px] text-ink-3 max-w-[320px]">Вы ещё не откликались на заявки.</span>
          <Link href="/feed" className="text-sm font-medium text-accent hover:text-accent-hover">
            Перейти в ленту
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface flex flex-col items-center gap-3 text-center py-16 px-6">
          <ContainerMark size={28} className="text-ink-4" />
          <span className="text-[15px] text-ink-3">Нет откликов по заданным фильтрам.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filtered.map((r: any) => {
            const order = r.order
            if (!order) return null
            const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label || order.container_type
            const client = order.client
            const unread = unreadMap[order.id] || 0

            // Статус отклика перевозчика → пилюля дизайн-системы
            const respStatus = (() => {
              if (order.status === 'cancelled') return { status: 'cancelled', label: 'Заявка отменена' }
              if (order.status === 'closed')    return { status: 'closed',    label: 'Заявка закрыта' }
              if (order.accepted_carrier_id === user?.id)
                                               return { status: 'delivered', label: 'Ваш отклик принят' }
              if (order.accepted_carrier_id)   return { status: 'cancelled', label: 'Выбран другой перевозчик' }
              return                                  { status: 'in_transit', label: 'Ожидает решения' }
            })()

            const isAccepted = order.accepted_carrier_id === user?.id
            const isRejected = order.status === 'cancelled' || (order.accepted_carrier_id && order.accepted_carrier_id !== user?.id)
            const borderClass = isRejected
              ? 'border-danger-soft'
              : isAccepted
              ? 'border-accent'
              : 'border-hairline'

            return (
              <div key={r.id} className={`bg-surface rounded-card border p-4 sm:p-5 ${borderClass}`}>
                {/* Заголовок: № · маршрут · статус */}
                <div className="flex items-center gap-3 flex-wrap mb-4">
                  {order.order_number && (
                    <Link href={`/orders/${order.id}`} className="font-mono text-[13px] tabular-nums text-ink-3 hover:text-accent transition-colors">
                      {formatOrderNumber(order.order_number)}
                    </Link>
                  )}
                  <Link href={`/orders/${order.id}`} className="min-w-0 flex-1">
                    <RouteInline
                      from={order.from_city}
                      to={order.to_city}
                      via={order.via_city}
                      urgent={order.is_urgent}
                    />
                  </Link>
                  <StatusPill status={respStatus.status} label={respStatus.label} kind="order" className="flex-none" />
                </div>

                {/* Данные заявки */}
                <div className="flex flex-wrap items-center gap-2.5 mb-4">
                  <ContainerChip label={containerLabel} genset={order.requires_genset} />
                  <span className="font-mono text-[15px] font-medium tabular-nums text-ink">
                    {formatPrice(order.price, order.is_negotiable)}
                  </span>
                  {order.ready_date && (
                    <span className="font-mono text-[13px] tabular-nums text-ink-3">
                      погрузка {new Date(order.ready_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>

                {/* Контакт клиента */}
                <div className="p-3.5 rounded-field bg-surface-sunken border border-hairline">
                  <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Контакт клиента</div>
                  <div className="text-[15px] font-medium text-ink">{client?.name}</div>
                  {client?.city && <div className="text-sm text-ink-3">{client.city}</div>}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <RevealPhone kind="order" id={order.id} targetUserId={order.client_id} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-card border border-hairline bg-surface text-ink-2 text-sm font-medium hover:border-border-strong transition-colors" />
                    <Link href={`/orders/${order.id}`}>
                      <Button size="sm">Открыть заявку</Button>
                    </Link>
                    <Link
                      href={`/orders/${order.id}/chat`}
                      className="relative inline-flex items-center min-h-[36px] px-3 rounded-card border border-hairline bg-surface text-ink-2 text-sm font-medium hover:border-border-strong transition-colors"
                    >
                      Чат
                      {unread > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                          {unread}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>

                {/* Комментарий перевозчика */}
                {r.message && (
                  <p className="mt-3 text-sm text-ink-2">
                    <span className="text-ink-3">Ваш комментарий: </span>{r.message}
                  </p>
                )}

                <div className="mt-2.5 font-mono text-[12px] tabular-nums text-ink-4">Отклик: {formatDateTime(r.created_at)}</div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
