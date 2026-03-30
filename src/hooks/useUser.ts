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

    async function getUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        setUser(null)
        setIsEmailVerified(false)
        setLoading(false)
        return
      }

      setIsEmailVerified(!!authUser.email_confirmed_at)

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      setUser(data)
      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      getUser()
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, isEmailVerified, loading }
}
