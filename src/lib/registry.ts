// Реестр перевозок — выгрузка заявок за период в Excel.
// Одна строка = одна перевозка: заявка + водитель/ТС + принятый перевозчик.
// Состав и порядок колонок согласованы с бухгалтерией, менять только целиком.

import { Order, OrderDriverInfo } from '@/types/database'
import { formatOrderNumber, priceWithVat } from './utils'
import { effectiveOrderStatus, orderStatusLabel } from './order-status'

// Заявка с подтянутыми связями. order_driver_info уникальна по order_id, но
// PostgREST в зависимости от версии отдаёт её то объектом, то массивом из одного
// элемента — нормализуем в driverOf().
export type RegistryOrder = Order & {
  driver?: OrderDriverInfo | OrderDriverInfo[] | null
  carrier?: { name: string | null; company_name: string | null } | null
}

function driverOf(order: RegistryOrder): OrderDriverInfo | null {
  const d = order.driver
  if (!d) return null
  return Array.isArray(d) ? (d[0] ?? null) : d
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

const MONEY_FMT = '#,##0.00" ₽"'
const DATE_FMT = 'dd.mm.yyyy'

type CellValue = string | number | Date | null

interface RegistryColumn {
  header: string
  value: (order: RegistryOrder, now: number) => CellValue
  numFmt?: string
  /** Ширина, если считать по содержимому не имеет смысла (даты, суммы). */
  width?: number
  wrap?: boolean
}

export const REGISTRY_COLUMNS: RegistryColumn[] = [
  {
    header: 'Номер заявки',
    value: o => formatOrderNumber(o.order_number) || '',
  },
  {
    header: 'КТК',
    value: o => o.container_number?.trim() || '',
  },
  {
    header: 'Водитель',
    value: o => driverOf(o)?.driver_name?.trim() || '',
  },
  {
    header: 'ТС',
    value: o => vehicleLabel(driverOf(o)),
  },
  {
    header: 'Дата',
    value: o => excelDate(o.ready_date),
    numFmt: DATE_FMT,
    width: 12,
  },
  {
    header: 'Точка постановки',
    value: o => point(o.from_city, o.from_city_address),
    wrap: true,
  },
  {
    header: 'Точка выгрузки/погрузки',
    value: o => point(o.via_city, o.via_city_address),
    wrap: true,
  },
  {
    header: 'Точка сдачи',
    value: o => point(o.to_city, o.to_city_address),
    wrap: true,
  },
  {
    header: 'Сумма клиента с НДС',
    value: o => priceWithVat(o),
    numFmt: MONEY_FMT,
    width: 20,
  },
  {
    header: 'Перевозчик',
    value: o => o.carrier?.company_name?.trim() || o.carrier?.name?.trim() || '',
    wrap: true,
  },
  {
    header: 'Статус',
    value: (o, now) => orderStatusLabel(effectiveOrderStatus(o, now)),
    width: 14,
  },
]

// Сколько знакомест займёт значение — для автоширины колонки.
function cellLength(v: CellValue): number {
  if (v === null || v === undefined) return 0
  if (v instanceof Date) return 10
  if (typeof v === 'number') return String(Math.round(v)).length + 6 // разряды + " ₽"
  // Переносы внутри ячейки ширину не увеличивают — меряем самую длинную строку.
  return Math.max(...v.split('\n').map(s => s.length))
}

export function registryFileName(from: string, to: string): string {
  return `reestr_perevozok_${from}_${to}.xlsx`
}

/**
 * Собирает книгу Excel и возвращает её байтами.
 * exceljs, а не xlsx: бесплатная сборка SheetJS не умеет ни жирную шапку,
 * ни числовые форматы.
 */
export async function buildRegistryWorkbook(
  orders: RegistryOrder[],
  now: number = Date.now(),
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Реестр перевозок')

  const headers = REGISTRY_COLUMNS.map(c => c.header)
  const rows = orders.map(o => REGISTRY_COLUMNS.map(c => c.value(o, now)))

  ws.addRow(headers)
  for (const row of rows) ws.addRow(row)

  REGISTRY_COLUMNS.forEach((col, i) => {
    const column = ws.getColumn(i + 1)
    if (col.numFmt) column.numFmt = col.numFmt
    column.alignment = { vertical: 'top', wrapText: !!col.wrap }
    // Автоширина по самому длинному значению в колонке, с потолком — иначе
    // один длинный адрес растягивает лист на пол-экрана.
    const longest = rows.reduce((max, r) => Math.max(max, cellLength(r[i])), col.header.length)
    column.width = col.width ?? Math.min(46, Math.max(12, longest + 2))
  })

  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  headerRow.height = 30
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F1' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB9C4C2' } } }
  })

  // Шапка остаётся на месте при прокрутке + фильтры по колонкам.
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }

  return wb.xlsx.writeBuffer()
}

/** Формирует реестр и отдаёт файл браузеру. */
export async function downloadRegistry(orders: RegistryOrder[], from: string, to: string) {
  const out = await buildRegistryWorkbook(orders)
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = registryFileName(from, to)
  a.click()
  URL.revokeObjectURL(url)
}
