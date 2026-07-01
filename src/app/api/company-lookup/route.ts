import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const STUB = {
  name: 'ООО «Пример Компания»',
  short_name: 'ООО «Пример»',
  kpp: '770101001',
  ogrn: '1027700132195',
  legal_address: 'г. Москва, ул. Примерная, д. 1, офис 1',
  director_name: 'Иванов Иван Иванович',
  director_position: 'Генеральный директор',
  _stub: true,
  _hint: 'Задайте переменную окружения DADATA_API_KEY (и опционально DADATA_SECRET_KEY) для реальных данных',
}

export async function GET(req: Request) {
  // Только для авторизованных — иначе внешний ключ DaData можно расходовать анонимно
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const inn = searchParams.get('inn')?.trim()

  if (!inn || !/^\d{10}$|^\d{12}$/.test(inn)) {
    return NextResponse.json({ error: 'Укажите корректный ИНН (10 или 12 цифр)' }, { status: 400 })
  }

  const apiKey = process.env.DADATA_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ...STUB, inn })
  }

  const secretKey = process.env.DADATA_SECRET_KEY

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Token ${apiKey}`,
  }

  // X-Secret используется для clean-методов DaData; для suggestions — опционально, но добавляем если задан
  if (secretKey) {
    headers['X-Secret'] = secretKey
  }

  try {
    const res = await fetch(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: inn, count: 1 }),
      }
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[DADATA ERROR]', res.status, text)
      return NextResponse.json({ error: `DaData: ${res.status} ${res.statusText}` }, { status: 502 })
    }

    const data = await res.json()
    const s = data.suggestions?.[0]

    if (!s) {
      return NextResponse.json({ error: 'Компания с таким ИНН не найдена' }, { status: 404 })
    }

    return NextResponse.json({
      inn,
      name: s.data.name?.full_with_opf ?? s.value,
      short_name: s.data.name?.short_with_opf ?? s.value,
      kpp: s.data.kpp ?? null,
      ogrn: s.data.ogrn ?? null,
      legal_address: s.data.address?.value ?? null,
      director_name: s.data.management?.name ?? null,
      director_position: s.data.management?.post ?? null,
    })
  } catch (err) {
    console.error('[DADATA FETCH ERROR]', err)
    return NextResponse.json({ error: 'Ошибка соединения с DaData' }, { status: 503 })
  }
}
