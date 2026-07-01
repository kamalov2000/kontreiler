'use client'

import { useState, useRef } from 'react'
import { X, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { CONTAINER_TYPES } from '@/lib/cities'
import { VatType } from '@/types/database'
import { toast } from 'sonner'

// Заголовки шаблона (порядок = порядок колонок в Excel)
const H = {
  from:      'Откуда*',
  via:       'Промежуточный город',
  to:        'Куда*',
  container: 'Тип контейнера*',
  date:      'Плановая дата* (ГГГГ-ММ-ДД)',
  time:      'Время (ЧЧ:ММ)',
  price:     'Ставка, ₽ (пусто = договорная)',
  vat:       'НДС (нет/5/15/20/0)',
  gross:     'Вес брутто, кг',
  net:       'Вес нетто, кг',
  urgent:    'Срочная (да/нет)',
  expires:   'Действует до* (ГГГГ-ММ-ДД ЧЧ:ММ)',
  notes:     'Особые условия',
} as const

const TEMPLATE_HEADERS = Object.values(H)

interface ParsedRow {
  order: Record<string, unknown>
  errors: string[]
  rowNum: number
  summary: string
}

function pad(n: number) { return String(n).padStart(2, '0') }

// Возвращает YYYY-MM-DD из Date / excel-serial / строки
function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/)
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Возвращает ISO-строку из Date / строки "YYYY-MM-DD HH:MM"
function parseDateTime(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString()
  const s = String(v).trim().replace('T', ' ')
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ ]?(\d{1,2})?:?(\d{2})?/)
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

function parseTime(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v.getTime())) return `${pad(v.getHours())}:${pad(v.getMinutes())}`
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/)
  return m ? `${pad(+m[1])}:${m[2]}` : null
}

function matchContainer(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim().toLowerCase()
  const byValue = CONTAINER_TYPES.find(c => c.value.toLowerCase() === s)
  if (byValue) return byValue.value
  const byLabel = CONTAINER_TYPES.find(c => c.label.toLowerCase() === s)
  if (byLabel) return byLabel.value
  // частичное совпадение по началу метки/значения
  const partial = CONTAINER_TYPES.find(c => c.label.toLowerCase().startsWith(s) || c.value.toLowerCase().startsWith(s))
  return partial ? partial.value : null
}

function parseVat(v: unknown): VatType {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s || s === 'нет' || s === 'none' || s.includes('без')) return 'none'
  if (s === '5' || s === 'vat5' || s.includes('5')) return 'vat5'
  if (s === '15' || s === 'vat15' || s.includes('15')) return 'vat15'
  if (s === '20' || s === '22' || s === 'vat20' || s.includes('20') || s.includes('22')) return 'vat20'
  if (s === '0' || s === 'vat0') return 'vat0'
  return 'none'
}

function parseBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'да' || s === 'yes' || s === 'true' || s === '1' || s === '+'
}

function parseIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10)
  return isNaN(n) ? null : n
}

export function OrderImportModal({
  open, onClose, userId, onImported,
}: {
  open: boolean
  onClose: () => void
  userId: string
  onImported: () => void
}) {
  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  async function downloadTemplate() {
    const { utils, writeFile } = await import('xlsx')
    const example: Record<string, string> = {
      [H.from]: 'Москва',
      [H.via]: '',
      [H.to]: 'Санкт-Петербург',
      [H.container]: '40HC',
      [H.date]: '2026-07-15',
      [H.time]: '09:00',
      [H.price]: '85000',
      [H.vat]: '20',
      [H.gross]: '18000',
      [H.net]: '16000',
      [H.urgent]: 'нет',
      [H.expires]: '2026-07-10 18:00',
      [H.notes]: 'Хрупкий груз',
    }
    const ws = utils.json_to_sheet([example], { header: TEMPLATE_HEADERS as unknown as string[] })
    ws['!cols'] = TEMPLATE_HEADERS.map(h => ({ wch: Math.max(14, h.length + 2) }))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Заявки')
    writeFile(wb, 'shablon_zayavok.xlsx')
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    const { read, utils } = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = read(buf, { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    const today = new Date(); today.setHours(0, 0, 0, 0)

    const result: ParsedRow[] = rows.map((row, i) => {
      const errors: string[] = []
      const from = String(row[H.from] ?? '').trim()
      const to = String(row[H.to] ?? '').trim()
      const via = String(row[H.via] ?? '').trim()
      const container = matchContainer(row[H.container])
      const readyDate = parseDate(row[H.date])
      const expiresAt = parseDateTime(row[H.expires])
      const price = parseIntOrNull(row[H.price])
      const gross = parseIntOrNull(row[H.gross])
      const net = parseIntOrNull(row[H.net])
      const urgent = parseBool(row[H.urgent])

      if (!from) errors.push('не указан город отправления')
      if (!to) errors.push('не указан город назначения')
      if (!container) errors.push(`неизвестный тип контейнера «${row[H.container]}»`)
      if (!readyDate) errors.push('некорректная плановая дата')
      if (!expiresAt) errors.push('некорректный срок действия')
      if (net != null && gross != null && net > gross) errors.push('нетто больше брутто')

      const order = {
        client_id: userId,
        format: urgent ? 'urgent' : 'regular',
        from_city: from,
        via_city: via || null,
        to_city: to,
        container_type: container,
        ready_date: readyDate,
        ready_time: parseTime(row[H.time]),
        expires_at: expiresAt,
        price: price == null ? null : price,
        is_negotiable: price == null,
        is_urgent: urgent,
        vat_type: parseVat(row[H.vat]),
        weight_gross: gross,
        weight_net: net,
        requires_genset: false,
        notes: String(row[H.notes] ?? '').trim() || null,
      }

      return {
        order,
        errors,
        rowNum: i + 2, // +1 заголовок, +1 к 1-индексации
        summary: `${from || '—'} → ${to || '—'} · ${container ?? '?'} · ${readyDate ?? '?'}`,
      }
    }).filter(r => // пропускаем полностью пустые строки
      r.order.from_city || r.order.to_city || r.order.container_type)

    setParsed(result)
    if (result.length === 0) toast.error('В файле не найдено ни одной строки с данными')
  }

  const validRows = parsed.filter(r => r.errors.length === 0)
  const invalidRows = parsed.filter(r => r.errors.length > 0)

  async function doImport() {
    if (validRows.length === 0) return
    setImporting(true)
    const supabase = createClient()
    const { error } = await supabase.from('orders').insert(validRows.map(r => r.order))
    setImporting(false)
    if (error) {
      toast.error(`Ошибка импорта: ${error.message}`)
      return
    }
    toast.success(`Загружено заявок: ${validRows.length}`)
    setParsed([])
    setFileName('')
    onImported()
    onClose()
  }

  function reset() {
    setParsed([])
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-600" />
            Массовая загрузка заявок из Excel
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-xl p-3">
            1. Скачайте шаблон · 2. Заполните строки (одна строка = одна заявка) · 3. Загрузите файл.
            Поля со <span className="font-semibold">*</span> обязательны. Пустая «Ставка» — договорная.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              <Download size={15} className="mr-1" /> Скачать шаблон
            </Button>
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
            >
              <Upload size={15} /> Выбрать файл
            </button>
            {fileName && (
              <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 underline">
                Сбросить
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          {fileName && (
            <div className="text-xs text-gray-500">Файл: <span className="font-medium text-gray-700">{fileName}</span></div>
          )}

          {parsed.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-700 font-medium">
                  <CheckCircle2 size={15} /> Готово к загрузке: {validRows.length}
                </span>
                {invalidRows.length > 0 && (
                  <span className="flex items-center gap-1 text-red-600 font-medium">
                    <AlertTriangle size={15} /> С ошибками: {invalidRows.length}
                  </span>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {parsed.map(r => (
                  <div key={r.rowNum} className={`px-3 py-2 text-sm ${r.errors.length ? 'bg-red-50/50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-800">
                        <span className="text-gray-400 mr-1.5">#{r.rowNum}</span>{r.summary}
                      </span>
                      {r.errors.length === 0
                        ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                        : <AlertTriangle size={15} className="text-red-500 shrink-0" />}
                    </div>
                    {r.errors.length > 0 && (
                      <div className="text-xs text-red-600 mt-0.5">{r.errors.join('; ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white">
          <Button
            onClick={doImport}
            loading={importing}
            disabled={validRows.length === 0}
            className="flex-1"
          >
            Загрузить {validRows.length > 0 ? `(${validRows.length})` : ''}
          </Button>
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  )
}
