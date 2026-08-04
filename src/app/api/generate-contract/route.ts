import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ContractDocument, ContractData, PartyData } from '@/lib/contract-pdf'
import { CONTAINER_TYPES } from '@/lib/cities'
import { isDocGenerationBlocked, DRIVER_GATE_MESSAGE } from '@/lib/driver-gate'
import { vatDocLabel } from '@/lib/utils'

// react-pdf требует Node-рантайм (не Edge). maxDuration — чтобы холодный старт
// с рендером PDF и загрузкой шрифта не упирался в дефолтный лимит функции.
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

// Дата и время погрузки/выгрузки: «3 августа 2026 г., 14:30».
// ready_date — колонка DATE («2026-08-03»): подставляем полночь явно, иначе
// строка читается как UTC и в зонах западнее Гринвича дата уезжает на сутки.
// ready_time — VARCHAR(5), «14:30»; если не задано, остаётся одна дата.
function formatLoadingDateTime(date: string, time: string | null): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`)
  const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  return time ? `${dateStr}, ${time}` : dateStr
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toParty(u: any): PartyData {
  return {
    role: u.role,
    name: u.name,
    companyName: u.company_name,
    inn: u.inn,
    kpp: u.kpp,
    ogrn: u.ogrn,
    legalAddress: u.legal_address,
    bankName: u.bank_name,
    bankAccount: u.bank_account,
    bankCorrAccount: u.bank_corr_account,
    bankBik: u.bank_bik,
    signatoryName: u.signatory_name,
    signatoryPosition: u.signatory_position,
    signatoryBasis: u.signatory_basis,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('order_id')

  if (!orderId || !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'order_id обязателен' }, { status: 400 })
  }

  // Проверяем аутентификацию
  const supabaseAuth = await createClient()
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser()
  if (!authUser) {
    return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Загружаем заявку с данными клиента
  const { data: order } = await supabase
    .from('orders')
    .select('*, client:users!client_id(*)')
    .eq('id', orderId)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }

  // Проверяем доступ: только клиент и принятый перевозчик
  const isClient = order.client_id === authUser.id
  const isCarrier = order.accepted_carrier_id === authUser.id
  if (!isClient && !isCarrier) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }

  // Статус должен быть matched или выше
  const allowedStatuses = ['matched', 'in_transit', 'delivered', 'closed']
  if (!allowedStatuses.includes(order.status)) {
    return NextResponse.json({ error: 'Договор доступен после принятия отклика' }, { status: 422 })
  }

  // Клиенту договор-заявка без водителя и машины неполон — не формируем его,
  // пока перевозчик не внёс обязательные данные (кнопка в UI при этом
  // задизейблена, но запрос можно послать и напрямую). Перевозчику отдаём:
  // ему бланк нужен заранее, чтобы дозаполнить руками в дороге.
  if (await isDocGenerationBlocked(supabase, orderId, order.format, isClient)) {
    return NextResponse.json({ error: DRIVER_GATE_MESSAGE }, { status: 403 })
  }

  // Данные водителя и ТС — идут в раздел 3 договора
  const { data: driverInfo } = await supabase
    .from('order_driver_info')
    .select('driver_name, passport_data, vehicle_brand, vehicle_plate, trailer_plate')
    .eq('order_id', orderId)
    .maybeSingle()

  // Загружаем данные перевозчика
  let carrierUser = null
  if (order.accepted_carrier_id) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', order.accepted_carrier_id)
      .single()
    carrierUser = data
  }

  // Чувствительные реквизиты хранятся в user_private (service_role обходит RLS)
  async function withPrivate(u: Record<string, unknown> | null) {
    if (!u?.id) return u
    const { data: priv } = await supabase.from('user_private').select('*').eq('id', u.id).maybeSingle()
    return { ...u, ...(priv || {}) }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientUser = await withPrivate((order as any).client)
  carrierUser = await withPrivate(carrierUser)

  const containerLabel =
    CONTAINER_TYPES.find(c => c.value === order.container_type)?.label ?? order.container_type

  const contractData: ContractData = {
    orderNumber: order.order_number ?? `КТ-${orderId.slice(0, 6).toUpperCase()}`,
    orderDate: formatDate(order.created_at),
    fromCity: order.from_city,
    fromAddress: order.from_city_address,
    viaCity: order.via_city,
    viaAddress: order.via_city_address,
    toCity: order.to_city,
    toAddress: order.to_city_address,
    senderPhone: order.sender_contact_phone ?? null,
    receiverPhone: order.receiver_contact_phone ?? null,
    cargoName: order.cargo_name ?? null,
    containerNumber: order.container_number ?? null,
    containerType: order.container_type,
    containerLabel,
    weightGross: order.weight_gross,
    weightNet: order.weight_net,
    weightGross2: order.weight_gross_2,
    weightNet2: order.weight_net_2,
    requiresGenset: !!order.requires_genset,
    readyDate: formatLoadingDateTime(order.ready_date, order.ready_time ?? null),
    price: order.price,
    vatLabel: vatDocLabel(order.vat_type),
    agreedPrice: order.agreed_price,
    downtimeRate: order.downtime_rate ?? null,
    client: toParty(clientUser),
    carrier: carrierUser ? toParty(carrierUser) : {
      role: 'carrier',
      name: 'Перевозчик',
      companyName: null, inn: null, kpp: null, ogrn: null, legalAddress: null,
      bankName: null, bankAccount: null, bankCorrAccount: null, bankBik: null,
      signatoryName: null, signatoryPosition: null, signatoryBasis: null,
    },
    driver: driverInfo ? {
      name: driverInfo.driver_name,
      passport: driverInfo.passport_data,
      vehicleBrand: driverInfo.vehicle_brand,
      vehiclePlate: driverInfo.vehicle_plate,
      trailerPlate: driverInfo.trailer_plate,
    } : null,
    obligations: clientUser?.default_obligations ?? '',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(ContractDocument, { data: contractData }) as any
  const filename = `dogovor-${contractData.orderNumber}.pdf`
  // Заголовок Content-Disposition — только Latin-1. Номер заявки содержит
  // кириллицу («КТ-…»), поэтому даём ASCII-безопасное имя + RFC 5987 filename*
  // с UTF-8 для браузеров, которые понимают Unicode-имена.
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
    // Раньше падало необработанно → 500 с HTML-страницей и общий тост в UI.
    // Теперь пишем реальную причину в логи Vercel и отдаём понятную ошибку.
    console.error('generate-contract: renderToBuffer failed', e)
    return NextResponse.json(
      { error: 'Не удалось сформировать PDF договора. Попробуйте ещё раз через минуту.' },
      { status: 500 }
    )
  }
}
