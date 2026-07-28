import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kontreiler.vercel.app'

// Города — свободный ввод пользователя, экранируем перед вставкой в HTML письма.
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Перевозчик внёс или заменил данные водителя и ТС.
 *
 * Делается на сервере, потому что перевозчику по RLS недоступно ни создание
 * уведомлений (их пишут SECURITY DEFINER-триггеры), ни UPDATE чужой заявки —
 * а сбросить флаг баннера driver_info_seen нужно именно на заявке клиента.
 *
 * changed = true → это замена: клиенту показывается баннер «скачайте документы
 * заново». changed = false → первое заполнение: баннера нет, но клиента всё
 * равно уведомляем — для него это разблокировка документов.
 */
export async function POST(req: Request) {
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  const changed = body?.changed === true
  if (!orderId || !UUID_RE.test(orderId)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: order } = await service
    .from('orders')
    .select('id, client_id, accepted_carrier_id, status, from_city, to_city')
    .eq('id', orderId)
    .single()

  // Данные водителя вносит только принятый перевозчик по этой заявке.
  if (!order || order.accepted_carrier_id !== user.id) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  // После доставки/закрытия/отмены документы уже оформлены — не дёргаем клиента.
  if (['delivered', 'closed', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const message = changed
    ? 'Перевозчик изменил данные по водителю и транспортному средству — скачайте документы заново'
    : 'Перевозчик внёс данные по водителю и транспортному средству — документы доступны для скачивания'

  // Баннер поднимаем только на замену: при первом заполнении скачивать заново нечего.
  if (changed) {
    await service.from('orders').update({ driver_info_seen: false }).eq('id', orderId)
  }

  const { error } = await service.from('notifications').insert({
    user_id: order.client_id,
    type: 'driver_info_changed',
    link: `/orders/${orderId}`,
    message,
    is_read: false,
  })
  if (error) {
    console.error('[DRIVER-INFO-CHANGED]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  // Письмо клиенту — некритичный путь, ошибку глотаем.
  try {
    const { data: clientAuth } = await service.auth.admin.getUserById(order.client_id)
    if (clientAuth?.user?.email) {
      const route = `${esc(order.from_city)} → ${esc(order.to_city)}`
      await sendEmail({
        to: clientAuth.user.email,
        subject: changed
          ? `Данные водителя изменены: ${order.from_city} → ${order.to_city}`
          : `Водитель назначен: ${order.from_city} → ${order.to_city}`,
        html: renderEmail({
          preview: changed
            ? `Перевозчик заменил водителя по заявке ${route}`
            : `Перевозчик назначил водителя по заявке ${route}`,
          heading: changed ? 'Данные водителя изменены' : 'Водитель назначен',
          bodyHtml: changed
            ? `<p style="margin:0 0 12px;">Перевозчик изменил данные по водителю и транспортному средству по заявке <strong style="color:#10201F;">${route}</strong>.</p>
               <p style="margin:0;">Ранее скачанные договор-заявка и транспортная накладная содержат прежние данные — сформируйте документы заново.</p>`
            : `<p style="margin:0 0 12px;">Перевозчик внёс данные по водителю и транспортному средству по заявке <strong style="color:#10201F;">${route}</strong>.</p>
               <p style="margin:0;">Договор-заявка и транспортная накладная теперь доступны для скачивания.</p>`,
          cta: { label: 'Открыть заявку', url: `${APP_URL}/orders/${orderId}` },
        }),
      })
    }
  } catch (e) {
    console.error('[DRIVER-INFO-CHANGED] email', e)
  }

  return NextResponse.json({ ok: true })
}
