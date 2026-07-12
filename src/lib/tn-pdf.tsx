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

// Тот же вшитый base64-шрифт, что и у договора-заявки: рендер без обращения
// к CDN, иначе serverless-функция Vercel падает на холодном старте.
Font.register({
  family: 'Roboto',
  fonts: [
    { src: ROBOTO_REGULAR, fontWeight: 'normal' },
    { src: ROBOTO_BOLD, fontWeight: 'bold' },
  ],
})
Font.registerHyphenationCallback(word => [word])

/**
 * Транспортная накладная — форма из Приложения № 4 к Правилам перевозок грузов
 * автомобильным транспортом (ПП РФ № 2200). Нумерация разделов сохранена как в
 * бланке, поэтому в документе есть пропуски: разделы, которые платформа не
 * заполняет (4, 9, 11, 13–17), печатаются пустыми под подпись от руки.
 */
export interface TnData {
  // 1. Шапка
  tnNumber: string
  tnDate: string
  orderNumber: string
  orderDate: string
  // 2. Грузополучатель
  consigneeRequisites: string
  deliveryAddress: string
  // 3. Груз
  cargoName: string
  placesCount: string
  placesUnit: string
  weightGross: string
  weightNet: string
  // 5. Особые условия
  route: string
  deliveryDeadline: string
  forwardingContact: string
  temperatureMode: string | null // только для REF-контейнеров
  seal: string
  // 6. Перевозчик
  carrierRequisites: string
  driverName: string
  // 7. Транспортное средство
  vehicle: string
  trailerPlate: string
  // 8. Приём груза
  pickupAddress: string
  pickupDatetime: string
  containerNumber: string
  // 10. Выдача груза
  unloadAddress: string
  unloadDatetime: string
  // 12. Стоимость
  costNoVat: string
  vatRate: string
  costWithVat: string
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 8,
    paddingTop: 24,
    paddingBottom: 30,
    paddingHorizontal: 28,
    color: '#1a1a1a',
    lineHeight: 1.35,
  },
  title: { fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { fontSize: 6.5, textAlign: 'center', color: '#555', marginTop: 2, marginBottom: 8 },

  // Раздел = рамка с полосой-заголовком, как в бланке
  section: { borderWidth: 0.7, borderColor: '#000', marginBottom: -0.7 },
  sectionHead: {
    flexDirection: 'row',
    backgroundColor: '#EEEEEE',
    borderBottomWidth: 0.7,
    borderBottomColor: '#000',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  sectionNo: { fontWeight: 'bold', fontSize: 8, width: 16 },
  sectionTitle: { fontWeight: 'bold', fontSize: 8, flex: 1 },
  body: { padding: 4 },

  row: { flexDirection: 'row' },
  cell: { flex: 1, paddingHorizontal: 4, paddingVertical: 3 },
  cellDivider: { borderLeftWidth: 0.7, borderLeftColor: '#000' },
  rowDivider: { borderTopWidth: 0.7, borderTopColor: '#000' },

  label: { fontSize: 6.5, color: '#555', marginBottom: 1.5 },
  val: { fontSize: 8, minHeight: 10 },
  valBold: { fontSize: 8, fontWeight: 'bold' },
  empty: { fontSize: 8, color: '#999', minHeight: 10 },

  signRow: { flexDirection: 'row', gap: 16, marginTop: 14 },
  signBox: { flex: 1 },
  signLine: { borderBottomWidth: 0.7, borderBottomColor: '#000', marginTop: 18, marginBottom: 2 },
  signCaption: { fontSize: 6.5, color: '#555', textAlign: 'center' },

  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 6,
    color: '#888',
    textAlign: 'center',
  },
})

/** Значение поля: пустое печатаем прочерком, чтобы бланк не выглядел «недозаполненным». */
function V({ children, bold }: { children?: string | null; bold?: boolean }) {
  const text = (children ?? '').trim()
  if (!text) return <Text style={s.empty}>—</Text>
  return <Text style={bold ? s.valBold : s.val}>{text}</Text>
}

function Field({ label, value, bold }: { label: string; value?: string | null; bold?: boolean }) {
  return (
    <View style={s.cell}>
      <Text style={s.label}>{label}</Text>
      <V bold={bold}>{value}</V>
    </View>
  )
}

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <View style={s.section} wrap={false}>
      <View style={s.sectionHead}>
        <Text style={s.sectionNo}>{no}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

export function TnDocument({ data }: { data: TnData }) {
  return (
    <Document
      title={`Транспортная накладная ${data.tnNumber}`}
      author="Контрейл"
    >
      <Page size="A4" style={s.page}>
        <Text style={s.title}>ТРАНСПОРТНАЯ НАКЛАДНАЯ</Text>
        <Text style={s.subtitle}>
          Приложение № 4 к Правилам перевозок грузов автомобильным транспортом
        </Text>

        {/* 1 */}
        <Section no="1" title="Транспортная накладная">
          <View style={s.row}>
            <Field label="Дата" value={data.tnDate} bold />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Номер накладной</Text>
              <V bold>{data.tnNumber}</V>
            </View>
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Заказ (заявка) №</Text>
              <V>{data.orderNumber}</V>
            </View>
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Дата заказа</Text>
              <V>{data.orderDate}</V>
            </View>
          </View>
        </Section>

        {/* 2 */}
        <Section no="2" title="Грузополучатель">
          <View style={s.row}>
            <Field label="Реквизиты грузополучателя" value={data.consigneeRequisites} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Адрес места доставки</Text>
              <V>{data.deliveryAddress}</V>
            </View>
          </View>
        </Section>

        {/* 3 */}
        <Section no="3" title="Груз">
          <View style={s.row}>
            <Field label="Наименование груза" value={data.cargoName} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Количество мест</Text>
              <V>{[data.placesCount, data.placesUnit].filter(Boolean).join(' ')}</V>
            </View>
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Масса брутто, кг</Text>
              <V>{data.weightGross}</V>
            </View>
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Масса нетто, кг</Text>
              <V>{data.weightNet}</V>
            </View>
          </View>
        </Section>

        {/* 4 — платформа не заполняет */}
        <Section no="4" title="Сопроводительные документы на груз">
          <View style={s.body}>
            <V>{null}</V>
          </View>
        </Section>

        {/* 5 */}
        <Section no="5" title="Указания грузоотправителя / особые условия">
          <View style={s.row}>
            <Field label="Маршрут перевозки" value={data.route} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Срок доставки</Text>
              <V>{data.deliveryDeadline}</V>
            </View>
          </View>
          <View style={[s.row, s.rowDivider]}>
            <Field label="Контактное лицо для переадресовки" value={data.forwardingContact} />
            {data.temperatureMode !== null && (
              <View style={[s.cell, s.cellDivider]}>
                <Text style={s.label}>Температурный режим</Text>
                <V>{data.temperatureMode}</V>
              </View>
            )}
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>ЗПУ (запорно-пломбировочное устройство)</Text>
              <V>{data.seal}</V>
            </View>
          </View>
        </Section>

        {/* 6 */}
        <Section no="6" title="Перевозчик">
          <View style={s.row}>
            <Field label="Реквизиты перевозчика" value={data.carrierRequisites} bold />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Ф. И. О. водителя</Text>
              <V bold>{data.driverName}</V>
            </View>
          </View>
        </Section>

        {/* 7 */}
        <Section no="7" title="Транспортное средство">
          <View style={s.row}>
            <Field label="Марка и государственный номер тягача" value={data.vehicle} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Государственный номер прицепа / полуприцепа</Text>
              <V>{data.trailerPlate}</V>
            </View>
          </View>
        </Section>

        {/* 8 */}
        <Section no="8" title="Приём груза">
          <View style={s.row}>
            <Field label="Адрес места погрузки" value={data.pickupAddress} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Заявленные дата и время подачи ТС</Text>
              <V>{data.pickupDatetime}</V>
            </View>
          </View>
          <View style={[s.row, s.rowDivider]}>
            <Field label="Контейнер №" value={data.containerNumber} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Ф. И. О. водителя</Text>
              <V>{data.driverName}</V>
            </View>
          </View>
          <View style={[s.row, s.rowDivider]}>
            <View style={s.cell}>
              <Text style={s.label}>Подпись грузоотправителя</Text>
              <View style={s.signLine} />
            </View>
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Подпись водителя (груз принял)</Text>
              <View style={s.signLine} />
            </View>
          </View>
        </Section>

        {/* 9 — платформа не заполняет */}
        <Section no="9" title="Переадресовка">
          <View style={s.body}>
            <V>{null}</V>
          </View>
        </Section>

        {/* 10 */}
        <Section no="10" title="Выдача груза">
          <View style={s.row}>
            <Field label="Адрес места выгрузки" value={data.unloadAddress} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Заявленные дата и время выгрузки</Text>
              <V>{data.unloadDatetime}</V>
            </View>
          </View>
          <View style={[s.row, s.rowDivider]}>
            <Field label="Ф. И. О. водителя" value={data.driverName} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Подпись грузополучателя (груз получил)</Text>
              <View style={s.signLine} />
            </View>
          </View>
        </Section>

        {/* 11 — платформа не заполняет */}
        <Section no="11" title="Отметки грузоотправителей, грузополучателей, перевозчиков">
          <View style={s.body}>
            <V>{null}</V>
          </View>
        </Section>

        {/* 12 */}
        <Section no="12" title="Стоимость перевозки">
          <View style={s.row}>
            <Field label="Реквизиты перевозчика" value={data.carrierRequisites} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Ф. И. О. водителя</Text>
              <V>{data.driverName}</V>
            </View>
          </View>
          <View style={[s.row, s.rowDivider]}>
            <Field label="Стоимость перевозки без НДС, руб." value={data.costNoVat} />
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Налоговая ставка</Text>
              <V>{data.vatRate}</V>
            </View>
            <View style={[s.cell, s.cellDivider]}>
              <Text style={s.label}>Стоимость перевозки с НДС, руб.</Text>
              <V bold>{data.costWithVat}</V>
            </View>
          </View>
        </Section>

        <View style={s.signRow}>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signCaption}>Грузоотправитель (подпись, печать)</Text>
          </View>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signCaption}>Перевозчик (подпись, печать)</Text>
          </View>
          <View style={s.signBox}>
            <View style={s.signLine} />
            <Text style={s.signCaption}>Грузополучатель (подпись, печать)</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          Сформировано на платформе «Контрейл» · накладная {data.tnNumber} от {data.tnDate}
        </Text>
      </Page>
    </Document>
  )
}
