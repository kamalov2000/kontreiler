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

  const base = className ?? 'inline-flex items-center gap-2 min-h-[40px] px-3 rounded-card text-sm font-medium transition-colors'

  // Открыт: строка bg-accent-soft, моно-номер чернил-бирюзы.
  if (state === 'shown' && phone) {
    return (
      <a href={`tel:${phone}`} className={`${base} border border-hairline bg-accent-soft text-[#0B5A5A] hover:bg-accent-soft/80`}>
        <Phone size={15} strokeWidth={1.5} className="text-accent shrink-0" />
        <span className="font-mono tabular-nums text-[#0B5A5A]">{formatPhone(phone)}</span>
      </a>
    )
  }
  // Недоступно / скрыт: приглушённая утопленная поверхность.
  if (state === 'hidden') {
    return (
      <span className={`${base} bg-surface-sunken text-ink-4`}>
        Телефон скрыт — общение через чат
      </span>
    )
  }
  if (state === 'error') {
    return <span className={`${base} bg-surface-sunken text-ink-4`}>Телефон недоступен</span>
  }
  // До отклика: secondary-кнопка с иконкой телефона accent.
  return (
    <button
      onClick={reveal}
      disabled={state === 'loading'}
      className={`${base} border border-hairline bg-surface text-accent hover:bg-surface-sunken disabled:opacity-50`}
    >
      <Phone size={15} strokeWidth={1.5} className="text-accent shrink-0" />
      {state === 'loading' ? 'Загрузка…' : 'Показать телефон'}
    </button>
  )
}
