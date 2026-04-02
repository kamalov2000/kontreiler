'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, X, Filter } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderCard } from '@/components/orders/OrderCard'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, ContainerType } from '@/types/database'
import { formatOrderNumber } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = 'active' | 'closed' | 'cancelled' | 'expired' | 'all'

// Универсальный поиск:
// - "заявка КТ-00010", "заявку 00010", "order КТ-00010", "# 10", "№10" — стрипаем префикс
// - "00010", "10" — только цифры → пэддинг до 5 знаков, ищем по концу номера
// - "КТ", "А-000", "Р-0" — частичный номер
// - город, примечание, тип контейнера
function matchesSearch(order: Order, q: string): boolean {
  if (!q) return true

  // Стрипаем общие слова-префиксы
  const ql = q.toLowerCase().trim()
    .replace(/^(заявк[аую]|ордер|order|#|№)\s*/i, '')
    .trim()

  if (!ql) return true

  const num = order.order_number || ''
  const shortNum = formatOrderNumber(num).toLowerCase()

  // Только цифры — пэддинг до 5 и ищем по концу
  if (/^\d+$/.test(ql)) {
    const padded = ql.padStart(5, '0')
    return num.endsWith('-' + padded) || shortNum.endsWith('-' + padded)
  }

  // Метка контейнера ("40 HC", "20 футов" и т.д.)
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

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const { t } = useLanguage()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')

  // Фильтры вкладки "Все заявки"
  const [allFilterStatus, setAllFilterStatus] = useState('')
  const [allFilterContainer, setAllFilterContainer] = useState('')
  const [allFilterFrom, setAllFilterFrom] = useState('')
  const [allFilterTo, setAllFilterTo] = useState('')
  const [allFilterDate, setAllFilterDate] = useState('')
  const [showAllFilters, setShowAllFilters] = useState(false)

  const TAB_LABEL: Record<Tab, string> = {
    active:    t.dashboard.active,
    closed:    t.dashboard.archive,
    cancelled: t.dashboard.cancelled,
    expired:   t.dashboard.expired,
    all:       'Все заявки',
  }

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
      // Пункт 11: убираем торги (reduction/auction) из "Мои заявки"
      setOrders(mapped.filter((o: Order) => o.format !== 'reduction' && o.format !== 'auction'))
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

  // Пункт 1: Отправить в архив (для просроченных)
  async function archiveOrder(orderId: string) {
    setArchivingId(orderId)
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status: 'closed', was_expired: true })
      .eq('id', orderId)

    if (error) {
      toast.error('Ошибка при архивировании')
    } else {
      toast.success('Заявка отправлена в архив')
      fetchOrders()
    }
    setArchivingId(null)
  }

  const now = Date.now()

  // Фильтрация по вкладкам
  const filtered = orders.filter(o => {
    // Определяем эффективный статус (пункт 8)
    const effStatus = (
      o.status === 'active' &&
      o.expires_at &&
      new Date(o.expires_at).getTime() <= now
    ) ? 'expired' : o.status

    if (tab === 'active') {
      if (['closed', 'cancelled', 'expired'].includes(effStatus)) return false
    } else if (tab === 'all') {
      // Все заявки — дополнительные фильтры
      if (allFilterStatus && effStatus !== allFilterStatus) return false
      if (allFilterContainer && o.container_type !== allFilterContainer) return false
      if (allFilterFrom && !o.from_city?.toLowerCase().includes(allFilterFrom.toLowerCase())) return false
      if (allFilterTo && !o.to_city?.toLowerCase().includes(allFilterTo.toLowerCase())) return false
      if (allFilterDate && o.ready_date !== allFilterDate) return false
    } else {
      if (effStatus !== tab) return false
    }

    return matchesSearch(o, search)
  })

  const activeCount   = orders.filter(o => {
    const eff = (o.status === 'active' && o.expires_at && new Date(o.expires_at).getTime() <= now) ? 'expired' : o.status
    return !['closed', 'cancelled', 'expired'].includes(eff)
  }).length
  const cancelledCount = orders.filter(o => o.status === 'cancelled').length
  const expiredCount   = orders.filter(o => {
    const eff = (o.status === 'active' && o.expires_at && new Date(o.expires_at).getTime() <= now) ? 'expired' : o.status
    return eff === 'expired'
  }).length

  const emptyMessage: Record<Tab, React.ReactNode> = {
    active:    <><p className="mb-4">{t.dashboard.noActive}</p><Link href="/orders/new"><Button>{t.dashboard.postFirst}</Button></Link></>,
    closed:    <p>{t.dashboard.noClosed}</p>,
    cancelled: <p>{t.dashboard.noCancelled}</p>,
    expired:   <p>{t.dashboard.noExpired}</p>,
    all:       <p>Нет заявок по выбранным фильтрам</p>,
  }

  const hasAllFilters = !!(allFilterStatus || allFilterContainer || allFilterFrom || allFilterTo || allFilterDate)

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.dashboard.title}</h1>
        <Link href="/orders/new">
          <Button size="md">
            <Plus size={16} className="mr-1" />
            {t.dashboard.newOrder}
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6 flex-wrap">
        {(['active', 'all', 'closed', 'cancelled', 'expired'] as Tab[]).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'relative px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === tabKey ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {TAB_LABEL[tabKey]}
            {tabKey === 'active' && activeCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold px-1">
                {activeCount}
              </span>
            )}
            {tabKey === 'cancelled' && cancelledCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-100 text-red-600 text-[10px] font-bold px-1">
                {cancelledCount}
              </span>
            )}
            {tabKey === 'expired' && expiredCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold px-1">
                {expiredCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Поиск */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск: город, 00010, КТ-00010, заявка КТ-00010…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Фильтры для "Все заявки" */}
      {tab === 'all' && (
        <div className="mb-4">
          <button
            onClick={() => setShowAllFilters(v => !v)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
              hasAllFilters
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <Filter size={14} />
            Фильтры{hasAllFilters ? ` (${[allFilterStatus, allFilterContainer, allFilterFrom, allFilterTo, allFilterDate].filter(Boolean).length})` : ''}
          </button>

          {showAllFilters && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-white rounded-xl border border-gray-200">
              <Select
                id="allFilterStatus"
                label="Статус"
                value={allFilterStatus}
                onChange={e => setAllFilterStatus(e.target.value)}
                options={[
                  { value: '', label: 'Любой' },
                  { value: 'active',     label: 'Активная' },
                  { value: 'matched',    label: 'Перевозчик найден' },
                  { value: 'in_transit', label: 'В пути' },
                  { value: 'delivered',  label: 'Доставлено' },
                  { value: 'closed',     label: 'Закрыта' },
                  { value: 'cancelled',  label: 'Отменена' },
                  { value: 'expired',    label: 'Просрочена' },
                ]}
              />
              <Select
                id="allFilterContainer"
                label="Контейнер"
                value={allFilterContainer}
                onChange={e => setAllFilterContainer(e.target.value as ContainerType | '')}
                options={[
                  { value: '', label: 'Любой' },
                  ...CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label })),
                ]}
              />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Откуда</label>
                <input
                  type="text"
                  value={allFilterFrom}
                  onChange={e => setAllFilterFrom(e.target.value)}
                  placeholder="Город отправления"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Куда</label>
                <input
                  type="text"
                  value={allFilterTo}
                  onChange={e => setAllFilterTo(e.target.value)}
                  placeholder="Город назначения"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Дата погрузки</label>
                <input
                  type="date"
                  value={allFilterDate}
                  onChange={e => setAllFilterDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {hasAllFilters && (
                <div className="flex items-end">
                  <button
                    onClick={() => { setAllFilterStatus(''); setAllFilterContainer(''); setAllFilterFrom(''); setAllFilterTo(''); setAllFilterDate('') }}
                    className="text-sm text-red-600 hover:text-red-800 underline"
                  >
                    Сбросить фильтры
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {emptyMessage[tab]}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(order => {
            const unread = unreadMap[order.id] || 0
            const isMatched = order.status === 'matched'
            const effStatus = (
              order.status === 'active' &&
              order.expires_at &&
              new Date(order.expires_at).getTime() <= now
            ) ? 'expired' : order.status
            const isExpired = effStatus === 'expired'

            return (
              <OrderCard
                key={order.id}
                order={order}
                showResponses={true}
                actions={
                  <>
                    {isMatched && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold">
                        {t.dashboard.carrierChosen}
                      </span>
                    )}

                    {/* Пункт 1: для просроченных — "Отправить в архив" */}
                    {isExpired ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={archivingId === order.id}
                        onClick={() => archiveOrder(order.id)}
                      >
                        Отправить в архив
                      </Button>
                    ) : (
                      /* Пункт 2: убрали кнопку "Закрыть", только "Открыть" */
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="secondary" size="sm">
                          Открыть
                        </Button>
                      </Link>
                    )}

                    {!isExpired && !isMatched && (order.response_count || 0) > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
                        {t.dashboard.responses}: {order.response_count}
                      </span>
                    )}
                    {!isExpired && (order.response_count || 0) > 0 && (
                      <Link href={`/orders/${order.id}/chat`} className="relative inline-flex">
                        <Button variant="ghost" size="sm" className="text-blue-600">
                          {t.dashboard.chat}
                        </Button>
                        {unread > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                            {unread}
                          </span>
                        )}
                      </Link>
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
