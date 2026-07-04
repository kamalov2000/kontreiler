'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, User, CheckCircle,
  MoreVertical, X, Edit2, Copy, RotateCcw, Ban, Star, Banknote,
  MapPin, Timer, Weight, TrendingDown, TrendingUp, FileText, Navigation,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderDocuments } from '@/components/orders/OrderDocuments'
import { TrackingDrawer } from '@/components/orders/TrackingDrawer'
import { RevealPhone } from '@/components/ui/RevealPhone'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { StatusPill } from '@/components/ui/StatusPill'
import { ContainerChip } from '@/components/ui/ContainerChip'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, Response, Review, Bid, OrderStatus, ContainerType, VatType, OrderStop } from '@/types/database'
import { formatDateWithTime, formatDateTime, formatPrice, formatOrderNumber, readyDateBadge } from '@/lib/utils'
import { CONTAINER_TYPES, REF_CONTAINER_TYPES, CONTAINER_TARE_WEIGHT, CONTAINER_UNIT_TARE } from '@/lib/cities'
import { TRACKING_STEPS, getTrackingStepIndex } from '@/lib/tracking'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Задача 8: после статуса "Доставлено" любые изменения запрещены —
// поэтому откат из delivered недоступен.
const PREV_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  matched:    'active',
  in_transit: 'matched',
}

const REVERT_LABEL: Partial<Record<OrderStatus, string>> = {
  matched:    '← Вернуть: "Новая"',
  in_transit: '← Вернуть: "Перевозчик найден"',
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="p-0.5 transition-colors"
        >
          <Star
            size={28}
            className={`transition-colors ${star <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
          />
        </button>
      ))}
    </div>
  )
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return <span className="text-red-600 font-medium text-sm">Истекла</span>

  const totalMinutes = Math.floor(diff / 60000)
  const days    = Math.floor(totalMinutes / 1440)
  const hours   = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const isUrgent = diff < 24 * 60 * 60 * 1000

  let label = ''
  if (days > 0)       label = `${days} д ${hours} ч`
  else if (hours > 0) label = `${hours} ч ${minutes} мин`
  else                label = `${minutes} мин`

  return (
    <span className={cn('flex items-center gap-1.5 font-medium text-sm', isUrgent ? 'text-red-600' : 'text-amber-700')}>
      <Timer size={14} />
      Истекает через {label}
    </span>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()
  const { t } = useLanguage()
  const [order, setOrder] = useState<Order | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [carrierRatings, setCarrierRatings] = useState<Record<string, { avg: number; count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [statusChanging, setStatusChanging] = useState(false)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editFrom, setEditFrom] = useState('')
  const [editVia, setEditVia] = useState('')
  const [editTo, setEditTo] = useState('')
  const [editContainer, setEditContainer] = useState<ContainerType>('20ft')
  const [editDate, setEditDate] = useState('')
  const [editReadyTime, setEditReadyTime] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editNegotiable, setEditNegotiable] = useState(false)
  const [editUrgent, setEditUrgent] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editGenset, setEditGenset] = useState(false)
  const [editVatType, setEditVatType] = useState<VatType>('none')
  const [editWeightGross, setEditWeightGross] = useState('')
  const [editWeightNet, setEditWeightNet] = useState('')
  const [editExpiresAt, setEditExpiresAt] = useState('')

  // Agreed price modal
  const [agreedPriceOpen, setAgreedPriceOpen] = useState(false)
  const [pendingCarrierId, setPendingCarrierId] = useState<string | null>(null)
  const [agreedPriceInput, setAgreedPriceInput] = useState('')

  const [showReviewModal, setShowReviewModal] = useState(false)

  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Bids (for auction/reduction orders)
  const [bids, setBids] = useState<(Bid & { carrier?: { name: string | null; is_verified?: boolean } })[]>([])
  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)
  const [stops, setStops] = useState<OrderStop[]>([])
  const [downloadingContract, setDownloadingContract] = useState(false)

  // Edit modal — stops
  const [editStops, setEditStops] = useState<{id?: string; address: string; comment: string}[]>([])

  // Carrier respond
  const [respondOpen, setRespondOpen] = useState(false)
  const [respondMessage, setRespondMessage] = useState('')
  const [respondLoading, setRespondLoading] = useState(false)

  // Tracking drawer
  const [trackingDrawerOpen, setTrackingDrawerOpen] = useState(false)

  const isOwner = user?.id === order?.client_id

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const { data: orderData } = await supabase
        .from('orders')
        .select('*, client:users!client_id(*)')
        .eq('id', id)
        .single()

      if (!orderData) { router.push('/dashboard'); return }
      setOrder(orderData as Order)

      const { data: stopsData } = await supabase
        .from('order_stops')
        .select('*')
        .eq('order_id', id)
        .order('sort_order', { ascending: true })
      setStops((stopsData || []) as OrderStop[])

      if (orderData.format === 'reduction' || orderData.format === 'auction') {
        const { data: bidsData } = await supabase
          .from('bids')
          .select('*, carrier:users!carrier_id(name, is_verified)')
          .eq('order_id', id)
          .order('created_at', { ascending: false })
        setBids((bidsData || []) as (Bid & { carrier?: { name: string | null; is_verified?: boolean } })[])
      }

      const { data: responsesData } = await supabase
        .from('responses')
        .select('*, carrier:users!carrier_id(*)')
        .eq('order_id', id)
        .order('created_at', { ascending: false })
      setResponses((responsesData || []) as Response[])

      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('*, reviewer:users!reviewer_id(name), reviewee:users!reviewee_id(name)')
        .eq('order_id', id)
      setReviews((reviewsData || []) as Review[])

      if (responsesData && responsesData.length > 0) {
        const carrierIds = responsesData.map((r: Response) => r.carrier_id)
        const { data: allReviews } = await supabase
          .from('reviews')
          .select('reviewee_id, rating')
          .in('reviewee_id', carrierIds)

        if (allReviews) {
          const ratings: Record<string, { sum: number; count: number }> = {}
          for (const rv of allReviews) {
            if (!ratings[rv.reviewee_id]) ratings[rv.reviewee_id] = { sum: 0, count: 0 }
            ratings[rv.reviewee_id].sum += rv.rating
            ratings[rv.reviewee_id].count += 1
          }
          const computed: Record<string, { avg: number; count: number }> = {}
          for (const [uid, { sum, count }] of Object.entries(ratings)) {
            computed[uid] = { avg: Math.round((sum / count) * 10) / 10, count }
          }
          setCarrierRatings(computed)
        }
      }
      setLoading(false)
    }
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Realtime: обновляем трекинг и статус заказа в реальном времени
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`order-detail-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${id}`,
      }, (payload) => {
        setOrder(prev => prev ? { ...prev, ...payload.new } : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  function openEdit() {
    if (!order) return
    setEditFrom(order.from_city)
    setEditVia(order.via_city || '')
    setEditTo(order.to_city)
    setEditContainer(order.container_type)
    setEditDate(order.ready_date)
    setEditReadyTime(order.ready_time || '')
    setEditPrice(order.price ? String(order.price) : '')
    setEditNegotiable(order.is_negotiable)
    setEditUrgent(order.is_urgent)
    setEditNotes(order.notes || '')
    setEditGenset(order.requires_genset)
    setEditVatType(order.vat_type || 'none')
    setEditWeightGross(order.weight_gross ? String(order.weight_gross) : '')
    setEditWeightNet(order.weight_net ? String(order.weight_net) : '')
    setEditExpiresAt(order.expires_at ? order.expires_at.slice(0, 16) : '')
    setEditStops(stops.map(s => ({ id: s.id, address: s.address, comment: s.comment || '' })))
    setEditOpen(true)
    setMenuOpen(false)
  }

  // Задача 8: человекочитаемый список корректировок для уведомления перевозчику
  function buildChangeSummary(): string[] {
    if (!order) return []
    const changes: string[] = []
    const priceLabel = (price: number | null, negotiable: boolean) =>
      negotiable ? 'Договорная' : (price ? `${price.toLocaleString('ru-RU')} ₽` : '—')
    const containerName = (v: string) => CONTAINER_TYPES.find(c => c.value === v)?.label || v

    if (editFrom !== order.from_city) changes.push(`Откуда: «${order.from_city}» → «${editFrom}»`)
    if ((editVia || '') !== (order.via_city || '')) changes.push(`Промежуточная точка: «${order.via_city || '—'}» → «${editVia || '—'}»`)
    if (editTo !== order.to_city) changes.push(`Куда: «${order.to_city}» → «${editTo}»`)
    if (editContainer !== order.container_type) changes.push(`Контейнер: «${containerName(order.container_type)}» → «${containerName(editContainer)}»`)
    if (editDate !== order.ready_date) changes.push(`Плановая дата: ${order.ready_date} → ${editDate}`)
    if ((editReadyTime || '') !== (order.ready_time || '')) changes.push(`Время: «${order.ready_time || '—'}» → «${editReadyTime || '—'}»`)

    const newPrice = editNegotiable ? null : (parseInt(editPrice) || null)
    if (newPrice !== order.price || editNegotiable !== order.is_negotiable) {
      changes.push(`Ставка: ${priceLabel(order.price, order.is_negotiable)} → ${priceLabel(newPrice, editNegotiable)}`)
    }
    if (editVatType !== (order.vat_type || 'none')) changes.push(`НДС: ${order.vat_type || 'none'} → ${editVatType}`)
    if (editUrgent !== order.is_urgent) changes.push(editUrgent ? 'Отмечена как срочная' : 'Снята отметка «срочная»')
    if (editGenset !== order.requires_genset) changes.push(editGenset ? 'Добавлено требование Genset' : 'Снято требование Genset')

    const newGross = editWeightGross ? parseInt(editWeightGross) : null
    const newNet = editWeightNet ? parseInt(editWeightNet) : null
    if (newGross !== order.weight_gross) changes.push(`Вес брутто: ${order.weight_gross ?? '—'} → ${newGross ?? '—'} кг`)
    if (newNet !== order.weight_net) changes.push(`Вес нетто: ${order.weight_net ?? '—'} → ${newNet ?? '—'} кг`)

    const newExpires = editExpiresAt ? new Date(editExpiresAt).toISOString() : null
    if (newExpires !== order.expires_at) changes.push('Изменён срок действия заявки')
    if ((editNotes.trim() || null) !== (order.notes || null)) changes.push('Изменены особые условия')

    const oldStops = stops.map(s => `${s.address}|${s.comment || ''}`).join('§')
    const newStops = editStops.filter(s => s.address.trim()).map(s => `${s.address.trim()}|${s.comment.trim()}`).join('§')
    if (oldStops !== newStops) changes.push('Изменены дополнительные точки маршрута')

    return changes
  }

  async function saveEdit() {
    if (!order) return
    // Задача 8: запрет любых изменений после статуса «Доставлено»
    if (['delivered', 'closed', 'cancelled'].includes(order.status)) {
      toast.error('Заявку в этом статусе изменить нельзя')
      setEditOpen(false)
      return
    }
    const changeSummary = buildChangeSummary()
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({
        from_city: editFrom,
        via_city: editVia || null,
        to_city: editTo,
        container_type: editContainer,
        ready_date: editDate,
        ready_time: editReadyTime || null,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable,
        is_urgent: editUrgent,
        format: (order.format === 'auction' || order.format === 'reduction')
          ? order.format
          : editUrgent ? 'urgent' : 'regular',
        notes: editNotes.trim() || null,
        requires_genset: editGenset,
        vat_type: editVatType,
        weight_gross: editWeightGross ? parseInt(editWeightGross) : null,
        weight_net: editWeightNet ? parseInt(editWeightNet) : null,
        expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
      })
      .eq('id', order.id)

    const newFormat = (order.format === 'auction' || order.format === 'reduction')
      ? order.format
      : editUrgent ? 'urgent' : 'regular'

    if (error) {
      toast.error('Ошибка при сохранении')
    } else {
      // Update stops: delete old, insert new
      await supabase.from('order_stops').delete().eq('order_id', order.id)
      const validStops = editStops.filter(s => s.address.trim())
      if (validStops.length > 0) {
        await supabase.from('order_stops').insert(
          validStops.map((s, i) => ({
            order_id: order.id,
            address: s.address.trim(),
            comment: s.comment.trim() || null,
            sort_order: i,
          }))
        )
      }
      setStops(validStops.map((s, i) => ({
        id: s.id || `temp-${i}`,
        order_id: order.id,
        address: s.address.trim(),
        comment: s.comment.trim() || null,
        sort_order: i,
        created_at: new Date().toISOString(),
      })))

      toast.success('Заявка обновлена')
      setOrder(prev => prev ? {
        ...prev,
        from_city: editFrom, via_city: editVia || null, to_city: editTo,
        container_type: editContainer, ready_date: editDate, ready_time: editReadyTime || null,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable, is_urgent: editUrgent,
        format: newFormat,
        notes: editNotes.trim() || null,
        requires_genset: editGenset, vat_type: editVatType,
        weight_gross: editWeightGross ? parseInt(editWeightGross) : null,
        weight_net: editWeightNet ? parseInt(editWeightNet) : null,
        expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
      } : prev)

      // Задача 8: Уведомить перевозчика(ов) о корректировке заявки с деталями.
      // Вставку уведомлений делает сервер (service_role) — таблица notifications
      // защищена RLS и не принимает клиентский INSERT.
      if (changeSummary.length > 0) {
        const numLabel = order.order_number ? formatOrderNumber(order.order_number) : order.id.slice(0, 8)
        const message = `Клиент скорректировал заявку ${numLabel}:\n• ${changeSummary.join('\n• ')}`
        fetch('/api/orders/notify-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, message }),
        }).catch(() => {})
      }

      setEditOpen(false)
    }
    setSaving(false)
  }

  async function handleDownloadContract() {
    if (!order) return
    setDownloadingContract(true)
    try {
      const res = await fetch(`/api/generate-contract?order_id=${order.id}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Ошибка генерации договора')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dogovor-${order.order_number || order.id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Ошибка при скачивании договора')
    } finally {
      setDownloadingContract(false)
    }
  }

  async function handleRespond() {
    if (!user || !order) return
    setRespondLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('responses').insert({
      order_id: order.id,
      carrier_id: user.id,
      message: respondMessage.trim() || null,
    })
    if (error) {
      if (error.code === '23505') {
        toast.error('Вы уже откликались на эту заявку')
      } else {
        toast.error('Ошибка при отклике')
      }
    } else {
      toast.success('Отклик отправлен!')
      setResponses(prev => [...prev, {
        id: crypto.randomUUID(),
        order_id: order.id,
        carrier_id: user.id,
        message: respondMessage.trim() || null,
        created_at: new Date().toISOString(),
        carrier: { ...user },
      } as Response & { carrier: typeof user }])
      setRespondOpen(false)
      setRespondMessage('')
      fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new_response', orderId: order.id, carrierId: user.id }),
      }).catch(() => {})
    }
    setRespondLoading(false)
  }

  async function revertStatus() {
    if (!order) return
    setMenuOpen(false)
    const prevStatus = PREV_STATUS[order.status]
    if (!prevStatus) return
    setStatusChanging(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { status: prevStatus }
    if (order.status === 'matched') update.accepted_carrier_id = null
    const { error } = await supabase.from('orders').update(update).eq('id', order.id)
    if (error) {
      toast.error('Ошибка при откате статуса')
    } else {
      const labels: Record<string, string> = {
        active: 'Статус сброшен в "Новая"',
        matched: 'Статус сброшен в "Перевозчик найден"',
        in_transit: 'Статус сброшен в "В пути"',
      }
      toast.success(labels[prevStatus] || 'Статус обновлён')
      setOrder(prev => prev ? { ...prev, status: prevStatus, ...(update.accepted_carrier_id === null ? { accepted_carrier_id: null } : {}) } : prev)
    }
    setStatusChanging(false)
  }

  async function reopenOrder() {
    if (!order) return
    setMenuOpen(false)
    setStatusChanging(true)
    const supabase = createClient()
    const { error } = await supabase.from('orders').update({ status: 'active' }).eq('id', order.id)
    if (error) toast.error('Ошибка при переоткрытии заявки')
    else { toast.success('Заявка переоткрыта'); setOrder(prev => prev ? { ...prev, status: 'active' } : prev) }
    setStatusChanging(false)
  }

  async function cancelOrder() {
    if (!order) return
    setMenuOpen(false)
    setStatusChanging(true)
    const supabase = createClient()
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (error) toast.error('Ошибка при отмене заявки')
    else {
      toast.success('Заявка отменена')
      setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev)
      if (order.accepted_carrier_id) {
        fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'order_cancelled', orderId: order.id, carrierId: order.accepted_carrier_id }),
        }).catch(() => {})
      }
    }
    setStatusChanging(false)
  }

  function duplicateOrder() {
    if (!order) return
    setMenuOpen(false)
    const qs = new URLSearchParams({
      from: order.from_city, to: order.to_city,
      container: order.container_type, date: order.ready_date,
      ...(order.price ? { price: String(order.price) } : {}),
      ...(order.is_negotiable ? { negotiable: '1' } : {}),
      ...(order.is_urgent ? { urgent: '1' } : {}),
      ...(order.notes ? { notes: order.notes } : {}),
    })
    router.push(`/orders/new?${qs}`)
  }


  function openAcceptModal(carrierId: string) {
    setPendingCarrierId(carrierId)
    setAgreedPriceInput(order?.price ? String(order.price) : '')
    setAgreedPriceOpen(true)
  }

  async function confirmAccept() {
    if (!order || !pendingCarrierId) return
    setAgreedPriceOpen(false)
    setAcceptingId(pendingCarrierId)
    const supabase = createClient()
    const agreedPrice = agreedPriceInput ? parseInt(agreedPriceInput) : null
    const { error } = await supabase
      .from('orders')
      .update({ accepted_carrier_id: pendingCarrierId, status: 'matched', agreed_price: agreedPrice })
      .eq('id', order.id)

    if (error) { toast.error('Ошибка при выборе перевозчика'); setAcceptingId(null); return }

    toast.success('Перевозчик выбран! Перейдите в чат для согласования деталей.')
    setOrder(prev => prev ? { ...prev, accepted_carrier_id: pendingCarrierId, status: 'matched', agreed_price: agreedPrice } : prev)
    setAcceptingId(null)
    setPendingCarrierId(null)

    fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'response_accepted', orderId: order.id, carrierId: pendingCarrierId }),
    }).catch(() => {})
  }

  async function changeStatus(newStatus: 'in_transit' | 'delivered' | 'closed') {
    if (!order) return
    setStatusChanging(true)
    const supabase = createClient()
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', order.id)
    if (error) {
      toast.error('Ошибка при обновлении статуса')
    } else {
      if (newStatus === 'delivered') {
        setTimeout(() => setShowReviewModal(true), 600)
        if (order.accepted_carrier_id) {
          fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'order_delivered', orderId: order.id, carrierId: order.accepted_carrier_id }),
          }).catch(() => {})
        }
      }
      const labels: Record<string, string> = {
        in_transit: 'Статус: В пути',
        delivered:  'Статус: Доставлено',
        closed:     'Заявка закрыта',
      }
      toast.success(labels[newStatus])
      if (newStatus === 'closed') {
        router.push('/dashboard')
      } else {
        setOrder(prev => prev ? { ...prev, status: newStatus } : prev)
      }
    }
    setStatusChanging(false)
  }

  const myReview = reviews.find(r => r.reviewer_id === user?.id)
  const canReview = order?.status === 'delivered' && !myReview && (
    (isOwner && !!order?.accepted_carrier_id) ||
    (!isOwner && user?.id === order?.accepted_carrier_id)
  )
  const revieweeId = isOwner ? order?.accepted_carrier_id : order?.client_id

  async function submitReview() {
    if (!order || !user || !revieweeId || reviewRating === 0) { toast.error('Выберите оценку'); return }
    setSubmittingReview(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('reviews').insert({
      order_id: order.id,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating: reviewRating,
      comment: reviewComment.trim() || null,
    }).select('*, reviewer:users!reviewer_id(name), reviewee:users!reviewee_id(name)').single()

    if (error) {
      toast.error('Ошибка при отправке отзыва')
    } else {
      toast.success('Отзыв отправлен!')
      setReviews(prev => [...prev, data as Review])
      setReviewRating(0)
      setReviewComment('')
    }
    setSubmittingReview(false)
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  async function placeBid() {
    if (!order || !user || !bidAmount) return
    const amount = parseInt(bidAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Введите корректную сумму'); return }
    setBidLoading(true)
    const supabase = createClient()
    const { data: newBid, error } = await supabase
      .from('bids')
      .insert({ order_id: order.id, carrier_id: user.id, amount })
      .select('*, carrier:users!carrier_id(name)')
      .single()
    setBidLoading(false)
    if (error) {
      const msg = error.message || ''
      if (msg.includes('bid_too_high')) toast.error(t.auctions.bidTooHigh)
      else if (msg.includes('bid_too_low')) toast.error(t.auctions.bidTooLow)
      else if (msg.includes('auction_ended')) toast.error(t.auctions.auctionEnded)
      else if (msg.includes('bid_wrong_step')) { const step = msg.split(':')[1]; toast.error(`Шаг торгов: ${parseInt(step).toLocaleString('ru-RU')} ₽`) }
      else toast.error(msg || 'Ошибка при ставке')
      return
    }
    toast.success(t.auctions.bidSuccess)
    setBidAmount('')
    if (newBid) setBids(prev => [newBid as Bid & { carrier?: { name: string | null } }, ...prev])
  }

  if (!order) return null

  const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label
  const isMatched = order.status === 'matched'
  const acceptedResponse = responses.find(r => r.carrier_id === order.accepted_carrier_id)
  const statusLabel = t.status[order.status as keyof typeof t.status] ?? order.status

  const canRevert = isOwner && !!PREV_STATUS[order.status]
  const canReopen = isOwner && (order.status === 'closed' || order.status === 'cancelled' || order.status === 'expired')
  const canCancel = isOwner && ['active', 'matched', 'in_transit'].includes(order.status)
  // Задача 8: правки разрешены до «Доставлено» включительно (active/matched/in_transit),
  // после доставки/закрытия/отмены — запрещены
  const canEdit   = isOwner && ['active', 'matched', 'in_transit'].includes(order.status)
  const today     = new Date().toISOString().split('T')[0]

  const vatLabel = order.vat_type === 'vat20' ? 'с НДС 22%'
    : order.vat_type === 'vat15' ? 'с НДС 15%'
    : order.vat_type === 'vat5'  ? 'с НДС 5%'
    : order.vat_type === 'vat0'  ? 'НДС 0%'
    : 'Без НДС'

  return (
    <AppLayout>
      <div className="max-w-3xl">
        {/* Навигация */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink transition-colors ease-terminal">
            <ArrowLeft size={16} /> Назад
          </button>
        </div>

        {/* Карточка заявки */}
        <div className={cn(
          'bg-surface rounded-card border p-6 mb-6',
          order.is_urgent ? 'border-danger/40' : 'border-hairline'
        )}>
          {/* Номер + статус + управление */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex flex-col gap-2.5">
              {order.order_number && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Заявка</span>
                  <span className="font-mono text-[26px] leading-none font-medium tabular-nums text-ink">
                    {formatOrderNumber(order.order_number)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {order.format === 'urgent' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-field bg-danger-soft text-danger text-[11.5px] font-semibold tracking-[0.06em] uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger" /> Срочно
                  </span>
                )}
                {order.format === 'reduction' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-field bg-warning-soft text-warning text-[11.5px] font-semibold tracking-[0.06em] uppercase">
                    <TrendingDown size={12} /> {t.order.formatReduction}
                  </span>
                )}
                {order.format === 'auction' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-field bg-accent-soft text-accent text-[11.5px] font-semibold tracking-[0.06em] uppercase">
                    <TrendingUp size={12} /> {t.order.formatAuction}
                  </span>
                )}
                <StatusPill status={order.status} kind="order" label={statusLabel} />
                {order.requires_genset && (
                  <ContainerChip label="Genset" genset />
                )}
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* Если трекинг НЕ включён — клиент управляет статусами вручную */}
              {isOwner && !order.tracking_enabled && order.status === 'matched' && (
                <Button size="sm" loading={statusChanging} onClick={() => changeStatus('in_transit')}>
                  В пути
                </Button>
              )}
              {isOwner && !order.tracking_enabled && order.status === 'in_transit' && (
                <Button size="sm" loading={statusChanging} onClick={() => changeStatus('delivered')}>
                  Доставлено
                </Button>
              )}

              {/* Пункт 2: 3 полноценные кнопки вместо меню */}
              {isOwner && canEdit && (
                <Button variant="secondary" size="sm" onClick={openEdit}>
                  <Edit2 size={14} className="mr-1" /> Редактировать
                </Button>
              )}
              {isOwner && (
                <Button variant="secondary" size="sm" onClick={duplicateOrder}>
                  <Copy size={14} className="mr-1" /> Дублировать
                </Button>
              )}
              {isOwner && canCancel && (
                <Button variant="danger" size="sm" loading={statusChanging} onClick={cancelOrder}>
                  <Ban size={14} className="mr-1" /> Отменить заявку
                </Button>
              )}

              {isOwner && (canRevert || canReopen) && (
                <div ref={menuRef} className="relative">
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="p-2 rounded-card text-ink-3 hover:bg-surface-sunken hover:text-ink transition-colors ease-terminal"
                    title="Дополнительно"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-hairline rounded-card shadow-overlay z-50 overflow-hidden">
                      {canRevert && (
                        <button onClick={revertStatus} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-warning hover:bg-warning-soft transition-colors ease-terminal">
                          <RotateCcw size={15} /> {REVERT_LABEL[order.status]}
                        </button>
                      )}
                      {canReopen && (
                        <button onClick={reopenOrder} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-accent hover:bg-accent-soft transition-colors ease-terminal">
                          <RotateCcw size={15} /> Переоткрыть заявку
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Дополнительные точки над маршрутом */}
          {stops.length > 0 && (
            <div className="mb-4 space-y-1.5">
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Дополнительные точки</div>
              {stops.map((s, i) => (
                <div key={s.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-soft text-accent flex items-center justify-center font-mono text-[11px] font-medium shrink-0">{i + 1}</span>
                  <div>
                    <span className="font-medium text-ink">{s.address}</span>
                    {s.comment && <span className="text-ink-3"> — {s.comment}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Герой-маршрут: крупные города, пунктирная рельса, узел via с accent-кольцом */}
          <div className="mb-6">
            <div className="flex items-stretch gap-3 flex-col sm:flex-row sm:items-center">
              {/* Точка А */}
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-2 w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
                <div className="min-w-0">
                  <div className="text-[28px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">{order.from_city}</div>
                  {order.from_city_address && (
                    <div className="flex items-center gap-1 text-[13px] text-ink-3 mt-1">
                      <MapPin size={12} className="shrink-0" />
                      {order.from_city_address}
                    </div>
                  )}
                </div>
              </div>

              {/* Рельса */}
              <div className="hidden sm:flex items-center flex-none px-1 self-start mt-4 min-w-[36px]">
                <span className="w-8 rail" />
              </div>

              {/* Точка Б (если есть) — узел via с accent-кольцом */}
              {order.via_city && (
                <>
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-2.5 w-3 h-3 rounded-full bg-surface border-2 border-accent ring-2 ring-accent-soft shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[22px] leading-[1.1] font-semibold tracking-[-0.01em] text-ink-2">{order.via_city}</div>
                      {order.via_city_address && (
                        <div className="flex items-center gap-1 text-[13px] text-ink-3 mt-1">
                          <MapPin size={12} className="shrink-0" />
                          {order.via_city_address}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center flex-none px-1 self-start mt-4 min-w-[36px]">
                    <span className="w-8 rail" />
                  </div>
                </>
              )}

              {/* Точка В */}
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-2 w-2.5 h-2.5 rounded-full bg-success shrink-0" />
                <div className="min-w-0">
                  <div className="text-[28px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">{order.to_city}</div>
                  {order.to_city_address && (
                    <div className="flex items-center gap-1 text-[13px] text-ink-3 mt-1">
                      <MapPin size={12} className="shrink-0" />
                      {order.to_city_address}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Волосяной разделитель */}
          <div className="border-t border-hairline mb-5" />

          {/* Сетка параметров */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5 mb-5">
            <div>
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Контейнер</div>
              <ContainerChip label={containerLabel || order.container_type} />
            </div>
            {/* Пункт 10: для аукционов — начальная ставка вместо обычной цены */}
            {order.format === 'reduction' || order.format === 'auction' ? (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Начальная ставка</div>
                <div className="font-mono text-xl font-medium tabular-nums text-ink">{order.auction_start_price?.toLocaleString('ru-RU')} ₽</div>
              </div>
            ) : (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Ставка</div>
                <div className="font-mono text-xl font-medium tabular-nums text-ink">{formatPrice(order.price, order.is_negotiable)}</div>
                <div className="text-[11px] font-medium text-ink-4 mt-0.5">{vatLabel}</div>
              </div>
            )}
            {/* Плановая дата погрузки/выгрузки */}
            <div>
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Дата погрузки/выгрузки</div>
              <div className="font-mono text-[15px] tabular-nums text-ink">{formatDateWithTime(order.ready_date, order.ready_time)}</div>
              {(() => {
                const badge = readyDateBadge(order.ready_date)
                if (!badge) return null
                const colorClass = badge.color === 'red' ? 'text-danger' : badge.color === 'amber' ? 'text-warning' : 'text-success'
                return <div className={`text-[11px] font-medium mt-0.5 ${colorClass}`}>{badge.label}</div>
              })()}
              {order.arrival_time && (
                <div className="text-[11px] text-ink-3 mt-0.5 font-mono tabular-nums">Прибытие ТС: {order.arrival_time.slice(0, 5)}</div>
              )}
            </div>
            {(order.weight_gross || order.weight_net || order.weight_gross_2 || order.weight_net_2) && (
              <div className="col-span-2 sm:col-span-1">
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5 flex items-center gap-1"><Weight size={12} /> Вес</div>
                {order.container_type === '20DC2' ? (
                  <div className="space-y-0.5 text-[13px] text-ink-2">
                    {order.weight_gross && <div>Конт. 1 с тарой: <strong className="font-mono tabular-nums text-ink">{(order.weight_gross + (CONTAINER_UNIT_TARE['20DC2'] ?? 2200)).toLocaleString('ru-RU')} кг</strong></div>}
                    {order.weight_net   && <div>Конт. 1 нетто: <strong className="font-mono tabular-nums text-ink">{order.weight_net.toLocaleString('ru-RU')} кг</strong></div>}
                    {order.weight_gross_2 && <div className="mt-1">Конт. 2 с тарой: <strong className="font-mono tabular-nums text-ink">{(order.weight_gross_2 + (CONTAINER_UNIT_TARE['20DC2'] ?? 2200)).toLocaleString('ru-RU')} кг</strong></div>}
                    {order.weight_net_2   && <div>Конт. 2 нетто: <strong className="font-mono tabular-nums text-ink">{order.weight_net_2.toLocaleString('ru-RU')} кг</strong></div>}
                  </div>
                ) : (
                  <div className="space-y-0.5 text-[13px] text-ink-2">
                    {order.weight_gross && <div>С контейнером: <strong className="font-mono tabular-nums text-ink">{(order.weight_gross + (CONTAINER_TARE_WEIGHT[order.container_type] ?? 0)).toLocaleString('ru-RU')} кг</strong></div>}
                    {order.weight_net   && <div>Нетто: <strong className="font-mono tabular-nums text-ink">{order.weight_net.toLocaleString('ru-RU')} кг</strong></div>}
                  </div>
                )}
              </div>
            )}
            {order.expires_at && (
              <div className="col-span-2">
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Срок действия</div>
                <ExpiryCountdown expiresAt={order.expires_at} />
                <div className="text-[11px] text-ink-4 mt-0.5 font-mono tabular-nums">до {formatDateTime(order.expires_at!)}</div>
              </div>
            )}
          </div>

          {/* Договорная цена */}
          {order.agreed_price && (
            <div className="flex items-center gap-2.5 p-3 rounded-field bg-success-soft border border-success/20 mb-3">
              <Banknote size={16} className="text-success shrink-0" />
              <span className="text-sm font-medium text-success">
                Договорная цена: <span className="font-mono tabular-nums">{order.agreed_price.toLocaleString('ru-RU')} ₽</span>
              </span>
            </div>
          )}

          {/* Простой транспорта */}
          {order.downtime_rate && (
            <div className="flex items-center gap-2 p-3 rounded-field bg-surface-sunken border border-hairline mb-3">
              <span className="text-sm text-ink-2">Простой транспорта:</span>
              <span className="text-sm font-medium text-ink font-mono tabular-nums">{order.downtime_rate.toLocaleString('ru-RU')} ₽/час</span>
            </div>
          )}

          {/* Особые условия */}
          {order.notes && (
            <div className="p-3 rounded-field bg-warning-soft border border-warning/20 mb-3">
              <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-warning mb-1">Особые условия</div>
              <div className="text-sm text-ink-2">{order.notes}</div>
            </div>
          )}

          {/* Блок торгов */}
          {(order.format === 'reduction' || order.format === 'auction') && (
            <div className="mt-5 p-4 rounded-card border border-hairline bg-surface-sunken">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-2">
                  {order.format === 'reduction' ? t.order.formatReduction : t.order.formatAuction}
                </div>
                {order.auction_end_time && (
                  <ExpiryCountdown expiresAt={order.auction_end_time} />
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3 text-sm">
                <div>
                  <span className="text-ink-3">{t.auctions.startPrice}: </span>
                  <strong className="font-mono tabular-nums text-ink">{order.auction_start_price?.toLocaleString('ru-RU')} ₽</strong>
                </div>
                {bids.length > 0 && (
                  <div>
                    <span className="text-ink-3">{t.auctions.bestBid}: </span>
                    <strong className="font-mono tabular-nums text-accent">
                      {(order.format === 'reduction'
                        ? Math.min(...bids.map(b => b.amount))
                        : Math.max(...bids.map(b => b.amount))
                      ).toLocaleString('ru-RU')} ₽
                    </strong>
                  </div>
                )}
                <div className="text-ink-3 font-mono tabular-nums">
                  {bids.length} {t.auctions.bidCount}
                </div>
              </div>

              {/* Форма ставки для перевозчиков */}
              {user?.role === 'carrier' && order.status === 'active' && (
                <div className="flex gap-2">
                  <Input
                    id="bidAmountDetail"
                    type="number"
                    label=""
                    value={bidAmount}
                    onChange={e => setBidAmount(e.target.value)}
                    placeholder={t.auctions.yourBid}
                    min="1"
                  />
                  <Button size="sm" onClick={placeBid} loading={bidLoading} className="shrink-0 self-end mb-0.5">
                    {t.auctions.placeBid}
                  </Button>
                </div>
              )}

              {/* История ставок */}
              {bids.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                  {bids.map(b => (
                    <div key={b.id} className="flex items-center justify-between text-[13px] px-2.5 py-1.5 rounded-field bg-surface border border-hairline">
                      <span className="font-medium text-ink-2 inline-flex items-center gap-1">
                        {b.carrier?.name || 'Перевозчик'}
                        <VerifiedBadge verified={b.carrier?.is_verified} iconOnly />
                      </span>
                      <span className="font-mono tabular-nums text-accent">{b.amount.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-[11px] text-ink-4 mt-5 font-mono tabular-nums">
            Размещено: {formatDateTime(order.created_at)}
          </div>
        </div>

        {/* Выбранный перевозчик */}
        {(isMatched || ['in_transit', 'delivered', 'closed', 'cancelled'].includes(order.status)) && acceptedResponse && (
          <div className="bg-surface border border-hairline rounded-card p-5 mb-6">
            <div className="flex items-center gap-2 mb-2.5">
              <CheckCircle size={16} className="text-accent" />
              <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Выбранный перевозчик</span>
            </div>
            <div className="font-semibold text-ink text-[17px] flex items-center gap-2 flex-wrap">
              {acceptedResponse.carrier?.name}
              <VerifiedBadge verified={acceptedResponse.carrier?.is_verified} />
            </div>
            {acceptedResponse.carrier?.city && (
              <div className="text-sm text-ink-3 mt-0.5">{acceptedResponse.carrier.city}</div>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              <RevealPhone kind="order" id={order.id} targetUserId={order.accepted_carrier_id} />
              <Link
                href={`/orders/${order.id}/chat?carrier=${order.accepted_carrier_id}`}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors ease-terminal"
              >
                Открыть чат
              </Link>
              {(isOwner || user?.id === order.accepted_carrier_id) && (
                <button
                  onClick={handleDownloadContract}
                  disabled={downloadingContract}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-card bg-surface border border-hairline text-ink-2 text-sm font-medium hover:border-border-strong transition-colors ease-terminal disabled:opacity-50"
                >
                  <FileText size={14} />
                  {downloadingContract ? 'Генерация...' : 'Договор-заявка PDF'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Трекинг рейса — задача 5, 10 */}
        {order.tracking_enabled && (isOwner || user?.id === order.accepted_carrier_id) && ['matched', 'in_transit', 'delivered'].includes(order.status) && (
          <div className="border border-hairline rounded-card bg-surface p-5 mb-6">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Navigation size={16} className="text-accent" />
                <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Трекинг рейса</span>
                {order.tracking_status ? (
                  <span className="text-[11.5px] bg-accent-soft text-accent px-2.5 py-1 rounded-field font-semibold tracking-[0.06em] uppercase">
                    {TRACKING_STEPS[getTrackingStepIndex(order.tracking_status)]?.shortLabel ?? order.tracking_status}
                  </span>
                ) : order.status === 'matched' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] bg-surface-sunken text-ink-3 px-2.5 py-1 rounded-field font-semibold tracking-[0.06em] uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-4" /> Не в пути
                  </span>
                ) : null}
              </div>
              <button
                onClick={() => setTrackingDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-card bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors ease-terminal"
              >
                <Navigation size={14} />
                {user?.id === order.accepted_carrier_id && !order.tracking_status && order.status === 'matched'
                  ? 'Начать рейс'
                  : 'Трекинг'}
              </button>
            </div>

            {/* Mini-timeline */}
            {order.tracking_status ? (
              <>
                <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2">
                  {TRACKING_STEPS.map((step, idx) => {
                    const currentIdx = getTrackingStepIndex(order.tracking_status)
                    const isDone = currentIdx >= idx
                    const isCurrent = currentIdx === idx
                    return (
                      <div key={step.value} className="flex items-center gap-1 shrink-0">
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-all ease-terminal',
                          isDone && !isCurrent ? 'bg-accent border-accent text-white' :
                          isCurrent ? 'bg-surface border-accent ring-2 ring-accent-soft text-accent' :
                          'bg-surface border-hairline text-ink-4'
                        )} title={step.label}>
                          {isDone && !isCurrent ? '✓' : isCurrent ? <span>{step.icon}</span> : <span className="text-[9px] font-mono">{idx + 1}</span>}
                        </div>
                        {idx < TRACKING_STEPS.length - 1 && (
                          <div className={cn('w-3 h-0.5', isDone ? 'bg-accent/50' : 'bg-hairline')} />
                        )}
                      </div>
                    )
                  })}
                </div>
                {order.tracking_updated_at && (
                  <div className="text-[11px] text-ink-4 font-mono tabular-nums">
                    Обновлено: {formatDateTime(order.tracking_updated_at)}
                  </div>
                )}
              </>
            ) : order.status === 'matched' ? (
              <p className="text-sm text-ink-3">
                {user?.id === order.accepted_carrier_id
                  ? 'Нажмите «Начать рейс», чтобы запустить трекинг'
                  : 'Ожидаем начала рейса от перевозчика…'}
              </p>
            ) : null}
          </div>
        )}

        {/* Документы */}
        {(isOwner || user?.id === order.accepted_carrier_id || responses.some(r => r.carrier_id === user?.id)) && (
          <OrderDocuments
            orderId={order.id}
            currentUserId={user!.id}
            canUpload={isOwner || user?.id === order.accepted_carrier_id}
          />
        )}

        {/* Отзывы (после доставки) */}
        {order.status === 'delivered' && (
          <div className="mb-6">
            <h2 className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-3">Отзывы</h2>
            {canReview && (
              <div className="bg-surface rounded-card border border-hairline p-5 mb-4">
                <div className="font-medium text-ink mb-3">
                  Оцените {isOwner ? 'перевозчика' : 'клиента'}
                </div>
                <StarRating value={reviewRating} onChange={setReviewRating} />
                <textarea
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  rows={2}
                  maxLength={500}
                  className="mt-3 w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
                />
                <Button onClick={submitReview} loading={submittingReview} className="mt-3 w-full" disabled={reviewRating === 0}>
                  Отправить отзыв
                </Button>
              </div>
            )}
            {reviews.length > 0 && (
              <div className="space-y-3">
                {reviews.map(rv => (
                  <div key={rv.id} className="bg-surface rounded-card border border-hairline p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-ink-2">
                        {rv.reviewer?.name} → {rv.reviewee?.name}
                      </span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} size={14} className={s <= rv.rating ? 'fill-warning text-warning' : 'text-ink-4/40'} />
                        ))}
                      </div>
                    </div>
                    {rv.comment && <p className="text-sm text-ink-2">{rv.comment}</p>}
                    <div className="text-[11px] text-ink-4 mt-1 font-mono tabular-nums">{formatDateTime(rv.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
            {reviews.length === 0 && !canReview && (
              <div className="flex flex-col items-center gap-2 text-center py-8">
                <ContainerMark size={24} className="text-ink-4" />
                <span className="text-sm text-ink-3">Отзывов пока нет</span>
              </div>
            )}
          </div>
        )}

        {/* Кнопка «Откликнуться» для перевозчика */}
        {user?.role === 'carrier' && !isOwner && order.status === 'active' && (
          responses.some(r => r.carrier_id === user.id) ? (
            <div className="flex items-center gap-2 bg-success-soft border border-success/20 rounded-card p-4 mb-4">
              <CheckCircle size={18} className="text-success shrink-0" />
              <span className="text-success text-sm font-medium">Вы уже откликнулись на этот рейс</span>
            </div>
          ) : (
            <div className="bg-surface border border-hairline rounded-card p-5 mb-4">
              <p className="text-[15px] font-semibold text-ink mb-1">Хотите взять этот рейс?</p>
              <p className="text-[13px] text-ink-3 mb-4">Откликнитесь — клиент увидит ваш отклик и свяжется с вами.</p>
              <Button onClick={() => setRespondOpen(true)} className="w-full sm:w-auto">
                Откликнуться на рейс
              </Button>
            </div>
          )
        )}

        {/* Отклики */}
        <div className="flex items-baseline gap-2.5 mb-3">
          <h2 className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Отклики</h2>
          <span className="font-mono text-[13px] tabular-nums text-ink-3">{responses.length}</span>
        </div>

        {responses.length === 0 ? (
          <div className="bg-surface rounded-card border border-hairline flex flex-col items-center gap-3 py-12 px-6 text-center">
            <ContainerMark size={26} className="text-ink-4" />
            <span className="text-[15px] text-ink-3">Пока никто не откликнулся</span>
          </div>
        ) : (
          <div className="space-y-3">
            {responses.map(r => {
              const isAccepted = r.carrier_id === order.accepted_carrier_id
              const canAccept = isOwner && (order.status === 'active' || order.status === 'matched') && !isAccepted
              const rating = carrierRatings[r.carrier_id]
              return (
                <div
                  key={r.id}
                  className={cn(
                    'bg-surface rounded-card border p-4 transition-colors ease-terminal',
                    isAccepted ? 'border-accent/40 shadow-row-active' : 'border-hairline'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                      <User size={18} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-ink">{r.carrier?.name || 'Перевозчик'}</div>
                        <VerifiedBadge verified={r.carrier?.is_verified} />
                        {isAccepted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-accent-soft text-accent text-[11.5px] font-semibold tracking-[0.06em] uppercase">
                            <CheckCircle size={11} /> Выбран
                          </span>
                        )}
                        {rating && (
                          <span className="flex items-center gap-1 text-[12px] text-ink-3 font-mono tabular-nums">
                            <Star size={12} className="fill-warning text-warning" />
                            {rating.avg} ({rating.count})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-ink-3">{r.carrier?.city}</div>
                      {r.message && (
                        <p className="mt-2 text-sm text-ink-2 bg-surface-sunken rounded-field p-2.5">{r.message}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {isOwner && <RevealPhone kind="order" id={order.id} targetUserId={r.carrier_id} />}
                        <Link
                          href={`/orders/${order.id}/chat?carrier=${r.carrier_id}`}
                          className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-card bg-surface border border-hairline text-ink-2 text-sm font-medium hover:border-border-strong transition-colors ease-terminal"
                        >
                          Чат
                        </Link>
                        {canAccept && (
                          <Button
                            size="sm"
                            variant={isMatched ? 'secondary' : 'primary'}
                            loading={acceptingId === r.carrier_id}
                            onClick={() => openAcceptModal(r.carrier_id)}
                          >
                            {isMatched ? 'Перевыбрать' : 'Принять'}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-ink-4 shrink-0 font-mono tabular-nums">{formatDateTime(r.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-modal shadow-overlay w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-hairline">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Редактировать заявку</h2>
              <button onClick={() => setEditOpen(false)} className="p-1.5 rounded-card text-ink-3 hover:bg-surface-sunken transition-colors ease-terminal">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <CityAutocomplete label="Откуда" value={editFrom} onChange={setEditFrom} placeholder="Город отправления" />
              <CityAutocomplete label="Промежуточная точка" value={editVia} onChange={setEditVia} placeholder="Город (необязательно)" />
              <CityAutocomplete label="Куда" value={editTo} onChange={setEditTo} placeholder="Город назначения" />
              <Select
                label="Тип контейнера"
                value={editContainer}
                onChange={e => { setEditContainer(e.target.value as ContainerType); if (!REF_CONTAINER_TYPES.has(e.target.value)) setEditGenset(false) }}
                options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              />
              {REF_CONTAINER_TYPES.has(editContainer) && (
                <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-field border border-warning/30 bg-warning-soft">
                  <input type="checkbox" checked={editGenset} onChange={e => setEditGenset(e.target.checked)} className="w-4 h-4 rounded border-hairline text-accent" />
                  <span className="text-sm text-warning font-medium">{t.order.genset}</span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Дата погрузки/выгрузки" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={today} />
                <Input label="Время (необязательно)" type="time" value={editReadyTime} onChange={e => setEditReadyTime(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t.order.weightGross}
                  type="number"
                  value={editWeightGross}
                  onChange={e => setEditWeightGross(e.target.value)}
                  placeholder="кг"
                  min="0"
                />
                <Input
                  label={t.order.weightNet}
                  type="number"
                  value={editWeightNet}
                  onChange={e => setEditWeightNet(e.target.value)}
                  placeholder="кг"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">Ставка</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={editNegotiable} onChange={e => { setEditNegotiable(e.target.checked); if (e.target.checked) setEditPrice('') }} className="w-4 h-4 rounded border-hairline text-accent" />
                  <span className="text-sm text-ink-2">Договорная</span>
                </label>
                {!editNegotiable && (
                  <Input type="number" placeholder="Ставка в рублях" value={editPrice} onChange={e => setEditPrice(e.target.value)} min="0" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-2">{t.order.vatType}</label>
                <div className="flex gap-2 flex-wrap">
                  {(['none', 'vat5', 'vat15', 'vat20', 'vat0'] as VatType[]).map(v => (
                    <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-field border cursor-pointer transition-colors ease-terminal text-sm ${editVatType === v ? 'border-accent bg-accent-soft text-accent font-medium' : 'border-hairline text-ink-2 hover:border-border-strong'}`}>
                      <input type="radio" name="editVatType" value={v} checked={editVatType === v} onChange={() => setEditVatType(v)} className="sr-only" />
                      {v === 'none' ? t.order.vatNone : v === 'vat5' ? t.order.vatVat5 : v === 'vat15' ? t.order.vatVat15 : v === 'vat20' ? t.order.vatVat20 : t.order.vatVat0}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-2 mb-1.5">Особые условия</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Опасный груз..."
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-field border border-hairline hover:border-border-strong transition-colors ease-terminal">
                <input type="checkbox" checked={editUrgent} onChange={e => setEditUrgent(e.target.checked)} className="w-4 h-4 rounded border-hairline text-danger" />
                <div>
                  <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger" /> Срочная заявка
                  </div>
                  <div className="text-xs text-ink-3">Будет выделена в ленте перевозчиков</div>
                </div>
              </label>
              <Input
                label="Действует до (необязательно)"
                type="datetime-local"
                value={editExpiresAt}
                onChange={e => setEditExpiresAt(e.target.value)}
              />
              {/* Дополнительные точки маршрута */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-ink-2">Доп. точки маршрута</label>
                  <button
                    type="button"
                    onClick={() => setEditStops(prev => [...prev, { address: '', comment: '' }])}
                    className="text-xs text-accent hover:text-accent-hover font-medium"
                  >
                    + Добавить точку
                  </button>
                </div>
                {editStops.length === 0 && (
                  <p className="text-xs text-ink-4 py-1">Нет дополнительных точек</p>
                )}
                <div className="space-y-2">
                  {editStops.map((s, i) => (
                    <div key={i} className="bg-surface-sunken rounded-field p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-ink-3">Точка {i + 1}</span>
                        <button
                          type="button"
                          onClick={() => setEditStops(prev => prev.filter((_, j) => j !== i))}
                          className="text-xs text-danger hover:text-[#8f3229]"
                        >
                          Удалить
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Адрес"
                        value={s.address}
                        onChange={e => setEditStops(prev => prev.map((x, j) => j === i ? { ...x, address: e.target.value } : x))}
                        className="w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
                      />
                      <input
                        type="text"
                        placeholder="Комментарий (необязательно)"
                        value={s.comment}
                        onChange={e => setEditStops(prev => prev.map((x, j) => j === i ? { ...x, comment: e.target.value } : x))}
                        className="w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink-2 placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-hairline">
              <Button onClick={saveEdit} loading={saving} className="flex-1">Сохранить</Button>
              <Button variant="secondary" onClick={() => setEditOpen(false)}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {/* Agreed price modal */}
      {agreedPriceOpen && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-modal shadow-overlay w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-hairline">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Подтвердите стоимость рейса</h2>
              <button onClick={() => { setAgreedPriceOpen(false); setPendingCarrierId(null) }} className="p-1.5 rounded-card text-ink-3 hover:bg-surface-sunken transition-colors ease-terminal">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-ink-2">
                Укажите итоговую договорную стоимость рейса (необязательно). Сумма будет видна обеим сторонам.
              </p>
              <Input label="Сумма (₽)" type="number" value={agreedPriceInput} onChange={e => setAgreedPriceInput(e.target.value)} placeholder="Например: 85000" min="0" />
            </div>
            <div className="flex gap-3 p-5 border-t border-hairline">
              <Button onClick={confirmAccept} className="flex-1">Принять перевозчика</Button>
              <Button variant="secondary" onClick={() => { setAgreedPriceOpen(false); setPendingCarrierId(null) }}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {/* Review prompt modal */}
      {showReviewModal && canReview && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-modal shadow-overlay w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-hairline">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Рейс завершён</h2>
              <button onClick={() => setShowReviewModal(false)} className="p-1.5 rounded-card text-ink-3 hover:bg-surface-sunken transition-colors ease-terminal">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-ink-2">
                Оцените {isOwner ? 'перевозчика' : 'клиента'} — это поможет другим участникам платформы.
              </p>
              <StarRating value={reviewRating} onChange={setReviewRating} />
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="Комментарий (необязательно)"
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
              />
              <div className="flex gap-2">
                <Button onClick={async () => { await submitReview(); setShowReviewModal(false) }} loading={submittingReview} disabled={reviewRating === 0} className="flex-1">
                  Отправить отзыв
                </Button>
                <Button variant="secondary" onClick={() => setShowReviewModal(false)}>Позже</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Tracking Drawer — задача 5 */}
      {order.tracking_enabled && (
        <TrackingDrawer
          open={trackingDrawerOpen}
          onClose={() => setTrackingDrawerOpen(false)}
          order={order}
          isAcceptedCarrier={user?.id === order.accepted_carrier_id}
          isOwner={isOwner}
          onOrderUpdate={(updates) => setOrder(prev => prev ? { ...prev, ...updates } : prev)}
        />
      )}

      {/* Respond modal for carrier */}
      {respondOpen && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-modal shadow-overlay w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-hairline">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">Откликнуться на рейс</h2>
              <button onClick={() => setRespondOpen(false)} className="p-1.5 rounded-card text-ink-3 hover:bg-surface-sunken transition-colors ease-terminal">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-ink-2">
                Добавьте сообщение для клиента — необязательно, но повышает шансы.
              </p>
              <textarea
                value={respondMessage}
                onChange={e => setRespondMessage(e.target.value)}
                placeholder="Например: готов выехать завтра утром, всё подходит"
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 rounded-field border border-hairline bg-surface text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent resize-none"
              />
            </div>
            <div className="flex gap-3 p-5 border-t border-hairline">
              <Button onClick={handleRespond} loading={respondLoading} className="flex-1">Откликнуться</Button>
              <Button variant="secondary" onClick={() => setRespondOpen(false)}>Отмена</Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
