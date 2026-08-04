import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kontreiler.vercel.app'

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Вызывается клиентом сразу после создания заявки (regular/urgent). Находит
 * перевозчиков, у которых сохранён маршрут, совпадающий с новой заявкой, и
 * уведомляет их. saved_routes сейчас работает только как фильтр в ленте —
 * это делает его активным каналом, а не просто справочником.
 */
export async function POST(req: Request) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  if (!orderId || !UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: order } = await service
    .from('orders')
    .select('id, client_id, from_city, to_city, container_type, format, counterparties_only')
    .eq('id', orderId)
    .single()

  // Уведомление шлём только по инициативе владельца заявки
  if (!order || order.client_id !== user.id) return NextResponse.json({ ok: false }, { status: 403 })
  // Торги/редукцион с сохранёнными маршрутами не связаны — там своя механика откликов
  if (order.format !== 'regular' && order.format !== 'urgent') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { data: routes } = await service
    .from('saved_routes')
    .select('carrier_id, container_type')
    .ilike('from_city', order.from_city)
    .ilike('to_city', order.to_city)

  let carrierIds = Array.from(new Set(
    (routes || [])
      .filter(r => !r.container_type || r.container_type === order.container_type)
      .map(r => r.carrier_id)
      .filter(id => id !== order.client_id)
  ))

  // Заявка «только для контрагентов» — сужаем до тех, кто реально в контрагентах клиента
  if (order.counterparties_only && carrierIds.length > 0) {
    const { data: cps } = await service
      .from('counterparties')
      .select('counterparty_id')
      .eq('owner_id', order.client_id)
    const allowed = new Set((cps || []).map(c => c.counterparty_id))
    carrierIds = carrierIds.filter(id => allowed.has(id))
  }

  if (carrierIds.length === 0) return NextResponse.json({ ok: true, matched: 0 })

  const message = `Новая заявка по вашему маршруту: ${order.from_city} → ${order.to_city}`
  await service.from('notifications').insert(
    carrierIds.map(carrierId => ({
      user_id: carrierId,
      type: 'route_match',
      link: `/orders/${orderId}`,
      message,
    }))
  )

  for (const carrierId of carrierIds) {
    try {
      const { data: carrierAuth } = await service.auth.admin.getUserById(carrierId)
      if (carrierAuth?.user?.email) {
        await sendEmail({
          to: carrierAuth.user.email,
          subject: `Новая заявка по вашему маршруту: ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `Заявка ${esc(order.from_city)} → ${esc(order.to_city)} — по вашему сохранённому маршруту`,
            heading: 'Новая заявка по вашему маршруту',
            bodyHtml: `<p style="margin:0 0 12px;">Появилась новая заявка <strong style="color:#10201F;">${esc(order.from_city)} → ${esc(order.to_city)}</strong>, совпадающая с одним из ваших сохранённых маршрутов.</p>
              <p style="margin:0;">Откройте заявку, чтобы посмотреть детали и откликнуться.</p>`,
            cta: { label: 'Открыть заявку', url: `${APP_URL}/orders/${orderId}` },
          }),
        })
      }
    } catch (e) {
      console.error('[ROUTE-MATCH] email', carrierId, e)
    }
  }

  return NextResponse.json({ ok: true, matched: carrierIds.length })
}
