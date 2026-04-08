import { NextResponse } from 'next/server'

const STUB = {
  name: 'ООО «Пример Компания»',
  short_name: 'ООО «Пример»',
  kpp: '770101001',
  ogrn: '1027700132195',
  legal_address: 'г. Москва, ул. Примерная, д. 1, офис 1',
  director_name: 'Иванов Иван Иванович',
  director_position: 'Генеральный директор',
  _stub: true,
  _hint: 'Задайте переменную окружения DADATA_API_KEY для реальных данных из DaData',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const inn = searchParams.get('inn')?.trim()

  if (!inn || !/^\d{10}$|^\d{12}$/.test(inn)) {
    return NextResponse.json({ error: 'Укажите корректный ИНН (10 или 12 цифр)' }, { status: 400 })
  }

  const apiKey = process.env.DADATA_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ...STUB, inn })
  }

  try {
    const res = await fetch(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({ query: inn, count: 1 }),
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'Ошибка запроса к DaData' }, { status: 502 })
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
  } catch {
    return NextResponse.json({ error: 'Ошибка соединения с DaData' }, { status: 503 })
  }
}
