import { NextResponse } from 'next/server'
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
 * Вызывается только из send_driver_info_reminders() (pg_cron + pg_net) — сам
 * Postgres письма слать не умеет, поэтому отправку делегирует сюда. Уведомление
 * в notifications уже вставлено самой SQL-функцией — это только письмо.
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const orders: { orderId?: string; carrierId?: string }[] = Array.isArray(body?.orders) ? body.orders : []
  const service = createServiceClient()

  let sent = 0
  for (const item of orders) {
    const orderId = item.orderId
    const carrierId = item.carrierId
    if (!orderId || !carrierId || !UUID_RE.test(orderId) || !UUID_RE.test(carrierId)) continue

    try {
      const { data: order } = await service
        .from('orders').select('from_city, to_city').eq('id', orderId).single()
      const { data: carrierAuth } = await service.auth.admin.getUserById(carrierId)

      if (order && carrierAuth?.user?.email) {
        const route = `${esc(order.from_city)} → ${esc(order.to_city)}`
        await sendEmail({
          to: carrierAuth.user.email,
          subject: `Напоминание: внесите данные по водителю — ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `Клиент не сможет оформить документы по заявке ${route}`,
            heading: 'Внесите данные по водителю и ТС',
            bodyHtml: `<p style="margin:0 0 12px;">По заявке <strong style="color:#10201F;">${route}</strong> клиент до сих пор не может оформить документы — данные по водителю и транспортному средству ещё не внесены.</p>
              <p style="margin:0;">Внесите их как можно скорее, чтобы клиент мог скачать договор-заявку и транспортную накладную.</p>`,
            cta: { label: 'Внести данные', url: `${APP_URL}/orders/${orderId}` },
          }),
        })
        sent++
      }
    } catch (e) {
      console.error('[CRON driver-info-reminders]', orderId, e)
    }
  }

  return NextResponse.json({ ok: true, sent })
}
