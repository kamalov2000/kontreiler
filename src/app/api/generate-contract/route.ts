import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ContractDocument, ContractData, PartyData } from '@/lib/contract-pdf'
import { CONTAINER_TYPES } from '@/lib/cities'

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

function vatLabel(vat: string | null): string {
  if (vat === 'vat20') return 'НДС 22%'
  if (vat === 'vat0')  return 'НДС 0%'
  if (vat === 'vat5')  return 'НДС 5%'
  if (vat === 'vat15') return 'НДС 15%'
  return 'Без НДС'
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
    containerType: order.container_type,
    containerLabel,
    weightGross: order.weight_gross,
    weightNet: order.weight_net,
    weightGross2: order.weight_gross_2,
    weightNet2: order.weight_net_2,
    requiresGenset: !!order.requires_genset,
    readyDate: formatDate(order.ready_date),
    price: order.price,
    vatLabel: vatLabel(order.vat_type),
    agreedPrice: order.agreed_price,
    client: toParty(clientUser),
    carrier: carrierUser ? toParty(carrierUser) : {
      role: 'carrier',
      name: 'Перевозчик',
      companyName: null, inn: null, kpp: null, ogrn: null, legalAddress: null,
      bankName: null, bankAccount: null, bankCorrAccount: null, bankBik: null,
      signatoryName: null, signatoryPosition: null, signatoryBasis: null,
    },
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
