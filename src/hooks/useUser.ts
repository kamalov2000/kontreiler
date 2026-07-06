'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@/types/database'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    // Чтобы не перезагружать профиль на каждый TOKEN_REFRESHED — грузим только при смене пользователя.
    let loadedFor: string | null = null

    async function loadProfile(authUser: { id: string; email_confirmed_at?: string } | null) {
      if (!authUser) {
        loadedFor = null
        if (!active) return
        setUser(null)
        setIsEmailVerified(false)
        setLoading(false)
        return
      }
      if (loadedFor === authUser.id) return // уже загружен этот пользователь
      loadedFor = authUser.id
      setIsEmailVerified(!!authUser.email_confirmed_at)

      // Профиль и свой телефон (приватная user_private через RPC) — параллельно, один раунд-трип.
      const [{ data }, { data: ownPhone }] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase.rpc('get_own_phone'),
      ])
      if (!active) return
      if (data && typeof ownPhone === 'string') data.phone = ownPhone
      setUser(data)
      setLoading(false)
    }

    // onAuthStateChange сразу отдаёт INITIAL_SESSION с локальной сессией (без сетевой
    // валидации токена, как делал getUser) — этого достаточно для UI, RLS всё равно на сервере.
    // Запросы к БД выносим из колбэка (setTimeout 0): внутри него держится auth-lock,
    // и синхронные вызовы Supabase приводят к дедлокам/«Lock stolen».
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null
      setTimeout(() => { if (active) loadProfile(authUser) }, 0)
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  return { user, isEmailVerified, loading }
}
