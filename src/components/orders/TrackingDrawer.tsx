'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Check, Play, Clock, ChevronRight, ChevronDown, Loader2, PackageCheck } from 'lucide-react'
import { Order } from '@/types/database'
import { TRACKING_STEPS, getTrackingStepIndex, getNextTrackingStep, isLastTrackingStep } from '@/lib/tracking'
import { formatDateTime, formatOrderNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TrackingDrawerProps {
  open: boolean
  onClose: () => void
  order: Order
  isAcceptedCarrier: boolean
  isOwner: boolean
  onOrderUpdate: (updates: Partial<Order>) => void
}

export function TrackingDrawer({ open, onClose, order, isAcceptedCarrier, isOwner, onOrderUpdate }: TrackingDrawerProps) {
  const [advancing, setAdvancing] = useState(false)
  // История этапов: step → дата/время достижения (первое вхождение).
  const [events, setEvents] = useState<Record<string, string>>({})
  // Аккордеон: какой этап раскрыт (показывает дату/время). null — все свёрнуты.
  const [openStep, setOpenStep] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('order_tracking_events')
      .select('step, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true })
    if (data) {
      const map: Record<string, string> = {}
      for (const e of data) if (!map[e.step]) map[e.step] = e.created_at
      setEvents(map)
    }
  }, [order.id])

  useEffect(() => {
    if (open) loadEvents()
  }, [open, order.tracking_status, order.status, loadEvents])

  const currentIdx = getTrackingStepIndex(order.tracking_status)
  const nextStep = getNextTrackingStep(order.tracking_status)
  const nextStepInfo = nextStep ? TRACKING_STEPS.find(s => s.value === nextStep) : null
  const canStart = isAcceptedCarrier && order.status === 'matched' && !order.tracking_status
  const canAdvance = isAcceptedCarrier && order.status === 'in_transit' && !!nextStep
  const canFinish = isAcceptedCarrier && order.status === 'in_transit' && isLastTrackingStep(order.tracking_status)
  const isDelivered = order.status === 'delivered'

  // Прогресс в процентах для текущего этапа
  const progressPct = order.tracking_status
    ? Math.round(((currentIdx + 1) / TRACKING_STEPS.length) * 100)
    : 0

  async function handleStart() {
    setAdvancing(true)
    try {
      const res = await fetch('/api/orders/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, action: 'start' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      onOrderUpdate({ status: 'in_transit', tracking_status: data.tracking_status, tracking_updated_at: new Date().toISOString() })
      await loadEvents()
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
        body: JSON.stringify({ order_id: order.id, action: 'advance' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      onOrderUpdate({ tracking_status: data.tracking_status, tracking_updated_at: new Date().toISOString() })
      await loadEvents()
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
        body: JSON.stringify({ order_id: order.id, action: 'finish' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      onOrderUpdate({ status: 'delivered' })
      await loadEvents()
      toast.success('Контейнер сдан! Рейс завершён, статус «Доставлено».')
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={cn(
        'fixed top-0 right-0 h-full w-full sm:w-[420px] bg-surface shadow-overlay z-50 flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0">
          <div className="flex flex-col gap-px">
            <span className="text-base font-semibold text-ink">Трекинг рейса</span>
            {order.order_number && (
              <span className="font-mono tabular-nums text-xs text-ink-3">
                {formatOrderNumber(order.order_number)} · {order.from_city}{order.via_city ? ` → ${order.via_city}` : ''} → {order.to_city}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-field flex items-center justify-center text-ink-3 hover:bg-surface-sunken transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Progress bar */}
          {order.tracking_status && (
            <div className="px-5 py-4 border-b border-hairline">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Этап {currentIdx + 1} из {TRACKING_STEPS.length}
                </span>
                <span className="font-mono tabular-nums text-xs text-warning">{progressPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                <div
                  className="h-full bg-warning rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Carrier action block */}
          {isAcceptedCarrier && !isDelivered && (
            <div className="px-5 py-4 border-b border-hairline flex flex-col gap-2.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Действие перевозчика
              </span>
              {canStart && (
                <Button onClick={handleStart} loading={advancing} className="w-full gap-2">
                  <Play size={16} /> Начать рейс
                </Button>
              )}
              {canAdvance && nextStepInfo && (
                <>
                  <Button onClick={handleAdvance} loading={advancing} className="w-full gap-2">
                    <Play size={16} /> Отметить следующий этап
                    <ChevronRight size={16} />
                  </Button>
                  <p className="text-xs text-ink-3">Следующий: {nextStepInfo.label}</p>
                </>
              )}
              {canFinish && (
                <Button
                  variant="secondary"
                  onClick={handleFinish}
                  loading={advancing}
                  className="w-full gap-1.5 text-success"
                >
                  <PackageCheck size={16} className="text-success" /> Контейнер сдан
                </Button>
              )}
            </div>
          )}

          {/* Client waiting */}
          {isOwner && !isDelivered && order.status === 'matched' && !order.tracking_status && (
            <div className="mx-5 mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-field bg-warning-soft">
              <Loader2 size={15} className="text-warning animate-spin shrink-0" />
              <span className="text-[12.5px] text-warning">Ожидаем начала рейса от перевозчика</span>
            </div>
          )}

          {/* Delivered */}
          {isDelivered && (
            <div className="mx-5 mt-3.5 flex items-center gap-2 px-3 py-2.5 rounded-field bg-success-soft">
              <Check size={16} className="text-success shrink-0" strokeWidth={2.5} />
              <span className="text-[12.5px] font-semibold text-success">Рейс завершён! Груз доставлен.</span>
            </div>
          )}

          {/* Timeline — аккордеон: клик по этапу раскрывает его дату/время */}
          <div className="px-5 pt-4 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Хронология
              </span>
              <span className="text-[10.5px] text-ink-4">нажмите на этап — покажет дату и время</span>
            </div>
            <div className="grid grid-cols-[24px_1fr] gap-x-3">
              {TRACKING_STEPS.map((step, idx) => {
                const reached = currentIdx >= idx
                const isCurrent = !isDelivered && currentIdx === idx
                const time = events[step.value]
                const isOpen = openStep === step.value
                // Последний узел без линии — только если рейс НЕ завершён (иначе линия идёт к «Контейнер сдан»)
                const isLastNode = idx === TRACKING_STEPS.length - 1 && !isDelivered
                return (
                  <div key={step.value} className="contents">
                    {/* Узел + линия */}
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        'w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0',
                        isCurrent
                          ? 'bg-warning-soft border-2 border-warning'
                          : reached
                            ? 'bg-success-soft'
                            : 'bg-surface border-2 border-border-strong'
                      )}>
                        {isCurrent ? (
                          <span className="w-[7px] h-[7px] rounded-full bg-warning" />
                        ) : reached ? (
                          <Check size={12} className="text-success" strokeWidth={2.5} />
                        ) : null}
                      </span>
                      {!isLastNode && (
                        <span className={cn(
                          'flex-1 my-0.5 border-l-2',
                          reached && !isCurrent ? 'border-[#CFE2D8]' : 'border-dashed border-hairline'
                        )} />
                      )}
                    </div>
                    {/* Подпись — кнопка-аккордеон */}
                    <div className={cn(isOpen ? 'pb-2.5' : 'pb-3.5')}>
                      <button
                        type="button"
                        onClick={() => setOpenStep(isOpen ? null : step.value)}
                        className="w-full text-left flex items-center gap-1.5"
                      >
                        <span className={cn(
                          'text-[13px] leading-tight flex-1',
                          isCurrent ? 'font-semibold text-warning' : reached ? 'font-semibold text-ink' : 'text-ink-4'
                        )}>
                          {step.label}
                        </span>
                        <ChevronDown size={13} className={cn('shrink-0 text-ink-4 transition-transform', isOpen && 'rotate-180')} />
                      </button>
                      {isOpen && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {time ? (
                            <span className="font-mono tabular-nums text-[11.5px] text-ink-2 flex items-center gap-1.5">
                              <Clock size={12} className={isCurrent ? 'text-warning' : 'text-success'} />
                              {formatDateTime(time)}
                            </span>
                          ) : (
                            <span className="text-[11.5px] text-ink-4">Этап ещё не пройден</span>
                          )}
                          <span className="text-[11px] text-ink-4">{step.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Финальная отметка «Контейнер сдан» — только после завершения рейса */}
              {isDelivered && (
                <div className="contents">
                  <div className="flex flex-col items-center">
                    <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 bg-success">
                      <PackageCheck size={13} className="text-white" strokeWidth={2.25} />
                    </span>
                  </div>
                  <div className="pb-0">
                    <button
                      type="button"
                      onClick={() => setOpenStep(openStep === 'delivered' ? null : 'delivered')}
                      className="w-full text-left flex items-center gap-1.5"
                    >
                      <span className="text-[13px] leading-tight flex-1 font-semibold text-success">Контейнер сдан</span>
                      <ChevronDown size={13} className={cn('shrink-0 text-ink-4 transition-transform', openStep === 'delivered' && 'rotate-180')} />
                    </button>
                    {openStep === 'delivered' && (
                      <div className="mt-1.5">
                        {events['delivered'] ? (
                          <span className="font-mono tabular-nums text-[11.5px] text-ink-2 flex items-center gap-1.5">
                            <Clock size={12} className="text-success" />
                            {formatDateTime(events['delivered'])}
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-ink-4">Груз доставлен</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
