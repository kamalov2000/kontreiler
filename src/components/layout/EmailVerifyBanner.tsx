'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useUser } from '@/hooks/useUser'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function EmailVerifyBanner() {
  const { user, isEmailVerified, loading } = useUser()

  // Обновляем last_seen_at при каждом рендере (активность пользователя)
  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
  }, [user])

  if (loading || !user) return null
  if (isEmailVerified) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800">
        <ShieldAlert size={16} className="shrink-0 text-amber-500" />
        <span>Подтвердите почту — без верификации вы не сможете откликаться на заявки.</span>
        <Link href="/profile" className="ml-auto font-medium underline hover:text-amber-900 shrink-0">
          Подтвердить →
        </Link>
      </div>
    </div>
  )
}
