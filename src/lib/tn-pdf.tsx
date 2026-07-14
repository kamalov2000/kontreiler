import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
} from '@react-pdf/renderer'
import { PT_SERIF_REGULAR, PT_SERIF_BOLD, PT_SERIF_ITALIC } from './tn-fonts'

// Накладная набирается засечным шрифтом, как государственный бланк, — договорный
// Roboto здесь не годится. Шрифт вшит base64, а не тянется с CDN: serverless-
// функция Vercel падает на холодном старте, если рендер уходит в сеть.
Font.register({
  family: 'PTSerif',
  fonts: [
    { src: PT_SERIF_REGULAR, fontWeight: 'normal' },
    { src: PT_SERIF_BOLD, fontWeight: 'bold' },
    { src: PT_SERIF_ITALIC, fontStyle: 'italic' },
  ],
})
Font.registerHyphenationCallback(word => [word])

/**
 * Транспортная накладная — дословная реплика бланка из Приложения № 4 к Правилам
 * перевозок грузов автомобильным транспортом (ПП РФ № 2200 в ред. ПП РФ от
 * 30.11.2021 № 2116).
 *
 * Ключевое требование бухгалтерии: форма должна совпадать с типовым бланком —
 * те же разделы в том же порядке и те же казённые подписи под каждой строкой
 * («(реквизиты, позволяющие идентифицировать Грузоотправителя)» и т. д.).
 * Поэтому подписи полей здесь захардкожены дословно и менять их нельзя.
 *
 * Поля, которые заполняются физически в момент погрузки/выгрузки (фактические
 * даты и время прибытия/убытия, оговорки перевозчика, подписи), платформа не
 * печатает — они выводятся пустыми линиями под запись от руки. Разделы 9 и 11
 * пустые по той же причине.
 */
export interface TnData {
  // Шапка
  tnNumber: string
  tnDate: string
  orderNumber: string
  orderDate: string
  copyNumber: string

  // 1. Грузоотправитель
  shipperRequisites: string
  shipperPaymentBasis: string

  // 1а. Заказчик услуг по организации перевозки груза
  serviceCustomerRequisites: string
  serviceContractRequisites: string

  // 2. Грузополучатель
  consigneeRequisites: string
  deliveryAddress: string

  // 3. Груз
  containerNumber: string
  cargoName: string
  cargoPackaging: string
  cargoMass: string
  declaredValue: string

  // 4. Сопроводительные документы
  docsDangerous: string
  docsCertificates: string
  docsShipping: string

  // 5. Особые условия
  route: string
  deliveryDeadline: string
  forwardingContact: string
  specialRequirements: string
  temperatureAndSeal: string

  // 6. Перевозчик
  carrierRequisites: string
  driverName: string

  // 7. Транспортное средство
  vehicleTypeBrand: string
  vehiclePlate: string
  ownershipType: string
  ownershipDoc: string
  specialPermit: string

  // 8. Приём груза
  loaderRequisites: string
  loadingPointOwner: string
  pickupAddress: string
  pickupDatetime: string
  massAtLoading: string
  placesAtLoading: string
  packagingAtLoading: string

  // 10. Выдача груза
  unloadAddress: string
  unloadDatetime: string
  massAtUnloading: string

  // 12. Стоимость перевозки
  costNoVat: string
  vatRate: string
  vatAmount: string
  costWithVat: string
  costCalcOrder: string
  economicSubjectCarrier: string
  economicSubjectShipper: string
  economicBasisCarrier: string
  economicBasisShipper: string
  payerRequisites: string
}

// Бланк печатается в один цвет: чёрный на белом, никаких заливок и полутонов —
// его подписывают и сдают в бухгалтерию, а не смотрят на экране.
const BLACK = '#000'

// Высота строки значения. Завязана на кегль value: если поднять кегль и забыть
// про неё, текст сядет на линию поля. Вертикальные интервалы бланка выбраны
// так, чтобы форма укладывалась ровно в два листа A4, как бумажный оригинал:
// разделы 1–8 на первом листе, 9–12 на втором. Раздел 8 идёт с wrap={false},
// поэтому лишние 2–3 пункта высоты выше по документу выбрасывают его целиком
// на следующую страницу — после правки интервалов пересчитывай число страниц.
const VALUE_LINE = 7.5

const s = StyleSheet.create({
  page: {
    fontFamily: 'PTSerif',
    fontSize: 8,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 18,
    color: BLACK,
    lineHeight: 1.05,
  },

  // Шапка бланка: ссылка на приложение — справа, как в типовой форме
  appRef: { fontSize: 7.5, textAlign: 'right' },
  formTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 4,
  },

  // Внешняя рамка документа
  frame: { borderWidth: 0.8, borderColor: BLACK },

  // Полоса-заголовок раздела: без заливки и без линии под текстом — разделы
  // отбиваются друг от друга одной чертой сверху.
  sectionHead: {
    borderTopWidth: 0.6,
    borderTopColor: BLACK,
    paddingVertical: 0.5,
    paddingHorizontal: 3,
  },
  sectionTitle: { fontSize: 8, fontWeight: 'bold' },

  row: { flexDirection: 'row' },
  // Колонка внутри row. flex здесь задаёт ШИРИНУ — использовать только в row,
  // иначе (в колоночном контейнере) flex-basis 0 схлопывает высоту в ноль и
  // содержимое наезжает на следующий раздел.
  half: { flex: 1, paddingHorizontal: 3, paddingTop: 1, paddingBottom: 0.5 },
  // Те же отступы, но без flex — для блоков, лежащих в колоночном контейнере.
  pad: { paddingHorizontal: 3, paddingTop: 1, paddingBottom: 0.5 },
  vDivider: { borderLeftWidth: 0.6, borderLeftColor: BLACK },

  // Поле бланка: значение → линия → казённая подпись мелким курсивом
  value: { fontSize: 8.5, minHeight: VALUE_LINE },
  valueBold: { fontSize: 8.5, fontWeight: 'bold', minHeight: VALUE_LINE },
  line: { borderBottomWidth: 0.5, borderBottomColor: BLACK, marginTop: 0.5 },
  caption: { fontSize: 6, fontStyle: 'italic', textAlign: 'center', marginTop: 0.3 },

  // Мелкая надпись без линии (пояснения вроде «Тип владения: 1 — собственность…»)
  note: { fontSize: 6.5, fontStyle: 'italic', paddingHorizontal: 3, paddingVertical: 1 },

  headRow: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: BLACK },
  headCell: { flex: 1, paddingHorizontal: 3, paddingVertical: 1.5 },
  headLabel: { fontSize: 8, fontWeight: 'bold' },

  footer: {
    position: 'absolute',
    bottom: 8,
    left: 20,
    right: 20,
    fontSize: 6,
    fontStyle: 'italic',
    textAlign: 'center',
  },
})

/**
 * Поле бланка. Значение печатается над линией, под линией — дословная подпись
 * из типовой формы. Пустое значение оставляет линию под запись от руки.
 */
function F({
  value,
  caption,
  bold,
  lines = 1,
}: {
  value?: string | null
  caption: string
  bold?: boolean
  lines?: number
}) {
  const text = (value ?? '').trim()
  return (
    <View>
      <Text style={[bold ? s.valueBold : s.value, { minHeight: VALUE_LINE * lines }]}>{text || ' '}</Text>
      <View style={s.line} />
      <Text style={s.caption}>{caption}</Text>
    </View>
  )
}

/** Раздел на всю ширину. */
function Full({ children }: { children: React.ReactNode }) {
  return <View style={s.pad}>{children}</View>
}

/** Две колонки с вертикальным разделителем — базовая сетка бланка. */
function Two({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={s.half}>{left}</View>
      <View style={[s.half, s.vDivider]}>{right}</View>
    </View>
  )
}

function Head({ title }: { title: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

/**
 * Раздел бланка целиком. wrap={false} — чтобы разрыв страницы не резал раздел
 * пополам, отрывая подписи от полей (в бумажном бланке разделы тоже цельные).
 */
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Head title={title} />
      {children}
    </View>
  )
}

/**
 * Флажок бланка — всегда пустая рамка. Отметку ставят ручкой на распечатке:
 * экспедиторский статус определяют на месте, и печатать за грузоотправителя
 * готовый крест нельзя.
 */
function Check({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
      <View style={{ width: 8, height: 8, borderWidth: 0.6, borderColor: BLACK }} />
      <Text style={{ fontSize: 7 }}>{label}</Text>
    </View>
  )
}

const OWNERSHIP_NOTE =
  'Тип владения: 1 — собственность; 2 — совместная собственность супругов; 3 — аренда; 4 — лизинг; 5 — безвозмездное пользование'

export function TnDocument({ data }: { data: TnData }) {
  // Номер контейнера печатается в отгрузочном наименовании груза — так же, как
  // в бумажных накладных наших клиентов («КОНТЕЙНЕР DLRU0087364»).
  const cargoLine = [
    data.containerNumber ? `КОНТЕЙНЕР ${data.containerNumber}` : '',
    data.cargoName,
  ].filter(Boolean).join(', ')

  return (
    <Document title={`Транспортная накладная ${data.tnNumber}`} author="Контрейл">
      <Page size="A4" style={s.page}>
        <Text style={s.appRef}>Приложение № 4</Text>
        <Text style={s.appRef}>к Правилам перевозок грузов автомобильным транспортом</Text>
        <Text style={s.appRef}>(в ред. Постановления Правительства РФ от 30.11.2021 № 2116)</Text>

        <Text style={s.formTitle}>Транспортная накладная</Text>

        <View style={s.frame}>
          {/* Шапка: накладная / заказ (заявка) */}
          <View style={s.headRow}>
            <View style={s.headCell}>
              <Text style={s.headLabel}>Транспортная накладная</Text>
            </View>
            <View style={[s.headCell, s.vDivider]}>
              <Text style={s.headLabel}>Заказ (заявка)</Text>
            </View>
          </View>
          <View style={[s.row, { borderBottomWidth: 0.6, borderBottomColor: BLACK }]}>
            <View style={s.half}>
              <View style={s.row}>
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <F value={data.tnDate} caption="Дата" bold />
                </View>
                <View style={{ flex: 1 }}>
                  <F value={data.tnNumber} caption="№" bold />
                </View>
              </View>
              <View style={{ marginTop: 2 }}>
                <F value={data.copyNumber} caption="Экземпляр №" />
              </View>
            </View>
            <View style={[s.half, s.vDivider]}>
              <View style={s.row}>
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <F value={data.orderDate} caption="Дата" />
                </View>
                <View style={{ flex: 1 }}>
                  <F value={data.orderNumber} caption="№" />
                </View>
              </View>
            </View>
          </View>

          {/* 1 / 1а */}
          <View style={s.row} wrap={false}>
            <View style={{ flex: 1, borderBottomWidth: 0.6, borderBottomColor: BLACK }}>
              <Head title="1. Грузоотправитель" />
              <View style={s.pad}>
                <Check label="является экспедитором" />
                <F
                  value={data.shipperRequisites}
                  caption="(реквизиты, позволяющие идентифицировать Грузоотправителя)"
                  lines={2}
                />
                <View style={{ marginTop: 3 }}>
                  <F
                    value={data.shipperPaymentBasis}
                    caption="(реквизиты документа, определяющего основания осуществления расчетов по договору перевозки иным лицом, отличным от грузоотправителя (при наличии)"
                  />
                </View>
              </View>
            </View>
            <View style={[{ flex: 1, borderBottomWidth: 0.6, borderBottomColor: BLACK }, s.vDivider]}>
              <Head title="1а. Заказчик услуг по организации перевозки груза (при наличии)" />
              <View style={s.pad}>
                <F
                  value={data.serviceCustomerRequisites}
                  caption="(реквизиты, позволяющие идентифицировать Заказчика услуг по организации перевозки груза)"
                  lines={2}
                />
                <View style={{ marginTop: 3 }}>
                  <F
                    value={data.serviceContractRequisites}
                    caption="(реквизиты договора на выполнение услуг по организации перевозки груза)"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* 2 */}
          <Sec title="2. Грузополучатель">
          <Two
            left={
              <F
                value={data.consigneeRequisites}
                caption="(реквизиты, позволяющие идентифицировать Грузополучателя)"
                lines={2}
              />
            }
            right={<F value={data.deliveryAddress} caption="(адрес места доставки груза)" lines={2} />}
          />

          {/* 3 */}
          </Sec>
          <Sec title="3. Груз">
          <Two
            left={
              <F
                value={cargoLine}
                caption="(отгрузочное наименование груза (для опасных грузов — в соответствии с ДОПОГ), его состояние и другая необходимая информация о грузе)"
                lines={2}
                bold
              />
            }
            right={
              <F
                value={data.cargoPackaging}
                caption="(количество грузовых мест, маркировка, вид тары и способ упаковки)"
                lines={2}
              />
            }
          />
          <Full>
            <F
              value={data.cargoMass}
              caption="(масса груза брутто в килограммах, масса груза нетто в килограммах (при возможности ее определения), размеры (высота, ширина, длина) в метрах (при перевозке крупногабаритного груза), объем груза в кубических метрах и плотность груза в соответствии с документацией на груз (при необходимости)"
            />
          </Full>
          <Two
            left={
              <F
                caption="(в случае перевозки опасного груза — информация по каждому опасному веществу, материалу или изделию в соответствии с пунктом 5.4.1 ДОПОГ)"
              />
            }
            right={
              <F
                value={data.declaredValue}
                caption="(объявленная стоимость (ценность) груза (при необходимости)"
              />
            }
          />

          {/* 4 */}
          </Sec>
          <Sec title="4. Сопроводительные документы на груз (при наличии)">
          <Full>
            <F
              value={data.docsDangerous}
              caption="(перечень прилагаемых к транспортной накладной документов, предусмотренных ДОПОГ, санитарными, таможенными (при наличии), карантинными, иными правилами в соответствии с законодательством Российской Федерации)"
            />
          </Full>
          <Full>
            <F
              value={data.docsCertificates}
              caption="(перечень прилагаемых к грузу сертификатов, паспортов качества, удостоверений и других документов, наличие которых установлено законодательством Российской Федерации)"
            />
          </Full>
          <Full>
            <F
              value={data.docsShipping}
              caption="(реквизиты, позволяющие идентифицировать документ(-ы), подтверждающий(-ие) отгрузку товаров) (при наличии), реквизиты сопроводительной ведомости (при перевозке груженых контейнеров или порожних контейнеров)"
            />
          </Full>

          {/* 5 */}
          </Sec>
          <Sec title="5. Указания грузоотправителя по особым условиям перевозки">
          <Two
            left={
              <F
                value={[data.route, data.deliveryDeadline].filter(Boolean).join('; срок доставки: ')}
                caption="(маршрут перевозки, дата и время/сроки доставки груза (при необходимости)"
                lines={2}
              />
            }
            right={
              <F
                value={data.forwardingContact}
                caption="(контактная информация о лицах, по указанию которых может осуществляться переадресовка)"
                lines={2}
              />
            }
          />
          <Two
            left={
              <F
                value={data.specialRequirements}
                caption="(указания, необходимые для выполнения фитосанитарных, санитарных, карантинных, таможенных и прочих требований, установленных законодательством Российской Федерации)"
                lines={2}
              />
            }
            right={
              <F
                value={data.temperatureAndSeal}
                caption="(температурный режим перевозки груза (при необходимости), сведения о запорно-пломбировочных устройствах (в случае их предоставления грузоотправителем), запрещение перегрузки груза)"
                lines={2}
              />
            }
          />

          {/* 6 */}
          </Sec>
          <Sec title="6. Перевозчик">
          <Two
            left={
              <F
                value={data.carrierRequisites}
                caption="(реквизиты, позволяющие идентифицировать Перевозчика)"
                lines={2}
                bold
              />
            }
            right={
              <F
                value={data.driverName}
                caption="(реквизиты, позволяющие идентифицировать водителя(-ей)"
                lines={2}
                bold
              />
            }
          />

          {/* 7 */}
          </Sec>
          <Sec title="7. Транспортное средство">
          <Two
            left={
              <F
                value={data.vehicleTypeBrand}
                caption="(тип, марка, грузоподъемность (в тоннах), вместимость (в кубических метрах)"
              />
            }
            right={
              <F
                value={data.vehiclePlate}
                caption="(регистрационный номер транспортного средства)"
              />
            }
          />
          <View style={s.row}>
            <View style={[s.half, { flex: 3 }]}>
              <Text style={s.note}>{OWNERSHIP_NOTE}</Text>
            </View>
            <View style={[s.half, s.vDivider, { flex: 1 }]}>
              <F value={data.ownershipType} caption="(тип владения)" bold />
            </View>
          </View>
          <Two
            left={
              <F
                value={data.ownershipDoc}
                caption="(реквизиты документа(-ов), подтверждающего(-их) основание владения грузовым автомобилем (тягачом, а также прицепом (полуприцепом) (для типов владения 3, 4, 5)"
              />
            }
            right={
              <F
                value={data.specialPermit}
                caption="(номер, дата и срок действия специального разрешения, установленный маршрут движения тяжеловесного и (или) крупногабаритного транспортного средства или транспортного средства, перевозящего опасный груз) (при наличии)"
              />
            }
          />

          {/* 8 */}
          </Sec>
          <Sec title="8. Прием груза">
          <Full>
            <F
              value={data.loaderRequisites}
              caption="(реквизиты лица, осуществляющего погрузку груза в транспортное средство)"
            />
          </Full>
          <Full>
            <F
              value={data.loadingPointOwner}
              caption="(наименование (ИНН) владельца объекта инфраструктуры пункта погрузки)"
            />
          </Full>
          <Two
            left={<F value={data.pickupAddress} caption="(адрес места погрузки)" />}
            right={
              <F
                value={data.pickupDatetime}
                caption="(заявленные дата и время подачи транспортного средства под погрузку)"
              />
            }
          />
          {/* Фактические даты и время проставляются на погрузке — печатаем пустыми */}
          <Two
            left={<F caption="(фактические дата и время прибытия под погрузку)" />}
            right={<F caption="(фактические дата и время убытия)" />}
          />
          <Full>
            <F
              value={data.massAtLoading}
              caption="(масса груза брутто в килограммах и метод ее определения (определение разницы между массой транспортного средства после погрузки и перед погрузкой по общей массе или взвешиванием поосно или расчетная масса груза)"
            />
          </Full>
          <Two
            left={<F value={data.placesAtLoading} caption="(количество грузовых мест)" />}
            right={<F value={data.packagingAtLoading} caption="(тара, упаковка (при наличии)" />}
          />
          <Full>
            <F
              caption="(оговорки и замечания перевозчика (при наличии) о дате и времени прибытия/убытия, о состоянии, креплении груза, тары, упаковки, маркировки, опломбирования, о массе груза и количестве грузовых мест, о проведении погрузочных работ)"
              lines={2}
            />
          </Full>
          <Two
            left={
              <F
                caption="(подпись, расшифровка подписи лица, осуществившего погрузку груза, с указанием реквизитов документа, подтверждающего полномочия лица на погрузку груза)"
                lines={2}
              />
            }
            right={
              <F
                value={data.driverName}
                caption="(подпись, расшифровка подписи водителя, принявшего груз для перевозки)"
                lines={2}
              />
            }
          />

          </Sec>

          {/* 9 — заполняется вручную при переадресовке */}
          <Sec title="9. Переадресовка (при наличии)">
          <Two
            left={
              <F
                caption="(дата, вид переадресовки на бумажном носителе или в электронном виде (с указанием вида доставки документа)"
              />
            }
            right={
              <F
                caption="(адрес нового пункта выгрузки, новые дата и время подачи транспортного средства под выгрузку)"
              />
            }
          />
          <Two
            left={<F caption="(реквизиты лица, от которого получено указание на переадресовку)" />}
            right={<F caption="(при изменении получателя груза — реквизиты нового получателя)" />}
          />

          </Sec>

          {/* 10 */}
          <Sec title="10. Выдача груза">
          <Two
            left={<F value={data.unloadAddress} caption="(адрес места выгрузки)" lines={2} />}
            right={
              <F
                value={data.unloadDatetime}
                caption="(заявленные дата и время подачи транспортного средства под выгрузку)"
                lines={2}
              />
            }
          />
          <Two
            left={<F caption="(фактические дата и время прибытия)" />}
            right={<F caption="(фактические дата и время убытия)" />}
          />
          <Two
            left={<F caption="(фактическое состояние груза, тары, упаковки, маркировки, опломбирования)" />}
            right={<F caption="(количество грузовых мест)" />}
          />
          <Two
            left={
              <F
                value={data.massAtUnloading}
                caption="(масса груза брутто в килограммах, масса груза нетто в килограммах (при возможности ее определения), плотность груза в соответствии с документацией на груз (при необходимости)"
                lines={2}
              />
            }
            right={
              <F
                caption="(оговорки и замечания перевозчика (при наличии) о дате и времени прибытия/убытия, о состоянии груза, тары, упаковки, маркировки, опломбирования, о массе груза и количестве грузовых мест)"
                lines={1.5}
              />
            }
          />
          <Two
            left={
              <F
                caption="(должность, подпись, расшифровка подписи грузополучателя или уполномоченного грузоотправителем лица)"
                lines={1.5}
              />
            }
            right={
              <F
                value={data.driverName}
                caption="(подпись, расшифровка подписи водителя, сдавшего груз грузополучателю или уполномоченному грузополучателем лицу)"
                lines={2}
              />
            }
          />

          </Sec>

          {/* 11 — заполняется вручную */}
          <Sec title="11. Отметки грузоотправителей, грузополучателей, перевозчиков (при необходимости)">
          <View style={s.row}>
            <View style={[s.half, { flex: 2 }]}>
              <F
                caption="(краткое описание обстоятельств, послуживших основанием для отметки, сведения о коммерческих и иных актах, в том числе о погрузке/выгрузке груза)"
                lines={1.5}
              />
            </View>
            <View style={[s.half, s.vDivider]}>
              <F caption="(расчет и размер штрафа)" lines={1.5} />
            </View>
            <View style={[s.half, s.vDivider]}>
              <F caption="(подпись, дата)" lines={1.5} />
            </View>
          </View>

          </Sec>

          {/* 12 */}
          <Sec title="12. Стоимость перевозки груза (установленная плата) в рублях (при необходимости)">
          <View style={s.row}>
            <View style={s.half}>
              <F value={data.costNoVat} caption="(стоимость перевозки без налога — всего)" bold />
            </View>
            <View style={[s.half, s.vDivider]}>
              <F value={data.vatRate} caption="(налоговая ставка)" />
            </View>
            <View style={[s.half, s.vDivider]}>
              <F value={data.vatAmount} caption="(сумма налога, предъявляемая покупателю)" />
            </View>
            <View style={[s.half, s.vDivider]}>
              <F value={data.costWithVat} caption="(стоимость перевозки с налогом — всего)" bold />
            </View>
          </View>
          <Full>
            <F
              value={data.costCalcOrder}
              caption="(порядок (механизм) расчета (исчислений) платы) (при наличии порядка (механизма)"
            />
          </Full>
          <Two
            left={
              <F
                value={data.economicSubjectCarrier}
                caption="(реквизиты, позволяющие идентифицировать Экономического субъекта, составляющего первичный учетный документ о факте хозяйственной жизни со стороны Перевозчика)"
                lines={2}
              />
            }
            right={
              <F
                value={data.economicSubjectShipper}
                caption="(реквизиты, позволяющие идентифицировать Экономического субъекта, составляющего первичный учетный документ о факте хозяйственной жизни со стороны Грузоотправителя)"
                lines={2}
              />
            }
          />
          <Two
            left={
              <F
                value={data.economicBasisCarrier}
                caption="(основание, по которому Экономический субъект является составителем документа о факте хозяйственной жизни)"
              />
            }
            right={
              <F
                value={data.economicBasisShipper}
                caption="(основание, по которому Экономический субъект является составителем документа о факте хозяйственной жизни)"
              />
            }
          />
          {/* Слева бланк оставляет пустое место — поле о плательщике только справа. */}
          <Two
            left={null}
            right={
              <F
                value={data.payerRequisites}
                caption="(реквизиты, позволяющие идентифицировать лицо, от которого будут поступать денежные средства)"
              />
            }
          />
          <Two
            left={
              <F
                caption="(подпись, расшифровка подписи лица, ответственного за оформление факта хозяйственной жизни со стороны Перевозчика (уполномоченного лица)"
                lines={1.5}
              />
            }
            right={
              <F
                caption="(подпись, расшифровка подписи лица, ответственного за оформление факта хозяйственной жизни со стороны Грузоотправителя (уполномоченного лица)"
                lines={1.5}
              />
            }
          />
          <Two
            left={
              <F
                caption="(должность, основание полномочий физического лица, уполномоченного Перевозчиком (уполномоченным лицом), дата подписания)"
                lines={1.5}
              />
            }
            right={
              <F
                caption="(должность, основание полномочий физического лица, уполномоченного Грузоотправителем (уполномоченным лицом), дата подписания)"
                lines={1.5}
              />
            }
          />
          </Sec>
        </View>

        <Text style={s.footer} fixed>
          Сформировано на платформе «Контрейл» · накладная {data.tnNumber} от {data.tnDate}
        </Text>
      </Page>
    </Document>
  )
}
