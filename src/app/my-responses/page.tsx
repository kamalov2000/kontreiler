'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Response } from '@/types/database'
import { formatDateTime, formatPrice, formatPhone, maskPhone } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'
import { ORDER_STATUS_LABEL } from '@/lib/status'
import { ArrowRight, Phone } from 'lucide-react'

export default function MyResponsesPage() {
  const { user, loading: userLoading } = useUser()
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set())

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

  return (
    <AppLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Мои отклики</h1>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : responses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="mb-4">Вы ещё не откликались на заявки</p>
          <Link href="/feed" className="text-blue-600 hover:underline text-sm">
            Перейти в ленту →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {responses.map((r: any) => {
            const order = r.order
            if (!order) return null
            const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label
            const client = order.client
            const unread = unreadMap[order.id] || 0

            // Статус отклика для перевозчика
            const badge = (() => {
              if (order.status === 'cancelled') return { text: '🚫 Заявка отменена',          cls: 'bg-red-100 text-red-600' }
              if (order.status === 'closed')    return { text: 'Заявка закрыта',               cls: 'bg-gray-100 text-gray-500' }
              if (order.accepted_carrier_id === user?.id)
                                               return { text: '✅ Ваш отклик принят',          cls: 'bg-green-100 text-green-700' }
              if (order.accepted_carrier_id)   return { text: '❌ Выбран другой перевозчик',   cls: 'bg-red-100 text-red-600' }
              return                                  { text: '⏳ Ожидает решения',             cls: 'bg-amber-100 text-amber-700' }
            })()

            const borderClass = order.status === 'cancelled' || (order.accepted_carrier_id && order.accepted_carrier_id !== user?.id)
              ? 'border-red-200'
              : order.accepted_carrier_id === user?.id
              ? 'border-blue-300'
              : 'border-gray-100'

            return (
              <div key={r.id} className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 ${borderClass}`}>
                {/* Route + status badge */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-bold text-gray-900 text-lg">{order.from_city}</span>
                  <ArrowRight size={16} className="text-gray-400 shrink-0" />
                  <span className="font-bold text-gray-900 text-lg">{order.to_city}</span>
                  {order.is_urgent && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                      СРОЧНО
                    </span>
                  )}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ml-auto ${badge.cls}`}>
                    {badge.text}
                  </span>
                </div>

                {/* Details */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-sm">{containerLabel}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium">
                    {formatPrice(order.price, order.is_negotiable)}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 text-sm">
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>

                {/* Client contact */}
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="text-xs text-gray-500 mb-1">Контакт клиента</div>
                  <div className="font-medium text-gray-900">{client?.name}</div>
                  {client?.city && <div className="text-sm text-gray-500">{client.city}</div>}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {revealedPhones.has(order.id) ? (
                      <a
                        href={`tel:${client?.phone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                      >
                        <Phone size={14} />
                        {formatPhone(client?.phone)}
                      </a>
                    ) : (
                      <button
                        onClick={() => setRevealedPhones(prev => { const s = new Set(prev); s.add(order.id); return s })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                      >
                        <Phone size={14} />
                        {maskPhone(client?.phone)}
                      </button>
                    )}
                    <Link
                      href={`/orders/${order.id}/chat`}
                      className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
                    >
                      💬 Чат
                      {unread > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                          {unread}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>

                {/* My comment */}
                {r.message && (
                  <p className="mt-3 text-sm text-gray-600 italic">
                    Ваш комментарий: {r.message}
                  </p>
                )}

                <div className="mt-2 text-xs text-gray-400">Отклик: {formatDateTime(r.created_at)}</div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
