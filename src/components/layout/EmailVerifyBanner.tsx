'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/hooks/useUser'
import { Mail, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function EmailVerifyBanner() {
  const { user, isEmailVerified, loading } = useUser()
  const [dismissed, setDismissed] = useState(false)

  // Обновляем last_seen_at при каждом рендере (активность пользователя)
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
  }, [user])

  if (loading || !user) return null
  if (isEmailVerified) return null
  if (dismissed) return null

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-warning-soft border-b border-hairline">
      <Mail size={16} className="shrink-0 text-warning" />
      <span className="flex-1 text-[13px] text-warning">
        Подтвердите email, чтобы откликаться и получать уведомления.
      </span>
      <Link
        href="/profile"
        className="shrink-0 flex items-center gap-1 text-[13px] font-semibold text-warning hover:underline"
      >
        Перейти в профиль →
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Скрыть"
        className="shrink-0 w-[22px] h-[22px] flex items-center justify-center rounded-field text-warning hover:bg-warning/10 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  )
}
