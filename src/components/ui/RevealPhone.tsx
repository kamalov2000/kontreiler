'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

// Раскрытие телефона контрагента. Номер закрыт RLS и приходит только с сервера
// (/api/contact-phone) после проверки участия в сделке и флага hide_phone.
export function RevealPhone({
  kind, id, targetUserId, className,
}: {
  kind: 'order' | 'truck'
  id: string
  targetUserId: string | null | undefined
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'shown' | 'hidden' | 'error'>('idle')
  const [phone, setPhone] = useState<string | null>(null)

  if (!targetUserId) return null

  async function reveal() {
    setState('loading')
    try {
      const res = await fetch('/api/contact-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, targetUserId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.phone) { setPhone(data.phone); setState('shown') }
      else if (res.ok && data.hidden) setState('hidden')
      else setState('error')
    } catch {
      setState('error')
    }
  }

  const base = className ?? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'

  if (state === 'shown' && phone) {
    return (
      <a href={`tel:${phone}`} className={`${base} bg-green-50 text-green-700 hover:bg-green-100`}>
        <Phone size={14} /> {formatPhone(phone)}
      </a>
    )
  }
  if (state === 'hidden') {
    return (
      <span className={`${base} bg-gray-100 text-gray-500`}>
        Телефон скрыт — общение через чат
      </span>
    )
  }
  if (state === 'error') {
    return <span className={`${base} bg-gray-100 text-gray-400`}>Телефон недоступен</span>
  }
  return (
    <button onClick={reveal} disabled={state === 'loading'} className={`${base} bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50`}>
      <Phone size={14} /> {state === 'loading' ? 'Загрузка…' : 'Показать телефон'}
    </button>
  )
}
