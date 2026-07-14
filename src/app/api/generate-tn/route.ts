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

interface OrderAccess {
  id: string
  client_id: string
  accepted_carrier_id: string | null
  status: string
  order_number: string | null
  created_at: string
}

/**
 * Общая для GET и POST проверка: авторизован, участник сделки, перевозчик принят.
 * Возвращает либо заявку, либо готовый ответ с ошибкой.
 */
async function loadOrderForParty(
  orderId: string
): Promise<{ order: OrderAccess; userId: string } | { error: NextResponse }> {
  if (!orderId || !UUID_RE.test(orderId)) {
    return { error: NextResponse.json({ error: 'order_id обязателен' }, { status: 400 }) }
  }

  // Аутентификация — анонимным ключом по cookie-сессии.
  const supabaseAuth = await createClient()
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser()
  if (!authUser) {
    return { error: NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 }) }
  }

  const supabase = createServiceClient()
  const { data: order } = await supabase
    .from('orders')
    .select('id, client_id, accepted_carrier_id, status, order_number, created_at')
    .eq('id', orderId)
    .single()

  if (!order) {
    return { error: NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 }) }
  }

  // Доступ: только клиент-владелец и принятый перевозчик.
  const isClient = order.client_id === authUser.id
  const isCarrier = order.accepted_carrier_id === authUser.id
  if (!isClient && !isCarrier) {
    return { error: NextResponse.json({ error: 'Нет доступа' }, { status: 403 }) }
  }

  // ТН имеет смысл только после того, как перевозчик принят.
  const allowedStatuses = ['matched', 'in_transit', 'delivered', 'closed']
  if (!allowedStatuses.includes(order.status)) {
    return {
      error: NextResponse.json(
        { error: 'Накладная доступна после принятия перевозчика' },
        { status: 422 }
      ),
    }
  }

  return { order: order as OrderAccess, userId: authUser.id }
}

/** Реквизиты стороны одной строкой: «ООО «Ромашка», ИНН 7707083893, 198188, г. Санкт-Петербург…». */
function partyRequisites(u: Record<string, unknown> | null): string {
  if (!u) return ''
  const parts = [
    (u.company_name as string) || (u.name as string) || '',
    u.inn ? `ИНН ${u.inn}` : '',
    (u.legal_address as string) || '',
  ]
  return parts.filter(Boolean).join(', ')
}

/**
 * Префилл формы накладной. Юридический адрес лежит в приватной user_private,
 * которую клиентский код второй стороны прочитать не может (RLS) — поэтому
 * реквизиты грузоотправителя и перевозчика собирает сервер под service_role.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const res = await loadOrderForParty(searchParams.get('order_id') ?? '')
  if ('error' in res) return res.error
  const { order } = res

  const supabase = createServiceClient()

  async function requisitesOf(userId: string | null): Promise<string> {
    if (!userId) return ''
    const [{ data: pub }, { data: priv }] = await Promise.all([
      supabase.from('users').select('name, company_name, inn').eq('id', userId).maybeSingle(),
      supabase.from('user_private').select('legal_address').eq('id', userId).maybeSingle(),
    ])
    if (!pub) return ''
    return partyRequisites({ ...pub, ...(priv || {}) })
  }

  const [shipper, carrier] = await Promise.all([
    requisitesOf(order.client_id),
    requisitesOf(order.accepted_carrier_id),
  ])

  // Грузоотправитель и составитель документа со стороны грузоотправителя —
  // одно и то же лицо (клиент). Так же и по перевозчику.
  return NextResponse.json({
    shipper_requisites: shipper,
    carrier_requisites: carrier,
  })
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
  }

  const res = await loadOrderForParty(typeof body.order_id === 'string' ? body.order_id : '')
  if ('error' in res) return res.error
  const { order } = res

  const orderNumber = order.order_number ?? `КТ-${order.id.slice(0, 6).toUpperCase()}`
  const tnNumber = str(body.tn_number) || orderNumber

  const data: TnData = {
    tnNumber,
    tnDate: str(body.tn_date),
    orderNumber: str(body.order_number) || orderNumber,
    orderDate: str(body.order_date),
    copyNumber: str(body.copy_number),

    shipperRequisites: str(body.shipper_requisites),
    shipperIsForwarder: body.shipper_is_forwarder === true,
    shipperPaymentBasis: str(body.shipper_payment_basis),

    serviceCustomerRequisites: str(body.service_customer_requisites),
    serviceContractRequisites: str(body.service_contract_requisites),

    consigneeRequisites: str(body.consignee_requisites),
    deliveryAddress: str(body.delivery_address),

    containerNumber: str(body.container_number),
    cargoName: str(body.cargo_name),
    cargoPackaging: str(body.cargo_packaging),
    cargoMass: str(body.cargo_mass),
    declaredValue: str(body.declared_value),

    docsDangerous: str(body.docs_dangerous),
    docsCertificates: str(body.docs_certificates),
    docsShipping: str(body.docs_shipping),

    route: str(body.route),
    deliveryDeadline: str(body.delivery_deadline),
    forwardingContact: str(body.forwarding_contact),
    specialRequirements: str(body.special_requirements),
    temperatureAndSeal: str(body.temperature_and_seal),

    carrierRequisites: str(body.carrier_requisites),
    driverName: str(body.driver_name),

    vehicleTypeBrand: str(body.vehicle_type_brand),
    vehiclePlate: str(body.vehicle_plate),
    ownershipType: str(body.ownership_type),
    ownershipDoc: str(body.ownership_doc),
    specialPermit: str(body.special_permit),

    loaderRequisites: str(body.loader_requisites),
    loadingPointOwner: str(body.loading_point_owner),
    pickupAddress: str(body.pickup_address),
    pickupDatetime: str(body.pickup_datetime),
    massAtLoading: str(body.mass_at_loading),
    placesAtLoading: str(body.places_at_loading),
    packagingAtLoading: str(body.packaging_at_loading),

    unloadAddress: str(body.unload_address),
    unloadDatetime: str(body.unload_datetime),
    massAtUnloading: str(body.mass_at_unloading),

    costNoVat: str(body.cost_no_vat),
    vatRate: str(body.vat_rate),
    vatAmount: str(body.vat_amount),
    costWithVat: str(body.cost_with_vat),
    costCalcOrder: str(body.cost_calc_order),
    economicSubjectCarrier: str(body.economic_subject_carrier),
    economicSubjectShipper: str(body.economic_subject_shipper),
    economicBasisCarrier: str(body.economic_basis_carrier),
    economicBasisShipper: str(body.economic_basis_shipper),
    payerRequisites: str(body.payer_requisites),
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
