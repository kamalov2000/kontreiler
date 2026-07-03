'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Navigation, CheckCircle, Clock, ChevronRight, Loader2,
  Truck, Package, Settings, FileText, Flag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import { RouteInline } from '@/components/ui/RouteInline'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Order } from '@/types/database'
import { TRACKING_STEPS, getTrackingStepIndex, getNextTrackingStep, isLastTrackingStep } from '@/lib/tracking'
import { formatOrderNumber, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Линейные иконки этапов (lucide, обводка 1.5) — по порядку TRACKING_STEPS.
// Эмодзи-иконки этапов заменены на монохромные знаки в тоне статуса.
const STEP_ICONS: LucideIcon[] = [
  Truck,     // heading_to_pickup
  Package,   // at_pickup_terminal
  Truck,     // heading_to_cargo
  Settings,  // at_cargo_point
  FileText,  // waiting_documents
  Truck,     // heading_to_delivery
  Flag,      // at_delivery_terminal
]

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
      toast.success(step?.label ?? 'Этап обновлён')
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
      toast.success('Рейс завершён! Статус переведён в «Доставлено».')
    } finally {
      setAdvancing(false)
    }
  }

  if (loading || userLoading) {
    return (
      <AppLayout>
        <div className="max-w-lg">
          {/* Скелетон-строки под таймлайн */}
          <div className="h-4 w-32 rounded-field bg-surface-sunken mb-6 animate-pulse" />
          <div className="h-6 w-48 rounded-field bg-surface-sunken mb-2 animate-pulse" />
          <div className="h-4 w-56 rounded-field bg-surface-sunken mb-6 animate-pulse" />
          <div className="border border-hairline rounded-card bg-surface p-5">
            <div className="h-3 w-24 rounded-field bg-surface-sunken mb-5 animate-pulse" />
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface-sunken animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded-field bg-surface-sunken animate-pulse" />
                    <div className="h-3 w-1/2 rounded-field bg-surface-sunken animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!order) return null

  const currentIdx = getTrackingStepIndex(order.tracking_status)
  const nextStep = getNextTrackingStep(order.tracking_status)
  const nextStepInfo = nextStep ? TRACKING_STEPS.find(s => s.value === nextStep) : null
  const nextStepIcon = nextStep ? STEP_ICONS[getTrackingStepIndex(nextStep)] : null
  const canStart = isAcceptedCarrier && order.status === 'matched' && !order.tracking_status
  const canAdvance = isAcceptedCarrier && order.status === 'in_transit' && !!nextStep
  const canFinish = isAcceptedCarrier && order.status === 'in_transit' && isLastTrackingStep(order.tracking_status)
  const isDelivered = order.status === 'delivered'
  const currentStep = currentIdx >= 0 ? TRACKING_STEPS[currentIdx] : null

  return (
    <AppLayout>
      <div className="max-w-lg">
        <button
          onClick={() => router.push(`/orders/${id}`)}
          className="flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink transition-colors ease-terminal mb-5"
        >
          <ArrowLeft size={16} /> Назад к заявке
        </button>

        {/* Шапка: герой-маршрут + метаданные */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Navigation size={16} className="text-accent" strokeWidth={1.5} />
            <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Трекинг рейса</span>
          </div>
          <RouteInline
            from={order.from_city}
            to={order.to_city}
            via={order.via_city}
            className="text-[17px] mb-2"
          />
          <div className="flex items-center gap-2.5 flex-wrap">
            {order.order_number && (
              <span className="font-mono text-[13px] tabular-nums text-ink-3">
                {formatOrderNumber(order.order_number)}
              </span>
            )}
            {currentStep ? (
              <StatusPill status={order.status} kind="order" label={currentStep.shortLabel} />
            ) : (
              <StatusPill status={order.status} kind="order" />
            )}
          </div>
        </div>

        {/* Блок действий перевозчика */}
        {isAcceptedCarrier && !isDelivered && (
          <div className="bg-accent-soft border border-accent/25 rounded-card p-4 mb-6">
            {canStart && (
              <div>
                <p className="text-sm font-semibold text-ink mb-1">Готов выехать?</p>
                <p className="text-[13px] text-ink-2 mb-3">
                  Нажмите «Начать рейс» — статус перейдёт в «В пути» и клиент увидит первый этап.
                </p>
                <Button onClick={handleStart} loading={advancing} className="w-full sm:w-auto">
                  <Truck size={16} className="mr-1.5" strokeWidth={1.5} /> Начать рейс
                </Button>
              </div>
            )}

            {canAdvance && nextStepInfo && (
              <div>
                <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5">Следующий этап</div>
                <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                  {nextStepIcon && (() => {
                    const NextIcon = nextStepIcon
                    return <NextIcon size={16} className="text-accent shrink-0" strokeWidth={1.5} />
                  })()}
                  {nextStepInfo.label}
                </p>
                <Button onClick={handleAdvance} loading={advancing} className="w-full sm:w-auto">
                  Перейти к следующему этапу
                  <ChevronRight size={16} className="ml-1" strokeWidth={1.5} />
                </Button>
              </div>
            )}

            {canFinish && (
              <div>
                <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
                  <Flag size={16} className="text-accent shrink-0" strokeWidth={1.5} /> Все этапы пройдены
                </p>
                <p className="text-[13px] text-ink-2 mb-3">
                  Нажмите «Завершить рейс» — статус заказа изменится на «Доставлено».
                </p>
                <Button onClick={handleFinish} loading={advancing} className="w-full sm:w-auto bg-success hover:bg-success/90">
                  <CheckCircle size={16} className="mr-1.5" strokeWidth={1.5} /> Завершить рейс
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Клиент ожидает начала рейса */}
        {isOwner && !isDelivered && order.status === 'matched' && !order.tracking_status && (
          <div className="bg-warning-soft border border-warning/25 rounded-card p-4 mb-6 flex items-center gap-3">
            <Loader2 size={16} className="text-warning animate-spin shrink-0" strokeWidth={1.5} />
            <p className="text-sm text-ink-2">Ожидаем начала рейса от перевозчика…</p>
          </div>
        )}

        {/* Баннер завершения */}
        {isDelivered && (
          <div className="bg-success-soft border border-success/25 rounded-card p-4 mb-6 flex items-center gap-3">
            <CheckCircle size={18} className="text-success shrink-0" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-success">Рейс завершён. Груз доставлен.</p>
          </div>
        )}

        {/* Таймлайн: вертикальная рельса из 7 узлов */}
        <div className="bg-surface border border-hairline rounded-card p-5">
          <div className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-5">Этапы рейса</div>

          <div className="relative">
            {/* Вертикальная рельса */}
            <div className="absolute left-5 top-2 bottom-2 w-px bg-hairline" />

            <div className="space-y-0">
              {TRACKING_STEPS.map((step, idx) => {
                const isDone = currentIdx >= idx
                const isCurrent = currentIdx === idx
                const isUpcoming = currentIdx < idx
                const StepIcon = STEP_ICONS[idx]

                return (
                  <div key={step.value} className="relative flex gap-4 pb-6 last:pb-0">
                    {/* Узел */}
                    <div className={cn(
                      'relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all ease-terminal',
                      isDone && !isCurrent
                        ? 'bg-success border-success text-white'
                        : isCurrent
                          ? 'bg-surface border-accent ring-4 ring-accent-soft text-accent'
                          : 'bg-surface border-hairline text-ink-4'
                    )}>
                      {isDone && !isCurrent ? (
                        <CheckCircle size={17} strokeWidth={1.5} />
                      ) : (
                        <StepIcon size={17} strokeWidth={1.5} />
                      )}
                    </div>

                    {/* Содержимое */}
                    <div className={cn(
                      'flex-1 pt-1.5 pb-1',
                      isUpcoming && 'opacity-45'
                    )}>
                      <div className={cn(
                        'text-sm font-semibold leading-tight mb-0.5 flex items-center gap-2 flex-wrap',
                        isCurrent ? 'text-ink' : isDone ? 'text-ink' : 'text-ink-3'
                      )}>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold tracking-[0.06em] uppercase bg-accent-soft text-accent px-2 py-0.5 rounded-field">
                            Сейчас
                          </span>
                        )}
                        {step.label}
                      </div>
                      <div className="text-[13px] text-ink-3">{step.description}</div>
                      {isCurrent && order.tracking_updated_at && (
                        <div className="text-[11px] text-ink-3 mt-1.5 flex items-center gap-1 font-mono tabular-nums">
                          <Clock size={11} strokeWidth={1.5} />
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

        {/* Индикатор прогресса */}
        {order.tracking_status && (
          <div className="mt-4 bg-surface border border-hairline rounded-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">Прогресс рейса</span>
              <span className="font-mono text-[13px] tabular-nums font-medium text-accent">
                {currentIdx + 1} / {TRACKING_STEPS.length}
              </span>
            </div>
            <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500 ease-terminal"
                style={{ width: `${((currentIdx + 1) / TRACKING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
