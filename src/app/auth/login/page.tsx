'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { toast } from 'sonner'

const fieldInputClass =
  'rounded-field border-hairline bg-surface text-ink focus:ring-2 focus:ring-accent focus:border-accent placeholder:text-ink-4'
const overlineLabelClass = 'block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message === 'Email not confirmed') {
        toast.error('Email не подтверждён — проверьте почту и перейдите по ссылке')
      } else {
        toast.error('Неверный email или пароль')
      }
      setLoading(false)
      return
    }

    // Получаем роль
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profile?.role === 'carrier') {
      router.push('/feed')
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-2">
            <ContainerMark size={24} />
            <span className="text-2xl font-bold tracking-[-0.02em] text-ink">Контрейл</span>
          </Link>
          <p className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3">
            Биржа контейнерных перевозок
          </p>
        </div>

        <div className="bg-surface rounded-card border border-hairline p-6">
          <h1 className="text-xl font-semibold text-ink mb-6">Вход в систему</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="w-full">
              <label htmlFor="email" className={overlineLabelClass}>Email</label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={fieldInputClass}
              />
            </div>
            <div className="w-full">
              <label htmlFor="password" className={overlineLabelClass}>Пароль</label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={fieldInputClass}
              />
            </div>
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Войти
            </Button>
          </form>

          <p className="mt-3 text-center text-sm">
            <Link href="/auth/forgot-password" className="text-accent hover:text-accent-hover">
              Забыл пароль?
            </Link>
          </p>

          <p className="mt-3 text-center text-sm text-ink-3">
            Нет аккаунта?{' '}
            <Link href="/auth/register" className="text-accent hover:text-accent-hover font-medium">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
