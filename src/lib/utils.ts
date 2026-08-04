import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { CONTAINER_TARE_WEIGHT, CONTAINER_UNIT_TARE } from './cities'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Ставка НДС в процентах по типу заявки. `vat20` — легаси-ключ enum, фактическая
// ставка 22% (как в договоре, ТН и торгах) — единый источник правды для всех мест,
// где раньше эта карта была продублирована по отдельности.
const VAT_PERCENT: Record<string, number | null> = {
  none: null,
  vat0: 0,
  vat5: 5,
  vat15: 15,
  vat20: 22,
}

export function vatPercent(vatType: string | null | undefined): number | null {
  return VAT_PERCENT[vatType ?? 'none'] ?? null
}

// Метка НДС для UI-чипов и карточек: "с НДС 22%" / "НДС 0%" / "Без НДС"
export function vatLabel(vatType: string | null | undefined): string {
  const p = vatPercent(vatType)
  if (p === null) return 'Без НДС'
  return p === 0 ? 'НДС 0%' : `с НДС ${p}%`
}

// Метка НДС для печатных документов (договор-заявка, ТН): "НДС 22%" / "Без НДС" —
// без предлога, отдельная фраза от UI-чипов, поэтому не объединена с vatLabel.
export function vatDocLabel(vatType: string | null | undefined): string {
  const p = vatPercent(vatType)
  return p === null ? 'Без НДС' : `НДС ${p}%`
}

// Тара контейнера для расчёта веса брутто: индивидуальная (order.weight_tare),
// иначе справочная по типу. Для 20DC2 — тара ОДНОЙ единицы пары, а не суммарная
// величина CONTAINER_TARE_WEIGHT['20DC2'].
export function containerUnitTare(order: { container_type: string; weight_tare?: number | null }): number {
  if (order.weight_tare) return order.weight_tare
  if (order.container_type === '20DC2') return CONTAINER_UNIT_TARE['20DC2'] ?? 2200
  return CONTAINER_TARE_WEIGHT[order.container_type] ?? 0
}

// Итоговый вес брутто с тарой контейнера, одной строкой — для списков (лента,
// торги). Для 20DC2 суммирует оба контейнера пары, если задан второй вес.
export function weightWithTareDisplay(order: {
  container_type: string
  weight_tare?: number | null
  weight_gross?: number | null
  weight_gross_2?: number | null
}): string {
  if (!order.weight_gross) return '—'
  const tare = containerUnitTare(order)
  let total = order.weight_gross + tare
  if (order.container_type === '20DC2' && order.weight_gross_2) {
    total += order.weight_gross_2 + tare
  }
  return total.toLocaleString('ru-RU')
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(date: string) {
  return new Date(date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// UTC ISO из БД → строка для <input type="datetime-local"> в ЛОКАЛЬНОМ времени.
// Нужно, чтобы поле показывало то же настенное время, что и остальной UI, и чтобы
// повторное сохранение (new Date(value).toISOString()) не сдвигало значение на
// величину часового пояса при каждом редактировании.
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function formatPrice(price: number | null, isNegotiable: boolean) {
  if (isNegotiable || !price) return 'Договорная'
  return `${price.toLocaleString('ru-RU')} ₽`
}

// Нормализует телефон к формату +7XXXXXXXXXX перед сохранением
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return '+7' + digits.slice(1)
  }
  if (digits.length === 10) {
    return '+7' + digits
  }
  // Уже есть + и 11 цифр — оставляем как есть
  if (raw.startsWith('+') && digits.length === 11) return '+' + digits
  return raw
}

// В российском госномере разрешены только те 12 букв, начертание которых
// совпадает с латинскими. Набранный с латинской раскладки номер выглядит
// правильно, но состоит из ДРУГИХ символов: он перестаёт находиться поиском по
// базе и не совпадает с номером в накладной. Приводим латинские двойники к
// кириллице — и при сохранении в БД, и при генерации ТН.
const PLATE_LOOKALIKES: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К',
  M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
}

export function normalizePlate(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .trim()
    .toUpperCase()
    .replace(/[ABCEHKMOPTXY]/g, ch => PLATE_LOOKALIKES[ch])
}

// Форматирует телефон для отображения: +7 XXX XXX-XX-XX
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return 'Нет телефона'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const d = digits.slice(1)
    return `+7 ${d.slice(0,3)} ${d.slice(3,6)}-${d.slice(6,8)}-${d.slice(8,10)}`
  }
  return phone
}

// Маскирует телефон против ботов/скрапинга: +7 (XXX) ***-**-XX
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'Не указан'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ***-**-${digits.slice(9, 11)}`
  }
  return '***'
}

// Валидирует формат российского телефона
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8')))
    || digits.length === 10
}

// Убирает год из номера заявки для отображения:
// КТ-2026-00001 → КТ-00001; А-2026-00001 → А-00001
export function formatOrderNumber(num: string | null | undefined): string {
  if (!num) return ''
  return num.replace(/^(.+)-\d{4}-(\d+)$/, '$1-$2')
}

// Возвращает метку "через N дней" / "сегодня" / "вчера (просрочено)" для даты погрузки
export function readyDateBadge(readyDate: string): { label: string; color: 'green' | 'amber' | 'red' } | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(readyDate + 'T00:00:00')
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)

  function pluralDay(n: number): string {
    const abs = Math.abs(n)
    if (abs % 10 === 1 && abs % 100 !== 11) return 'день'
    if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) return 'дня'
    return 'дней'
  }

  if (diffDays > 0) return { label: `через ${diffDays} ${pluralDay(diffDays)}`, color: 'green' }
  if (diffDays === 0) return { label: 'сегодня', color: 'amber' }
  if (diffDays === -1) return { label: 'вчера (просрочено)', color: 'red' }
  return { label: `${Math.abs(diffDays)} дней назад (просрочено)`, color: 'red' }
}

// Форматирует дату погрузки с опциональным временем: "30 марта 2026, 14:30"
export function formatDateWithTime(date: string, time?: string | null): string {
  const d = new Date(date + 'T00:00:00')
  const dateStr = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  if (!time) return dateStr
  return `${dateStr}, ${time}`
}
