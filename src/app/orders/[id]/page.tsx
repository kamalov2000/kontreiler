'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, User, ArrowRight, CheckCircle,
  MoreVertical, X, Edit2, Copy, RotateCcw, Ban, Star, Banknote,
  MapPin, Timer, Zap, Weight, TrendingDown, TrendingUp,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { OrderDocuments } from '@/components/orders/OrderDocuments'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useLanguage } from '@/contexts/LanguageContext'
import { Order, Response, Review, Bid, OrderStatus, ContainerType, VatType } from '@/types/database'
import { formatDateWithTime, formatDateTime, formatPrice, formatPhone, maskPhone, formatOrderNumber } from '@/lib/utils'
import { CONTAINER_TYPES, REF_CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { ORDER_STATUS_CLASS } from '@/lib/status'
import { cn } from '@/lib/utils'

const PREV_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  matched:    'active',
  in_transit: 'matched',
  delivered:  'in_transit',
}

const REVERT_LABEL: Partial<Record<OrderStatus, string>> = {
  matched:    '← Вернуть: "Новая"',
  in_transit: '← Вернуть: "Перевозчик найден"',
  delivered:  '← Вернуть: "В пути"',
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
  const [editPrice, setEditPrice] = useState('')
  const [editNegotiable, setEditNegotiable] = useState(false)
  const [editUrgent, setEditUrgent] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editGenset, setEditGenset] = useState(false)
  const [editVatType, setEditVatType] = useState<VatType>('none')
  const [editWeightGross, setEditWeightGross] = useState('')
  const [editWeightNet, setEditWeightNet] = useState('')

  // Agreed price modal
  const [agreedPriceOpen, setAgreedPriceOpen] = useState(false)
  const [pendingCarrierId, setPendingCarrierId] = useState<string | null>(null)
  const [agreedPriceInput, setAgreedPriceInput] = useState('')

  const [carrierPhoneRevealed, setCarrierPhoneRevealed] = useState(false)
  const [revealedResponsePhones, setRevealedResponsePhones] = useState<Set<string>>(new Set())
  const [showReviewModal, setShowReviewModal] = useState(false)

  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // Bids (for auction/reduction orders)
  const [bids, setBids] = useState<(Bid & { carrier?: { name: string | null } })[]>([])
  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)

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

      if (orderData.format === 'reduction' || orderData.format === 'auction') {
        const { data: bidsData } = await supabase
          .from('bids')
          .select('*, carrier:users!carrier_id(name)')
          .eq('order_id', id)
          .order('created_at', { ascending: false })
        setBids((bidsData || []) as (Bid & { carrier?: { name: string | null } })[])
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
    setEditPrice(order.price ? String(order.price) : '')
    setEditNegotiable(order.is_negotiable)
    setEditUrgent(order.is_urgent)
    setEditNotes(order.notes || '')
    setEditGenset(order.requires_genset)
    setEditVatType(order.vat_type || 'none')
    setEditWeightGross(order.weight_gross ? String(order.weight_gross) : '')
    setEditWeightNet(order.weight_net ? String(order.weight_net) : '')
    setEditOpen(true)
    setMenuOpen(false)
  }

  async function saveEdit() {
    if (!order) return
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
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable,
        is_urgent: editUrgent,
        notes: editNotes.trim() || null,
        requires_genset: editGenset,
        vat_type: editVatType,
        weight_gross: editWeightGross ? parseInt(editWeightGross) : null,
        weight_net: editWeightNet ? parseInt(editWeightNet) : null,
      })
      .eq('id', order.id)

    if (error) {
      toast.error('Ошибка при сохранении')
    } else {
      toast.success('Заявка обновлена')
      setOrder(prev => prev ? {
        ...prev,
        from_city: editFrom, via_city: editVia || null, to_city: editTo,
        container_type: editContainer, ready_date: editDate,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable, is_urgent: editUrgent,
        notes: editNotes.trim() || null,
        requires_genset: editGenset, vat_type: editVatType,
        weight_gross: editWeightGross ? parseInt(editWeightGross) : null,
        weight_net: editWeightNet ? parseInt(editWeightNet) : null,
      } : prev)
      setEditOpen(false)
    }
    setSaving(false)
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
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
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
  const canEdit   = isOwner && order.status === 'active'
  const today     = new Date().toISOString().split('T')[0]

  const vatLabel = order.vat_type === 'vat20' ? t.order.vatVat20
    : order.vat_type === 'vat0' ? t.order.vatVat0
    : t.order.vatNone

  return (
    <AppLayout>
      <div className="max-w-2xl">
        {/* Навигация */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft size={16} /> Назад
          </button>
        </div>

        {/* Карточка заявки */}
        <div className={cn(
          'bg-white rounded-2xl border shadow-sm p-5 mb-6',
          order.is_urgent ? 'border-red-200' : 'border-gray-100'
        )}>
          {/* Номер + статус + управление */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              {order.order_number && (
                <span className="text-2xl font-black font-mono text-blue-600 tracking-tight">
                  {formatOrderNumber(order.order_number)}
                </span>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {order.format === 'urgent' && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                    🔴 СРОЧНО
                  </span>
                )}
                {order.format === 'reduction' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                    <TrendingDown size={11} /> {t.order.formatReduction}
                  </span>
                )}
                {order.format === 'auction' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
                    <TrendingUp size={11} /> {t.order.formatAuction}
                  </span>
                )}
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold', ORDER_STATUS_CLASS[order.status])}>
                  {statusLabel}
                </span>
                {order.requires_genset && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                    <Zap size={11} /> Genset
                  </span>
                )}
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {isOwner && order.status === 'matched' && (
                <Button size="sm" loading={statusChanging} onClick={() => changeStatus('in_transit')}>
                  В пути
                </Button>
              )}
              {isOwner && order.status === 'in_transit' && (
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
                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    title="Дополнительно"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      {canRevert && (
                        <button onClick={revertStatus} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors">
                          <RotateCcw size={15} className="text-amber-500" /> {REVERT_LABEL[order.status]}
                        </button>
                      )}
                      {canReopen && (
                        <button onClick={reopenOrder} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-50 transition-colors">
                          <RotateCcw size={15} className="text-blue-500" /> Переоткрыть заявку
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Маршрут цепочкой А → Б → В с адресами */}
          <div className="mb-4">
            <div className="flex items-start gap-0 flex-col sm:flex-row sm:items-center">
              {/* Точка А */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center pt-1 shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">{order.from_city}</div>
                  {order.from_city_address && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                      <MapPin size={12} className="shrink-0" />
                      {order.from_city_address}
                    </div>
                  )}
                </div>
              </div>

              <ArrowRight size={18} className="text-gray-300 mx-3 shrink-0 my-2 sm:my-0" />

              {/* Точка Б (если есть) */}
              {order.via_city && (
                <>
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center pt-1 shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-gray-900">{order.via_city}</div>
                      {order.via_city_address && (
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                          <MapPin size={12} className="shrink-0" />
                          {order.via_city_address}
                        </div>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-gray-300 mx-3 shrink-0 my-2 sm:my-0" />
                </>
              )}

              {/* Точка В */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center pt-1 shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">{order.to_city}</div>
                  {order.to_city_address && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                      <MapPin size={12} className="shrink-0" />
                      {order.to_city_address}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Сетка параметров */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Контейнер</div>
              <div className="font-semibold text-gray-900 text-sm">{containerLabel}</div>
            </div>
            {/* Пункт 10: для аукционов — начальная ставка вместо обычной цены */}
            {order.format === 'reduction' || order.format === 'auction' ? (
              <div className="p-3 rounded-xl bg-amber-50">
                <div className="text-xs text-gray-500 mb-0.5">Начальная ставка</div>
                <div className="font-semibold text-amber-700 text-sm">{order.auction_start_price?.toLocaleString('ru-RU')} ₽</div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-gray-50">
                <div className="text-xs text-gray-500 mb-0.5">Ставка</div>
                <div className="font-semibold text-blue-700 text-sm">{formatPrice(order.price, order.is_negotiable)}</div>
                <div className="text-xs text-gray-400 mt-0.5">{vatLabel}</div>
              </div>
            )}
            {/* Пункт 9: дата + время погрузки */}
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Дата погрузки/выгрузки</div>
              <div className="font-semibold text-gray-900 text-sm">{formatDateWithTime(order.ready_date, order.ready_time)}</div>
              {order.arrival_time && (
                <div className="text-xs text-gray-500 mt-0.5">Прибытие ТС: {order.arrival_time.slice(0, 5)}</div>
              )}
            </div>
            {(order.weight_gross || order.weight_net) && (
              <div className="p-3 rounded-xl bg-gray-50">
                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Weight size={11} /> Вес</div>
                {order.weight_gross && <div className="text-xs text-gray-700">Брутто: <strong>{order.weight_gross.toLocaleString('ru-RU')} кг</strong></div>}
                {order.weight_net   && <div className="text-xs text-gray-700">Нетто: <strong>{order.weight_net.toLocaleString('ru-RU')} кг</strong></div>}
              </div>
            )}
            {order.expires_at && (
              <div className="p-3 rounded-xl bg-gray-50 col-span-2 sm:col-span-2">
                <div className="text-xs text-gray-500 mb-1">Срок действия</div>
                <ExpiryCountdown expiresAt={order.expires_at} />
                <div className="text-xs text-gray-400 mt-0.5">до {formatDateWithTime(order.expires_at!)}</div>
              </div>
            )}
          </div>

          {/* Договорная цена */}
          {order.agreed_price && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100 mb-3">
              <Banknote size={16} className="text-green-600 shrink-0" />
              <span className="text-sm font-medium text-green-800">
                Договорная цена: {order.agreed_price.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}

          {/* Особые условия */}
          {order.notes && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 mb-3">
              <div className="text-xs text-amber-600 mb-0.5">Особые условия</div>
              <div className="text-sm text-amber-900">{order.notes}</div>
            </div>
          )}

          {/* Блок торгов */}
          {(order.format === 'reduction' || order.format === 'auction') && (
            <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-amber-900 text-sm">
                  {order.format === 'reduction' ? t.order.formatReduction : t.order.formatAuction}
                </div>
                {order.auction_end_time && (
                  <ExpiryCountdown expiresAt={order.auction_end_time} />
                )}
              </div>
              <div className="flex flex-wrap gap-4 mb-3 text-sm">
                <div>
                  <span className="text-gray-500">{t.auctions.startPrice}: </span>
                  <strong>{order.auction_start_price?.toLocaleString('ru-RU')} ₽</strong>
                </div>
                {bids.length > 0 && (
                  <div>
                    <span className="text-gray-500">{t.auctions.bestBid}: </span>
                    <strong className="text-amber-800">
                      {(order.format === 'reduction'
                        ? Math.min(...bids.map(b => b.amount))
                        : Math.max(...bids.map(b => b.amount))
                      ).toLocaleString('ru-RU')} ₽
                    </strong>
                  </div>
                )}
                <div className="text-gray-500">
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
                    <div key={b.id} className="flex items-center justify-between text-xs text-gray-600 px-2 py-1 rounded-lg bg-white border border-amber-100">
                      <span className="font-medium text-gray-800">{b.carrier?.name || 'Перевозчик'}</span>
                      <span className="font-semibold text-amber-800">{b.amount.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-gray-400 mt-4">
            Размещено: {formatDateTime(order.created_at)}
          </div>
        </div>

        {/* Выбранный перевозчик */}
        {(isMatched || ['in_transit', 'delivered', 'closed', 'cancelled'].includes(order.status)) && acceptedResponse && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} className="text-blue-600" />
              <span className="font-semibold text-blue-900">Выбранный перевозчик</span>
            </div>
            <div className="font-medium text-gray-900">{acceptedResponse.carrier?.name}</div>
            {acceptedResponse.carrier?.city && (
              <div className="text-sm text-gray-500">{acceptedResponse.carrier.city}</div>
            )}
            <div className="mt-3 flex gap-2 flex-wrap">
              {acceptedResponse.carrier?.phone && (
                carrierPhoneRevealed ? (
                  <a
                    href={`tel:${acceptedResponse.carrier.phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                  >
                    <Phone size={14} /> {formatPhone(acceptedResponse.carrier.phone)}
                  </a>
                ) : (
                  <button
                    onClick={() => setCarrierPhoneRevealed(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                  >
                    <Phone size={14} /> {maskPhone(acceptedResponse.carrier.phone)}
                  </button>
                )
              )}
              <Link
                href={`/orders/${order.id}/chat`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                💬 Открыть чат
              </Link>
            </div>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Отзывы</h2>
            {canReview && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
                <div className="font-medium text-gray-900 mb-3">
                  Оцените {isOwner ? 'перевозчика' : 'клиента'}
                </div>
                <StarRating value={reviewRating} onChange={setReviewRating} />
                <textarea
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  rows={2}
                  maxLength={500}
                  className="mt-3 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <Button onClick={submitReview} loading={submittingReview} className="mt-3 w-full" disabled={reviewRating === 0}>
                  Отправить отзыв
                </Button>
              </div>
            )}
            {reviews.length > 0 && (
              <div className="space-y-3">
                {reviews.map(rv => (
                  <div key={rv.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        {rv.reviewer?.name} → {rv.reviewee?.name}
                      </span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} size={14} className={s <= rv.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
                        ))}
                      </div>
                    </div>
                    {rv.comment && <p className="text-sm text-gray-600">{rv.comment}</p>}
                    <div className="text-xs text-gray-400 mt-1">{formatDateTime(rv.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
            {reviews.length === 0 && !canReview && (
              <div className="text-sm text-gray-400 text-center py-4">Отзывов пока нет</div>
            )}
          </div>
        )}

        {/* Отклики */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Отклики ({responses.length})
        </h2>

        {responses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            Пока никто не откликнулся
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
                  className={`bg-white rounded-2xl border shadow-sm p-4 transition-colors ${
                    isAccepted ? 'border-blue-300 bg-blue-50/30' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <User size={18} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-gray-900">{r.carrier?.name || 'Перевозчик'}</div>
                        {isAccepted && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                            <CheckCircle size={11} /> Выбран
                          </span>
                        )}
                        {rating && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <Star size={12} className="fill-amber-400 text-amber-400" />
                            {rating.avg} ({rating.count})
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{r.carrier?.city}</div>
                      {r.message && (
                        <p className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{r.message}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {r.carrier?.phone && (revealedResponsePhones.has(r.carrier_id) ? (
                          <a
                            href={`tel:${r.carrier.phone}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            <Phone size={14} /> {formatPhone(r.carrier.phone)}
                          </a>
                        ) : (
                          <button
                            onClick={() => setRevealedResponsePhones(prev => { const s = new Set(prev); s.add(r.carrier_id); return s })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            <Phone size={14} /> {maskPhone(r.carrier.phone)}
                          </button>
                        ))}
                        <Link
                          href={`/orders/${order.id}/chat`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
                        >
                          💬 Чат
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
                    <div className="text-xs text-gray-400 shrink-0">{formatDateTime(r.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Редактировать заявку</h2>
              <button onClick={() => setEditOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
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
                <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-blue-200 bg-blue-50">
                  <input type="checkbox" checked={editGenset} onChange={e => setEditGenset(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-blue-800">⚡ {t.order.genset}</span>
                </label>
              )}
              <Input label="Дата погрузки/выгрузки" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={today} />
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Ставка</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input type="checkbox" checked={editNegotiable} onChange={e => { setEditNegotiable(e.target.checked); if (e.target.checked) setEditPrice('') }} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-700">Договорная</span>
                </label>
                {!editNegotiable && (
                  <Input type="number" placeholder="Ставка в рублях" value={editPrice} onChange={e => setEditPrice(e.target.value)} min="0" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t.order.vatType}</label>
                <div className="flex gap-2 flex-wrap">
                  {(['none', 'vat20', 'vat0'] as VatType[]).map(v => (
                    <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${editVatType === v ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <input type="radio" name="editVatType" value={v} checked={editVatType === v} onChange={() => setEditVatType(v)} className="sr-only" />
                      {v === 'none' ? t.order.vatNone : v === 'vat20' ? t.order.vatVat20 : t.order.vatVat0}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Особые условия</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Опасный груз..."
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <input type="checkbox" checked={editUrgent} onChange={e => setEditUrgent(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-red-500" />
                <div>
                  <div className="text-sm font-medium text-gray-900">🔴 Срочная заявка</div>
                  <div className="text-xs text-gray-500">Будет выделена в ленте перевозчиков</div>
                </div>
              </label>
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <Button onClick={saveEdit} loading={saving} className="flex-1">Сохранить</Button>
              <Button variant="secondary" onClick={() => setEditOpen(false)}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {/* Agreed price modal */}
      {agreedPriceOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Подтвердите стоимость рейса</h2>
              <button onClick={() => { setAgreedPriceOpen(false); setPendingCarrierId(null) }} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                Укажите итоговую договорную стоимость рейса (необязательно). Сумма будет видна обеим сторонам.
              </p>
              <Input label="Сумма (₽)" type="number" value={agreedPriceInput} onChange={e => setAgreedPriceInput(e.target.value)} placeholder="Например: 85000" min="0" />
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <Button onClick={confirmAccept} className="flex-1">Принять перевозчика</Button>
              <Button variant="secondary" onClick={() => { setAgreedPriceOpen(false); setPendingCarrierId(null) }}>Отмена</Button>
            </div>
          </div>
        </div>
      )}

      {/* Review prompt modal */}
      {showReviewModal && canReview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">🎉 Рейс завершён!</h2>
              <button onClick={() => setShowReviewModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Оцените {isOwner ? 'перевозчика' : 'клиента'} — это поможет другим участникам платформы.
              </p>
              <StarRating value={reviewRating} onChange={setReviewRating} />
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="Комментарий (необязательно)"
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
    </AppLayout>
  )
}
