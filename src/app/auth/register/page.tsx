'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Truck, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ContainerMark } from '@/components/ui/ContainerMark'
import { UserRole } from '@/types/database'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { normalizePhone } from '@/lib/utils'

const fieldInputClass =
  'rounded-field border-hairline bg-surface text-ink focus:ring-2 focus:ring-accent focus:border-accent placeholder:text-ink-4'
const overlineLabelClass = 'block text-[11.5px] font-semibold tracking-[0.06em] uppercase text-ink-3 mb-1.5'

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
      const msg = error?.message || ''
      let ruMsg = 'Ошибка регистрации'
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('user already')) {
        ruMsg = 'Этот email уже зарегистрирован. Попробуйте войти или восстановить пароль.'
      } else if (msg.toLowerCase().includes('password') && msg.toLowerCase().includes('least')) {
        ruMsg = 'Пароль должен содержать не менее 6 символов'
      } else if (msg.toLowerCase().includes('invalid email')) {
        ruMsg = 'Некорректный email'
      } else if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many')) {
        ruMsg = 'Слишком много попыток. Попробуйте позже.'
      } else if (msg) {
        ruMsg = msg
      }
      toast.error(ruMsg)
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
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <Link href="/" className="flex items-center gap-2 mb-2">
              <ContainerMark size={24} />
              <span className="text-2xl font-bold tracking-[-0.02em] text-ink">Контрейл</span>
            </Link>
          </div>
          <div className="bg-surface rounded-card border border-hairline p-6 text-center">
            <h1 className="text-xl font-semibold text-ink mb-2">Подтвердите почту</h1>
            <p className="text-sm text-ink-3 mb-6">
              Письмо отправлено на <span className="font-medium text-ink">{email}</span>.
              Перейдите по ссылке в письме чтобы завершить регистрацию.
            </p>
            <Link href="/auth/login" className="text-accent hover:text-accent-hover text-sm">
              ← Войти
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-4 py-8">
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
          {step === 1 ? (
            <>
              <h1 className="text-xl font-semibold text-ink mb-2">Кто вы?</h1>
              <p className="text-sm text-ink-3 mb-6">Выберите роль. Изменить её будет нельзя.</p>

              <div className="space-y-3">
                <button
                  onClick={() => setRole('client')}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-card border transition-colors ease-terminal text-left',
                    role === 'client'
                      ? 'border-accent bg-accent-soft'
                      : 'border-hairline hover:border-border-strong'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                    role === 'client' ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-3'
                  )}>
                    <User size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-medium text-ink">Клиент (грузовладелец)</div>
                    <div className="text-sm text-ink-3 mt-0.5">Размещаю заявки на перевозку контейнеров</div>
                  </div>
                </button>

                <button
                  onClick={() => setRole('carrier')}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-card border transition-colors ease-terminal text-left',
                    role === 'carrier'
                      ? 'border-accent bg-accent-soft'
                      : 'border-hairline hover:border-border-strong'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                    role === 'carrier' ? 'bg-accent text-white' : 'bg-surface-sunken text-ink-3'
                  )}>
                    <Truck size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-medium text-ink">Перевозчик</div>
                    <div className="text-sm text-ink-3 mt-0.5">Вожу контейнеры, ищу загрузки</div>
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
                className="text-sm text-accent hover:text-accent-hover mb-4 flex items-center gap-1"
              >
                ← Назад
              </button>
              <h1 className="text-xl font-semibold text-ink mb-6">
                {role === 'client' ? 'Регистрация клиента' : 'Регистрация перевозчика'}
              </h1>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="w-full">
                  <label htmlFor="email" className={overlineLabelClass}>Email</label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className={fieldInputClass}
                  />
                </div>
                <div className="w-full">
                  <label htmlFor="password" className={overlineLabelClass}>Пароль</label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Минимум 6 символов"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className={fieldInputClass}
                  />
                </div>
                <div className="w-full">
                  <label htmlFor="name" className={overlineLabelClass}>
                    {role === 'client' ? 'Имя / Название компании' : 'Имя или компания'}
                  </label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="ООО Ромашка"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className={fieldInputClass}
                  />
                </div>
                <div className="w-full">
                  <label htmlFor="phone" className={overlineLabelClass}>Телефон</label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+7 900 000 00 00"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    className={cn(fieldInputClass, 'font-mono tabular-nums')}
                  />
                </div>
                <div className="w-full">
                  <label htmlFor="city" className={overlineLabelClass}>Город</label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="Москва"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    required
                    className={fieldInputClass}
                  />
                </div>
                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Зарегистрироваться
                </Button>
              </form>
            </>
          )}

          <p className="mt-4 text-center text-sm text-ink-3">
            Уже есть аккаунт?{' '}
            <Link href="/auth/login" className="text-accent hover:text-accent-hover font-medium">
              Войти
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-ink-4">
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
