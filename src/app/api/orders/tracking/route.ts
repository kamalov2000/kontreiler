import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { TRACKING_STEPS, getTrackingStepIndex, getNextTrackingStep, isLastTrackingStep } from '@/lib/tracking'

// POST /api/orders/tracking
// Перевозчик обновляет этап рейса. Сервер проверяет:
//   1. Пользователь аутентифицирован
//   2. Он является принятым перевозчиком по данному заказу
//   3. Переход на следующий этап (без пропусков)
// action: 'start' | 'advance' | 'finish'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const orderId = body?.order_id
  const action: string = body?.action ?? 'advance'

  if (!orderId) {
    return NextResponse.json({ error: 'order_id required' }, { status: 400 })
  }

  const service = createServiceClient()

  // Загружаем заказ
  const { data: order, error: orderErr } = await service
    .from('orders')
    .select('id, status, accepted_carrier_id, tracking_enabled, tracking_status')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Проверяем что текущий пользователь — принятый перевозчик
  if (order.accepted_carrier_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden: you are not the accepted carrier' }, { status: 403 })
  }

  // Трекинг должен быть включён
  if (!order.tracking_enabled) {
    return NextResponse.json({ error: 'Tracking is not enabled for this order' }, { status: 400 })
  }

  let newTrackingStatus: string | null = null
  let newOrderStatus: string | undefined = undefined

  if (action === 'start') {
    // Начать рейс: заказ должен быть в статусе matched
    if (order.status !== 'matched') {
      return NextResponse.json({ error: 'Order must be in matched status to start' }, { status: 400 })
    }
    newTrackingStatus = 'heading_to_pickup'
    newOrderStatus = 'in_transit'

  } else if (action === 'advance') {
    // Следующий этап: только из in_transit
    if (order.status !== 'in_transit') {
      return NextResponse.json({ error: 'Order must be in_transit to advance' }, { status: 400 })
    }

    // Не последний шаг — получаем следующий
    const next = getNextTrackingStep(order.tracking_status)
    if (!next) {
      return NextResponse.json({ error: 'Already at last tracking step' }, { status: 400 })
    }

    // Проверяем что текущий статус соответствует ожидаемому (защита от прыжков)
    const currentIdx = getTrackingStepIndex(order.tracking_status)
    const nextIdx = TRACKING_STEPS.findIndex(s => s.value === next)
    if (nextIdx !== currentIdx + 1) {
      return NextResponse.json({ error: 'Invalid step transition' }, { status: 400 })
    }

    newTrackingStatus = next

  } else if (action === 'finish') {
    // Завершить рейс: должен быть на последнем этапе
    if (!isLastTrackingStep(order.tracking_status)) {
      return NextResponse.json({ error: 'Must complete all tracking steps before finishing' }, { status: 400 })
    }
    if (order.status !== 'in_transit') {
      return NextResponse.json({ error: 'Order must be in_transit to finish' }, { status: 400 })
    }
    newOrderStatus = 'delivered'
    newTrackingStatus = order.tracking_status // оставляем последний этап

  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Применяем изменения
  const updatePayload: Record<string, unknown> = {
    tracking_status: newTrackingStatus,
    tracking_updated_at: new Date().toISOString(),
  }
  if (newOrderStatus) updatePayload.status = newOrderStatus

  const { error: updateErr } = await service
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)

  if (updateErr) {
    console.error('[TRACKING UPDATE ERROR]', updateErr)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  // Фиксируем факт прохождения этапа с датой/временем в историю (order_tracking_events).
  // Для finish пишем финальную отметку 'delivered' («контейнер сдан»).
  const eventStep = action === 'finish' ? 'delivered' : newTrackingStatus
  const { error: eventErr } = await service
    .from('order_tracking_events')
    .insert({ order_id: orderId, step: eventStep })
  if (eventErr) {
    // Не валим весь запрос — статус уже обновлён; логируем для диагностики.
    console.error('[TRACKING EVENT INSERT ERROR]', eventErr)
  }

  return NextResponse.json({
    ok: true,
    tracking_status: newTrackingStatus,
    order_status: newOrderStatus ?? order.status,
  })
}
