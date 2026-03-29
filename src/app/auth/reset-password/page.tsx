'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) { setError(true); return }

    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) { setError(true) }
      else { setReady(true) }
    })
  }, [searchParams])

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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-2xl mb-2">
            <Package size={28} />
            Контрейл
          </Link>
          <p className="text-gray-500 text-sm">Биржа контейнерных перевозок</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {error ? (
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Ссылка недействительна</h1>
              <p className="text-sm text-gray-500 mb-6">
                Ссылка устарела или уже была использована.
              </p>
              <Link href="/auth/forgot-password" className="text-blue-600 hover:underline text-sm">
                Запросить новую ссылку →
              </Link>
            </div>
          ) : !ready ? (
            <div className="text-center py-4">
              <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-4" />
              <p className="text-sm text-gray-500">Проверяем ссылку…</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Новый пароль</h1>
              <p className="text-sm text-gray-500 mb-6">Придумайте новый пароль для входа.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="password"
                  type="password"
                  label="Новый пароль"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Input
                  id="confirm"
                  type="password"
                  label="Повторите пароль"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
