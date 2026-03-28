import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
