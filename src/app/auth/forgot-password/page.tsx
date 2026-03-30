'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

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
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📧</div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Письмо отправлено</h1>
              <p className="text-sm text-gray-500 mb-6">
                Проверьте <span className="font-medium text-gray-700">{email}</span> и перейдите
                по ссылке для сброса пароля.
              </p>
              <Link href="/auth/login" className="text-blue-600 hover:underline text-sm">
                ← Вернуться ко входу
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Сброс пароля</h1>
              <p className="text-sm text-gray-500 mb-6">
                Укажите email — пришлём ссылку для создания нового пароля.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="email"
                  type="email"
                  label="Email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Отправить ссылку
                </Button>
              </form>

              <p className="mt-4 text-center text-sm text-gray-600">
                <Link href="/auth/login" className="text-blue-600 hover:underline">
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
