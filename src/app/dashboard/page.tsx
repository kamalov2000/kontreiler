'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, X, Filter, Download, Upload, Layers, ChevronDown, ChevronRight } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderImportModal } from '@/components/orders/OrderImportModal'
import { RegistryExportButton } from '@/components/orders/RegistryExportButton'
import { PromoCallout } from '@/components/ui/PromoCallout'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { RouteInline } from '@/components/ui/RouteInline'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, ContainerType } from '@/types/database'
import { Input } from '@/components/ui/Input'
import { formatOrderNumber, formatPrice, toDatetimeLocal } from '@/lib/utils'
import { effectiveOrderStatus } from '@/lib/order-status'
import { TRACKING_STEPS, getTrackingStepIndex } from '@/lib/tracking'
import { CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Tab = 'active' | 'closed' | 'cancelled' | 'expired' | 'all'

// «1 рейс / 2 рейса / 5 рейсов» — счётчик рейсов в строке пакета.
function tripWord(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'рейсов'
  const mod10 = n % 10
  if (mod10 === 1) return 'рейс'
  if (mod10 >= 2 && mod10 <= 4) return 'рейса'
  return 'рейсов'
}


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

  // Пакеты рейсов: в списке они одна строка с разворачиванием. Действия — над
  // всем пакетом сразу, поштучно клиент возится на страницах рейсов.
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState<string | null>(null)
  // Пакет, которому продлеваем срок, и новая дата окончания
  const [extendBatchId, setExtendBatchId] = useState<string | null>(null)
  const [extendUntil, setExtendUntil] = useState('')

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

  function toggleBatch(batchId: string) {
    setExpandedBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  // Отменить все нераспределённые рейсы пакета. Уже принятые (matched и
  // дальше) не трогаем: там своя сделка и свой порядок отмены.
  async function cancelBatch(batchId: string, ids: string[]) {
    if (ids.length === 0) return
    setBatchBusy(batchId)
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .in('id', ids)
    setBatchBusy(null)
    if (error) { toast.error('Не удалось отменить рейсы'); return }
    toast.success(`Отменено рейсов: ${ids.length}`)
    fetchOrders()
  }

  // Продлить срок действия всем нераспределённым рейсам пакета одной датой.
  async function extendBatch(batchId: string, ids: string[]) {
    if (ids.length === 0 || !extendUntil) return
    setBatchBusy(batchId)
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ expires_at: new Date(extendUntil).toISOString() })
      .in('id', ids)
    setBatchBusy(null)
    setExtendBatchId(null)
    if (error) { toast.error('Не удалось продлить срок'); return }
    toast.success(`Срок продлён по ${ids.length} рейсам`)
    fetchOrders()
  }

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(timer)
  }, [])

  // Эффективный статус (с учётом expires_at и ready_date) — общая функция,
  // ею же считает статус реестр перевозок.
  function getEffStatus(o: Order): string {
    return effectiveOrderStatus(o, now)
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

  // Заявок нет вообще (а не «нет по текущему фильтру») — показываем крупный
  // призыв вместо списка, вкладок и статистики из нулей.
  const hasNoOrders = !loading && orders.length === 0

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
    writeFile(wb, `zayavki_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }


  // Заявки одного пакета — одна строка с разворачиванием. Пакет встаёт на
  // место своего первого рейса, порядок остальных строк не меняется.
  type DashRow =
    | { kind: 'order'; key: string; order: Order }
    | { kind: 'batch'; key: string; batchId: string; orders: Order[] }

  const dashRows: DashRow[] = []
  const batchRowIndex = new Map<string, number>()
  for (const o of filtered) {
    if (!o.batch_id) {
      dashRows.push({ kind: 'order', key: o.id, order: o })
      continue
    }
    const at = batchRowIndex.get(o.batch_id)
    if (at == null) {
      batchRowIndex.set(o.batch_id, dashRows.length)
      dashRows.push({ kind: 'batch', key: o.batch_id, batchId: o.batch_id, orders: [o] })
    } else {
      const r = dashRows[at]
      if (r.kind === 'batch') r.orders.push(o)
    }
  }
  // Пакет, от которого в текущей вкладке остался один рейс, показываем обычной
  // строкой: сворачивать нечего.
  const displayRows: DashRow[] = dashRows.map(r =>
    r.kind === 'batch' && r.orders.length === 1
      ? { kind: 'order', key: r.orders[0].id, order: r.orders[0] }
      : r
  )

  // Строка обычной заявки. Вынесена в функцию: список рисует и одиночные
  // заявки, и рейсы внутри развёрнутого пакета.
  function renderOrderRow(order: Order) {
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
  }

  // Строка пакета: маршрут и сводка по статусам, разворачивается в список
  // рейсов. Действия — над всем пакетом сразу.
  function renderBatchRow(row: { batchId: string; orders: Order[] }) {
    const head = row.orders[0]
    const expanded = expandedBatches.has(row.batchId)
    // «Нераспределённые» — те, где перевозчик ещё не принят: только их можно
    // отменить или продлить пачкой.
    const pending = row.orders.filter(o => getEffStatus(o) === 'active')
    const pendingIds = pending.map(o => o.id)
    const responses = pending.reduce((sum, o) => sum + (o.response_count || 0), 0)
    const busy = batchBusy === row.batchId

    return (
      <div key={row.batchId} className="border-b border-hairline last:border-0">
        <div
          onClick={() => toggleBatch(row.batchId)}
          className="flex items-center gap-3.5 min-h-[56px] py-2 px-5 bg-surface cursor-pointer transition-colors ease-terminal hover:bg-accent-soft"
        >
          <span className="w-[84px] flex-none font-mono text-[13px] text-ink-3 flex items-center gap-1">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Layers size={13} />
            <span className="tabular-nums">{row.orders.length}</span>
          </span>
          <span className="flex-1 min-w-0">
            <RouteInline from={head.from_city} to={head.to_city} via={head.via_city} className="flex-1" />
            {/* Действия над пакетом — второй строкой, а не в колонке кнопок:
                их две, и в ширину колонки одиночной заявки они не влезают,
                а ломать сетку списка ради пакета не стоит. */}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="font-mono text-[12px] tabular-nums text-ink-3 whitespace-nowrap">
                Пакет · {row.orders.length} {tripWord(row.orders.length)}, свободно {pending.length}
              </span>
              {pendingIds.length > 0 && (
                <span className="flex items-center gap-2.5" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      setExtendBatchId(row.batchId)
                      setExtendUntil(toDatetimeLocal(head.expires_at))
                    }}
                    className="text-[12px] font-medium text-accent hover:text-accent-hover transition-colors whitespace-nowrap"
                  >
                    продлить срок
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cancelBatch(row.batchId, pendingIds)}
                    className="text-[12px] font-medium text-danger hover:text-danger/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    отменить нераспределённые
                  </button>
                </span>
              )}
            </span>
          </span>
          <span className="w-[190px] flex-none text-right">
            {responses > 0 && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-accent text-white whitespace-nowrap">
                {responses} {t.dashboard.responses.toLowerCase()}
              </span>
            )}
          </span>
          <span className="w-[104px] flex-none text-right font-mono text-[15px] font-medium tabular-nums text-ink">
            {formatPrice(head.price, head.is_negotiable)}
          </span>
          <span className="w-[168px] flex-none flex items-center justify-end">
            <span className="text-[13px] font-medium text-ink-3">
              {expanded ? 'Свернуть' : 'Показать рейсы'}
            </span>
          </span>
        </div>

        {expanded && (
          <div className="bg-surface-sunken border-t border-hairline">
            {row.orders.map(o => renderOrderRow(o))}
          </div>
        )}

        {/* Продление срока: одна дата на все нераспределённые рейсы пакета */}
        {extendBatchId === row.batchId && (
          <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4" onClick={() => setExtendBatchId(null)}>
            <div className="bg-surface rounded-modal shadow-overlay w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink mb-1">Продлить срок пакета</h2>
              <p className="text-sm text-ink-3 mb-4">
                Новый срок действия получат {pendingIds.length} {tripWord(pendingIds.length)}, по которым перевозчик ещё не принят.
              </p>
              <Input
                id="extendUntil"
                type="datetime-local"
                label="Действует до"
                value={extendUntil}
                onChange={e => setExtendUntil(e.target.value)}
              />
              <div className="flex gap-3 mt-5">
                <Button
                  className="flex-1"
                  loading={busy}
                  disabled={!extendUntil}
                  onClick={() => extendBatch(row.batchId, pendingIds)}
                >
                  Продлить
                </Button>
                <Button variant="secondary" onClick={() => setExtendBatchId(null)}>Отмена</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
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
          {user && <RegistryExportButton role="client" user={user} />}
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

      {/* Главное действие клиента. Пока заявок нет вообще — занимает основную
          часть экрана вместо пустой таблицы и статистики из нулей. */}
      {!loading && (
        <PromoCallout
          variant={hasNoOrders ? 'hero' : 'compact'}
          title="Разместить заявку на перевозку"
          description={hasNoOrders
            ? 'Опишите маршрут, контейнер и дату — перевозчики увидят заявку в ленте и откликнутся. Это займёт пару минут.'
            : 'Пара минут — и заявка в ленте перевозчиков'}
          href="/orders/new"
          cta={hasNoOrders ? 'Разместить заявку' : 'Разместить'}
          className={hasNoOrders ? 'mb-5' : 'mb-5'}
        />
      )}

      {hasNoOrders ? null : (
      <>
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
                  ? 'text-accent shadow-[inset_0_-2px_0_#0E6E6E]'
                  : 'text-ink-3 hover:text-ink'
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
              'flex items-center gap-2 px-3 h-9 rounded-card text-sm transition-colors',
              hasAllFilters
                ? 'bg-accent text-white'
                : 'bg-surface border border-hairline text-ink-2 hover:border-border-strong'
            )}
          >
            <Filter size={14} />
            Фильтры{hasAllFilters ? ` (${[allFilterStatus, allFilterContainer, allFilterFrom, allFilterTo, allFilterDate].filter(Boolean).length})` : ''}
          </button>

          {showAllFilters && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-surface rounded-card border border-hairline">
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
              <div className="flex flex-col gap-1.5">
                <label className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Откуда</label>
                <input
                  type="text"
                  value={allFilterFrom}
                  onChange={e => setAllFilterFrom(e.target.value)}
                  placeholder="Город отправления"
                  className="w-full h-9 px-3 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Куда</label>
                <input
                  type="text"
                  value={allFilterTo}
                  onChange={e => setAllFilterTo(e.target.value)}
                  placeholder="Город назначения"
                  className="w-full h-9 px-3 text-sm rounded-field border border-hairline bg-surface text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Дата погрузки</label>
                <input
                  type="date"
                  value={allFilterDate}
                  onChange={e => setAllFilterDate(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-field border border-hairline bg-surface text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
                />
              </div>
              {hasAllFilters && (
                <div className="flex items-end">
                  <button
                    onClick={() => { setAllFilterStatus(''); setAllFilterContainer(''); setAllFilterFrom(''); setAllFilterTo(''); setAllFilterDate('') }}
                    className="text-sm text-danger hover:text-danger/80 underline"
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
            {displayRows.map(row => row.kind === 'order' ? renderOrderRow(row.order) : renderBatchRow(row))}
          </div>
        </div>
      )}

      </>
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
