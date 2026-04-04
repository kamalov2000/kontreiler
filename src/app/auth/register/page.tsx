'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Package, Truck, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { UserRole } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { normalizePhone } from '@/lib/utils'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [role, setRole] = useState<UserRole | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    setLoading(true)

    const supabase = createClient()

    const normalizedPhone = normalizePhone(phone)
    const next = role === 'carrier' ? '/feed' : '/dashboard'
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
        data: { role, name, phone: normalizedPhone, city },
      },
    })
    if (error || !data.user) {
      toast.error(error?.message || 'Ошибка регистрации')
      setLoading(false)
      return
    }

    // Если email confirmation включён — session будет null, показываем экран проверки почты
    // Если выключен — сразу редиректим
    if (!data.session) {
      setEmailSent(true)
    } else {
      router.push(next)
    }
    setLoading(false)
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-2xl mb-2">
              <Package size={28} />
              Контрейл
            </Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
            <div className="text-4xl mb-4">📧</div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Подтвердите почту</h1>
            <p className="text-sm text-gray-500 mb-6">
              Письмо отправлено на <span className="font-medium text-gray-700">{email}</span>.
              Перейдите по ссылке в письме чтобы завершить регистрацию.
            </p>
            <Link href="/auth/login" className="text-blue-600 hover:underline text-sm">
              ← Войти
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 text-blue-600 font-bold text-2xl mb-2">
            <Package size={28} />
            Контрейл
          </Link>
          <p className="text-gray-500 text-sm">Биржа контейнерных перевозок</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {step === 1 ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Кто вы?</h1>
              <p className="text-sm text-gray-500 mb-6">Выберите роль. Изменить её будет нельзя.</p>

              <div className="space-y-3">
                <button
                  onClick={() => setRole('client')}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-colors text-left',
                    role === 'client'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                    role === 'client' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  )}>
                    <User size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Клиент (грузовладелец)</div>
                    <div className="text-sm text-gray-500 mt-0.5">Размещаю заявки на перевозку контейнеров</div>
                  </div>
                </button>

                <button
                  onClick={() => setRole('carrier')}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-colors text-left',
                    role === 'carrier'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                    role === 'carrier' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  )}>
                    <Truck size={20} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Перевозчик</div>
                    <div className="text-sm text-gray-500 mt-0.5">Вожу контейнеры, ищу загрузки</div>
                  </div>
                </button>
              </div>

              <Button
                className="w-full mt-6"
                size="lg"
                disabled={!role}
                onClick={() => setStep(2)}
              >
                Продолжить
              </Button>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className="text-sm text-blue-600 hover:underline mb-4 flex items-center gap-1"
              >
                ← Назад
              </button>
              <h1 className="text-xl font-semibold text-gray-900 mb-6">
                {role === 'client' ? 'Регистрация клиента' : 'Регистрация перевозчика'}
              </h1>

              <form onSubmit={handleRegister} className="space-y-4">
                <Input
                  id="email"
                  type="email"
                  label="Email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
                <Input
                  id="password"
                  type="password"
                  label="Пароль"
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Input
                  id="name"
                  type="text"
                  label={role === 'client' ? 'Имя / Название компании' : 'Имя или компания'}
                  placeholder="ООО Ромашка"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
                <Input
                  id="phone"
                  type="tel"
                  label="Телефон"
                  placeholder="+7 900 000 00 00"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                />
                <Input
                  id="city"
                  type="text"
                  label="Город"
                  placeholder="Москва"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  required
                />
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Зарегистрироваться
                </Button>
              </form>
            </>
          )}

          <p className="mt-4 text-center text-sm text-gray-600">
            Уже есть аккаунт?{' '}
            <Link href="/auth/login" className="text-blue-600 hover:underline font-medium">
              Войти
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-gray-400">
            Регистрируясь, вы соглашаетесь с{' '}
            <Link href="/terms" className="hover:underline">условиями</Link>
            {' '}и{' '}
            <Link href="/privacy" className="hover:underline">политикой конфиденциальности</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
