'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, X, Filter, Download, Upload } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderImportModal } from '@/components/orders/OrderImportModal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { RouteInline } from '@/components/ui/RouteInline'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, ContainerType } from '@/types/database'
import { formatOrderNumber, formatPrice } from '@/lib/utils'
import { TRACKING_STEPS, getTrackingStepIndex } from '@/lib/tracking'
import { CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = 'active' | 'closed' | 'cancelled' | 'expired' | 'all'

// Слова-префиксы которые пользователь может набирать перед номером
const SEARCH_PREFIX_WORDS = ['заявка', 'заявку', 'заявки', 'заявке', 'заявкой', 'ордер', 'order']

// Извлекаем реальный поисковый запрос:
// - "з/за/зая/заяв/заявк/заявка" → '' (пользователь ещё набирает слово-префикс → показать всё)
// - "заявка КТ-00010" → 'кт-00010'
// - "00010" → '00010'
// - "Москва" → 'москва'
function extractQuery(raw: string): string {
  const q = raw.toLowerCase().trim()
  if (!q) return ''

  const spaceIdx = q.indexOf(' ')
  const firstWord = spaceIdx === -1 ? q : q.slice(0, spaceIdx)
  const rest = spaceIdx === -1 ? '' : q.slice(spaceIdx + 1).trim()

  // Если первое слово — начало одного из стрипаемых слов (≥2 символа) → стрипаем
  const isPrefix = firstWord.length >= 1 &&
    SEARCH_PREFIX_WORDS.some(w => w.startsWith(firstWord))

  if (isPrefix) return rest  // может быть пустой строкой → показать всё

  // # и № стрипаем всегда
  if (/^[#№]/.test(q)) return q.replace(/^[#№]\s*/, '').trim()

  return q
}

function matchesSearch(order: Order, q: string): boolean {
  if (!q) return true

  const ql = extractQuery(q)
  if (!ql) return true  // набирают слово-префикс → всё совпадает

  const num = order.order_number || ''
  const shortNum = formatOrderNumber(num).toLowerCase()

  // Только цифры — пэддинг до 5 и ищем по концу
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

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const { t } = useLanguage()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [stopOrders, setStopOrders] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)

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

  // Перевозчикам здесь делать нечего — редиректим в ленту
  useEffect(() => {
    if (!userLoading && user?.role === 'carrier') {
      router.replace('/feed')
    }
  }, [user, userLoading, router])

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
      const filtered = mapped.filter((o: Order) => o.format !== 'reduction' && o.format !== 'auction')
      setOrders(filtered)

      // Load which orders have additional stops
      const orderIds = filtered.map((o: Order) => o.id)
      if (orderIds.length > 0) {
        const { data: stopsData } = await supabase
          .from('order_stops')
          .select('order_id')
          .in('order_id', orderIds)
        if (stopsData && stopsData.length > 0) {
          setStopOrders(new Set(stopsData.map((s: { order_id: string }) => s.order_id)))
        } else {
          setStopOrders(new Set())
        }
      }
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

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])

  // Вычисляем эффективный статус: учитываем expires_at и ready_date
  function getEffStatus(o: Order): string {
    if (o.status !== 'active') return o.status
    if (o.expires_at && new Date(o.expires_at).getTime() <= now) return 'expired'
    // Если дата погрузки/выгрузки прошла — тоже считаем просроченной
    if (o.ready_date) {
      const endOfReadyDay = new Date(o.ready_date)
      endOfReadyDay.setDate(endOfReadyDay.getDate() + 1)
      if (endOfReadyDay.getTime() <= now) return 'expired'
    }
    return 'active'
  }

  // Фильтрация по вкладкам
  const filtered = orders.filter(o => {
    const effStatus = getEffStatus(o)

    if (tab === 'active') {
      // Активные: без закрытых, отменённых, просроченных и доставленных
      if (['closed', 'cancelled', 'expired', 'delivered'].includes(effStatus)) return false
    } else if (tab === 'all') {
      // Все заявки — закрытые только если явно выбраны в фильтре (они в Архиве)
      if (!allFilterStatus && effStatus === 'closed') return false
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

  const activeCount   = orders.filter(o => !['closed', 'cancelled', 'expired', 'delivered'].includes(getEffStatus(o))).length
  const cancelledCount = orders.filter(o => o.status === 'cancelled').length
  const expiredCount   = orders.filter(o => getEffStatus(o) === 'expired').length
  const inTransitCount = orders.filter(o => getEffStatus(o) === 'in_transit').length
  const deliveredCount = orders.filter(o => o.status === 'delivered').length
  const newResponsesCount = orders
    .filter(o => getEffStatus(o) === 'active')
    .reduce((s, o) => s + (o.response_count || 0), 0)

  const emptyMessage: Record<Tab, React.ReactNode> = {
    active:    <><p className="mb-4">{t.dashboard.noActive}</p><Link href="/orders/new"><Button>{t.dashboard.postFirst}</Button></Link></>,
    closed:    <p>{t.dashboard.noClosed}</p>,
    cancelled: <p>{t.dashboard.noCancelled}</p>,
    expired:   <p>{t.dashboard.noExpired}</p>,
    all:       <p>Нет заявок по выбранным фильтрам</p>,
  }

  const hasAllFilters = !!(allFilterStatus || allFilterContainer || allFilterFrom || allFilterTo || allFilterDate)

  async function exportToExcel() {
    const { utils, writeFile } = await import('xlsx')
    const rows = filtered.map(o => ({
      'Номер заявки': formatOrderNumber(o.order_number || ''),
      'Статус': getEffStatus(o),
      'Откуда': o.from_city,
      'Через': o.via_city || '',
      'Куда': o.to_city,
      'Контейнер': CONTAINER_TYPES.find(c => c.value === o.container_type)?.label || o.container_type,
      'Дата погрузки': o.ready_date,
      'Ставка': o.is_negotiable ? 'Договорная' : (o.price ? `${o.price} ₽` : ''),
      'НДС': o.vat_type,
      'Вес брутто': o.weight_gross || '',
      'Вес нетто': o.weight_net || '',
      'Особые условия': o.notes || '',
      'Создана': new Date(o.created_at).toLocaleDateString('ru-RU'),
    }))
    const ws = utils.json_to_sheet(rows)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Заявки')
    writeFile(wb, `zaявки_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-ink">{t.dashboard.title}</h1>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <Button variant="secondary" size="md" onClick={exportToExcel}>
              <Download size={15} className="mr-1" />
              Excel
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={() => setImportOpen(true)}>
            <Upload size={15} className="mr-1" />
            Импорт
          </Button>
          <Link href="/orders/new">
            <Button size="md">
              <Plus size={16} className="mr-1" />
              {t.dashboard.newOrder}
            </Button>
          </Link>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border border-hairline rounded-card bg-surface overflow-hidden mb-5">
        {[
          { label: 'Активные', value: activeCount, color: 'text-ink' },
          { label: 'Новые отклики', value: newResponsesCount, color: 'text-accent' },
          { label: 'В пути', value: inTransitCount, color: 'text-warning' },
          { label: 'Доставлено', value: deliveredCount, color: 'text-success' },
        ].map((s, i) => (
          <div key={s.label} className={cn('flex flex-col gap-1 px-5 py-4', i < 3 && 'sm:border-r border-hairline', i % 2 === 0 && 'border-r sm:border-r', i < 2 && 'border-b sm:border-b-0')}>
            <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">{s.label}</span>
            <span className={cn('font-mono text-2xl font-medium tabular-nums', s.color)}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-5 border-b border-hairline mb-4 flex-wrap">
        {(['active', 'all', 'closed', 'cancelled', 'expired'] as Tab[]).map(tabKey => {
          const count = tabKey === 'active' ? activeCount : tabKey === 'cancelled' ? cancelledCount : tabKey === 'expired' ? expiredCount : 0
          const countColor = tabKey === 'expired' ? 'text-danger' : tabKey === 'cancelled' ? 'text-danger' : 'text-ink-3'
          return (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={cn(
                'relative inline-flex items-center gap-1.5 pb-2.5 -mb-px text-[13px] font-medium transition-colors',
                tab === tabKey
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-ink-3 hover:text-ink border-b-2 border-transparent'
              )}
            >
              {TAB_LABEL[tabKey]}
              {count > 0 && (
                <span className={cn('font-mono text-[11px] tabular-nums', tab === tabKey ? 'text-accent' : countColor)}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Поиск */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск: город, 00010, КТ-00010, заявка КТ-00010…"
          className="w-full h-11 pl-9 pr-3 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2">
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
        <div className="border border-hairline rounded-card bg-surface overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 h-[56px] px-5 border-b border-hairline last:border-0">
              <span className="w-[84px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              <span className="flex-1 h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
              <span className="w-[110px] flex-none h-3 rounded bg-[linear-gradient(90deg,#ECEFEE_25%,#F3F5F4_50%,#ECEFEE_75%)] bg-[length:400px_100%] animate-shimmer" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface flex flex-col items-center gap-3 text-center py-16 px-6 text-ink-3">
          <ContainerMark size={28} className="text-ink-4" />
          {emptyMessage[tab]}
        </div>
      ) : (
        <div className="border border-hairline rounded-card bg-surface overflow-x-auto">
          <div className="min-w-[820px]">
            {filtered.map(order => {
              const unread = unreadMap[order.id] || 0
              const effStatus = getEffStatus(order)
              const isExpired = effStatus === 'expired'
              const respCount = order.response_count || 0
              const isActive = effStatus === 'active'
              const trackingLabel = order.tracking_enabled && order.tracking_status
                ? (() => {
                    const idx = getTrackingStepIndex(order.tracking_status!)
                    const step = TRACKING_STEPS[idx]
                    return step ? `${step.shortLabel} · ${idx + 1}/7` : null
                  })()
                : null

              return (
                <div
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className="flex items-center gap-3.5 min-h-[56px] py-2 px-5 border-b border-hairline last:border-0 bg-surface cursor-pointer transition-colors ease-terminal hover:bg-accent-soft hover:shadow-row-active"
                >
                  <span className="w-[84px] flex-none font-mono text-[13px] text-ink-3 flex items-center gap-1">
                    {stopOrders.has(order.id) && <span title="Есть доп. точки" className="text-ink-4">＋</span>}
                    {order.order_number ? formatOrderNumber(order.order_number) : '—'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <RouteInline from={order.from_city} to={order.to_city} via={order.via_city} className="flex-1" />
                  </span>
                  <StatusPill status={effStatus} className="flex-none" />
                  <span className="w-[190px] flex-none text-right">
                    {isActive && respCount > 0 ? (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-accent text-white whitespace-nowrap">
                        {respCount} {t.dashboard.responses.toLowerCase()}
                      </span>
                    ) : trackingLabel ? (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded-field border border-hairline bg-surface-sunken text-ink-2 whitespace-nowrap">
                        трекинг: {trackingLabel}
                      </span>
                    ) : isExpired && order.ready_date ? (
                      <span className="font-mono text-[12px] text-ink-3 whitespace-nowrap">
                        погрузка была {new Date(order.ready_date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                      </span>
                    ) : null}
                  </span>
                  <span className="w-[104px] flex-none text-right font-mono text-[15px] font-medium tabular-nums text-ink">
                    {formatPrice(order.price, order.is_negotiable)}
                  </span>
                  <span className="w-[168px] flex-none flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                    {isExpired ? (
                      <Button variant="secondary" size="sm" loading={archivingId === order.id} onClick={() => archiveOrder(order.id)}>
                        В архив
                      </Button>
                    ) : (
                      <Link href={`/orders/${order.id}`}>
                        <Button size="sm" variant={isActive && respCount > 0 ? 'primary' : 'secondary'}>
                          {isActive && respCount > 0 ? 'Отклики' : 'Открыть'}
                        </Button>
                      </Link>
                    )}
                    {!isExpired && respCount > 0 && (
                      <Link href={`/orders/${order.id}/chat`} className="relative inline-flex" onClick={e => e.stopPropagation()}>
                        <span className="inline-flex items-center min-h-[32px] px-3 rounded-card border border-hairline bg-surface text-ink-2 text-[13px] font-medium hover:border-border-strong transition-colors">
                          {t.dashboard.chat}
                        </span>
                        {unread > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                            {unread}
                          </span>
                        )}
                      </Link>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {user && (
        <OrderImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          userId={user.id}
          onImported={fetchOrders}
        />
      )}
    </AppLayout>
  )
}
