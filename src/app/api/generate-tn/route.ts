import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { TnDocument, TnData } from '@/lib/tn-pdf'

// react-pdf требует Node-рантайм (не Edge); maxDuration — на холодный старт с рендером.
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Поля накладной приходят из формы уже отредактированными пользователем —
// сервер их не переизобретает, только режет длину, чтобы в PDF не приехала
// простыня на мегабайт.
const MAX_FIELD = 500

function str(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, MAX_FIELD)
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
  }

  const orderId = typeof body.order_id === 'string' ? body.order_id : ''
  if (!orderId || !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'order_id обязателен' }, { status: 400 })
  }

  // Аутентификация — анонимным ключом по cookie-сессии.
  const supabaseAuth = await createClient()
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser()
  if (!authUser) {
    return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, accepted_carrier_id, status, order_number, created_at')
    .eq('id', orderId)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }

  // Доступ: только клиент-владелец и принятый перевозчик.
  const isClient = order.client_id === authUser.id
  const isCarrier = order.accepted_carrier_id === authUser.id
  if (!isClient && !isCarrier) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }

  // ТН имеет смысл только после того, как перевозчик принят.
  const allowedStatuses = ['matched', 'in_transit', 'delivered', 'closed']
  if (!allowedStatuses.includes(order.status)) {
    return NextResponse.json(
      { error: 'Накладная доступна после принятия перевозчика' },
      { status: 422 }
    )
  }

  const orderNumber = order.order_number ?? `КТ-${order.id.slice(0, 6).toUpperCase()}`
  const tnNumber = str(body.tn_number) || orderNumber

  const data: TnData = {
    tnNumber,
    tnDate: str(body.tn_date),
    orderNumber: str(body.order_number) || orderNumber,
    orderDate: str(body.order_date),

    consigneeRequisites: str(body.consignee_requisites),
    deliveryAddress: str(body.delivery_address),

    cargoName: str(body.cargo_name),
    placesCount: str(body.places_count),
    placesUnit: str(body.places_unit),
    weightGross: str(body.weight_gross),
    weightNet: str(body.weight_net),

    route: str(body.route),
    deliveryDeadline: str(body.delivery_deadline),
    forwardingContact: str(body.forwarding_contact),
    // null → секция «Температурный режим» вообще не печатается (не-REF контейнер).
    temperatureMode: body.temperature_mode === null || body.temperature_mode === undefined
      ? null
      : str(body.temperature_mode),
    seal: str(body.seal),

    carrierRequisites: str(body.carrier_requisites),
    driverName: str(body.driver_name),

    vehicle: str(body.vehicle),
    trailerPlate: str(body.trailer_plate),

    pickupAddress: str(body.pickup_address),
    pickupDatetime: str(body.pickup_datetime),
    containerNumber: str(body.container_number),

    unloadAddress: str(body.unload_address),
    unloadDatetime: str(body.unload_datetime),

    costNoVat: str(body.cost_no_vat),
    vatRate: str(body.vat_rate),
    costWithVat: str(body.cost_with_vat),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(TnDocument, { data }) as any

  const filename = `TN-${tnNumber}.pdf`
  // Content-Disposition — только Latin-1, а номер кириллический («КТ-…»):
  // даём ASCII-безопасное имя + RFC 5987 filename* с UTF-8.
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_')
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`

  try {
    const buffer = await renderToBuffer(element)
    const uint8 = new Uint8Array(buffer)
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Content-Length': String(uint8.byteLength),
      },
    })
  } catch (e) {
    console.error('generate-tn: renderToBuffer failed', e)
    return NextResponse.json(
      { error: 'Не удалось сформировать PDF накладной. Попробуйте ещё раз через минуту.' },
      { status: 500 }
    )
  }
}
