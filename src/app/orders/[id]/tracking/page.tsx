'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Circle, Clock, MapPin, ChevronRight, Loader2 } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Order } from '@/types/database'
import { TRACKING_STEPS, getTrackingStepIndex, getNextTrackingStep, isLastTrackingStep } from '@/lib/tracking'
import { formatOrderNumber, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function TrackingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, loading: userLoading } = useUser()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)

  const isCarrier = user?.role === 'carrier'
  const isAcceptedCarrier = isCarrier && order?.accepted_carrier_id === user?.id
  const isOwner = user?.id === order?.client_id

  useEffect(() => {
    if (userLoading) return
    if (!user) { setLoading(false); return }

    async function fetch() {
      const supabase = createClient()
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()

      if (!data) { router.push('/dashboard'); return }

      const order = data as Order
      // Только участники заказа
      if (user!.id !== order.client_id && user!.id !== order.accepted_carrier_id) {
        router.push('/dashboard')
        return
      }
      if (!order.tracking_enabled) {
        router.push(`/orders/${id}`)
        return
      }

      setOrder(order)
      setLoading(false)
    }
    fetch()
  }, [user, userLoading, id, router])

  // Realtime subscription
  useEffect(() => {
    if (!order) return
    const supabase = createClient()
    const channel = supabase
      .channel(`tracking-${id}`)
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
  }, [order, id])

  async function handleStart() {
    setAdvancing(true)
    try {
      const res = await fetch('/api/orders/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id, action: 'start' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      setOrder(prev => prev ? {
        ...prev,
        status: 'in_transit',
        tracking_status: data.tracking_status,
        tracking_updated_at: new Date().toISOString(),
      } : prev)
      toast.success('Рейс начат!')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleAdvance() {
    setAdvancing(true)
    try {
      const res = await fetch('/api/orders/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id, action: 'advance' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      setOrder(prev => prev ? {
        ...prev,
        tracking_status: data.tracking_status,
        tracking_updated_at: new Date().toISOString(),
      } : prev)
      const step = TRACKING_STEPS.find(s => s.value === data.tracking_status)
      toast.success(`${step?.icon ?? ''} ${step?.label ?? 'Этап обновлён'}`)
    } finally {
      setAdvancing(false)
    }
  }

  async function handleFinish() {
    setAdvancing(true)
    try {
      const res = await fetch('/api/orders/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id, action: 'finish' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      setOrder(prev => prev ? { ...prev, status: 'delivered' } : prev)
      toast.success('🎉 Рейс завершён! Статус переведён в «Доставлено».')
    } finally {
      setAdvancing(false)
    }
  }

  if (loading || userLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (!order) return null

  const currentIdx = getTrackingStepIndex(order.tracking_status)
  const nextStep = getNextTrackingStep(order.tracking_status)
  const nextStepInfo = nextStep ? TRACKING_STEPS.find(s => s.value === nextStep) : null
  const canStart = isAcceptedCarrier && order.status === 'matched' && !order.tracking_status
  const canAdvance = isAcceptedCarrier && order.status === 'in_transit' && !!nextStep
  const canFinish = isAcceptedCarrier && order.status === 'in_transit' && isLastTrackingStep(order.tracking_status)
  const isDelivered = order.status === 'delivered'

  return (
    <AppLayout>
      <div className="max-w-lg">
        <Link
          href={`/orders/${id}`}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-6"
        >
          <ArrowLeft size={16} /> Назад к заявке
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={18} className="text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Трекинг рейса</h1>
          </div>
          {order.order_number && (
            <div className="text-sm text-gray-500">
              Заявка {formatOrderNumber(order.order_number)}
            </div>
          )}
          <div className="text-sm text-gray-500 mt-0.5">
            {order.from_city} → {order.to_city}
          </div>
        </div>

        {/* Carrier action block */}
        {isAcceptedCarrier && !isDelivered && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
            {canStart && (
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">Готов выехать?</p>
                <p className="text-xs text-blue-700 mb-3">
                  Нажмите «Начать рейс» — статус перейдёт в «В пути» и клиент увидит первый этап.
                </p>
                <Button onClick={handleStart} loading={advancing} className="w-full sm:w-auto">
                  🚛 Начать рейс
                </Button>
              </div>
            )}

            {canAdvance && nextStepInfo && (
              <div>
                <p className="text-xs text-blue-700 mb-1">Следующий этап:</p>
                <p className="text-sm font-semibold text-blue-900 mb-3">
                  {nextStepInfo.icon} {nextStepInfo.label}
                </p>
                <Button onClick={handleAdvance} loading={advancing} className="w-full sm:w-auto">
                  Перейти к следующему этапу
                  <ChevronRight size={16} className="ml-1" />
                </Button>
              </div>
            )}

            {canFinish && (
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">🏁 Все этапы пройдены</p>
                <p className="text-xs text-blue-700 mb-3">
                  Нажмите «Завершить рейс» — статус заказа изменится на «Доставлено».
                </p>
                <Button onClick={handleFinish} loading={advancing} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                  ✅ Завершить рейс
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Client waiting */}
        {isOwner && !isDelivered && order.status === 'matched' && !order.tracking_status && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Loader2 size={18} className="text-amber-600 animate-spin shrink-0" />
            <p className="text-sm text-amber-800">Ожидаем начала рейса от перевозчика...</p>
          </div>
        )}

        {/* Delivered banner */}
        {isDelivered && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600 shrink-0" />
            <p className="text-sm font-semibold text-green-800">Рейс завершён! Груз доставлен.</p>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-5">Этапы рейса</h2>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />

            <div className="space-y-0">
              {TRACKING_STEPS.map((step, idx) => {
                const isDone = currentIdx >= idx
                const isCurrent = currentIdx === idx
                const isUpcoming = currentIdx < idx

                return (
                  <div key={step.value} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* Circle icon */}
                    <div className={cn(
                      'relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 border-2 transition-all',
                      isDone && !isCurrent
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : isCurrent
                          ? 'bg-white border-blue-600 ring-4 ring-blue-100'
                          : 'bg-white border-gray-200 text-gray-300'
                    )}>
                      {isDone && !isCurrent ? (
                        <CheckCircle size={18} className="text-white" />
                      ) : isCurrent ? (
                        <span className="text-sm">{step.icon}</span>
                      ) : (
                        <Circle size={16} className="text-gray-300" />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn(
                      'flex-1 pt-2 pb-1',
                      isUpcoming && 'opacity-40'
                    )}>
                      <div className={cn(
                        'text-sm font-semibold leading-tight mb-0.5',
                        isCurrent ? 'text-blue-700' : isDone ? 'text-gray-900' : 'text-gray-400'
                      )}>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mr-2 font-medium">
                            Сейчас
                          </span>
                        )}
                        {step.label}
                      </div>
                      <div className="text-xs text-gray-400">{step.description}</div>
                      {isCurrent && order.tracking_updated_at && (
                        <div className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                          <Clock size={11} />
                          {formatDateTime(order.tracking_updated_at)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        {order.tracking_status && (
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Прогресс рейса</span>
              <span className="font-semibold text-blue-700">
                {currentIdx + 1} / {TRACKING_STEPS.length} этапов
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${((currentIdx + 1) / TRACKING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
