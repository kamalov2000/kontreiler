// Реестр перевозок — выгрузка за период в Excel.
// Одна строка = одна перевозка: заявка + водитель/ТС + перевозчик.
// Перевозчик формирует реестр под каждого клиента и шлёт ему на сверку, поэтому
// файл оформлен как документ (шапка, реквизиты сторон, итоги), а не как дамп.
// Состав и порядок колонок согласованы с бухгалтерией, менять только целиком.

import { Order, OrderDriverInfo, OrderExtraServices, RateMethod, effectiveDowntimeRate } from '@/types/database'
import { formatOrderNumber, priceWithVat, toCyrillicLookalikes, vatPercent } from './utils'
import { effectiveOrderStatus, orderStatusLabel } from './order-status'

// Подпись под таблицей — та же формулировка, что в договоре-заявке и ТН
const PLATFORM_LABEL = 'Сформировано на платформе «Контрейл»'
const PLATFORM_URL = 'https://kontreiler.vercel.app'

// В реестр идут только обычные и срочные заявки: торги — это способ найти
// перевозчика, а не сама перевозка. Завершённые торги попадают в реестр через
// созданную по их результатам заявку (см. source_auction_id).
export const REGISTRY_FORMATS = ['regular', 'urgent'] as const

interface Party { name: string | null; company_name: string | null; inn?: string | null }

// PostgREST отдаёт NUMERIC строкой — приводим к числу, иначе в ячейку встанет
// текст и Excel не посчитает по колонке ни сумму, ни фильтр.
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Заявка с подтянутыми связями. order_driver_info уникальна по order_id, но
// PostgREST в зависимости от версии отдаёт её то объектом, то массивом из одного
// элемента — нормализуем в driverOf().
export type RegistryOrder = Order & {
  driver?: OrderDriverInfo | OrderDriverInfo[] | null
  extras?: OrderExtraServices | OrderExtraServices[] | null
  carrier?: Party | null
  client?: Party | null
}

function driverOf(order: RegistryOrder): OrderDriverInfo | null {
  const d = order.driver
  if (!d) return null
  return Array.isArray(d) ? (d[0] ?? null) : d
}

function extrasOf(order: RegistryOrder): OrderExtraServices | null {
  const e = order.extras
  if (!e) return null
  return Array.isArray(e) ? (e[0] ?? null) : e
}

// Стоимость простоя = согласованная ставка × часы. Нет любого из двух — пусто:
// нулём это показывать нельзя, ноль означал бы «простоя не было».
function downtimeCost(order: RegistryOrder): number | null {
  const ex = extrasOf(order)
  const rate = effectiveDowntimeRate(ex, order)
  if (rate == null || ex?.downtime_hours == null) return null
  return Math.round(rate * Number(ex.downtime_hours) * 100) / 100
}

function overweightCost(order: RegistryOrder): number | null {
  const ex = extrasOf(order)
  if (ex?.overweight_rate == null || ex?.overweight_tons == null) return null
  return Math.round(ex.overweight_rate * Number(ex.overweight_tons) * 100) / 100
}

// Простой заявлен перевозчиком, но клиент его ещё не подтвердил. В реестр он
// идёт всё равно — иначе перевозчик не сможет предъявить его к сверке, — но с
// пометкой на ячейках и строкой-легендой под таблицей.
const DISPUTED_NOTE = 'Простой не согласован заказчиком'
function downtimeDisputed(order: RegistryOrder): boolean {
  const ex = extrasOf(order)
  return ex?.downtime_hours != null && !ex.downtime_confirmed
}

// Сумма без НДС — то, о чём договорились: согласованная цена, иначе заявленная.
function priceNoVat(order: RegistryOrder): number | null {
  return order.agreed_price ?? order.price ?? null
}

function vatAmount(order: RegistryOrder): number | null {
  const base = priceNoVat(order)
  const percent = vatPercent(order.vat_type)
  if (base == null || !percent) return null
  return Math.round(base * percent / 100 * 100) / 100
}

// Ставка с учётом допуслуг = согласованная сумма с НДС + простой + перегруз.
// Считается по тем же числам, что стоят в соседних колонках, — чтобы строку
// можно было проверить глазами прямо в файле.
export function totalWithExtras(order: RegistryOrder): number | null {
  const base = priceWithVat(order)
  const extra = (downtimeCost(order) ?? 0) + (overweightCost(order) ?? 0)
  if (base == null) return extra > 0 ? Math.round(extra * 100) / 100 : null
  return Math.round((base + extra) * 100) / 100
}

export function partyName(p: Party | null | undefined): string {
  return p?.company_name?.trim() || p?.name?.trim() || ''
}

// «Город, адрес» — адрес необязателен, лишней запятой не оставляем.
function point(city?: string | null, address?: string | null): string {
  return [city?.trim(), address?.trim()].filter(Boolean).join(', ')
}

// ТС: «марка госномер», с прицепом — «Е166АК250//ЕХ8726 50».
export function vehicleLabel(info: OrderDriverInfo | null): string {
  if (!info) return ''
  const plates = [info.vehicle_plate, info.trailer_plate]
    .map(p => p?.trim())
    .filter(Boolean)
    .join('//')
  return [info.vehicle_brand?.trim(), plates].filter(Boolean).join(' ')
}

// 'YYYY-MM-DD' из БД → полночь UTC. Именно UTC: exceljs переводит Date в
// excel-serial по UTC-миллисекундам, и локальная полночь в Москве дала бы
// serial на 3 часа раньше — в ячейке встал бы предыдущий день.
function excelDate(ymd: string | null | undefined): Date | null {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function ruDate(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

// ── Фильтр по номерам заявок ────────────────────────────────────────────────
// Перевозчик копирует номера из письма клиента, поэтому разбираем и «КТ-00068»,
// и «кт-68», и просто «68», разделители — запятая, точка с запятой, пробел.
export function parseOrderNumbers(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    // Префиксы номеров кириллические (КТ, А, Р), а на латинской раскладке
    // выходят визуально те же символы — приводим, иначе фильтр молча пуст.
    .map(s => toCyrillicLookalikes(s.trim().replace(/^[#№]/, '').toUpperCase()))
    .filter(Boolean)
}

export function matchesOrderNumbers(order: RegistryOrder, needles: string[]): boolean {
  if (needles.length === 0) return true
  const full = toCyrillicLookalikes((order.order_number || '').toUpperCase())
  const short = toCyrillicLookalikes(formatOrderNumber(order.order_number).toUpperCase())
  return needles.some(n => {
    if (/^\d+$/.test(n)) {
      const padded = n.padStart(5, '0')
      return full.endsWith('-' + padded) || short.endsWith('-' + padded)
    }
    // «КТ-68» → «КТ-00068»: добиваем нулями числовой хвост
    const padded = n.replace(/-(\d+)$/, (_, d: string) => '-' + d.padStart(5, '0'))
    return full === n || short === n || full === padded || short === padded
  })
}

// ── Колонки таблицы ─────────────────────────────────────────────────────────

const MONEY_FMT = '#,##0.00" ₽"'
const NUM_FMT = '#,##0.##'
const DATE_FMT = 'dd.mm.yyyy'
const HEADER_FILL = 'FFEDF2F1'
const BORDER_COLOR = 'FFB9C4C2'
// Спорные значения — янтарный курсив, чтобы сверяющий их не пропустил
const WARN_COLOR = 'FFB4700A'
const MUTED_COLOR = 'FF8A9A97'

type CellValue = string | number | Date | null

interface RegistryColumn {
  header: string
  value: (order: RegistryOrder, now: number) => CellValue
  numFmt?: string
  width?: number
  wrap?: boolean
  /** Пометка на ячейке: комментарий Excel + выделение. Возвращает null, если её нет. */
  note?: (order: RegistryOrder) => string | null
}

const TOTAL_HEADER = 'Итого к оплате'

// Плечо — то, чем методы расчёта отличаются друг от друга в самой строке.
const LEG_LABELS: Record<RateMethod, string> = {
  composite_round: 'туда-обратно',
  composite_oneway: 'в один конец',
  mkad: 'от МКАД',
  market: '',
}

const BASE_COLUMNS: RegistryColumn[] = [
  { header: 'Номер заявки', value: o => formatOrderNumber(o.order_number) || '' },
  { header: 'КТК', value: o => o.container_number?.trim() || '' },
  { header: 'Водитель', value: o => driverOf(o)?.driver_name?.trim() || '' },
  { header: 'ТС', value: o => vehicleLabel(driverOf(o)) },
  { header: 'Дата', value: o => excelDate(o.ready_date), numFmt: DATE_FMT, width: 12 },
  { header: 'Точка постановки', value: o => point(o.from_city, o.from_city_address), wrap: true },
  { header: 'Точка выгрузки/погрузки', value: o => point(o.via_city, o.via_city_address), wrap: true },
  { header: 'Точка сдачи', value: o => point(o.to_city, o.to_city_address), wrap: true },
]

// НДС развёрнут в три колонки: бухгалтерия сверяет реестр со счётом построчно,
// а в счёте налог стоит отдельной строкой.
const MONEY_COLUMNS: RegistryColumn[] = [
  { header: 'Сумма без НДС', value: o => priceNoVat(o), numFmt: MONEY_FMT, width: 16 },
  { header: 'НДС', value: o => vatAmount(o), numFmt: MONEY_FMT, width: 14 },
  { header: 'Сумма с НДС', value: o => priceWithVat(o), numFmt: MONEY_FMT, width: 16 },
]

// Допуслуги — во всех реестрах, независимо от метода расчёта: они появляются
// после рейса и к способу, которым считали цену, отношения не имеют.
const EXTRAS_COLUMNS: RegistryColumn[] = [
  { header: 'Перегруз, ₽', value: o => overweightCost(o), numFmt: MONEY_FMT, width: 14 },
  { header: 'Сверх. тонн', value: o => num(extrasOf(o)?.overweight_tons), numFmt: NUM_FMT, width: 12 },
  {
    header: 'Простой, ч',
    value: o => num(extrasOf(o)?.downtime_hours),
    numFmt: NUM_FMT, width: 12,
    note: o => (downtimeDisputed(o) ? DISPUTED_NOTE : null),
  },
  {
    header: 'Простой, ₽',
    value: o => downtimeCost(o),
    numFmt: MONEY_FMT, width: 14,
    note: o => (downtimeDisputed(o) ? DISPUTED_NOTE : null),
  },
  { header: TOTAL_HEADER, value: o => totalWithExtras(o), numFmt: MONEY_FMT, width: 18 },
]

const TAIL_COLUMNS: RegistryColumn[] = [
  { header: 'Перевозчик', value: o => partyName(o.carrier), wrap: true },
  { header: 'Статус', value: (o, now) => orderStatusLabel(effectiveOrderStatus(o, now)), width: 14 },
]

/**
 * Разбивка ставки: из чего сложилась цена в калькуляторе при создании заявки.
 *
 * Набор один на все методы расчёта и стоит в файле всегда — даже если в выборке
 * нет ни одной посчитанной заявки. Делать состав колонок зависимым от выборки
 * пробовали: при смешанных методах разбивка исчезала целиком, а реестр за месяц
 * почти всегда смешанный. Пустой столбец сверяющий удалит сам, отсутствующий —
 * не восстановит.
 *
 * Методы различает колонка «Плечо»: она же объясняет, от чего считан километраж
 * (у МКАДного — от МКАД). У рыночных заявок разбивки нет по определению.
 */
const RATE_COLUMNS: RegistryColumn[] = [
  { header: 'Подача', value: o => num(o.rate_delivery_cost), numFmt: MONEY_FMT, width: 14 },
  { header: 'Км', value: o => num(o.rate_distance_km), numFmt: NUM_FMT, width: 12 },
  { header: 'Ставка за км', value: o => num(o.rate_per_km), numFmt: MONEY_FMT, width: 14 },
  { header: 'Плечо', value: o => (o.rate_method ? LEG_LABELS[o.rate_method] : ''), width: 15 },
]

export const REGISTRY_COLUMNS: RegistryColumn[] = [
  ...BASE_COLUMNS, ...RATE_COLUMNS, ...MONEY_COLUMNS, ...EXTRAS_COLUMNS, ...TAIL_COLUMNS,
]

// Сколько знакомест займёт значение — для автоширины колонки.
function cellLength(v: CellValue): number {
  if (v === null || v === undefined) return 0
  if (v instanceof Date) return 10
  if (typeof v === 'number') return String(Math.round(v)).length + 6
  return Math.max(...v.split('\n').map(s => s.length))
}

/** Сторона документа: в шапке — реквизитами, внизу — колонкой блока подписей. */
export interface RegistryParty {
  role: 'carrier' | 'client'
  name: string
  inn?: string | null
}

export interface RegistryMeta {
  from: string
  to: string
  /**
   * Номер реестра — сквозной по выгружающей компании (registry_exports).
   * null, если номер выдать не удалось: файл всё равно нужен, просто без номера.
   */
  number?: number | null
  /** Дата формирования, 'YYYY-MM-DD'. По умолчанию — сегодня. */
  date?: string
  /** Реквизиты сторон: составитель и, если реестр под одного — получатель. */
  parties: RegistryParty[]
}

// В шапке стороны названы по роли в перевозке, в блоке подписей — по роли в
// договоре: подписывают его исполнитель и заказчик.
const HEADER_LABEL: Record<RegistryParty['role'], string> = { carrier: 'Перевозчик', client: 'Заказчик' }
const SIGN_LABEL:   Record<RegistryParty['role'], string> = { carrier: 'Исполнитель', client: 'Заказчик' }

export function registryFileName(from: string, to: string, number?: number | null): string {
  const prefix = number ? `reestr_${number}` : 'reestr_perevozok'
  return `${prefix}_${from}_${to}.xlsx`
}

function todayYmd(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Собирает книгу Excel и возвращает её байтами.
 * exceljs, а не xlsx: бесплатная сборка SheetJS не умеет ни жирную шапку, ни
 * числовые форматы, ни границы.
 *
 * Файл должен остаться редактируемым: без защиты листа, без объединённых ячеек
 * и без формул — итоги записаны готовыми числами. Заголовок живёт в колонке A и
 * визуально перетекает в пустые соседние — так клиент может вставлять строки и
 * пересортировывать таблицу, ничего не разъезжается.
 */
export async function buildRegistryWorkbook(
  orders: RegistryOrder[],
  meta: RegistryMeta,
  now: number = Date.now(),
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Реестр')

  const columns = REGISTRY_COLUMNS
  const headers = columns.map(c => c.header)
  const rows = orders.map(o => columns.map(c => c.value(o, now)))
  const totalCol = headers.indexOf(TOTAL_HEADER) + 1

  // ── Шапка документа ───────────────────────────────────────────────────────
  const title = ws.addRow([
    meta.number
      ? `РЕЕСТР ПЕРЕВОЗОК № ${meta.number} от ${ruDate(meta.date ?? todayYmd(now))}`
      : 'РЕЕСТР ПЕРЕВОЗОК',
  ])
  title.font = { bold: true, size: 14 }
  ws.addRow([`за период с ${ruDate(meta.from)} по ${ruDate(meta.to)}`]).font = { size: 11 }
  ws.addRow([])
  for (const p of meta.parties) {
    const text = [p.name, p.inn?.trim() ? `ИНН ${p.inn.trim()}` : null].filter(Boolean).join(', ')
    ws.addRow([`${HEADER_LABEL[p.role]}: ${text || '—'}`]).font = { size: 11 }
  }
  ws.addRow([])

  // ── Таблица ───────────────────────────────────────────────────────────────
  const headerRowNumber = ws.rowCount + 1
  ws.addRow(headers)
  for (const row of rows) ws.addRow(row)
  const lastDataRow = ws.rowCount

  columns.forEach((col, i) => {
    const column = ws.getColumn(i + 1)
    if (col.numFmt) column.numFmt = col.numFmt
    // Автоширина считается только по таблице: строки шапки документа лежат в
    // колонке A и иначе растянули бы её на всю ширину заголовка.
    const longest = rows.reduce((max, r) => Math.max(max, cellLength(r[i])), col.header.length)
    column.width = col.width ?? Math.min(46, Math.max(12, longest + 2))
  })

  const thin = { style: 'thin' as const, color: { argb: BORDER_COLOR } }
  const box = { top: thin, left: thin, bottom: thin, right: thin }

  let hasNotes = false
  for (let r = headerRowNumber; r <= lastDataRow; r++) {
    const row = ws.getRow(r)
    const isHeader = r === headerRowNumber
    const order = isHeader ? null : orders[r - headerRowNumber - 1]
    for (let c = 1; c <= headers.length; c++) {
      const col = columns[c - 1]
      const cell = row.getCell(c)
      cell.border = box
      cell.alignment = {
        vertical: isHeader ? 'middle' : 'top',
        horizontal: 'left',
        wrapText: isHeader || !!col.wrap,
      }
      if (isHeader) {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
        continue
      }
      // Несогласованный простой: значение остаётся числом (иначе колонка
      // перестанет считаться), а спорность видна цветом и примечанием.
      const note = order && col.note ? col.note(order) : null
      if (note) {
        hasNotes = true
        cell.font = { color: { argb: WARN_COLOR }, italic: true }
        cell.note = note
      }
    }
    if (isHeader) row.height = 30
  }

  // ── Итоги ─────────────────────────────────────────────────────────────────
  // Пустая строка отделяет итоги от таблицы: иначе автофильтр считает их данными
  // и прячет при фильтрации.
  ws.addRow([])
  const total = orders.reduce((sum, o) => sum + (totalWithExtras(o) ?? 0), 0)
  const totalsRow = ws.addRow([])
  totalsRow.getCell(1).value = `ИТОГО, рейсов: ${orders.length}`
  totalsRow.getCell(1).font = { bold: true }
  totalsRow.getCell(1).border = { top: thin }
  if (totalCol > 0) {
    totalsRow.getCell(totalCol).value = Math.round(total * 100) / 100
    totalsRow.getCell(totalCol).numFmt = MONEY_FMT
    totalsRow.getCell(totalCol).font = { bold: true }
    totalsRow.getCell(totalCol).border = { top: thin }
  }

  // Легенда к пометкам — иначе курсив в колонках простоя читается как случайность
  if (hasNotes) {
    const legend = ws.addRow([])
    legend.getCell(1).value = `Курсивом выделен простой, который заказчик ещё не подтвердил — суммы по нему предварительные`
    legend.getCell(1).font = { size: 9, italic: true, color: { argb: WARN_COLOR } }
  }

  // ── Блок подписей ─────────────────────────────────────────────────────────
  // Две колонки: исполнитель и заказчик. Заказчика в файле может не быть —
  // реестр по нескольким клиентам сразу адресовать некому, но подписать его
  // получателю всё равно нужно, поэтому вторая колонка остаётся пустым бланком.
  const carrierParty = meta.parties.find(p => p.role === 'carrier')
  const clientParty  = meta.parties.find(p => p.role === 'client')
  // Правая колонка стоит на фиксированном отступе: объединённых ячеек в файле
  // нет намеренно (иначе сломается вставка строк), а ширины первых колонок
  // складываются в достаточное поле под левый блок.
  const RIGHT_COL = Math.min(5, headers.length)

  ws.addRow([])
  ws.addRow([])
  const signLines: [string, string][] = [
    [SIGN_LABEL.carrier, SIGN_LABEL.client],
    [carrierParty?.name || '', clientParty?.name || ''],
    [carrierParty?.inn?.trim() ? `ИНН ${carrierParty.inn.trim()}` : 'ИНН ______________',
     clientParty?.inn?.trim()  ? `ИНН ${clientParty.inn.trim()}`  : 'ИНН ______________'],
    ['', ''],
    ['ФИО ______________________________', 'ФИО ______________________________'],
    ['Подпись __________________________', 'Подпись __________________________'],
    ['', ''],
    ['М.П.', 'М.П.'],
  ]
  signLines.forEach(([left, right], i) => {
    const row = ws.addRow([])
    row.getCell(1).value = left
    row.getCell(RIGHT_COL).value = right
    // Первая строка — заголовки колонок блока
    const font = i === 0
      ? { bold: true, size: 11 }
      : i === 1
      ? { size: 11 }
      : { size: 10, color: { argb: MUTED_COLOR } }
    row.getCell(1).font = font
    row.getCell(RIGHT_COL).font = font
  })

  // Служебная подпись платформы — как в договоре-заявке и ТН
  ws.addRow([])
  const stamp = ws.addRow([])
  const stampCell = stamp.getCell(1)
  stampCell.value = { text: `${PLATFORM_LABEL} · ${PLATFORM_URL.replace(/^https?:\/\//, '')}`, hyperlink: PLATFORM_URL }
  stampCell.font = { size: 8, color: { argb: MUTED_COLOR }, underline: false }

  // Шапка таблицы остаётся на месте при прокрутке + фильтры по колонкам.
  ws.views = [{ state: 'frozen', ySplit: headerRowNumber }]
  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: headers.length },
  }

  return wb.xlsx.writeBuffer()
}

/** Формирует реестр и отдаёт файл браузеру. */
export async function downloadRegistry(orders: RegistryOrder[], meta: RegistryMeta) {
  const out = await buildRegistryWorkbook(orders, meta)
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = registryFileName(meta.from, meta.to, meta.number)
  a.click()
  URL.revokeObjectURL(url)
}
