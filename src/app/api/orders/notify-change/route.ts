import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Задача 8: уведомление перевозчика(ов) о корректировке заявки.
// Уведомления защищены RLS (INSERT только через SECURITY DEFINER-триггеры),
// поэтому создаём их на сервере через service_role с проверкой владельца заявки.
export async function POST(req: Request) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  const rawMessage: string | undefined = body?.message
  if (!orderId || !UUID_RE.test(orderId) || !rawMessage || typeof rawMessage !== 'string') {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const message = rawMessage.slice(0, 1000)

  const service = createServiceClient()
  const { data: order } = await service
    .from('orders')
    .select('id, client_id, accepted_carrier_id, status')
    .eq('id', orderId)
    .single()

  // Уведомлять о корректировке может только владелец заявки
  if (!order || order.client_id !== user.id) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  // После доставки/закрытия/отмены изменений быть не должно
  if (['delivered', 'closed', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Кому: принятому перевозчику, иначе — всем откликнувшимся
  let recipientIds: string[] = []
  if (order.accepted_carrier_id) {
    recipientIds = [order.accepted_carrier_id]
  } else {
    const { data: resp } = await service.from('responses').select('carrier_id').eq('order_id', orderId)
    recipientIds = Array.from(new Set((resp || []).map((r: { carrier_id: string }) => r.carrier_id)))
  }
  if (recipientIds.length === 0) return NextResponse.json({ ok: true, recipients: 0 })

  const { error } = await service.from('notifications').insert(
    recipientIds.map(uid => ({
      user_id: uid,
      type: 'order_changed' as const,
      link: `/orders/${orderId}`,
      message,
      is_read: false,
    }))
  )
  if (error) {
    console.error('[NOTIFY-CHANGE]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true, recipients: recipientIds.length })
}
