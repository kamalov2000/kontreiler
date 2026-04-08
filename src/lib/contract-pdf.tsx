import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
} from '@react-pdf/renderer'

// Шрифт с поддержкой кириллицы
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.woff',
      fontWeight: 'normal',
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.woff',
      fontWeight: 'bold',
    },
  ],
})

Font.registerHyphenationCallback(word => [word])

const s = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 9,
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  center: { textAlign: 'center' },
  bold: { fontWeight: 'bold' },
  h1: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 3 },
  h2: { fontSize: 10, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  label: { color: '#555', fontSize: 8, marginBottom: 1 },
  val: { fontSize: 9 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 8 },
  block: {
    border: '0.5 solid #ddd',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    gap: 20,
  },
  signBox: { flex: 1 },
  signLine: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    marginTop: 24,
    marginBottom: 3,
  },
  signLabel: { fontSize: 8, color: '#555' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#aaa',
    textAlign: 'center',
  },
  table: { border: '0.5 solid #ddd', borderRadius: 4, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  tableRowLast: { flexDirection: 'row' },
  tableKey: { width: '40%', padding: '5 6', backgroundColor: '#f8f8f8', fontSize: 8, color: '#555' },
  tableVal: { flex: 1, padding: '5 6', fontSize: 9 },
})

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={{ marginBottom: 3 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.val}>{value}</Text>
    </View>
  )
}

function TableRow({ k, v, last }: { k: string; v?: string | null; last?: boolean }) {
  if (!v) return null
  return (
    <View style={last ? s.tableRowLast : s.tableRow}>
      <Text style={s.tableKey}>{k}</Text>
      <Text style={s.tableVal}>{v}</Text>
    </View>
  )
}

export interface ContractData {
  orderNumber: string
  orderDate: string
  // Маршрут
  fromCity: string
  fromAddress: string | null
  viaCity: string | null
  viaAddress: string | null
  toCity: string
  toAddress: string | null
  // Параметры груза
  containerType: string
  containerLabel: string
  weightGross: number | null
  weightNet: number | null
  weightGross2: number | null
  weightNet2: number | null
  requiresGenset: boolean
  readyDate: string
  // Ставки
  price: number | null
  vatLabel: string
  agreedPrice: number | null
  // Клиент
  client: PartyData
  // Перевозчик
  carrier: PartyData
  // Обязательства (берутся из профиля клиента или стандартные)
  obligations: string
}

export interface PartyData {
  role: 'client' | 'carrier'
  name: string | null
  companyName: string | null
  inn: string | null
  kpp: string | null
  ogrn: string | null
  legalAddress: string | null
  bankName: string | null
  bankAccount: string | null
  bankCorrAccount: string | null
  bankBik: string | null
  signatoryName: string | null
  signatoryPosition: string | null
  signatoryBasis: string | null
}

function PartyBlock({ party, title }: { party: PartyData; title: string }) {
  const companyName = party.companyName || party.name || '—'
  return (
    <View style={s.block}>
      <Text style={[s.bold, { marginBottom: 5, fontSize: 9 }]}>{title}</Text>
      <View style={s.row}>
        <View style={s.col}>
          <Field label="Компания" value={companyName} />
          <Field label="ИНН" value={party.inn} />
          <Field label="КПП" value={party.kpp} />
          <Field label="ОГРН" value={party.ogrn} />
          <Field label="Юридический адрес" value={party.legalAddress} />
        </View>
        <View style={s.col}>
          <Field label="Банк" value={party.bankName} />
          <Field label="Р/с" value={party.bankAccount} />
          <Field label="К/с" value={party.bankCorrAccount} />
          <Field label="БИК" value={party.bankBik} />
          <Field label="Подписант" value={party.signatoryName} />
          <Field label="Должность" value={party.signatoryPosition} />
          {party.signatoryBasis && <Field label="Действует на основании" value={party.signatoryBasis} />}
        </View>
      </View>
    </View>
  )
}

const DEFAULT_OBLIGATIONS = `ЗАКАЗЧИК обязуется:
1. Предоставить контейнер и груз в согласованные сроки в место погрузки.
2. Обеспечить загрузку/разгрузку транспортного средства в сроки, не превышающие нормы простоя.
3. Оплатить услуги Исполнителя в установленные сроки.
4. Предоставить необходимые товаросопроводительные документы.

ИСПОЛНИТЕЛЬ обязуется:
1. Подать транспортное средство в срок и место, указанные в заявке.
2. Обеспечить сохранность груза в ходе перевозки.
3. Доставить груз в место назначения в согласованные сроки.
4. Уведомить Заказчика о прибытии транспортного средства и о доставке груза.

Платформа Контрейл является информационным посредником и не несёт ответственности за исполнение настоящего договора.`

export function ContractDocument({ data }: { data: ContractData }) {
  const obligations = data.obligations || DEFAULT_OBLIGATIONS

  return (
    <Document
      title={`Договор-заявка ${data.orderNumber}`}
      author="Платформа Контрейл"
    >
      <Page size="A4" style={s.page}>

        {/* Заголовок */}
        <Text style={s.h1}>ДОГОВОР-ЗАЯВКА</Text>
        <Text style={s.h1}>на оказание транспортно-экспедиционных услуг</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 4 }}>
          <Text><Text style={s.bold}>№ {data.orderNumber}</Text></Text>
          <Text>от {data.orderDate}</Text>
        </View>
        <View style={s.divider} />

        {/* Стороны */}
        <Text style={s.h2}>1. СТОРОНЫ</Text>
        <View style={s.row}>
          <View style={s.col}>
            <PartyBlock party={data.client} title="ЗАКАЗЧИК" />
          </View>
          <View style={s.col}>
            <PartyBlock party={data.carrier} title="ИСПОЛНИТЕЛЬ" />
          </View>
        </View>

        {/* Маршрут */}
        <Text style={s.h2}>2. МАРШРУТ</Text>
        <View style={s.table}>
          <TableRow k="Пункт отправления" v={data.fromCity + (data.fromAddress ? ` — ${data.fromAddress}` : '')} />
          {data.viaCity && (
            <TableRow k="Транзитный пункт" v={data.viaCity + (data.viaAddress ? ` — ${data.viaAddress}` : '')} />
          )}
          <TableRow k="Пункт назначения" v={data.toCity + (data.toAddress ? ` — ${data.toAddress}` : '')} last />
        </View>

        {/* Параметры */}
        <Text style={s.h2}>3. ПАРАМЕТРЫ ГРУЗА И ТРАНСПОРТА</Text>
        <View style={s.table}>
          <TableRow k="Тип контейнера" v={data.containerLabel} />
          <TableRow k="Дата погрузки" v={data.readyDate} />
          {data.weightGross && (
            <TableRow k="Вес брутто (Конт. 1)" v={`${data.weightGross.toLocaleString('ru-RU')} кг`} />
          )}
          {data.weightNet && (
            <TableRow k="Вес нетто (Конт. 1)" v={`${data.weightNet.toLocaleString('ru-RU')} кг`} />
          )}
          {data.weightGross2 && (
            <TableRow k="Вес брутто (Конт. 2)" v={`${data.weightGross2.toLocaleString('ru-RU')} кг`} />
          )}
          {data.weightNet2 && (
            <TableRow k="Вес нетто (Конт. 2)" v={`${data.weightNet2.toLocaleString('ru-RU')} кг`} />
          )}
          <TableRow
            k="Генераторная установка"
            v={data.requiresGenset ? 'Требуется' : 'Не требуется'}
            last={!data.agreedPrice && !data.price}
          />
        </View>

        {/* Ставка */}
        <Text style={s.h2}>4. СТАВКА И ОПЛАТА</Text>
        <View style={s.table}>
          {data.agreedPrice ? (
            <>
              <TableRow k="Согласованная ставка" v={`${data.agreedPrice.toLocaleString('ru-RU')} ₽`} />
              {data.price && <TableRow k="Первоначальная ставка" v={`${data.price.toLocaleString('ru-RU')} ₽`} />}
            </>
          ) : data.price ? (
            <TableRow k="Ставка" v={`${data.price.toLocaleString('ru-RU')} ₽`} />
          ) : (
            <TableRow k="Ставка" v="Договорная" />
          )}
          <TableRow k="НДС" v={data.vatLabel} last />
        </View>

        {/* Обязанности */}
        <Text style={s.h2}>5. ОБЯЗАННОСТИ СТОРОН</Text>
        <View style={[s.block, { backgroundColor: '#fafafa' }]}>
          <Text style={{ fontSize: 8, lineHeight: 1.6, color: '#333' }}>{obligations}</Text>
        </View>

        {/* Подписи */}
        <Text style={s.h2}>6. РЕКВИЗИТЫ И ПОДПИСИ</Text>
        <View style={s.signRow}>
          <View style={s.signBox}>
            <Text style={[s.bold, { marginBottom: 4 }]}>ЗАКАЗЧИК</Text>
            <Text style={{ fontSize: 8 }}>{data.client.companyName || data.client.name || '—'}</Text>
            {data.client.inn && <Text style={{ fontSize: 8 }}>ИНН: {data.client.inn}</Text>}
            <View style={s.signLine} />
            <Text style={s.signLabel}>{data.client.signatoryName || '___________________'}</Text>
            <Text style={s.signLabel}>{data.client.signatoryPosition || 'подпись / расшифровка'}</Text>
            <Text style={[s.signLabel, { marginTop: 8 }]}>М.П.</Text>
          </View>
          <View style={s.signBox}>
            <Text style={[s.bold, { marginBottom: 4 }]}>ИСПОЛНИТЕЛЬ</Text>
            <Text style={{ fontSize: 8 }}>{data.carrier.companyName || data.carrier.name || '—'}</Text>
            {data.carrier.inn && <Text style={{ fontSize: 8 }}>ИНН: {data.carrier.inn}</Text>}
            <View style={s.signLine} />
            <Text style={s.signLabel}>{data.carrier.signatoryName || '___________________'}</Text>
            <Text style={s.signLabel}>{data.carrier.signatoryPosition || 'подпись / расшифровка'}</Text>
            <Text style={[s.signLabel, { marginTop: 8 }]}>М.П.</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          Сформировано платформой Контрейл · kontreiler.vercel.app · Платформа является информационным посредником
        </Text>
      </Page>
    </Document>
  )
}
