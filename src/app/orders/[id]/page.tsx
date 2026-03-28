'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Phone, User, ArrowRight, CheckCircle,
  MoreVertical, X, Edit2, Copy, RotateCcw, Ban, Star, Banknote,
} from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Order, Response, Review, OrderStatus, ContainerType } from '@/types/database'
import { formatDate, formatDateTime, formatPrice, formatPhone, maskPhone } from '@/lib/utils'
import { CONTAINER_TYPES } from '@/lib/cities'
import { toast } from 'sonner'
import { ORDER_STATUS_LABEL, ORDER_STATUS_CLASS } from '@/lib/status'

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

// Компонент выбора звёзд
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
            className={`transition-colors ${
              star <= (hovered || value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()
  const [order, setOrder] = useState<Order | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [carrierRatings, setCarrierRatings] = useState<Record<string, { avg: number; count: number }>>({})
  const [loading, setLoading] = useState(true)
  const [closingId, setClosingId] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [statusChanging, setStatusChanging] = useState(false)

  // Action menu
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Edit modal
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')
  const [editContainer, setEditContainer] = useState<ContainerType>('20ft')
  const [editDate, setEditDate] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editNegotiable, setEditNegotiable] = useState(false)
  const [editUrgent, setEditUrgent] = useState(false)
  const [editNotes, setEditNotes] = useState('')

  // Agreed price modal
  const [agreedPriceOpen, setAgreedPriceOpen] = useState(false)
  const [pendingCarrierId, setPendingCarrierId] = useState<string | null>(null)
  const [agreedPriceInput, setAgreedPriceInput] = useState('')

  const [carrierPhoneRevealed, setCarrierPhoneRevealed] = useState(false)
  const [revealedResponsePhones, setRevealedResponsePhones] = useState<Set<string>>(new Set())
  const [showReviewModal, setShowReviewModal] = useState(false)

  // Review form
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  const isOwner = user?.id === order?.client_id

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const { data: orderData } = await supabase
        .from('orders')
        .select('*, client:users!client_id(*)')
        .eq('id', id)
        .single()

      if (!orderData) {
        router.push('/dashboard')
        return
      }
      setOrder(orderData as Order)

      const { data: responsesData } = await supabase
        .from('responses')
        .select('*, carrier:users!carrier_id(*)')
        .eq('order_id', id)
        .order('created_at', { ascending: false })
      setResponses((responsesData || []) as Response[])

      // Загружаем отзывы для этой заявки
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('*, reviewer:users!reviewer_id(name), reviewee:users!reviewee_id(name)')
        .eq('order_id', id)
      setReviews((reviewsData || []) as Review[])

      // Загружаем рейтинги перевозчиков из откликов
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

  // ── Edit ────────────────────────────────────────────────────────────

  function openEdit() {
    if (!order) return
    setEditFrom(order.from_city)
    setEditTo(order.to_city)
    setEditContainer(order.container_type)
    setEditDate(order.ready_date)
    setEditPrice(order.price ? String(order.price) : '')
    setEditNegotiable(order.is_negotiable)
    setEditUrgent(order.is_urgent)
    setEditNotes(order.notes || '')
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
        to_city: editTo,
        container_type: editContainer,
        ready_date: editDate,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable,
        is_urgent: editUrgent,
        notes: editNotes.trim() || null,
      })
      .eq('id', order.id)

    if (error) {
      toast.error('Ошибка при сохранении')
    } else {
      toast.success('Заявка обновлена')
      setOrder(prev => prev ? {
        ...prev,
        from_city: editFrom, to_city: editTo,
        container_type: editContainer, ready_date: editDate,
        price: editNegotiable ? null : (parseInt(editPrice) || null),
        is_negotiable: editNegotiable, is_urgent: editUrgent,
        notes: editNotes.trim() || null,
      } : prev)
      setEditOpen(false)
    }
    setSaving(false)
  }

  // ── Status changes ──────────────────────────────────────────────────

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
        active:     'Статус сброшен в "Новая"',
        matched:    'Статус сброшен в "Перевозчик найден"',
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
    else { toast.success('Заявка отменена'); setOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev) }
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

  async function closeOrder() {
    if (!order) return
    setClosingId(true)
    const supabase = createClient()
    await supabase.from('orders').update({ status: 'closed' }).eq('id', order.id)
    toast.success('Заявка закрыта')
    router.push('/dashboard')
  }

  // ── Accept carrier (with agreed price popup) ─────────────────────────

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
      .update({
        accepted_carrier_id: pendingCarrierId,
        status: 'matched',
        agreed_price: agreedPrice,
      })
      .eq('id', order.id)

    if (error) {
      toast.error('Ошибка при выборе перевозчика')
      setAcceptingId(null)
      return
    }

    toast.success('Перевозчик выбран! Перейдите в чат для согласования деталей.')
    setOrder(prev => prev ? {
      ...prev,
      accepted_carrier_id: pendingCarrierId,
      status: 'matched',
      agreed_price: agreedPrice,
    } : prev)
    setAcceptingId(null)
    setPendingCarrierId(null)

    // Email уведомление перевозчику
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
        // Предлагаем оставить отзыв
        setTimeout(() => setShowReviewModal(true), 600)
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

  // ── Reviews ─────────────────────────────────────────────────────────

  const myReview = reviews.find(r => r.reviewer_id === user?.id)
  const canReview = order?.status === 'delivered' && !myReview && (
    (isOwner && !!order?.accepted_carrier_id) ||
    (!isOwner && user?.id === order?.accepted_carrier_id)
  )

  // Reviewee: если я клиент — оцениваю перевозчика, если перевозчик — оцениваю клиента
  const revieweeId = isOwner ? order?.accepted_carrier_id : order?.client_id

  async function submitReview() {
    if (!order || !user || !revieweeId || reviewRating === 0) {
      toast.error('Выберите оценку')
      return
    }
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

  // ── Loading ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (!order) return null

  const containerLabel = CONTAINER_TYPES.find(c => c.value === order.container_type)?.label
  const isMatched = order.status === 'matched'
  const acceptedResponse = responses.find(r => r.carrier_id === order.accepted_carrier_id)

  const canRevert = isOwner && !!PREV_STATUS[order.status]
  const canReopen = isOwner && (order.status === 'closed' || order.status === 'cancelled')
  const canCancel = isOwner && ['active', 'matched', 'in_transit'].includes(order.status)
  const canEdit   = isOwner && order.status === 'active'

  const today = new Date().toISOString().split('T')[0]

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Link href="/dashboard" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft size={16} /> Назад к заявкам
          </Link>
          {order.order_number && (
            <span className="text-sm font-mono text-gray-400 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">
              {order.order_number}
            </span>
          )}
        </div>

        {/* Order details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {order.is_urgent && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                  🔴 СРОЧНО
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_CLASS[order.status]}`}>
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
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
              {isOwner && order.status === 'active' && (
                <Button variant="danger" size="sm" loading={closingId} onClick={closeOrder}>
                  Закрыть
                </Button>
              )}

              {isOwner && (
                <div ref={menuRef} className="relative">
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    title="Действия"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      {canEdit && (
                        <button onClick={openEdit} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <Edit2 size={15} className="text-gray-400" /> Редактировать
                        </button>
                      )}
                      <button onClick={duplicateOrder} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                        <Copy size={15} className="text-gray-400" /> Дублировать
                      </button>
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
                      {canCancel && (
                        <>
                          <div className="border-t border-gray-100" />
                          <button onClick={cancelOrder} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                            <Ban size={15} className="text-red-400" /> Отменить заявку
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-bold text-gray-900">{order.from_city}</span>
            <ArrowRight size={20} className="text-gray-400" />
            <span className="text-2xl font-bold text-gray-900">{order.to_city}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Контейнер</div>
              <div className="font-medium text-gray-900">{containerLabel}</div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Ставка</div>
              <div className="font-medium text-blue-700">{formatPrice(order.price, order.is_negotiable)}</div>
            </div>
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="text-xs text-gray-500 mb-0.5">Дата готовности</div>
              <div className="font-medium text-gray-900">{formatDate(order.ready_date)}</div>
            </div>
          </div>

          {/* Agreed price */}
          {order.agreed_price && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
              <Banknote size={16} className="text-green-600 shrink-0" />
              <span className="text-sm font-medium text-green-800">
                Договорная цена: {order.agreed_price.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-xs text-amber-600 mb-0.5">Особые условия</div>
              <div className="text-sm text-amber-900">{order.notes}</div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-400">
            Размещено: {formatDateTime(order.created_at)}
          </div>
        </div>

        {/* Matched: show accepted carrier */}
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

        {/* Reviews section (after delivery) */}
        {order.status === 'delivered' && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Отзывы</h2>

            {/* Leave review form */}
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
                <Button
                  onClick={submitReview}
                  loading={submittingReview}
                  className="mt-3 w-full"
                  disabled={reviewRating === 0}
                >
                  Отправить отзыв
                </Button>
              </div>
            )}

            {/* Existing reviews */}
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
                          <Star
                            key={s}
                            size={14}
                            className={s <= rv.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}
                          />
                        ))}
                      </div>
                    </div>
                    {rv.comment && (
                      <p className="text-sm text-gray-600">{rv.comment}</p>
                    )}
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

        {/* Responses */}
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
                            <Phone size={14} />
                            {formatPhone(r.carrier.phone)}
                          </a>
                        ) : (
                          <button
                            onClick={() => setRevealedResponsePhones(prev => { const s = new Set(prev); s.add(r.carrier_id); return s })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
                          >
                            <Phone size={14} />
                            {maskPhone(r.carrier.phone)}
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
              <div className="grid grid-cols-2 gap-3">
                <CityAutocomplete label="Откуда" value={editFrom} onChange={setEditFrom} placeholder="Город отправления" />
                <CityAutocomplete label="Куда" value={editTo} onChange={setEditTo} placeholder="Город назначения" />
              </div>
              <Select
                label="Тип контейнера"
                value={editContainer}
                onChange={e => setEditContainer(e.target.value as ContainerType)}
                options={CONTAINER_TYPES.map(c => ({ value: c.value, label: c.label }))}
              />
              <Input label="Дата готовности" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} min={today} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ставка</label>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editNegotiable}
                    onChange={e => { setEditNegotiable(e.target.checked); if (e.target.checked) setEditPrice('') }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">Договорная</span>
                </label>
                {!editNegotiable && (
                  <Input type="number" placeholder="Ставка в рублях" value={editPrice} onChange={e => setEditPrice(e.target.value)} min="0" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Особые условия</label>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Рефрижератор, опасный груз..."
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={editUrgent}
                  onChange={e => setEditUrgent(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-red-500"
                />
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
              <Input
                label="Сумма (₽)"
                type="number"
                value={agreedPriceInput}
                onChange={e => setAgreedPriceInput(e.target.value)}
                placeholder="Например: 85000"
                min="0"
              />
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100">
              <Button onClick={confirmAccept} className="flex-1">
                Принять перевозчика
              </Button>
              <Button variant="secondary" onClick={() => { setAgreedPriceOpen(false); setPendingCarrierId(null) }}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Review prompt modal (after delivery) */}
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
                <Button
                  onClick={async () => { await submitReview(); setShowReviewModal(false) }}
                  loading={submittingReview}
                  disabled={reviewRating === 0}
                  className="flex-1"
                >
                  Отправить отзыв
                </Button>
                <Button variant="secondary" onClick={() => setShowReviewModal(false)}>
                  Позже
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
