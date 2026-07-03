'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { toast } from 'sonner'

const fieldInputClass =
  'rounded-field border-hairline bg-surface text-ink focus:ring-2 focus:ring-accent focus:border-accent placeholder:text-ink-4'
const overlineLabelClass = 'block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5'

function ResetPasswordContent() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setReady(true)
      else setError(true)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error('Пароли не совпадают'); return }
    if (password.length < 6) { toast.error('Минимум 6 символов'); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error('Ошибка. Попробуйте запросить новую ссылку.')
    } else {
      toast.success('Пароль изменён')
      router.push('/auth/login')
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
          {error ? (
            <div className="text-center">
              <div className="rounded-card bg-danger-soft px-4 py-3 mb-4">
                <h1 className="text-base font-semibold text-danger">Ссылка недействительна</h1>
                <p className="text-sm text-danger mt-1">
                  Ссылка устарела или уже была использована.
                </p>
              </div>
              <Link href="/auth/forgot-password" className="text-accent hover:text-accent-hover text-sm">
                Запросить новую ссылку →
              </Link>
            </div>
          ) : !ready ? (
            <div className="text-center py-4">
              <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent mx-auto mb-4" />
              <p className="text-sm text-ink-3">Проверяем ссылку…</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-ink mb-2">Новый пароль</h1>
              <p className="text-sm text-ink-3 mb-6">Придумайте новый пароль для входа.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="w-full">
                  <label htmlFor="password" className={overlineLabelClass}>Новый пароль</label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={fieldInputClass}
                  />
                </div>
                <div className="w-full">
                  <label htmlFor="confirm" className={overlineLabelClass}>Повторите пароль</label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={fieldInputClass}
                  />
                </div>
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Сохранить пароль
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-accent border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
