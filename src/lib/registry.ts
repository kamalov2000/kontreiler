// Реестр перевозок — выгрузка за период в Excel.
// Одна строка = одна перевозка: заявка + водитель/ТС + перевозчик.
// Перевозчик формирует реестр под каждого клиента и шлёт ему на сверку, поэтому
// файл оформлен как документ (шапка, реквизиты сторон, итоги), а не как дамп.
// Состав и порядок колонок согласованы с бухгалтерией, менять только целиком.

import { Order, OrderDriverInfo } from '@/types/database'
import { formatOrderNumber, priceWithVat } from './utils'
import { effectiveOrderStatus, orderStatusLabel } from './order-status'

// В реестр идут только обычные и срочные заявки: торги — это способ найти
// перевозчика, а не сама перевозка. Завершённые торги попадают в реестр через
// созданную по их результатам заявку (см. source_auction_id).
export const REGISTRY_FORMATS = ['regular', 'urgent'] as const

interface Party { name: string | null; company_name: string | null; inn?: string | null }

// Заявка с подтянутыми связями. order_driver_info уникальна по order_id, но
// PostgREST в зависимости от версии отдаёт её то объектом, то массивом из одного
// элемента — нормализуем в driverOf().
export type RegistryOrder = Order & {
  driver?: OrderDriverInfo | OrderDriverInfo[] | null
  carrier?: Party | null
  client?: Party | null
}

function driverOf(order: RegistryOrder): OrderDriverInfo | null {
  const d = order.driver
  if (!d) return null
  return Array.isArray(d) ? (d[0] ?? null) : d
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
    .map(s => s.trim().replace(/^[#№]/, '').toUpperCase())
    .filter(Boolean)
}

export function matchesOrderNumbers(order: RegistryOrder, needles: string[]): boolean {
  if (needles.length === 0) return true
  const full = (order.order_number || '').toUpperCase()
  const short = formatOrderNumber(order.order_number).toUpperCase()
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
const DATE_FMT = 'dd.mm.yyyy'
const HEADER_FILL = 'FFEDF2F1'
const BORDER_COLOR = 'FFB9C4C2'

type CellValue = string | number | Date | null

interface RegistryColumn {
  header: string
  value: (order: RegistryOrder, now: number) => CellValue
  numFmt?: string
  width?: number
  wrap?: boolean
}

export const REGISTRY_COLUMNS: RegistryColumn[] = [
  { header: 'Номер заявки', value: o => formatOrderNumber(o.order_number) || '' },
  { header: 'КТК', value: o => o.container_number?.trim() || '' },
  { header: 'Водитель', value: o => driverOf(o)?.driver_name?.trim() || '' },
  { header: 'ТС', value: o => vehicleLabel(driverOf(o)) },
  { header: 'Дата', value: o => excelDate(o.ready_date), numFmt: DATE_FMT, width: 12 },
  { header: 'Точка постановки', value: o => point(o.from_city, o.from_city_address), wrap: true },
  { header: 'Точка выгрузки/погрузки', value: o => point(o.via_city, o.via_city_address), wrap: true },
  { header: 'Точка сдачи', value: o => point(o.to_city, o.to_city_address), wrap: true },
  { header: 'Сумма клиента с НДС', value: o => priceWithVat(o), numFmt: MONEY_FMT, width: 20 },
  { header: 'Перевозчик', value: o => partyName(o.carrier), wrap: true },
  { header: 'Статус', value: (o, now) => orderStatusLabel(effectiveOrderStatus(o, now)), width: 14 },
]

const MONEY_COL = REGISTRY_COLUMNS.findIndex(c => c.numFmt === MONEY_FMT) + 1

// Сколько знакомест займёт значение — для автоширины колонки.
function cellLength(v: CellValue): number {
  if (v === null || v === undefined) return 0
  if (v instanceof Date) return 10
  if (typeof v === 'number') return String(Math.round(v)).length + 6
  return Math.max(...v.split('\n').map(s => s.length))
}

export interface RegistryMeta {
  from: string
  to: string
  /** Реквизиты сторон над таблицей: составитель и, если реестр под одного — получатель. */
  parties: { label: string; name: string; inn?: string | null }[]
}

export function registryFileName(from: string, to: string): string {
  return `reestr_perevozok_${from}_${to}.xlsx`
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

  const headers = REGISTRY_COLUMNS.map(c => c.header)
  const rows = orders.map(o => REGISTRY_COLUMNS.map(c => c.value(o, now)))

  // ── Шапка документа ───────────────────────────────────────────────────────
  const title = ws.addRow(['РЕЕСТР ПЕРЕВОЗОК'])
  title.font = { bold: true, size: 14 }
  ws.addRow([`за период с ${ruDate(meta.from)} по ${ruDate(meta.to)}`]).font = { size: 11 }
  ws.addRow([])
  for (const p of meta.parties) {
    const text = [p.name, p.inn?.trim() ? `ИНН ${p.inn.trim()}` : null].filter(Boolean).join(', ')
    ws.addRow([`${p.label}: ${text || '—'}`]).font = { size: 11 }
  }
  ws.addRow([])

  // ── Таблица ───────────────────────────────────────────────────────────────
  const headerRowNumber = ws.rowCount + 1
  ws.addRow(headers)
  for (const row of rows) ws.addRow(row)
  const lastDataRow = ws.rowCount

  REGISTRY_COLUMNS.forEach((col, i) => {
    const column = ws.getColumn(i + 1)
    if (col.numFmt) column.numFmt = col.numFmt
    // Автоширина считается только по таблице: строки шапки документа лежат в
    // колонке A и иначе растянули бы её на всю ширину заголовка.
    const longest = rows.reduce((max, r) => Math.max(max, cellLength(r[i])), col.header.length)
    column.width = col.width ?? Math.min(46, Math.max(12, longest + 2))
  })

  const thin = { style: 'thin' as const, color: { argb: BORDER_COLOR } }
  const box = { top: thin, left: thin, bottom: thin, right: thin }

  for (let r = headerRowNumber; r <= lastDataRow; r++) {
    const row = ws.getRow(r)
    const isHeader = r === headerRowNumber
    for (let c = 1; c <= headers.length; c++) {
      const cell = row.getCell(c)
      cell.border = box
      cell.alignment = {
        vertical: isHeader ? 'middle' : 'top',
        horizontal: 'left',
        wrapText: isHeader || !!REGISTRY_COLUMNS[c - 1].wrap,
      }
      if (isHeader) {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      }
    }
    if (isHeader) row.height = 30
  }

  // ── Итоги ─────────────────────────────────────────────────────────────────
  // Пустая строка отделяет итоги от таблицы: иначе автофильтр считает их данными
  // и прячет при фильтрации.
  ws.addRow([])
  const total = orders.reduce((sum, o) => sum + (priceWithVat(o) ?? 0), 0)
  const totalsRow = ws.addRow([])
  totalsRow.getCell(1).value = `ИТОГО, рейсов: ${orders.length}`
  totalsRow.getCell(MONEY_COL).value = Math.round(total * 100) / 100
  totalsRow.getCell(MONEY_COL).numFmt = MONEY_FMT
  totalsRow.getCell(1).font = { bold: true }
  totalsRow.getCell(MONEY_COL).font = { bold: true }
  totalsRow.getCell(1).border = { top: thin }
  totalsRow.getCell(MONEY_COL).border = { top: thin }

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
  a.download = registryFileName(meta.from, meta.to)
  a.click()
  URL.revokeObjectURL(url)
}
