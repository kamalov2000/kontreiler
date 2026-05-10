'use client'

import { useState } from 'react'
import { X, CheckCircle, Circle, Clock, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { Order } from '@/types/database'
import { TRACKING_STEPS, getTrackingStepIndex, getNextTrackingStep, isLastTrackingStep } from '@/lib/tracking'
import { formatDateTime, formatOrderNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
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

  const currentIdx = getTrackingStepIndex(order.tracking_status)
  const nextStep = getNextTrackingStep(order.tracking_status)
  const nextStepInfo = nextStep ? TRACKING_STEPS.find(s => s.value === nextStep) : null
  const canStart = isAcceptedCarrier && order.status === 'matched' && !order.tracking_status
  const canAdvance = isAcceptedCarrier && order.status === 'in_transit' && !!nextStep
  const canFinish = isAcceptedCarrier && order.status === 'in_transit' && isLastTrackingStep(order.tracking_status)
  const isDelivered = order.status === 'delivered'

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
        body: JSON.stringify({ order_id: order.id, action: 'finish' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Ошибка'); return }
      onOrderUpdate({ status: 'delivered' })
      toast.success('🎉 Рейс завершён! Статус переведён в «Доставлено».')
      onClose()
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
        'fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-blue-600" />
            <div>
              <div className="font-semibold text-gray-900">Трекинг рейса</div>
              {order.order_number && (
                <div className="text-xs text-gray-400">{formatOrderNumber(order.order_number)} · {order.from_city} → {order.to_city}</div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Carrier action block */}
          {isAcceptedCarrier && !isDelivered && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              {canStart && (
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-1">Готов выехать?</p>
                  <p className="text-xs text-blue-700 mb-3">
                    Нажмите «Начать рейс» — статус перейдёт в «В пути».
                  </p>
                  <Button onClick={handleStart} loading={advancing} className="w-full">
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
                  <Button onClick={handleAdvance} loading={advancing} className="w-full">
                    Перейти к следующему этапу
                    <ChevronRight size={16} className="ml-1" />
                  </Button>
                </div>
              )}
              {canFinish && (
                <div>
                  <p className="text-sm font-semibold text-blue-900 mb-1">🏁 Все этапы пройдены</p>
                  <p className="text-xs text-blue-700 mb-3">
                    Нажмите «Завершить рейс» — статус изменится на «Доставлено».
                  </p>
                  <Button onClick={handleFinish} loading={advancing} className="w-full bg-green-600 hover:bg-green-700">
                    ✅ Завершить рейс
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Client waiting */}
          {isOwner && !isDelivered && order.status === 'matched' && !order.tracking_status && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <Loader2 size={18} className="text-amber-600 animate-spin shrink-0" />
              <p className="text-sm text-amber-800">Ожидаем начала рейса от перевозчика...</p>
            </div>
          )}

          {/* Delivered */}
          {isDelivered && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-600 shrink-0" />
              <p className="text-sm font-semibold text-green-800">Рейс завершён! Груз доставлен.</p>
            </div>
          )}

          {/* Progress bar */}
          {order.tracking_status && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
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

          {/* Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">Этапы рейса</h2>
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />
              <div className="space-y-0">
                {TRACKING_STEPS.map((step, idx) => {
                  const isDone = currentIdx >= idx
                  const isCurrent = currentIdx === idx
                  const isUpcoming = currentIdx < idx
                  return (
                    <div key={step.value} className="relative flex gap-4 pb-6 last:pb-0">
                      <div className={cn(
                        'relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 border-2 transition-all',
                        isDone && !isCurrent ? 'bg-blue-600 border-blue-600 text-white' :
                        isCurrent ? 'bg-white border-blue-600 ring-4 ring-blue-100' :
                        'bg-white border-gray-200 text-gray-300'
                      )}>
                        {isDone && !isCurrent ? (
                          <CheckCircle size={18} className="text-white" />
                        ) : isCurrent ? (
                          <span className="text-sm">{step.icon}</span>
                        ) : (
                          <Circle size={16} className="text-gray-300" />
                        )}
                      </div>
                      <div className={cn('flex-1 pt-2 pb-1', isUpcoming && 'opacity-40')}>
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
        </div>
      </div>
    </>
  )
}
