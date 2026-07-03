'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { toast } from 'sonner'

const fieldInputClass =
  'rounded-field border-hairline bg-surface text-ink focus:ring-2 focus:ring-accent focus:border-accent placeholder:text-ink-4'
const overlineLabelClass = 'block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    if (error) {
      toast.error('Ошибка отправки. Проверьте email.')
    } else {
      setSent(true)
    }
    setLoading(false)
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
          {sent ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold text-ink mb-2">Письмо отправлено</h1>
              <p className="text-sm text-ink-3 mb-6">
                Проверьте <span className="font-medium text-ink">{email}</span> и перейдите
                по ссылке для сброса пароля.
              </p>
              <Link href="/auth/login" className="text-accent hover:text-accent-hover text-sm">
                ← Вернуться ко входу
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-ink mb-2">Сброс пароля</h1>
              <p className="text-sm text-ink-3 mb-6">
                Укажите email — пришлём ссылку для создания нового пароля.
              </p>

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
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Отправить ссылку
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-ink-3">
                <Link href="/auth/login" className="text-accent hover:text-accent-hover">
                  ← Вернуться ко входу
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
