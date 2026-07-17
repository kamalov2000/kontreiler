import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kontreiler.vercel.app'

// Экранируем пользовательские данные перед вставкой в HTML письма
// (имена/города — свободный ввод, иначе возможна инъекция разметки/фишинг)
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ ok: true }) // email некритичен, не раскрываем ошибку
    }

    const body = await req.json()
    const { type } = body
    const supabase = createServiceClient()

    if (type === 'new_response') {
      const { orderId, carrierId } = body
      if (!UUID_RE.test(orderId) || !UUID_RE.test(carrierId)) return NextResponse.json({ ok: true })
      // Уведомление инициирует сам перевозчик — он и должен быть вызывающим
      if (authUser.id !== carrierId) return NextResponse.json({ ok: true })

      const { data: order } = await supabase
        .from('orders')
        .select('from_city, to_city, client:users!client_id(id)')
        .eq('id', orderId)
        .single()
      const { data: carrier } = await supabase
        .from('users').select('name').eq('id', carrierId).single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientId = (order as any)?.client?.id
      if (!clientId || !UUID_RE.test(clientId)) return NextResponse.json({ ok: true })

      const { data: clientAuth } = await supabase.auth.admin.getUserById(clientId)
      if (order && carrier && clientAuth?.user?.email) {
        await sendEmail({
          to: clientAuth.user.email,
          subject: `Новый отклик на заявку ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `Перевозчик ${esc(carrier.name)} готов взять ваш груз`,
            heading: 'Новый отклик на заявку',
            bodyHtml: `<p style="margin:0 0 12px;">Перевозчик <strong style="color:#10201F;">${esc(carrier.name)}</strong> откликнулся на вашу заявку <strong style="color:#10201F;">${esc(order.from_city)} → ${esc(order.to_city)}</strong>.</p>
              <p style="margin:0;">Откройте заявку, чтобы посмотреть отклик и связаться с перевозчиком.</p>`,
            cta: { label: 'Открыть заявку', url: `${APP_URL}/orders/${orderId}` },
          }),
        })
      }
    }

    if (type === 'response_accepted') {
      const { orderId, carrierId } = body
      if (!UUID_RE.test(orderId) || !UUID_RE.test(carrierId)) return NextResponse.json({ ok: true })

      const { data: order } = await supabase
        .from('orders').select('from_city, to_city, client_id').eq('id', orderId).single()
      // Принимает отклик только владелец заявки
      if (!order || order.client_id !== authUser.id) return NextResponse.json({ ok: true })

      const { data: carrierAuth } = await supabase.auth.admin.getUserById(carrierId)

      if (carrierAuth?.user?.email) {
        await sendEmail({
          to: carrierAuth.user.email,
          subject: `Ваш отклик принят: ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `Клиент выбрал вас перевозчиком по маршруту ${esc(order.from_city)} → ${esc(order.to_city)}`,
            heading: 'Ваш отклик принят',
            bodyHtml: `<p style="margin:0 0 12px;">Клиент принял ваш отклик на заявку <strong style="color:#10201F;">${esc(order.from_city)} → ${esc(order.to_city)}</strong>.</p>
              <p style="margin:0;">Перейдите к заявке и в чат, чтобы согласовать детали рейса.</p>`,
            cta: { label: 'Перейти к заявке', url: `${APP_URL}/orders/${orderId}` },
          }),
        })
      }
    }

    if (type === 'new_message') {
      const { orderId, senderId, recipientId } = body
      if (!UUID_RE.test(orderId) || !UUID_RE.test(senderId) || !UUID_RE.test(recipientId)) {
        return NextResponse.json({ ok: true })
      }
      // Письмо о сообщении инициирует его отправитель
      if (authUser.id !== senderId) return NextResponse.json({ ok: true })

      const { data: recipient } = await supabase
        .from('users').select('name, last_seen_at').eq('id', recipientId).single()

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const isOnline = recipient?.last_seen_at && recipient.last_seen_at > tenMinutesAgo
      if (isOnline) return NextResponse.json({ ok: true })

      const { data: order } = await supabase
        .from('orders').select('from_city, to_city').eq('id', orderId).single()
      const { data: sender } = await supabase
        .from('users').select('name').eq('id', senderId).single()
      const { data: recipientAuth } = await supabase.auth.admin.getUserById(recipientId)

      if (order && sender && recipientAuth?.user?.email) {
        await sendEmail({
          to: recipientAuth.user.email,
          subject: `Новое сообщение в чате: ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `${esc(sender.name)} написал вам по заявке ${esc(order.from_city)} → ${esc(order.to_city)}`,
            heading: 'Новое сообщение в чате',
            bodyHtml: `<p style="margin:0 0 12px;"><strong style="color:#10201F;">${esc(sender.name)}</strong> написал вам в чате по заявке <strong style="color:#10201F;">${esc(order.from_city)} → ${esc(order.to_city)}</strong>.</p>
              <p style="margin:0;">Откройте чат, чтобы прочитать и ответить.</p>`,
            cta: { label: 'Открыть чат', url: `${APP_URL}/orders/${orderId}/chat` },
          }),
        })
      }
    }

    if (type === 'order_delivered') {
      const { orderId, carrierId } = body
      if (!UUID_RE.test(orderId) || !UUID_RE.test(carrierId)) return NextResponse.json({ ok: true })

      const { data: order } = await supabase
        .from('orders').select('from_city, to_city, client_id').eq('id', orderId).single()
      // Статус меняет только владелец заявки
      if (!order || order.client_id !== authUser.id) return NextResponse.json({ ok: true })

      const { data: carrierAuth } = await supabase.auth.admin.getUserById(carrierId)

      if (carrierAuth?.user?.email) {
        await sendEmail({
          to: carrierAuth.user.email,
          subject: `Рейс завершён: ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `Доставка по маршруту ${esc(order.from_city)} → ${esc(order.to_city)} подтверждена`,
            heading: 'Рейс завершён',
            bodyHtml: `<p style="margin:0 0 12px;">Клиент подтвердил доставку по заявке <strong style="color:#10201F;">${esc(order.from_city)} → ${esc(order.to_city)}</strong>. Рейс успешно завершён.</p>
              <p style="margin:0;">Не забудьте оставить отзыв — это помогает другим участникам площадки.</p>`,
            cta: { label: 'Открыть заявку', url: `${APP_URL}/orders/${orderId}` },
          }),
        })
      }
    }

    if (type === 'order_cancelled') {
      const { orderId, carrierId } = body
      if (!UUID_RE.test(orderId) || !UUID_RE.test(carrierId)) return NextResponse.json({ ok: true })

      const { data: order } = await supabase
        .from('orders').select('from_city, to_city, client_id').eq('id', orderId).single()
      // Отменяет заявку только её владелец
      if (!order || order.client_id !== authUser.id) return NextResponse.json({ ok: true })

      const { data: carrierAuth } = await supabase.auth.admin.getUserById(carrierId)

      if (carrierAuth?.user?.email) {
        await sendEmail({
          to: carrierAuth.user.email,
          subject: `Заявка отменена: ${order.from_city} → ${order.to_city}`,
          html: renderEmail({
            preview: `Заявка ${esc(order.from_city)} → ${esc(order.to_city)} отменена клиентом`,
            heading: 'Заявка отменена',
            bodyHtml: `<p style="margin:0;">Клиент отменил заявку <strong style="color:#10201F;">${esc(order.from_city)} → ${esc(order.to_city)}</strong>, на которую вы откликались. Дополнительных действий не требуется.</p>`,
            cta: { label: 'Смотреть другие заявки', url: `${APP_URL}/feed` },
          }),
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[EMAIL API]', err)
    return NextResponse.json({ ok: true }) // email некритичен, не ломаем клиент
  }
}
