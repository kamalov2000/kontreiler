import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Выдаёт телефон контрагента по сделке. Телефон закрыт от прямого чтения (RLS
// на колонку users.phone), поэтому доступ только здесь — с проверкой участия и
// per-order флага hide_phone.
export async function POST(req: Request) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const kind: string = body?.kind
  const id: string = body?.id
  const targetUserId: string = body?.targetUserId
  if (!['order', 'truck'].includes(kind) || !UUID_RE.test(id) || !UUID_RE.test(targetUserId)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const svc = createServiceClient()

  // Проверяем, что вызывающий и target — две стороны сделки, и определяем hide
  let allowed = false
  let hidden = false

  if (kind === 'order') {
    const { data: order } = await svc.from('orders')
      .select('client_id, accepted_carrier_id, hide_phone').eq('id', id).single()
    if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { data: resp } = await svc.from('responses').select('carrier_id').eq('order_id', id)
    const carrierIds = new Set((resp || []).map((r: { carrier_id: string }) => r.carrier_id))

    if (user.id === order.client_id) {
      // Клиент смотрит телефон перевозчика — тот должен был откликнуться
      allowed = carrierIds.has(targetUserId)
    } else if (carrierIds.has(user.id)) {
      // Перевозчик смотрит телефон клиента — только сам клиент и если не скрыт
      allowed = targetUserId === order.client_id
      hidden = !!order.hide_phone
    }
  } else {
    const { data: truck } = await svc.from('trucks').select('carrier_id').eq('id', id).single()
    if (!truck) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { data: resp } = await svc.from('truck_responses').select('client_id').eq('truck_id', id)
    const clientIds = new Set((resp || []).map((r: { client_id: string }) => r.client_id))

    if (user.id === truck.carrier_id) {
      allowed = clientIds.has(targetUserId)
    } else if (clientIds.has(user.id)) {
      allowed = targetUserId === truck.carrier_id
    }
  }

  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (hidden) return NextResponse.json({ hidden: true, phone: null })

  const { data: target } = await svc.from('users').select('phone').eq('id', targetUserId).single()
  return NextResponse.json({ phone: target?.phone ?? null })
}
