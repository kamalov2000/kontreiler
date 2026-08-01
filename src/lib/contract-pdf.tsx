import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
} from '@react-pdf/renderer'
import { ROBOTO_REGULAR, ROBOTO_BOLD } from './contract-fonts'

// Шрифт с поддержкой кириллицы — вшит base64 (без рантайм-загрузки с CDN,
// что раньше валило генерацию PDF на serverless-функции Vercel).
Font.register({
  family: 'Roboto',
  fonts: [
    { src: ROBOTO_REGULAR, fontWeight: 'normal' },
    { src: ROBOTO_BOLD, fontWeight: 'bold' },
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

/**
 * Таблица «ключ — значение». Пустые строки отбрасываются, а разделитель снимается
 * у последней ВИДИМОЙ строки — иначе под ней остаётся висячая линия, когда
 * хвостовые поля не заполнены.
 */
function Rows({ items }: { items: { k: string; v?: string | null }[] }) {
  const visible = items.filter(i => i.v)
  if (visible.length === 0) return null
  return (
    <View style={s.table}>
      {visible.map((it, i) => (
        <View key={it.k} style={i === visible.length - 1 ? s.tableRowLast : s.tableRow}>
          <Text style={s.tableKey}>{it.k}</Text>
          <Text style={s.tableVal}>{it.v}</Text>
        </View>
      ))}
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
  // Контактные лица на погрузке и выгрузке (раздел 2)
  senderPhone: string | null
  receiverPhone: string | null
  // Параметры груза
  cargoName: string | null
  containerNumber: string | null
  containerType: string
  containerLabel: string
  weightGross: number | null
  weightNet: number | null
  weightGross2: number | null
  weightNet2: number | null
  requiresGenset: boolean
  /** Готовая строка «3 августа 2026 г., 14:30» (время — если задано в заявке). */
  readyDate: string
  // Ставки
  price: number | null
  vatLabel: string
  agreedPrice: number | null
  downtimeRate: number | null
  // Клиент
  client: PartyData
  // Перевозчик
  carrier: PartyData
  // Водитель и ТС — вносит перевозчик. Для обычных и срочных заявок договор без
  // них не формируется вовсе, для торгов/редукциона могут быть пустыми.
  driver: DriverData | null
  // Обязательства (берутся из профиля клиента или стандартные)
  obligations: string
}

export interface DriverData {
  name: string | null
  passport: string | null
  vehicleBrand: string | null
  vehiclePlate: string | null
  trailerPlate: string | null
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

        {/* Стороны — только сокращённое наименование, без реквизитов и подписанта.
            Полные реквизиты сторон вынесены в п.6 (к местам подписей). */}
        <Text style={s.h2}>1. СТОРОНЫ</Text>
        <Text style={{ fontSize: 9, lineHeight: 1.5 }}>
          <Text style={s.bold}>{data.client.companyName || data.client.name || '—'}</Text>
          <Text>, именуемое в дальнейшем «Заказчик», и </Text>
          <Text style={s.bold}>{data.carrier.companyName || data.carrier.name || '—'}</Text>
          <Text>, именуемое в дальнейшем «Исполнитель», заключили настоящий Договор-заявку о нижеследующем.</Text>
        </Text>

        {/* Маршрут. Телефоны контактных лиц — сразу под своим пунктом. */}
        <Text style={s.h2}>2. МАРШРУТ</Text>
        <Rows items={[
          { k: 'Пункт отправления', v: data.fromCity + (data.fromAddress ? ` — ${data.fromAddress}` : '') },
          { k: 'Телефон отправителя', v: data.senderPhone },
          { k: 'Транзитный пункт', v: data.viaCity ? data.viaCity + (data.viaAddress ? ` — ${data.viaAddress}` : '') : null },
          { k: 'Телефон грузополучателя/грузоотправителя', v: data.receiverPhone },
          { k: 'Пункт назначения', v: data.toCity + (data.toAddress ? ` — ${data.toAddress}` : '') },
        ]} />

        {/* Параметры груза и транспорта, включая назначенного водителя и ТС */}
        <Text style={s.h2}>3. ПАРАМЕТРЫ ГРУЗА И ТРАНСПОРТА</Text>
        <Rows items={[
          { k: 'Наименование груза', v: data.cargoName },
          { k: 'Номер контейнера', v: data.containerNumber },
          { k: 'Тип контейнера', v: data.containerLabel },
          { k: 'Дата и время погрузки/выгрузки', v: data.readyDate },
          { k: 'Вес брутто (Конт. 1)', v: data.weightGross ? `${data.weightGross.toLocaleString('ru-RU')} кг` : null },
          { k: 'Вес нетто (Конт. 1)', v: data.weightNet ? `${data.weightNet.toLocaleString('ru-RU')} кг` : null },
          { k: 'Вес брутто (Конт. 2)', v: data.weightGross2 ? `${data.weightGross2.toLocaleString('ru-RU')} кг` : null },
          { k: 'Вес нетто (Конт. 2)', v: data.weightNet2 ? `${data.weightNet2.toLocaleString('ru-RU')} кг` : null },
          { k: 'Генераторная установка', v: data.requiresGenset ? 'Требуется' : 'Не требуется' },
          { k: 'Водитель', v: data.driver?.name },
          { k: 'Паспортные данные водителя', v: data.driver?.passport },
          { k: 'Транспортное средство', v: data.driver?.vehicleBrand },
          { k: 'Госномер тягача', v: data.driver?.vehiclePlate },
          { k: 'Госномер прицепа', v: data.driver?.trailerPlate },
        ]} />

        {/* Ставка */}
        <Text style={s.h2}>4. СТАВКА И ОПЛАТА</Text>
        {/* Первоначальную ставку в договор не выносим: юридически значима только
            та, о которой стороны договорились. */}
        <Rows items={[
          data.agreedPrice
            ? { k: 'Согласованная ставка', v: `${data.agreedPrice.toLocaleString('ru-RU')} ₽` }
            : { k: 'Ставка', v: data.price ? `${data.price.toLocaleString('ru-RU')} ₽` : 'Договорная' },
          { k: 'НДС', v: data.vatLabel },
          { k: 'Простой транспорта', v: data.downtimeRate ? `${data.downtimeRate.toLocaleString('ru-RU')} ₽/час` : null },
        ]} />

        {/* Обязанности */}
        <Text style={s.h2}>5. ОБЯЗАННОСТИ СТОРОН</Text>
        <View style={[s.block, { backgroundColor: '#fafafa' }]}>
          <Text style={{ fontSize: 8, lineHeight: 1.6, color: '#333' }}>{obligations}</Text>
        </View>

        {/* Реквизиты и подписи — полные реквизиты сторон здесь (перенесены из п.1),
            места для подписей — сразу под реквизитами каждой стороны. */}
        <Text style={s.h2}>6. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</Text>
        <View style={s.row} wrap={false}>
          <View style={s.col}>
            <PartyBlock party={data.client} title="ЗАКАЗЧИК" />
            <View style={s.signLine} />
            <Text style={s.signLabel}>{data.client.signatoryName || '___________________'}</Text>
            <Text style={s.signLabel}>{data.client.signatoryPosition || 'подпись / расшифровка'}</Text>
            <Text style={[s.signLabel, { marginTop: 8 }]}>М.П.</Text>
          </View>
          <View style={s.col}>
            <PartyBlock party={data.carrier} title="ИСПОЛНИТЕЛЬ" />
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
